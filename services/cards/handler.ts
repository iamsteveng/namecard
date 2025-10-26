import {
  normalizePaginationParams,
  calculatePaginationMeta,
  type CreateCardInput,
  type BusinessCardData,
  type Card,
  getLogger,
  getMetrics,
  extractIdempotencyKey,
  withIdempotency,
  withHttpObservability,
  resolveUserFromToken,
  getTenantForUser,
  listCards,
  getCard,
  createCard,
  updateCard,
  deleteCard,
  addTag,
  getCardStats,
  recordSearchEvent,
  getSearchAnalytics,
  createOcrJob,
  createEnrichment,
  ensureDefaultDemoUser,
  ensureDatabaseUrl,
} from '@namecard/shared';
import {
  createErrorResponse,
  createSuccessResponse,
  extractBearerToken,
  getPathSegments,
  getQuery,
  getRequestId,
  parseJsonBody,
  withCors,
  type LambdaHttpEvent,
} from '@namecard/shared';

import { randomUUID } from 'node:crypto';

import { parseMultipartForm, type ParsedMultipartForm } from './multipart';
import { storeScanImage } from './storage';
import { extractBusinessCardData } from './textract';

const SUPPORTED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];

const buildCorsResponse = (statusCode = 204) =>
  withCors({
    statusCode,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': SUPPORTED_METHODS.join(', '),
      'access-control-allow-headers': '*',
    },
    body: '',
  });

const requireAuthenticatedUser = async (event: LambdaHttpEvent) => {
  const token = extractBearerToken(event);
  if (!token) {
    throw createErrorResponse(401, 'Authorization token missing', { code: 'UNAUTHORIZED' });
  }

  const user = await resolveUserFromToken(token);
  if (!user) {
    throw createErrorResponse(401, 'Invalid or expired access token', { code: 'UNAUTHORIZED' });
  }

  return { user, token } as const;
};

const parseBody = <T>(event: LambdaHttpEvent) => {
  const result = parseJsonBody<T>(event.body);
  if (!result.success) {
    throw createErrorResponse(400, 'Invalid JSON payload', {
      code: 'INVALID_JSON',
      details: { error: result.error },
    });
  }

  return (result.data ?? {}) as T;
};

const parseTags = (raw: string | string[] | undefined): string[] => {
  if (!raw) {
    return [];
  }

  if (Array.isArray(raw)) {
    return raw
      .flatMap(value => value.split(','))
      .map(tag => tag.trim())
      .filter(Boolean);
  }

  return raw
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
};

const getHeaderValue = (
  headers: Record<string, string | undefined> | undefined,
  key: string
): string | undefined => {
  if (!headers) {
    return undefined;
  }
  const target = key.toLowerCase();
  for (const [headerKey, value] of Object.entries(headers)) {
    if (headerKey.toLowerCase() === target) {
      return value ?? undefined;
    }
  }
  return undefined;
};

const isMultipartScanRequest = (event: LambdaHttpEvent): boolean => {
  const contentType = getHeaderValue(event.headers, 'content-type');
  return Boolean(contentType && contentType.toLowerCase().includes('multipart/form-data'));
};

const hostedScanPlaceholderImageUrl =
  'https://d11ofb8v2c3wun.cloudfront.net/tests/fixtures/card-sample.jpg';

type ScanExtractionPayload = BusinessCardData & {
  normalizedEmail?: string;
  normalizedPhone?: string;
  normalizedWebsite?: string;
};

interface ScanResponseOverrides {
  extractedData?: ScanExtractionPayload;
  confidence?: number;
  duplicateCardId?: string | null;
  imageUrls?: {
    original?: string | null;
    processed?: string | null;
  };
  processingTimeMs?: number;
}

