import { getPrismaClient } from './prisma';
import type { Company } from '../types/company.types';

const prisma = getPrismaClient();

export interface SearchAnalyticsSummary {
  totalQueries: number;
  averageLatencyMs: number;
  cardsIndexed: number;
  companiesIndexed: number;
  topQueries: Array<{ term: string; count: number }>;
  lastQueryAt?: Date;
}

export async function recordSearchEvent(params: {
  query: string;
  latencyMs: number;
  resultCount: number;
  tenantId?: string;
  userId?: string;
}): Promise<void> {
  await prisma.searchQueryLog.create({
    data: {
      query: params.query,
      latencyMs: params.latencyMs,
      resultCount: params.resultCount,
      tenantId: params.tenantId ?? null,
      userId: params.userId ?? null,
      executedAt: new Date(),
    },
  });
}

export async function getSearchAnalytics(): Promise<SearchAnalyticsSummary> {
  const [aggregate, cardsIndexed, companiesIndexed, groupedQueries] = await Promise.all([
    prisma.searchQueryLog.aggregate({
      _count: { _all: true },
      _avg: { latencyMs: true },
      _max: { executedAt: true },
    }),
    prisma.cardsCard.count(),
    prisma.enrichmentCompanyProfile.count(),
    prisma.searchQueryLog.groupBy({
      by: ['query'],
      where: { query: { not: null } },
      _count: { query: true },
    }),
  ]);

  const averageLatencyMs = aggregate._avg?.latencyMs ?? 0;
  const lastQueryAt = aggregate._max?.executedAt ?? undefined;

  const topQueries = groupedQueries
    .filter(item => (item.query ?? '').trim().length > 0)
    .map(item => ({
      term: (item.query ?? '').toLowerCase(),
      count: item._count.query ?? 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalQueries: aggregate._count?._all ?? 0,
    averageLatencyMs: Math.round(averageLatencyMs * 100) / 100,
    cardsIndexed,
    companiesIndexed,
    topQueries,
    lastQueryAt,
  };
}

export async function listCompanies(): Promise<Company[]> {
  const records = await prisma.enrichmentCompanyProfile.findMany({
    orderBy: { updatedAt: 'desc' },
  });

  return records.map(company => ({
    id: company.id,
    name: company.name,
    industry: company.industry ?? undefined,
    size: (company.size as Company['size']) ?? undefined,
    headquarters: company.headquarters ?? undefined,
    website: company.website ?? undefined,
    description: company.description ?? undefined,
    logoUrl: company.logoUrl ?? undefined,
    lastUpdated: company.lastUpdated,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
  }));
}
