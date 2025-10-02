import { randomUUID } from 'node:crypto';

import type { EnrichmentCompanyProfile, EnrichmentRecord } from '@prisma/client';

import { getPrismaClient } from './prisma';

const prisma = getPrismaClient();

export type EnrichmentStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface EnrichmentResponse {
  id: string;
  cardId: string;
  companyId?: string;
  tenantId: string;
  status: EnrichmentStatus;
  requestedBy: string;
  score?: number;
  summary?: string;
  companies?: Array<{ id: string; name: string; website?: string; score: number }>;
  insights?: Array<{ label: string; value: string }>;
  error?: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

function toEnrichmentResponse(record: EnrichmentRecord): EnrichmentResponse {
  return {
    id: record.id,
    cardId: record.cardId,
    companyId: record.companyId ?? undefined,
    tenantId: record.tenantId,
    status: record.status as EnrichmentStatus,
    requestedBy: record.requestedBy,
    score: record.score ?? undefined,
    summary: record.summary ?? undefined,
    companies: record.companies as EnrichmentResponse['companies'],
    insights: record.insights as EnrichmentResponse['insights'],
    error: record.error ?? undefined,
    completedAt: record.completedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function findOrCreateCompanyProfile(
  tenantId: string,
  name?: string
): Promise<EnrichmentCompanyProfile | null> {
  if (!name) {
    return null;
  }

  const existing = await prisma.enrichmentCompanyProfile.findFirst({
    where: {
      tenantId,
      name: {
        equals: name,
        mode: 'insensitive',
      },
    },
  });

  if (existing) {
    return existing;
  }

  const now = new Date();
  return prisma.enrichmentCompanyProfile.create({
    data: {
      id: randomUUID(),
      tenantId,
      name,
      industry: 'Technology',
      size: '50-100',
      headquarters: 'Remote',
      website: 'https://example.com',
      description: `Auto-generated company profile for ${name}.`,
      logoUrl: 'https://cdn.namecard.app/company/default.png',
      lastUpdated: now,
      createdAt: now,
      updatedAt: now,
    },
  });
}

export async function createEnrichment(
  cardId: string,
  options: { requestedBy: string; companyId?: string }
): Promise<EnrichmentResponse> {
  const cardRecord = await prisma.cardsCard.findUnique({ where: { id: cardId } });
  if (!cardRecord) {
    throw new Error('Card not found');
  }

  const tenantId = cardRecord.tenantId;
  let companyProfile: EnrichmentCompanyProfile | null = null;

  if (options.companyId) {
    companyProfile = await prisma.enrichmentCompanyProfile.findUnique({
      where: { id: options.companyId },
    });
  }

  if (!companyProfile) {
    companyProfile = await findOrCreateCompanyProfile(tenantId, cardRecord.company ?? undefined);
  }

  const completedAt = new Date();
  const companies = companyProfile
    ? [
        {
          id: companyProfile.id,
          name: companyProfile.name,
          website: companyProfile.website ?? undefined,
          score: 0.9,
        },
      ]
    : undefined;

  const insights = [
    {
      label: 'Opportunity',
      value: companyProfile
        ? `Strengthen relationship with ${companyProfile.name} by sharing tailored follow-up materials.`
        : 'Capture missing company details to improve enrichment accuracy.',
    },
    {
      label: 'Next Step',
      value: 'Schedule enrichment sync with sales team next week.',
    },
  ];

  const record = await prisma.enrichmentRecord.create({
    data: {
      id: randomUUID(),
      cardId,
      companyId: companyProfile?.id ?? null,
      tenantId,
      status: 'completed',
      requestedBy: options.requestedBy,
      score: 0.84,
      summary: companyProfile
        ? `${companyProfile.name} shows strong engagement potential. Recent activity suggests readiness for pilot.`
        : 'Generated enrichment summary. Awaiting confirmed company match.',
      companies,
      insights,
      completedAt,
      createdAt: completedAt,
      updatedAt: completedAt,
    },
  });

  await prisma.cardsCard.update({
    where: { id: cardId },
    data: {
      enrichmentId: record.id,
      lastEnrichmentDate: completedAt,
      updatedAt: new Date(),
    },
  });

  return toEnrichmentResponse(record);
}

export async function getEnrichmentByCard(cardId: string): Promise<EnrichmentResponse | null> {
  const record = await prisma.enrichmentRecord.findFirst({
    where: { cardId },
    orderBy: { createdAt: 'desc' },
  });
  return record ? toEnrichmentResponse(record) : null;
}

export async function getEnrichmentByCompany(
  companyId: string
): Promise<EnrichmentResponse | null> {
  const record = await prisma.enrichmentRecord.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });
  return record ? toEnrichmentResponse(record) : null;
}