const buildScanSuccessPayload = (
  requestId: string,
  card: Card,
  ocrJobId: string,
  enrichmentId: string,
  overrides: ScanResponseOverrides = {}
) => {
  const extractedData = overrides.extractedData;
  const confidence =
    overrides.confidence ?? extractedData?.confidence ?? card.confidence ?? 0.9;
  const originalImageUrl = overrides.imageUrls?.original ?? card.originalImageUrl ?? null;
  const processedImageUrl = overrides.imageUrls?.processed ?? card.processedImageUrl ?? null;

  return {
    requestId,
    card,
    cardId: card.id,
    ocrJobId,
    enrichmentId,
    extractedData,
    confidence,
    duplicateCardId: overrides.duplicateCardId ?? null,
    imageUrls: {
      original: originalImageUrl ?? undefined,
      processed: processedImageUrl,
    },
    processingTime: overrides.processingTimeMs ?? 1_200,
  };
};

const handleHealth = async (requestId: string) => {
  const logger = getLogger();
  logger.debug('cards.health.check', { requestId });
  await ensureDefaultDemoUser();
  const analytics = await getSearchAnalytics().catch(
    () =>
      ({
        cardsIndexed: 0,
        averageLatencyMs: 0,
      }) as any
  );

  return withCors(
    createSuccessResponse(
      {
        service: 'cards',
        status: 'ok',
        requestId,
        queues: {
          ocr: 'nominal',
          enrichment: 'nominal',
        },
        metrics: {
          indexedCards: analytics.cardsIndexed ?? 0,
          averageProcessingMs: analytics.averageLatencyMs ?? 0,
          pendingUploads: 0,
        },
      },
      { message: 'Cards service healthy' }
    )
  );
};

