import { randomUUID } from 'node:crypto';

import { Prisma, type CardsCard } from '@prisma/client';

import { getPrismaClient } from './prisma';
import type { Card } from '../types/card.types';

const prisma = getPrismaClient();

function normalizeTags(tags: readonly string[] | undefined): string[] {
  if (!tags) {
    return [];
  }
  const normalized = tags
    .map(tag => tag.trim())
    .filter(Boolean)
    .map(tag => tag.toLowerCase());
  return Array.from(new Set(normalized));
}

function toCard(record: CardsCard): Card {
  const base: Card = {
    id: record.id,
    userId: record.userId,
    originalImageUrl: record.originalImageUrl,
    tags: record.tags,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };

  if (record.processedImageUrl) base.processedImageUrl = record.processedImageUrl;
  if (record.extractedText) base.extractedText = record.extractedText;
  if (typeof record.confidence === 'number') base.confidence = record.confidence;
  if (record.name) base.name = record.name;
  if (record.title) base.title = record.title;
  if (record.company) base.company = record.company;
  if (record.email) base.email = record.email;
  if (record.phone) base.phone = record.phone;
  if (record.address) base.address = record.address;
  if (record.website) base.website = record.website;
  if (record.notes) base.notes = record.notes;
  if (record.scanDate) base.scanDate = record.scanDate;
  if (record.lastEnrichmentDate) base.lastEnrichmentDate = record.lastEnrichmentDate;

  return base;
}

function now(): Date {
  return new Date();
}

async function recordActivity(
  cardId: string,
  activityType: string,
  detail?: Record<string, unknown>
): Promise<void> {
  await prisma.cardsCardActivity.create({
    data: {
      cardId,
      activityType,
      detail: detail ? (detail as Prisma.JsonObject) : Prisma.JsonNull,
      occurredAt: now(),
    },
  });
}

export interface ListCardsParams {
  userId: string;
  page: number;
  limit: number;
  query?: string;
  tags?: string[];
  company?: string;
}

export interface CreateCardInput {
  userId: string;
  tenantId: string;
  originalImageUrl: string;
  processedImageUrl?: string;
  extractedText?: string;
  confidence?: number;
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  notes?: string;
  tags?: string[];
  scanDate?: Date;
  lastEnrichmentDate?: Date;
  ocrJobId?: string;
  enrichmentId?: string;
}

export interface UpdateCardInput {
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  notes?: string;
  tags?: string[];
  processedImageUrl?: string;
  lastEnrichmentDate?: Date | null;
}

export interface ListCardsResult {
  items: Card[];
  total: number;
}

export async function listCards(params: ListCardsParams): Promise<ListCardsResult> {
  const normalizedTags = normalizeTags(params.tags);
  const where: Prisma.CardsCardWhereInput = {
    userId: params.userId,
  };

  if (params.query) {
    const query = params.query.trim();
    if (query.length > 0) {
      const lowered = query.toLowerCase();
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { title: { contains: query, mode: 'insensitive' } },
        { company: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query, mode: 'insensitive' } },
        { notes: { contains: query, mode: 'insensitive' } },
        { tags: { has: lowered } },
      ];
    }
  }

  if (normalizedTags.length > 0) {
    where.tags = { hasEvery: normalizedTags };
  }

  if (params.company) {
    where.company = { equals: params.company, mode: 'insensitive' };
  }

  const [total, records] = await prisma.$transaction([
    prisma.cardsCard.count({ where }),
    prisma.cardsCard.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: Math.max(0, (params.page - 1) * params.limit),
      take: params.limit,
    }),
  ]);

  return {
    total,
    items: records.map(toCard),
  };
}

export async function getCard(cardId: string): Promise<Card | null> {
  const record = await prisma.cardsCard.findUnique({ where: { id: cardId } });
  return record ? toCard(record) : null;
}

