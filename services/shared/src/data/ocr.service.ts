import { randomUUID } from 'node:crypto';

import type { OcrJob } from '@prisma/client';

import { getPrismaClient } from './prisma';

const prisma = getPrismaClient();

export type OcrJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface OcrJobPayload {
  text?: string;
  confidence?: number;
  fields?: Record<string, { value: string; confidence: number }>;
}

export interface OcrJobResponse {
  id: string;
  cardId: string;
  tenantId: string;
  requestedBy: string;
  status: OcrJobStatus;
  submittedAt: Date;
  completedAt?: Date;
  payload?: Record<string, unknown>;
  result?: OcrJobPayload & { text: string; confidence: number };
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

function toOcrJobResponse(record: OcrJob): OcrJobResponse {
  return {
    id: record.id,
    cardId: record.cardId,
    tenantId: record.tenantId,
    requestedBy: record.requestedBy,
    status: record.status as OcrJobStatus,
    submittedAt: record.submittedAt,
    completedAt: record.completedAt ?? undefined,
    payload: record.payload ?? undefined,
    result: record.result as OcrJobResponse['result'],
    error: record.error ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function listOcrJobs(cardId?: string): Promise<OcrJobResponse[]> {
  const jobs = await prisma.ocrJob.findMany({
    where: cardId ? { cardId } : undefined,
    orderBy: { submittedAt: 'desc' },
  });
  return jobs.map(toOcrJobResponse);
}

export async function createOcrJob(
  cardId: string,
  options: { requestedBy: string; payload?: Record<string, unknown> }
): Promise<OcrJobResponse> {
  const cardRecord = await prisma.cardsCard.findUnique({ where: { id: cardId } });
  if (!cardRecord) {
    throw new Error('Card not found');
  }

  const card = {
    ...cardRecord,
    tags: cardRecord.tags ?? [],
  };

  const submittedAt = new Date();
  const completedAt = new Date(submittedAt.getTime() + 1500);

  const result = {
    text:
      card.extractedText ??
      [card.name, card.title, card.company, card.email, card.phone].filter(Boolean).join('\n'),
    confidence: card.confidence ?? 0.9,
    fields: {
      name: { value: card.name ?? 'Unknown', confidence: 0.85 },
      title: { value: card.title ?? 'Unknown', confidence: 0.8 },
      company: { value: card.company ?? 'Unknown', confidence: 0.78 },
      email: { value: card.email ?? 'unknown@example.com', confidence: 0.9 },
    },
  } satisfies OcrJobPayload & { text: string; confidence: number };

  const job = await prisma.ocrJob.create({
    data: {
      id: randomUUID(),
      cardId,
      tenantId: card.tenantId,
      requestedBy: options.requestedBy,
      status: 'completed',
      payload: options.payload ?? { source: 'api.scan' },
      result,
      submittedAt,
      completedAt,
      createdAt: submittedAt,
      updatedAt: completedAt,
    },
  });

  await prisma.cardsCard.update({
    where: { id: cardId },
    data: {
      ocrJobId: job.id,
      updatedAt: new Date(),
    },
  });

  return toOcrJobResponse(job);
}

export async function getOcrJobById(jobId: string): Promise<OcrJobResponse | null> {
  const job = await prisma.ocrJob.findUnique({ where: { id: jobId } });
  return job ? toOcrJobResponse(job) : null;
}