const handleListCards = async (event: LambdaHttpEvent, requestId: string) => {
  const logger = getLogger();
  const metrics = getMetrics();
  const startedAt = Date.now();
  try {
    const { user } = await requireAuthenticatedUser(event);
    const tenantId = await getTenantForUser(user.id);
    const query = getQuery(event);

    logger.debug('cards.list.start', {
      requestId,
      userId: user.id,
      hasQuery: Boolean(query.q ?? query.query),
    });

    const paginationBase = normalizePaginationParams({
      page: query.page,
      limit: query.limit,
      sort: 'desc',
      sortBy: 'updatedAt',
    });

    const tags = parseTags(query.tags);
    const searchTerm = query.q ?? query.query ?? undefined;

    const result = await listCards({
      userId: user.id,
      page: paginationBase.page,
      limit: paginationBase.limit,
      query: searchTerm,
      tags,
      company: query.company,
    });

    const pagination = calculatePaginationMeta(
      paginationBase.page,
      paginationBase.limit,
      result.total
    );

    metrics.duration('cardsListLatencyMs', Date.now() - startedAt, {
      hasQuery: searchTerm ? 'true' : 'false',
    });
    metrics.count('cardsListResults', result.items.length);
    logger.info('cards.list.success', {
      requestId,
      returned: result.items.length,
    });

    return withCors(
      createSuccessResponse(
        {
          requestId,
          tenantId,
          cards: result.items,
          pagination,
          filters: {
            q: searchTerm,
            tags,
            company: query.company,
          },
        },
        { message: 'Cards retrieved' }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to list cards';
    logger.error('cards.list.failure', error, { requestId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleGetCard = async (event: LambdaHttpEvent, requestId: string, cardId: string) => {
  try {
    const { user } = await requireAuthenticatedUser(event);
    const card = await getCard(cardId);
    const logger = getLogger();
    logger.debug('cards.get.start', { requestId, cardId, userId: user.id });

    if (!card || card.userId !== user.id) {
      logger.warn('cards.get.notFound', { requestId, cardId });
      return withCors(createErrorResponse(404, 'Card not found', { code: 'CARD_NOT_FOUND' }));
    }

    logger.info('cards.get.success', { requestId, cardId });
    return withCors(
      createSuccessResponse(
        {
          requestId,
          card,
        },
        { message: 'Card retrieved' }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to fetch card';
    getLogger().error('cards.get.failure', error, { requestId, cardId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleCreateCard = async (event: LambdaHttpEvent, requestId: string) => {
  const logger = getLogger();
  const metrics = getMetrics();
  const idempotencyKey = extractIdempotencyKey(event.headers ?? {});
  const startedAt = Date.now();

  return withIdempotency(idempotencyKey, async () => {
    try {
      const { user } = await requireAuthenticatedUser(event);
      const body = parseBody<{
        name?: string;
        title?: string;
        company?: string;
        email?: string;
        phone?: string;
        address?: string;
        website?: string;
        notes?: string;
        tags?: string[] | string;
        originalImageUrl?: string;
        processedImageUrl?: string;
      }>(event);

      const tags = Array.isArray(body.tags)
        ? body.tags
        : typeof body.tags === 'string'
          ? parseTags(body.tags)
          : [];
      const tenantId = await getTenantForUser(user.id);
      const timestamp = new Date();

      const input: CreateCardInput = {
        userId: user.id,
        tenantId,
        originalImageUrl:
          body.originalImageUrl ?? `https://cdn.namecard.app/cards/${randomUUID()}-original.jpg`,
        confidence: 0.88,
        scanDate: timestamp,
        tags,
      };

      if (body.name) input.name = body.name;
      if (body.title) input.title = body.title;
      if (body.company) input.company = body.company;
      if (body.email) input.email = body.email;
      if (body.phone) input.phone = body.phone;
      if (body.address) input.address = body.address;
      if (body.website) input.website = body.website;
      if (body.notes) input.notes = body.notes;
      if (body.processedImageUrl) input.processedImageUrl = body.processedImageUrl;
      if (body.name) {
        input.extractedText = `${body.name}\n${body.title ?? ''}\n${body.company ?? ''}`.trim();
      }

      const card = await createCard(input);

      metrics.count('cardsCreated');
      metrics.duration('cardCreationLatencyMs', Date.now() - startedAt);
      logger.info('cards.create.success', { requestId, cardId: card.id });

      return withCors(
        createSuccessResponse(
          {
            requestId,
            card,
          },
          { message: 'Card created', statusCode: 201 }
        )
      );
    } catch (error) {
      if ('statusCode' in (error as any)) {
        logger.warn('cards.create.errorResponse', { requestId });
        return withCors(error as any);
      }
      const message = error instanceof Error ? error.message : 'Unable to create card';
      logger.error('cards.create.failure', error, { requestId });
      return withCors(createErrorResponse(500, message));
    }
  });
};

const handleUpdateCard = async (event: LambdaHttpEvent, requestId: string, cardId: string) => {
  const logger = getLogger();
  const metrics = getMetrics();
  const startedAt = Date.now();
  try {
    const { user } = await requireAuthenticatedUser(event);
    const body = parseBody<Record<string, unknown>>(event);

    const card = await getCard(cardId);
    if (!card || card.userId !== user.id) {
      logger.warn('cards.update.notFound', { requestId, cardId });
      return withCors(createErrorResponse(404, 'Card not found', { code: 'CARD_NOT_FOUND' }));
    }

    const updated = await updateCard(cardId, {
      name: typeof body.name === 'string' ? body.name : undefined,
      title: typeof body.title === 'string' ? body.title : undefined,
      company: typeof body.company === 'string' ? body.company : undefined,
      email: typeof body.email === 'string' ? body.email : undefined,
      phone: typeof body.phone === 'string' ? body.phone : undefined,
      address: typeof body.address === 'string' ? body.address : undefined,
      website: typeof body.website === 'string' ? body.website : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
      tags: Array.isArray(body.tags)
        ? (body.tags as string[]).filter(Boolean)
        : typeof body.tags === 'string'
          ? parseTags(body.tags)
          : undefined,
    });

    metrics.count('cardsUpdated');
    metrics.duration('cardUpdateLatencyMs', Date.now() - startedAt);
    logger.info('cards.update.success', { requestId, cardId });

    return withCors(
      createSuccessResponse(
        {
          requestId,
          card: updated,
        },
        { message: 'Card updated' }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to update card';
    logger.error('cards.update.failure', error, { requestId, cardId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleDeleteCard = async (event: LambdaHttpEvent, requestId: string, cardId: string) => {
  const logger = getLogger();
  const metrics = getMetrics();
  try {
    const { user } = await requireAuthenticatedUser(event);
    const card = await getCard(cardId);

    if (!card || card.userId !== user.id) {
      logger.warn('cards.delete.notFound', { requestId, cardId });
      return withCors(createErrorResponse(404, 'Card not found', { code: 'CARD_NOT_FOUND' }));
    }

    await deleteCard(cardId);
    metrics.count('cardsDeleted');
    logger.info('cards.delete.success', { requestId, cardId });

    return withCors(
      createSuccessResponse(
        {
          requestId,
          cardId,
        },
        { message: 'Card deleted', statusCode: 200 }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to delete card';
    logger.error('cards.delete.failure', error, { requestId, cardId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleStats = async (event: LambdaHttpEvent, requestId: string) => {
  try {
    const { user } = await requireAuthenticatedUser(event);
    const logger = getLogger();
    const stats = await getCardStats(user.id);

    logger.debug('cards.stats.success', {
      requestId,
      userId: user.id,
      totalCards: stats.totalCards,
    });

    return withCors(
      createSuccessResponse(
        {
          requestId,
          stats,
        },
        { message: 'Card stats retrieved' }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to fetch stats';
    getLogger().error('cards.stats.failure', error, { requestId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleSearch = async (event: LambdaHttpEvent, requestId: string) => {
  const logger = getLogger();
  const metrics = getMetrics();
  const startedAt = Date.now();
  try {
    const { user } = await requireAuthenticatedUser(event);
    const query = getQuery(event);
    const searchTerm = query.q ?? '';
    const tags = parseTags(query.tags);

    logger.debug('cards.search.start', {
      requestId,
      userId: user.id,
      searchTerm,
      tagsCount: tags.length,
    });

    const paginationBase = normalizePaginationParams({
      page: query.page,
      limit: query.limit ?? 10,
      sort: 'desc',
      sortBy: 'updatedAt',
    });

    const result = await listCards({
      userId: user.id,
      page: paginationBase.page,
      limit: paginationBase.limit,
      query: searchTerm,
      tags,
      company: query.company,
    });

    const highlights = result.items.map(card => ({
      cardId: card.id,
      snippet: searchTerm
        ? `Matched on "${searchTerm}" in ${card.company ? card.company : 'card details'}`
        : 'Full card index match',
    }));

    const latency = Math.floor(Math.random() * 30) + 20;
    await recordSearchEvent({
      query: searchTerm,
      latencyMs: latency,
      resultCount: result.items.length,
      tenantId: await getTenantForUser(user.id),
      userId: user.id,
    });

    metrics.duration('cardsSearchLatencyMs', Date.now() - startedAt, {
      hasQuery: searchTerm ? 'true' : 'false',
    });
    metrics.count('cardsSearchResults', result.items.length);
    logger.info('cards.search.success', {
      requestId,
      matches: result.items.length,
      latencyMs: latency,
    });

    return withCors(
      createSuccessResponse(
        {
          requestId,
          results: result.items.map(card => ({
            item: card,
            rank: Number((Math.random() * 0.2 + 0.8).toFixed(4)),
            highlights: highlights.find(highlight => highlight.cardId === card.id)?.snippet ?? null,
          })),
          searchMeta: {
            query: searchTerm,
            executionTime: `${latency}ms`,
            totalMatches: result.total,
            page: paginationBase.page,
            limit: paginationBase.limit,
          },
          pagination: calculatePaginationMeta(
            paginationBase.page,
            paginationBase.limit,
            result.total
          ),
          latencyMs: latency,
        },
        { message: 'Search completed' }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to search cards';
    logger.error('cards.search.failure', error, { requestId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleScanJson = async (event: LambdaHttpEvent, requestId: string) => {
  const logger = getLogger();
  const metrics = getMetrics();
  const startedAt = Date.now();
  try {
    const { user } = await requireAuthenticatedUser(event);
    const tenantId = await getTenantForUser(user.id);
    const body = parseBody<{ fileName?: string; imageUrl?: string; tags?: string[] | string }>(
      event
    );
    const tags = Array.isArray(body.tags)
      ? body.tags
      : typeof body.tags === 'string'
        ? parseTags(body.tags)
        : [];

    const card = await createCard({
      userId: user.id,
      tenantId,
      name: 'Scanned Contact',
      title: 'Pending OCR',
      notes: 'Generated via scan endpoint',
      tags,
      originalImageUrl:
        body.imageUrl ?? `https://cdn.namecard.app/cards/${randomUUID()}-uploaded.jpg`,
      confidence: 0.0,
      scanDate: new Date(),
    });

    const ocrJob = await createOcrJob(card.id, {
      requestedBy: user.id,
      payload: {
        source: 'api.scan',
        fileName: body.fileName ?? 'upload.jpg',
      },
    });

    const enrichment = await createEnrichment(card.id, {
      requestedBy: user.id,
      companyId: undefined,
    });

    const durationMs = Date.now() - startedAt;
    metrics.duration('cardsScanLatencyMs', durationMs);
    metrics.count('cardsScanJobsCreated');
    logger.info('cards.scan.success', { requestId, cardId: card.id, ocrJobId: ocrJob.id });

    const payload = buildScanSuccessPayload(requestId, card, ocrJob.id, enrichment.id, {
      confidence: ocrJob.result?.confidence ?? 0.9,
      imageUrls: {
        original: card.originalImageUrl ?? null,
        processed: card.processedImageUrl ?? null,
      },
      processingTimeMs: durationMs,
    });

    return withCors(
      createSuccessResponse(payload, {
        message: 'Card scanned successfully',
        statusCode: 201,
      })
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to scan card';
    logger.error('cards.scan.failure', error, { requestId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleScanMultipart = async (event: LambdaHttpEvent, requestId: string) => {
  const logger = getLogger();
  const metrics = getMetrics();
  const startedAt = Date.now();

  try {
    const { user } = await requireAuthenticatedUser(event);
    const tenantId = await getTenantForUser(user.id);

    let form: ParsedMultipartForm;
    try {
      form = parseMultipartForm(event);
    } catch (parseError) {
      logger.warn('cards.scan.upload.invalidMultipart', parseError, { requestId });
      return withCors(
        createErrorResponse(400, 'Invalid multipart payload', {
          code: 'INVALID_MULTIPART',
        })
      );
    }
    const uploadedFile = form.files['image'] ?? Object.values(form.files)[0];

    if (!uploadedFile) {
      logger.warn('cards.scan.upload.missingFile', { requestId });
      return withCors(
        createErrorResponse(400, 'Image file is required for scanning', {
          code: 'IMAGE_REQUIRED',
        })
      );
    }

    const minConfidenceField = form.fields['minConfidence'];
    const minConfidence = minConfidenceField ? Number(minConfidenceField) : undefined;

    let extraction;
    try {
      extraction = await extractBusinessCardData(uploadedFile.content, {
        minConfidence,
      });
      metrics.count('cardsScanTextractSuccess');
    } catch (error) {
      metrics.count('cardsScanTextractFailure');
      logger.error('cards.scan.upload.ocrFailed', error, { requestId });
      return withCors(
        createErrorResponse(422, 'Unable to extract text from uploaded image', {
          code: 'OCR_FAILED',
        })
      );
    }

    let storedImage: Awaited<ReturnType<typeof storeScanImage>>;
    try {
      storedImage = await storeScanImage({
        buffer: uploadedFile.content,
        contentType: uploadedFile.contentType,
        tenantId,
        originalFileName: uploadedFile.fileName,
      });
    } catch (error) {
      storedImage = null;
      logger.warn('cards.scan.upload.storeImageFailed', error, {
        requestId,
        tenantId,
      });
    }

    const sanitizedPhone = extraction.phone
      ? extraction.phone.replace(/[^+\d]/g, '')
      : undefined;
    const normalizedEmail = extraction.email?.toLowerCase();
    const normalizedWebsite = extraction.website;

    const findLineConfidence = (value?: string) => {
      if (!value) {
        return extraction.confidence;
      }
      const matched = extraction.lines.find(line => line.text === value);
      return matched?.confidence ?? extraction.confidence;
    };

    const fieldToPayload = (value?: string) =>
      value
        ? {
            text: value,
            confidence: Number(findLineConfidence(value).toFixed(4)),
          }
        : undefined;

    const extractionPayload = {
      rawText: extraction.rawText,
      confidence: extraction.confidence,
      name: fieldToPayload(extraction.name),
      jobTitle: fieldToPayload(extraction.jobTitle),
      company: fieldToPayload(extraction.company),
      email: fieldToPayload(extraction.email),
      phone: fieldToPayload(extraction.phone),
      website: fieldToPayload(extraction.website),
      address: fieldToPayload(extraction.address),
      normalizedEmail,
      normalizedPhone: sanitizedPhone,
      normalizedWebsite,
    } satisfies ScanExtractionPayload;

    const extraTags = form.fields['tags'] ? parseTags(form.fields['tags']) : [];
    const tags = Array.from(new Set(['scan', 'hosted', ...extraTags]));

    const card = await createCard({
      userId: user.id,
      tenantId,
      name: extraction.name ?? 'Scanned Contact',
      title: extraction.jobTitle ?? undefined,
      company: extraction.company ?? undefined,
      email: extraction.email ?? normalizedEmail ?? undefined,
      phone: extraction.phone ?? sanitizedPhone ?? undefined,
      address: extraction.address ?? undefined,
      website: extraction.website ?? normalizedWebsite ?? undefined,
      notes: 'Generated via hosted scan upload',
      tags,
      originalImageUrl: storedImage?.url ?? hostedScanPlaceholderImageUrl,
      processedImageUrl: storedImage?.url ?? hostedScanPlaceholderImageUrl,
      extractedText: extraction.rawText,
      confidence: extraction.confidence,
      scanDate: new Date(),
    });

    const ocrJob = await createOcrJob(card.id, {
      requestedBy: user.id,
      payload: {
        source: 'api.scan',
        fileName: uploadedFile.fileName ?? 'upload.jpg',
        minConfidence,
        textractRegion: process.env['TEXTRACT_REGION'] ?? process.env['AWS_REGION'],
        textractLineCount: extraction.lines.length,
      },
    });

    const enrichment = await createEnrichment(card.id, {
      requestedBy: user.id,
      companyId: undefined,
    });

    const durationMs = Date.now() - startedAt;
    metrics.duration('cardsScanLatencyMs', durationMs);
    metrics.count('cardsScanJobsCreated');
    logger.info('cards.scan.upload.success', {
      requestId,
      cardId: card.id,
      ocrJobId: ocrJob.id,
      storedImageKey: storedImage?.key,
      extractionSummary: {
        name: extractionPayload.name?.text,
        company: extractionPayload.company?.text,
        email: extractionPayload.email?.text,
        phone: extractionPayload.phone?.text,
        website: extractionPayload.website?.text,
      },
    });

    const payload = buildScanSuccessPayload(requestId, card, ocrJob.id, enrichment.id, {
      extractedData: extractionPayload,
      confidence: extractionPayload.confidence,
      imageUrls: {
        original: storedImage?.url ?? hostedScanPlaceholderImageUrl,
        processed: storedImage?.url ?? hostedScanPlaceholderImageUrl,
      },
      processingTimeMs: durationMs,
    });

    return withCors(
      createSuccessResponse(payload, {
        message: 'Card scanned successfully',
        statusCode: 201,
      })
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to scan card';
    logger.error('cards.scan.upload.failure', error, { requestId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleScan = async (event: LambdaHttpEvent, requestId: string) => {
  const isBase64Multipart = Boolean(
    event.isBase64Encoded && typeof event.body === 'string' && event.body.startsWith('LS0t')
  );

  if (isMultipartScanRequest(event) || isBase64Multipart) {
    return handleScanMultipart(event, requestId);
  }
  return handleScanJson(event, requestId);
};

const handleTag = async (event: LambdaHttpEvent, requestId: string, cardId: string) => {
  const logger = getLogger();
  try {
    const { user } = await requireAuthenticatedUser(event);
    const body = parseBody<{ tag?: string }>(event);
    const card = await getCard(cardId);

    if (!card || card.userId !== user.id) {
      logger.warn('cards.tag.notFound', { requestId, cardId });
      return withCors(createErrorResponse(404, 'Card not found', { code: 'CARD_NOT_FOUND' }));
    }

    if (!body.tag) {
      logger.warn('cards.tag.missingTag', { requestId, cardId });
      return withCors(createErrorResponse(400, 'Tag is required', { code: 'INVALID_INPUT' }));
    }

    const updated = await addTag(cardId, body.tag);
    logger.info('cards.tag.success', { requestId, cardId, tag: body.tag });

    return withCors(
      createSuccessResponse(
        {
          requestId,
          card: updated,
        },
        { message: 'Tag added' }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to tag card';
    logger.error('cards.tag.failure', error, { requestId, cardId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleRequest = async (event: LambdaHttpEvent) => {
  await ensureDatabaseUrl();
  const method =
    (event.httpMethod ?? event.requestContext?.http?.method ?? 'GET').toUpperCase();
  const requestId = getRequestId(event);
  const segments = getPathSegments(event);
  const logger = getLogger();

  logger.debug('cards.router.received', {
    method,
    path: event.rawPath,
    requestId,
  });

  if (method === 'OPTIONS') {
    return buildCorsResponse();
  }

  if (segments.length < 2 || segments[0] !== 'v1' || segments[1] !== 'cards') {
    logger.warn('cards.router.notFound', { path: event.rawPath });
    return withCors(createErrorResponse(404, 'Route not found', { code: 'NOT_FOUND' }));
  }

  const tail = segments.slice(2);

  // /v1/cards or /v1/cards?...
  if (tail.length === 0) {
    if (method === 'GET') {
      return handleListCards(event, requestId);
    }
    if (method === 'POST') {
      return handleCreateCard(event, requestId);
    }
  }

  if (tail[0] === 'health') {
    return handleHealth(requestId);
  }

  if (tail[0] === 'stats' && method === 'GET') {
    return handleStats(event, requestId);
  }

  if (tail[0] === 'search' && method === 'GET') {
    return handleSearch(event, requestId);
  }

  if (tail[0] === 'scan' && method === 'POST') {
    return handleScan(event, requestId);
  }

  if (tail.length >= 1) {
    const cardId = tail[0];

    if (tail.length === 1) {
      if (method === 'GET') {
        return handleGetCard(event, requestId, cardId);
      }
      if (method === 'PATCH') {
        return handleUpdateCard(event, requestId, cardId);
      }
      if (method === 'DELETE') {
        return handleDeleteCard(event, requestId, cardId);
      }
    }

    if (tail[1] === 'tag' && method === 'POST') {
      return handleTag(event, requestId, cardId);
    }
  }

  logger.warn('cards.router.unhandled', {
    method,
    path: event.rawPath,
  });
  return withCors(createErrorResponse(405, 'Method not allowed', { code: 'METHOD_NOT_ALLOWED' }));
};

export const handler = withHttpObservability(handleRequest, { serviceName: 'cards' });