export async function createCard(input: CreateCardInput): Promise<Card> {
  const timestamp = now();
  const tags = normalizeTags(input.tags);

  const record = await prisma.cardsCard.create({
    data: {
      id: randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId,
      originalImageUrl: input.originalImageUrl,
      processedImageUrl: input.processedImageUrl ?? null,
      extractedText: input.extractedText ?? null,
      confidence: input.confidence ?? null,
      name: input.name ?? null,
      title: input.title ?? null,
      company: input.company ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      website: input.website ?? null,
      notes: input.notes ?? null,
      tags,
      scanDate: input.scanDate ?? null,
      lastEnrichmentDate: input.lastEnrichmentDate ?? null,
      ocrJobId: input.ocrJobId ?? null,
      enrichmentId: input.enrichmentId ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });

  await recordActivity(record.id, 'card_created', { userId: input.userId });
  return toCard(record);
}

export async function updateCard(cardId: string, updates: UpdateCardInput): Promise<Card> {
  const tags = updates.tags ? normalizeTags(updates.tags) : undefined;

  const data: Prisma.CardsCardUpdateInput = {
    updatedAt: now(),
  };

  if (typeof updates.name === 'string') data.name = updates.name;
  if (typeof updates.title === 'string') data.title = updates.title;
  if (typeof updates.company === 'string') data.company = updates.company;
  if (typeof updates.email === 'string') data.email = updates.email;
  if (typeof updates.phone === 'string') data.phone = updates.phone;
  if (typeof updates.address === 'string') data.address = updates.address;
  if (typeof updates.website === 'string') data.website = updates.website;
  if (typeof updates.notes === 'string') data.notes = updates.notes;
  if (typeof updates.processedImageUrl === 'string') {
    data.processedImageUrl = updates.processedImageUrl;
  }
  if (Array.isArray(tags)) {
    data.tags = tags;
  }
  if (updates.lastEnrichmentDate !== undefined) {
    data.lastEnrichmentDate = updates.lastEnrichmentDate;
  }

  const record = await prisma.cardsCard.update({
    where: { id: cardId },
    data,
  });

  await recordActivity(cardId, 'card_updated', { fields: Object.keys(updates) });
  return toCard(record);
}

export async function deleteCard(cardId: string): Promise<void> {
  await prisma.cardsCard.delete({ where: { id: cardId } });
}

export async function addTag(cardId: string, tag: string): Promise<Card> {
  const trimmed = tag.trim();
  if (!trimmed) {
    throw new Error('Tag is required');
  }

  const record = await prisma.cardsCard.findUnique({ where: { id: cardId } });
  if (!record) {
    throw new Error('Card not found');
  }

  const tags = normalizeTags([...record.tags, trimmed]);
  const updated = await prisma.cardsCard.update({
    where: { id: cardId },
    data: {
      tags,
      updatedAt: now(),
    },
  });

  await recordActivity(cardId, 'card_tag_added', { tag: trimmed });
  return toCard(updated);
}

export async function getCardStats(userId: string): Promise<Record<string, unknown>> {
  const cards = await prisma.cardsCard.findMany({
    where: { userId },
    select: {
      email: true,
      phone: true,
      company: true,
      tags: true,
    },
  });

  const total = cards.length;
  let cardsWithEmail = 0;
  let cardsWithPhone = 0;
  let investorCards = 0;
  const companies = new Set<string>();

  for (const card of cards) {
    if (card.email) {
      cardsWithEmail += 1;
    }
    if (card.phone) {
      cardsWithPhone += 1;
    }
    if (card.company) {
      companies.add(card.company.toLowerCase());
    }
    if (card.tags.some(tag => tag.toLowerCase() === 'investor')) {
      investorCards += 1;
    }
  }

  return {
    totalCards: total,
    cardsWithEmail,
    cardsWithPhone,
    distinctCompanies: companies.size,
    investorCards,
    lastUpdated: now(),
  };
}
