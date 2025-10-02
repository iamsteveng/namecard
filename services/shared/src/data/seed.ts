import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';

import { getPrismaClient } from './prisma';
import { ensureDefaultDemoUser, DEMO_USER_ID, DEMO_TENANT_ID } from './auth.service';

const prisma = getPrismaClient();

interface SeedOptions {
  reset?: boolean;
}

const DEMO_COMPANY_ONE_ID = '33333333-3333-3333-3333-333333333333';
const DEMO_COMPANY_TWO_ID = '44444444-4444-4444-4444-444444444444';
const DEMO_CARD_ONE_ID = '55555555-5555-5555-5555-555555555555';
const DEMO_CARD_TWO_ID = '66666666-6666-6666-6666-666666666666';
const DEMO_OCR_JOB_ID = '77777777-7777-7777-7777-777777777777';
const DEMO_ENRICHMENT_ID = '88888888-8888-8888-8888-888888888888';
const DEMO_UPLOAD_ID = '99999999-9999-9999-9999-999999999999';

function toDate(value: string): Date {
  return new Date(value);
}

export async function seedDemoWorkspace(options: SeedOptions = {}): Promise<void> {
  const { reset = true } = options;

  await ensureDefaultDemoUser();
  const demoAuthUser = await prisma.authUser.findUnique({
    where: { id: DEMO_USER_ID },
    select: { id: true, tenantId: true },
  });

  if (!demoAuthUser) {
    throw new Error('Demo auth user not found after initialization');
  }

  const demoTenantId = demoAuthUser.tenantId ?? DEMO_TENANT_ID;

  if (reset) {
    const existingCompanyIds = await prisma.enrichmentCompanyProfile.findMany({
      where: { tenantId: demoTenantId },
      select: { id: true },
    });
    const existingCardIds = await prisma.cardsCard.findMany({
      where: { tenantId: demoTenantId },
      select: { id: true },
    });

    if (existingCompanyIds.length > 0) {
      await prisma.enrichmentNewsArticle.deleteMany({
        where: { companyId: { in: existingCompanyIds.map(company => company.id) } },
      });
    }

    await prisma.enrichmentRecord.deleteMany({ where: { tenantId: demoTenantId } });
    await prisma.ocrJob.deleteMany({ where: { tenantId: demoTenantId } });

    if (existingCardIds.length > 0) {
      await prisma.cardsCardActivity.deleteMany({
        where: { cardId: { in: existingCardIds.map(card => card.id) } },
      });
    }

    await prisma.cardsCard.deleteMany({ where: { tenantId: demoTenantId } });
    await prisma.enrichmentCompanyProfile.deleteMany({ where: { tenantId: demoTenantId } });
    await prisma.uploadsAsset.deleteMany({ where: { tenantId: demoTenantId } });
    await prisma.searchQueryLog.deleteMany({ where: { tenantId: demoTenantId } });
  }

  const now = new Date();

  const northwind = await prisma.enrichmentCompanyProfile.create({
    data: {
      id: DEMO_COMPANY_ONE_ID,
      tenantId: demoTenantId,
      name: 'Northwind Analytics',
      industry: 'Technology',
      size: '50-100',
      headquarters: 'San Francisco, CA',
      website: 'https://northwind-analytics.example.com',
      description: 'AI-powered business intelligence solutions for modern sales teams.',
      logoUrl: 'https://cdn.namecard.app/company/northwind.png',
      lastUpdated: now,
      createdAt: now,
      updatedAt: now,
    },
  });

  const atlasVentures = await prisma.enrichmentCompanyProfile.create({
    data: {
      id: DEMO_COMPANY_TWO_ID,
      tenantId: demoTenantId,
      name: 'Atlas Ventures',
      industry: 'Finance',
      size: '100-500',
      headquarters: 'New York, NY',
      website: 'https://atlas-ventures.example.com',
      description: 'Venture capital firm backing data-centric B2B startups.',
      logoUrl: 'https://cdn.namecard.app/company/atlas.png',
      lastUpdated: now,
      createdAt: now,
      updatedAt: now,
    },
  });

  const cardOne = await prisma.cardsCard.create({
    data: {
      id: DEMO_CARD_ONE_ID,
      tenantId: demoTenantId,
      userId: demoAuthUser.id,
      originalImageUrl: 'https://cdn.namecard.app/cards/card-demo-001-original.jpg',
      processedImageUrl: 'https://cdn.namecard.app/cards/card-demo-001-processed.jpg',
      extractedText:
        'Ava Thompson\nVP Sales\nNorthwind Analytics\nava.thompson@northwind-analytics.com\n+1-415-555-1020',
      confidence: 0.94,
      name: 'Ava Thompson',
      title: 'VP Sales',
      company: northwind.name,
      email: 'ava.thompson@northwind-analytics.com',
      phone: '+1-415-555-1020',
      address: '123 Market Street, San Francisco, CA',
      website: northwind.website,
      notes: 'Interested in pilot deployment for APAC team.',
      tags: ['ai', 'priority'],
      scanDate: toDate('2024-01-15'),
      lastEnrichmentDate: now,
      ocrJobId: DEMO_OCR_JOB_ID,
      enrichmentId: DEMO_ENRICHMENT_ID,
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.cardsCardActivity.create({
    data: {
      id: randomUUID(),
      cardId: cardOne.id,
      activityType: 'card_created',
      detail: { source: 'seed' } satisfies Prisma.JsonValue,
      occurredAt: now,
    },
  });

  const cardTwo = await prisma.cardsCard.create({
    data: {
      id: DEMO_CARD_TWO_ID,
      tenantId: demoTenantId,
      userId: demoAuthUser.id,
      originalImageUrl: 'https://cdn.namecard.app/cards/card-demo-002-original.jpg',
      processedImageUrl: 'https://cdn.namecard.app/cards/card-demo-002-processed.jpg',
      extractedText:
        'Noah Patel\nPrincipal\nAtlas Ventures\nnoah.patel@atlas-ventures.com\n+1-212-555-4432',
      confidence: 0.9,
      name: 'Noah Patel',
      title: 'Principal',
      company: atlasVentures.name,
      email: 'noah.patel@atlas-ventures.com',
      phone: '+1-212-555-4432',
      address: '88 Wall Street, New York, NY',
      website: atlasVentures.website,
      notes: 'Schedule follow-up demo with product team.',
      tags: ['investor', 'follow-up'],
      scanDate: toDate('2024-01-20'),
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.cardsCardActivity.create({
    data: {
      id: randomUUID(),
      cardId: cardTwo.id,
      activityType: 'card_created',
      detail: { source: 'seed' } satisfies Prisma.JsonValue,
      occurredAt: now,
    },
  });

  await prisma.ocrJob.create({
    data: {
      id: DEMO_OCR_JOB_ID,
      cardId: cardOne.id,
      tenantId: demoTenantId,
      requestedBy: demoAuthUser.id,
      status: 'completed',
      payload: { source: 'seed' },
      result: {
        text: cardOne.extractedText ?? '',
        confidence: cardOne.confidence ?? 0.9,
        fields: {
          name: { value: cardOne.name ?? '', confidence: 0.95 },
          title: { value: cardOne.title ?? '', confidence: 0.9 },
          company: { value: cardOne.company ?? '', confidence: 0.92 },
          email: { value: cardOne.email ?? '', confidence: 0.98 },
        },
      },
      error: null,
      submittedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.enrichmentRecord.create({
    data: {
      id: DEMO_ENRICHMENT_ID,
      cardId: cardOne.id,
      companyId: northwind.id,
      tenantId: demoTenantId,
      status: 'completed',
      requestedBy: demoAuthUser.id,
      score: 0.84,
      summary:
        'Company expanding into APAC with focus on AI-enabled revenue intelligence. Recently closed Series C.',
      companies: [
        {
          id: northwind.id,
          name: northwind.name,
          website: northwind.website,
          score: 0.92,
        },
      ],
      insights: [
        { label: 'Opportunity', value: 'High conversion potential for analytics add-ons.' },
        { label: 'Next Step', value: 'Share ROI calculator ahead of procurement review.' },
      ],
      error: null,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.enrichmentNewsArticle.create({
    data: {
      id: randomUUID(),
      companyId: northwind.id,
      title: 'Northwind Analytics announces APAC expansion',
      summary: 'Seeded update summarizing regional go-to-market growth.',
      url: 'https://northwind-analytics.example.com/news/apac-expansion',
      publishedDate: toDate('2024-01-10'),
      source: 'Newswire',
      createdAt: now,
    },
  });

  await prisma.uploadsAsset.create({
    data: {
      id: DEMO_UPLOAD_ID,
      tenantId: demoTenantId,
      userId: demoAuthUser.id,
      objectKey: `uploads/${demoTenantId}/${DEMO_UPLOAD_ID}/business-card.png`,
      fileName: 'business-card.png',
      status: 'completed',
      checksum: 'abc123',
      contentType: 'image/png',
      sizeBytes: 2048,
      presignedUrl: `https://uploads.namecard.app/presign/${DEMO_UPLOAD_ID}`,
      cdnUrl: `https://cdn.namecard.app/uploads/${DEMO_UPLOAD_ID}/business-card.png`,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      uploadedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.searchQueryLog.createMany({
    data: [
      {
        tenantId: demoTenantId,
        userId: demoAuthUser.id,
        query: 'analytics',
        latencyMs: 42,
        resultCount: 2,
        executedAt: now,
      },
      {
        tenantId: demoTenantId,
        userId: demoAuthUser.id,
        query: 'investor',
        latencyMs: 38,
        resultCount: 1,
        executedAt: now,
      },
    ],
  });
}
