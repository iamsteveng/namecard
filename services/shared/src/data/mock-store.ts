import { randomUUID } from 'node:crypto';

import type { Card } from '../types/card.types';
import type { Company } from '../types/company.types';
import type { User } from '../types/user.types';
import type { UserPreferences } from '../types/common.types';

interface Timestamped {
  createdAt: Date;
  updatedAt: Date;
}

interface UserRecord extends Timestamped {
  id: string;
  email: string;
  name: string;
  password: string;
  tenantId: string;
  avatarUrl?: string;
  preferences: UserPreferences;
}

interface SessionRecord {
  accessToken: string;
  refreshToken: string;
  userId: string;
  issuedAt: Date;
  expiresAt: Date;
}

interface CardRecord extends Timestamped {
  id: string;
  userId: string;
  tenantId: string;
  name?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  tags: string[];
  notes?: string;
  originalImageUrl: string;
  processedImageUrl?: string;
  extractedText?: string;
  confidence?: number;
  scanDate?: Date;
  lastEnrichmentDate?: Date;
  ocrJobId?: string;
  enrichmentId?: string;
}

interface CreateCardInput {
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

type OcrJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface OcrJobRecord extends Timestamped {
  id: string;
  cardId: string;
  tenantId: string;
  requestedBy: string;
  status: OcrJobStatus;
  submittedAt: Date;
  completedAt?: Date;
  payload?: Record<string, any>;
  result?: {
    text: string;
    confidence: number;
    fields: Record<string, { value: string; confidence: number }>;
  };
  error?: string;
}

type EnrichmentStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface EnrichmentRecord extends Timestamped {
  id: string;
  cardId: string;
  companyId?: string;
  tenantId: string;
  status: EnrichmentStatus;
  requestedBy: string;
  score?: number;
  summary?: string;
  companies?: Array<{
    id: string;
    name: string;
    website?: string;
    score: number;
  }>;
  insights?: Array<{ label: string; value: string }>;
  completedAt?: Date;
  error?: string;
}

interface UploadRecord extends Timestamped {
  id: string;
  tenantId: string;
  objectKey: string;
  fileName: string;
  status: 'pending' | 'uploaded' | 'completed';
  checksum: string;
  contentType: string;
  size: number;
  presignedUrl: string;
  cdnUrl: string;
  expiresAt: Date;
  uploadedAt?: Date;
  completedAt?: Date;
}

interface SearchAnalytics {
  totalQueries: number;
  lastQueryAt?: Date;
  averageLatencyMs: number;
  cardsIndexed: number;
  companiesIndexed: number;
  topQueries: Array<{ term: string; count: number }>;
}

interface ListCardsParams {
  userId: string;
  page: number;
  limit: number;
  query?: string;
  tags?: string[];
  company?: string;
}

interface SearchCardsResult {
  items: Card[];
  total: number;
}

const DEMO_TENANT_ID = 'tenant-demo-001';
const ACCESS_TOKEN_TTL_MINUTES = 30;

const cloneDate = (value: Date | undefined): Date | undefined => {
  return value ? new Date(value.getTime()) : undefined;
};

const toCard = (record: CardRecord): Card => {
  const card: Card = {
    id: record.id,
    createdAt: cloneDate(record.createdAt)!,
    updatedAt: cloneDate(record.updatedAt)!,
    userId: record.userId,
    originalImageUrl: record.originalImageUrl,
    tags: [...record.tags],
  };

  if (record.processedImageUrl) card.processedImageUrl = record.processedImageUrl;
  if (record.extractedText) card.extractedText = record.extractedText;
  if (typeof record.confidence === 'number') card.confidence = record.confidence;
  if (record.name) card.name = record.name;
  if (record.title) card.title = record.title;
  if (record.company) card.company = record.company;
  if (record.email) card.email = record.email;
  if (record.phone) card.phone = record.phone;
  if (record.address) card.address = record.address;
  if (record.website) card.website = record.website;
  if (record.notes) card.notes = record.notes;
  if (record.scanDate) {
    const scanDate = cloneDate(record.scanDate);
    if (scanDate) card.scanDate = scanDate;
  }
  if (record.lastEnrichmentDate) {
    const last = cloneDate(record.lastEnrichmentDate);
    if (last) card.lastEnrichmentDate = last;
  }

  return card;
};

const toUser = (record: UserRecord): User => {
  const user: User = {
    id: record.id,
    createdAt: cloneDate(record.createdAt)!,
    updatedAt: cloneDate(record.updatedAt)!,
    cognitoId: record.id,
    email: record.email,
    preferences: { ...record.preferences },
  };

  if (record.name) user.name = record.name;
  if (record.avatarUrl) user.avatarUrl = record.avatarUrl;

  return user;
};

const cloneOcrJob = (job: OcrJobRecord): OcrJobRecord => {
  const clone: OcrJobRecord = {
    id: job.id,
    cardId: job.cardId,
    tenantId: job.tenantId,
    requestedBy: job.requestedBy,
    status: job.status,
    submittedAt: new Date(job.submittedAt),
    createdAt: cloneDate(job.createdAt)!,
    updatedAt: cloneDate(job.updatedAt)!,
  };

  if (job.completedAt) clone.completedAt = new Date(job.completedAt);
  if (job.payload) clone.payload = { ...job.payload };
  if (job.result) {
    clone.result = {
      text: job.result.text,
      confidence: job.result.confidence,
      fields: Object.fromEntries(
        Object.entries(job.result.fields).map(([key, value]) => [
          key,
          { value: value.value, confidence: value.confidence },
        ])
      ),
    };
  }
  if (job.error) clone.error = job.error;

  return clone;
};

const cloneEnrichmentRecord = (record: EnrichmentRecord): EnrichmentRecord => {
  const clone: EnrichmentRecord = {
    id: record.id,
    cardId: record.cardId,
    tenantId: record.tenantId,
    status: record.status,
    requestedBy: record.requestedBy,
    createdAt: cloneDate(record.createdAt)!,
    updatedAt: cloneDate(record.updatedAt)!,
  };

  if (record.companyId) clone.companyId = record.companyId;
  if (record.score !== undefined) clone.score = record.score;
  if (record.summary) clone.summary = record.summary;
  if (record.companies) {
    clone.companies = record.companies.map(company => ({
      id: company.id,
      name: company.name,
      score: company.score,
      ...(company.website ? { website: company.website } : {}),
    }));
  }
  if (record.insights) {
    clone.insights = record.insights.map(item => ({ label: item.label, value: item.value }));
  }
  if (record.completedAt) {
    const completed = cloneDate(record.completedAt);
    if (completed) {
      clone.completedAt = completed;
    }
  }
  if (record.error) {
    clone.error = record.error;
  }

  return clone;
};

const now = (): Date => new Date();

class MockDataStore {
  private users = new Map<string, UserRecord>();
  private sessions = new Map<string, SessionRecord>();
  private refreshIndex = new Map<string, string>();
  private cards = new Map<string, CardRecord>();
  private companies = new Map<string, Company>();
  private ocrJobs = new Map<string, OcrJobRecord>();
  private enrichment = new Map<string, EnrichmentRecord>();
  private uploads = new Map<string, UploadRecord>();
  private analytics: SearchAnalytics = {
    totalQueries: 0,
    averageLatencyMs: 42,
    cardsIndexed: 0,
    companiesIndexed: 0,
    topQueries: [],
  };

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.users.clear();
    this.sessions.clear();
    this.refreshIndex.clear();
    this.cards.clear();
    this.companies.clear();
    this.ocrJobs.clear();
    this.enrichment.clear();
    this.uploads.clear();
    this.analytics = {
      totalQueries: 0,
      averageLatencyMs: 42,
      cardsIndexed: 0,
      companiesIndexed: 0,
      topQueries: [],
    };

    this.seedDemoData();
  }

  private seedDemoData(): void {
    const createdAt = now();
    const userId = 'user-demo-001';

    const defaultUser: UserRecord = {
      id: userId,
      email: 'demo@namecard.app',
      name: 'Demo User',
      password: 'DemoPass123!',
      tenantId: DEMO_TENANT_ID,
      createdAt,
      updatedAt: createdAt,
      avatarUrl: 'https://cdn.namecard.app/avatars/demo-user.png',
      preferences: {
        theme: 'light',
        notifications: true,
        emailUpdates: true,
        language: 'en',
        timezone: 'UTC',
      },
    };

    this.users.set(defaultUser.id, defaultUser);

    const companyA: Company = {
      id: 'company-demo-001',
      name: 'Northwind Analytics',
      industry: 'Technology',
      size: '50-100',
      headquarters: 'San Francisco, CA',
      website: 'https://northwind-analytics.example.com',
      description: 'AI-powered business intelligence solutions for modern sales teams.',
      logoUrl: 'https://cdn.namecard.app/company/northwind.png',
      lastUpdated: createdAt,
      createdAt,
      updatedAt: createdAt,
    };

    const companyB: Company = {
      id: 'company-demo-002',
      name: 'Atlas Ventures',
      industry: 'Finance',
      size: '100-500',
      headquarters: 'New York, NY',
      website: 'https://atlas-ventures.example.com',
      description: 'Venture capital firm backing data-centric B2B startups.',
      logoUrl: 'https://cdn.namecard.app/company/atlas.png',
      lastUpdated: createdAt,
      createdAt,
      updatedAt: createdAt,
    };

    this.companies.set(companyA.id, companyA);
    this.companies.set(companyB.id, companyB);

    const cardOne: CardRecord = {
      id: 'card-demo-001',
      userId,
      tenantId: DEMO_TENANT_ID,
      name: 'Ava Thompson',
      title: 'VP Sales',
      company: companyA.name,
      email: 'ava.thompson@northwind-analytics.com',
      phone: '+1-415-555-1020',
      address: '123 Market Street, San Francisco, CA',
      website: 'https://northwind-analytics.example.com',
      tags: ['ai', 'priority'],
      notes: 'Interested in pilot deployment for APAC team.',
      originalImageUrl: 'https://cdn.namecard.app/cards/card-demo-001-original.jpg',
      processedImageUrl: 'https://cdn.namecard.app/cards/card-demo-001-processed.jpg',
      extractedText:
        'Ava Thompson\nVP Sales\nNorthwind Analytics\nava.thompson@northwind-analytics.com\n+1-415-555-1020',
      confidence: 0.94,
      scanDate: createdAt,
      lastEnrichmentDate: createdAt,
      createdAt,
      updatedAt: createdAt,
      ocrJobId: 'ocr-job-demo-001',
      enrichmentId: 'enrichment-demo-001',
    };

    const cardTwo: CardRecord = {
      id: 'card-demo-002',
      userId,
      tenantId: DEMO_TENANT_ID,
      name: 'Noah Patel',
      title: 'Principal',
      company: companyB.name,
      email: 'noah.patel@atlas-ventures.com',
      phone: '+1-212-555-4432',
      address: '88 Wall Street, New York, NY',
      website: 'https://atlas-ventures.example.com',
      tags: ['investor', 'follow-up'],
      notes: 'Schedule follow-up demo with product team.',
      originalImageUrl: 'https://cdn.namecard.app/cards/card-demo-002-original.jpg',
      processedImageUrl: 'https://cdn.namecard.app/cards/card-demo-002-processed.jpg',
      extractedText:
        'Noah Patel\nPrincipal\nAtlas Ventures\nnoah.patel@atlas-ventures.com\n+1-212-555-4432',
      confidence: 0.9,
      scanDate: createdAt,
      createdAt,
      updatedAt: createdAt,
    };

    this.cards.set(cardOne.id, cardOne);
    this.cards.set(cardTwo.id, cardTwo);

    const ocrJob: OcrJobRecord = {
      id: 'ocr-job-demo-001',
      cardId: cardOne.id,
      tenantId: DEMO_TENANT_ID,
      requestedBy: userId,
      status: 'completed',
      createdAt,
      updatedAt: createdAt,
      submittedAt: createdAt,
      completedAt: createdAt,
      payload: { source: 'cards.card.captured' },
      result: {
        text: cardOne.extractedText ?? '',
        confidence: cardOne.confidence ?? 0.92,
        fields: {
          name: { value: cardOne.name ?? '', confidence: 0.95 },
          title: { value: cardOne.title ?? '', confidence: 0.9 },
          company: { value: cardOne.company ?? '', confidence: 0.92 },
          email: { value: cardOne.email ?? '', confidence: 0.98 },
        },
      },
    };

    this.ocrJobs.set(ocrJob.id, ocrJob);

    const enrichmentRecord: EnrichmentRecord = {
      id: 'enrichment-demo-001',
      cardId: cardOne.id,
      companyId: companyA.id,
      tenantId: DEMO_TENANT_ID,
      status: 'completed',
      requestedBy: userId,
      score: 0.84,
      summary:
        'Company expanding into APAC with focus on AI-enabled revenue intelligence. Recently closed Series C.',
      companies: [
        {
          id: companyA.id,
          name: companyA.name,
          score: 0.92,
          ...(companyA.website ? { website: companyA.website } : {}),
        },
      ],
      insights: [
        { label: 'Opportunity', value: 'High conversion potential for analytics add-ons.' },
        { label: 'Next Step', value: 'Share ROI calculator ahead of procurement review.' },
      ],
      createdAt,
      updatedAt: createdAt,
      completedAt: createdAt,
    };

    this.enrichment.set(enrichmentRecord.id, enrichmentRecord);

    const uploadRecord: UploadRecord = {
      id: 'upload-demo-001',
      tenantId: DEMO_TENANT_ID,
      objectKey: 'uploads/demo/user-demo-001/card-demo-001.png',
      fileName: 'card-demo-001.png',
      status: 'completed',
      checksum: 'd3b07384d113edec49eaa6238ad5ff00',
      contentType: 'image/png',
      size: 48321,
      presignedUrl: 'https://uploads.namecard.app/presign/upload-demo-001',
      cdnUrl: 'https://cdn.namecard.app/uploads/upload-demo-001.png',
      expiresAt: new Date(createdAt.getTime() + 3600 * 1000),
      createdAt,
      updatedAt: createdAt,
      uploadedAt: createdAt,
      completedAt: createdAt,
    };

    this.uploads.set(uploadRecord.id, uploadRecord);

    this.analytics.totalQueries = 17;
    this.analytics.averageLatencyMs = 54;
    this.analytics.cardsIndexed = this.cards.size;
    this.analytics.companiesIndexed = this.companies.size;
    this.analytics.topQueries = [
      { term: 'analytics', count: 5 },
      { term: 'investor', count: 3 },
      { term: 'principal', count: 2 },
    ];
    this.analytics.lastQueryAt = createdAt;
  }

  private createSession(userId: string): SessionRecord {
    const issuedAt = now();
    const expiresAt = new Date(issuedAt.getTime() + ACCESS_TOKEN_TTL_MINUTES * 60_000);
    const session: SessionRecord = {
      accessToken: `access_${randomUUID()}`,
      refreshToken: `refresh_${randomUUID()}`,
      userId,
      issuedAt,
      expiresAt,
    };

    this.sessions.set(session.accessToken, session);
    this.refreshIndex.set(session.refreshToken, session.accessToken);
    return session;
  }

  private ensureUserExists(userId: string): UserRecord {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  getUserByEmail(email: string): UserRecord | undefined {
    const normalized = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === normalized) {
        return user;
      }
    }
    return undefined;
  }

  authenticate(
    email: string,
    password: string
  ): { user: User; accessToken: string; refreshToken: string; expiresAt: Date } {
    const user = this.getUserByEmail(email);
    if (!user || user.password !== password) {
      throw new Error('Invalid credentials');
    }

    const session = this.createSession(user.id);
    return {
      user: toUser(user),
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: new Date(session.expiresAt),
    };
  }

  register(data: { email: string; password: string; name: string }): {
    user: User;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  } {
    const existing = this.getUserByEmail(data.email);
    if (existing) {
      throw new Error('A user with this email already exists');
    }

    const timestamp = now();
    const user: UserRecord = {
      id: randomUUID(),
      email: data.email.trim().toLowerCase(),
      name: data.name,
      password: data.password,
      tenantId: DEMO_TENANT_ID,
      createdAt: timestamp,
      updatedAt: timestamp,
      preferences: {
        theme: 'light',
        notifications: true,
        emailUpdates: false,
        language: 'en',
        timezone: 'UTC',
      },
    };

    this.users.set(user.id, user);

    const session = this.createSession(user.id);

    return {
      user: toUser(user),
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: new Date(session.expiresAt),
    };
  }

  refresh(refreshToken: string): { accessToken: string; refreshToken: string; expiresAt: Date } {
    const accessToken = this.refreshIndex.get(refreshToken);
    if (!accessToken) {
      throw new Error('Refresh token invalid or expired');
    }

    const existing = this.sessions.get(accessToken);
    if (!existing) {
      throw new Error('Session not found');
    }

    this.sessions.delete(accessToken);
    this.refreshIndex.delete(refreshToken);

    const session = this.createSession(existing.userId);
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: new Date(session.expiresAt),
    };
  }

  revoke(accessToken: string): void {
    const session = this.sessions.get(accessToken);
    if (session) {
      this.sessions.delete(accessToken);
      this.refreshIndex.delete(session.refreshToken);
    }
  }

  getUserForToken(accessToken: string | undefined): User | undefined {
    if (!accessToken) {
      return undefined;
    }

    const session = this.sessions.get(accessToken);
    if (!session || session.expiresAt.getTime() < now().getTime()) {
      return undefined;
    }

    const user = this.users.get(session.userId);
    if (!user) {
      return undefined;
    }

    return toUser(user);
  }

  getUserProfile(userId: string): User {
    const user = this.ensureUserExists(userId);
    return toUser(user);
  }

  getTenantForUser(userId: string): string {
    const user = this.ensureUserExists(userId);
    return user.tenantId;
  }

  updateUser(
    userId: string,
    updates: Partial<Pick<UserRecord, 'name' | 'avatarUrl' | 'preferences'>>
  ): User {
    const user = this.ensureUserExists(userId);
    const next: UserRecord = {
      ...user,
      ...updates,
      preferences: updates.preferences
        ? { ...user.preferences, ...updates.preferences }
        : user.preferences,
      updatedAt: now(),
    };

    this.users.set(userId, next);
    return toUser(next);
  }

  listCards(params: ListCardsParams): SearchCardsResult {
    const normalizedQuery = params.query?.trim().toLowerCase();
    const filtered: CardRecord[] = [];

    for (const card of this.cards.values()) {
      if (card.userId !== params.userId) {
        continue;
      }

      let matches = true;

      if (normalizedQuery) {
        const haystack = [
          card.name,
          card.title,
          card.company,
          card.email,
          card.phone,
          card.notes,
          card.tags.join(' '),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        matches = haystack.includes(normalizedQuery);
      }

      if (matches && params.tags && params.tags.length > 0) {
        matches = params.tags.every(tag =>
          card.tags.some(cardTag => cardTag.toLowerCase() === tag.toLowerCase())
        );
      }

      if (matches && params.company) {
        matches = (card.company ?? '').toLowerCase() === params.company.toLowerCase();
      }

      if (matches) {
        filtered.push(card);
      }
    }

    filtered.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    const total = filtered.length;
    const start = (params.page - 1) * params.limit;
    const end = start + params.limit;
    const pageItems = filtered.slice(start, end);

    return { items: pageItems.map(toCard), total };
  }

  getCard(cardId: string): Card | undefined {
    const record = this.cards.get(cardId);
    return record ? toCard(record) : undefined;
  }

  createCard(input: CreateCardInput): Card {
    const timestamp = now();
    const id = randomUUID();
    const record: CardRecord = {
      id,
      userId: input.userId,
      tenantId: input.tenantId,
      originalImageUrl: input.originalImageUrl,
      tags: input.tags ? [...new Set(input.tags.map(tag => tag.trim()).filter(Boolean))] : [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    if (input.processedImageUrl) record.processedImageUrl = input.processedImageUrl;
    if (input.extractedText) record.extractedText = input.extractedText;
    if (typeof input.confidence === 'number') record.confidence = input.confidence;
    if (input.name) record.name = input.name;
    if (input.title) record.title = input.title;
    if (input.company) record.company = input.company;
    if (input.email) record.email = input.email;
    if (input.phone) record.phone = input.phone;
    if (input.address) record.address = input.address;
    if (input.website) record.website = input.website;
    if (input.notes) record.notes = input.notes;
    if (input.scanDate) {
      const scanDate = cloneDate(input.scanDate);
      if (scanDate) record.scanDate = scanDate;
    }
    if (input.lastEnrichmentDate) {
      const last = cloneDate(input.lastEnrichmentDate);
      if (last) record.lastEnrichmentDate = last;
    }
    if (input.ocrJobId) record.ocrJobId = input.ocrJobId;
    if (input.enrichmentId) record.enrichmentId = input.enrichmentId;

    this.cards.set(id, record);
    this.analytics.cardsIndexed = this.cards.size;
    return toCard(record);
  }

  updateCard(cardId: string, updates: Partial<CardRecord>): Card {
    const existing = this.cards.get(cardId);
    if (!existing) {
      throw new Error('Card not found');
    }

    const record: CardRecord = {
      ...existing,
      ...updates,
      tags: updates.tags ? [...new Set(updates.tags.map(tag => tag.trim()))] : existing.tags,
      updatedAt: now(),
    };

    this.cards.set(cardId, record);
    return toCard(record);
  }

  deleteCard(cardId: string): void {
    this.cards.delete(cardId);
    this.analytics.cardsIndexed = this.cards.size;
  }

  addTag(cardId: string, tag: string): Card {
    const card = this.cards.get(cardId);
    if (!card) {
      throw new Error('Card not found');
    }

    const normalized = tag.trim();
    if (!normalized) {
      return toCard(card);
    }

    const tags = new Set(card.tags.map(existing => existing.trim()));
    tags.add(normalized);

    card.tags = Array.from(tags);
    card.updatedAt = now();
    this.cards.set(cardId, card);
    return toCard(card);
  }

  getCardStats(userId: string): Record<string, any> {
    let total = 0;
    let withEmail = 0;
    let withPhone = 0;
    let investorCount = 0;
    const companies = new Set<string>();

    for (const card of this.cards.values()) {
      if (card.userId !== userId) continue;
      total += 1;
      if (card.email) withEmail += 1;
      if (card.phone) withPhone += 1;
      if (card.company) {
        companies.add(card.company);
        if (card.tags.some(tag => tag.toLowerCase() === 'investor')) {
          investorCount += 1;
        }
      }
    }

    return {
      totalCards: total,
      cardsWithEmail: withEmail,
      cardsWithPhone: withPhone,
      distinctCompanies: companies.size,
      investorCards: investorCount,
      lastUpdated: now(),
    };
  }

  createOcrJob(
    cardId: string,
    options: { requestedBy: string; payload?: Record<string, any> }
  ): OcrJobRecord {
    const card = this.cards.get(cardId);
    if (!card) {
      throw new Error('Card not found');
    }

    const timestamp = now();
    const job: OcrJobRecord = {
      id: randomUUID(),
      cardId,
      tenantId: card.tenantId,
      requestedBy: options.requestedBy,
      status: 'completed',
      submittedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    if (options.payload) {
      job.payload = { ...options.payload };
    }

    job.completedAt = timestamp;
    job.result = {
      text: card.extractedText ?? '',
      confidence: card.confidence ?? 0.9,
      fields: {
        name: { value: card.name ?? '', confidence: 0.93 },
        company: { value: card.company ?? '', confidence: 0.9 },
        email: { value: card.email ?? '', confidence: 0.96 },
      },
    };

    this.ocrJobs.set(job.id, job);
    this.cards.set(cardId, {
      ...card,
      ocrJobId: job.id,
      updatedAt: timestamp,
    });

    return cloneOcrJob(job);
  }

  listOcrJobs(cardId?: string): OcrJobRecord[] {
    const items: OcrJobRecord[] = [];
    for (const job of this.ocrJobs.values()) {
      if (!cardId || job.cardId === cardId) {
        items.push(cloneOcrJob(job));
      }
    }
    items.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
    return items;
  }

  getOcrJob(jobId: string): OcrJobRecord | undefined {
    const job = this.ocrJobs.get(jobId);
    return job ? cloneOcrJob(job) : undefined;
  }

  createEnrichment(
    cardId: string,
    options: { requestedBy: string; companyId?: string }
  ): EnrichmentRecord {
    const card = this.cards.get(cardId);
    if (!card) {
      throw new Error('Card not found');
    }

    const timestamp = now();
    const enrichment: EnrichmentRecord = {
      id: randomUUID(),
      cardId,
      tenantId: card.tenantId,
      status: 'completed',
      requestedBy: options.requestedBy,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: timestamp,
    };

    if (options.companyId) {
      enrichment.companyId = options.companyId;
    }
    enrichment.score = 0.82;
    enrichment.summary = `Generated enrichment insights for ${card.name ?? 'card contact'}.`;
    enrichment.companies = card.company
      ? [
          {
            id: options.companyId ?? randomUUID(),
            name: card.company,
            score: 0.86,
            ...(card.website ? { website: card.website } : {}),
          },
        ]
      : [];
    enrichment.insights = [
      { label: 'Engagement', value: 'Prefers email follow-up within 48 hours.' },
      { label: 'Topic', value: 'Discuss analytics roadmap with product leader.' },
    ];

    this.enrichment.set(enrichment.id, enrichment);
    this.cards.set(cardId, {
      ...card,
      enrichmentId: enrichment.id,
      lastEnrichmentDate: timestamp,
      updatedAt: timestamp,
    });

    return cloneEnrichmentRecord(enrichment);
  }

  getEnrichmentByCard(cardId: string): EnrichmentRecord | undefined {
    for (const record of this.enrichment.values()) {
      if (record.cardId === cardId) {
        return cloneEnrichmentRecord(record);
      }
    }
    return undefined;
  }

  getEnrichmentByCompany(companyId: string): EnrichmentRecord | undefined {
    for (const record of this.enrichment.values()) {
      if (record.companyId === companyId) {
        return cloneEnrichmentRecord(record);
      }
    }
    return undefined;
  }

  createUpload(input: {
    tenantId: string;
    fileName: string;
    checksum: string;
    contentType: string;
    size: number;
  }): UploadRecord {
    const timestamp = now();
    const id = randomUUID();
    const record: UploadRecord = {
      id,
      tenantId: input.tenantId,
      objectKey: `uploads/${input.tenantId}/${id}/${input.fileName}`,
      fileName: input.fileName,
      status: 'pending',
      checksum: input.checksum,
      contentType: input.contentType,
      size: input.size,
      presignedUrl: `https://uploads.namecard.app/presign/${id}`,
      cdnUrl: `https://cdn.namecard.app/uploads/${id}/${input.fileName}`,
      expiresAt: new Date(timestamp.getTime() + 3600 * 1000),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.uploads.set(record.id, record);
    return record;
  }

  completeUpload(uploadId: string): UploadRecord {
    const record = this.uploads.get(uploadId);
    if (!record) {
      throw new Error('Upload not found');
    }

    const timestamp = now();
    const updated: UploadRecord = {
      ...record,
      status: 'completed',
      uploadedAt: timestamp,
      completedAt: timestamp,
      updatedAt: timestamp,
    };

    this.uploads.set(uploadId, updated);
    return updated;
  }

  getUpload(uploadId: string): UploadRecord | undefined {
    const record = this.uploads.get(uploadId);
    return record ? { ...record } : undefined;
  }

  recordSearch(query: string, latencyMs: number, resultCount: number): void {
    const timestamp = now();
    this.analytics.totalQueries += 1;
    this.analytics.lastQueryAt = timestamp;
    this.analytics.averageLatencyMs =
      Math.round((this.analytics.averageLatencyMs * 0.6 + latencyMs * 0.4) * 100) / 100;

    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return;
    }

    const existing = this.analytics.topQueries.find(item => item.term === normalized);
    if (existing) {
      existing.count += 1;
    } else {
      this.analytics.topQueries.push({ term: normalized, count: 1 });
    }

    this.analytics.topQueries.sort((a, b) => b.count - a.count);
    this.analytics.topQueries = this.analytics.topQueries.slice(0, 5);

    // Basic signal: more results indicates better coverage
    if (resultCount > 0) {
      this.analytics.cardsIndexed = Math.max(this.analytics.cardsIndexed, resultCount);
    }
  }

  getSearchAnalytics(): SearchAnalytics {
    const result: SearchAnalytics = {
      totalQueries: this.analytics.totalQueries,
      averageLatencyMs: this.analytics.averageLatencyMs,
      cardsIndexed: this.analytics.cardsIndexed,
      companiesIndexed: this.analytics.companiesIndexed,
      topQueries: this.analytics.topQueries.map(item => ({ ...item })),
    };

    if (this.analytics.lastQueryAt) {
      const lastQuery = cloneDate(this.analytics.lastQueryAt);
      if (lastQuery) {
        result.lastQueryAt = lastQuery;
      }
    }

    return result;
  }

  listCompanies(): Company[] {
    return Array.from(this.companies.values()).map(company => ({
      ...company,
      createdAt: cloneDate(company.createdAt)!,
      updatedAt: cloneDate(company.updatedAt)!,
      lastUpdated: cloneDate(company.lastUpdated)!,
    }));
  }
}

export const mockDb = new MockDataStore();
export type {
  CardRecord,
  EnrichmentRecord,
  OcrJobRecord,
  UploadRecord,
  SessionRecord,
  UserRecord,
  CreateCardInput,
};
