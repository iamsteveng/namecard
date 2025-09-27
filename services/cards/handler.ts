import {
  mockDb,
  normalizePaginationParams,
  calculatePaginationMeta,
  type CreateCardInput,
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

const requireAuthenticatedUser = (event: LambdaHttpEvent) => {
  const token = extractBearerToken(event);
  if (!token) {
    throw createErrorResponse(401, 'Authorization token missing', { code: 'UNAUTHORIZED' });
  }

  const user = mockDb.getUserForToken(token);
  if (!user) {
    throw createErrorResponse(401, 'Invalid or expired access token', { code: 'UNAUTHORIZED' });
  }

  return user;
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
    return raw.flatMap(value => value.split(',')).map(tag => tag.trim()).filter(Boolean);
  }

  return raw
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
};

const handleHealth = (requestId: string) =>
  withCors(
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
          indexedCards: mockDb.getSearchAnalytics().cardsIndexed,
          averageProcessingMs: 2800,
          pendingUploads: 0,
        },
      },
      { message: 'Cards service healthy' }
    )
  );

const handleListCards = (event: LambdaHttpEvent, requestId: string) => {
  try {
    const user = requireAuthenticatedUser(event);
    const tenantId = mockDb.getTenantForUser(user.id);
    const query = getQuery(event);

    const paginationBase = normalizePaginationParams({
      page: query.page,
      limit: query.limit,
      sort: 'desc',
      sortBy: 'updatedAt',
    });

    const tags = parseTags(query.tags);
    const searchTerm = query.q ?? query.query ?? undefined;

    const result = mockDb.listCards({
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
    return withCors(createErrorResponse(500, message));
  }
};

const handleGetCard = (event: LambdaHttpEvent, requestId: string, cardId: string) => {
  try {
    const user = requireAuthenticatedUser(event);
    const card = mockDb.getCard(cardId);

    if (!card || card.userId !== user.id) {
      return withCors(createErrorResponse(404, 'Card not found', { code: 'CARD_NOT_FOUND' }));
    }

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
    return withCors(createErrorResponse(500, message));
  }
};

const handleCreateCard = (event: LambdaHttpEvent, requestId: string) => {
  try {
    const user = requireAuthenticatedUser(event);
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
    const tenantId = mockDb.getTenantForUser(user.id);
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

    const card = mockDb.createCard(input);

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
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to create card';
    return withCors(createErrorResponse(500, message));
  }
};

const handleUpdateCard = (event: LambdaHttpEvent, requestId: string, cardId: string) => {
  try {
    const user = requireAuthenticatedUser(event);
    const body = parseBody<Record<string, unknown>>(event);

    const card = mockDb.getCard(cardId);
    if (!card || card.userId !== user.id) {
      return withCors(createErrorResponse(404, 'Card not found', { code: 'CARD_NOT_FOUND' }));
    }

    const updated = mockDb.updateCard(cardId, {
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
    return withCors(createErrorResponse(500, message));
  }
};

const handleDeleteCard = (event: LambdaHttpEvent, requestId: string, cardId: string) => {
  try {
    const user = requireAuthenticatedUser(event);
    const card = mockDb.getCard(cardId);

    if (!card || card.userId !== user.id) {
      return withCors(createErrorResponse(404, 'Card not found', { code: 'CARD_NOT_FOUND' }));
    }

    mockDb.deleteCard(cardId);

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
    return withCors(createErrorResponse(500, message));
  }
};

const handleStats = (event: LambdaHttpEvent, requestId: string) => {
  try {
    const user = requireAuthenticatedUser(event);
    const stats = mockDb.getCardStats(user.id);

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
    return withCors(createErrorResponse(500, message));
  }
};

const handleSearch = (event: LambdaHttpEvent, requestId: string) => {
  try {
    const user = requireAuthenticatedUser(event);
    const query = getQuery(event);
    const searchTerm = query.q ?? '';
    const tags = parseTags(query.tags);

    const paginationBase = normalizePaginationParams({
      page: query.page,
      limit: query.limit ?? 10,
      sort: 'desc',
      sortBy: 'updatedAt',
    });

    const result = mockDb.listCards({
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
        ? `Matched on \"${searchTerm}\" in ${card.company ? card.company : 'card details'}`
        : 'Full card index match',
    }));

    const latency = Math.floor(Math.random() * 30) + 20;
    mockDb.recordSearch(searchTerm, latency, result.items.length);

    return withCors(
      createSuccessResponse(
        {
          requestId,
          results: result.items.map(card => ({
            item: card,
            rank: Number((Math.random() * 0.2 + 0.8).toFixed(4)),
            highlights:
              highlights.find(highlight => highlight.cardId === card.id)?.snippet ?? null,
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
    return withCors(createErrorResponse(500, message));
  }
};

const handleScan = (event: LambdaHttpEvent, requestId: string) => {
  try {
    const user = requireAuthenticatedUser(event);
    const tenantId = mockDb.getTenantForUser(user.id);
    const body = parseBody<{ fileName?: string; imageUrl?: string; tags?: string[] | string }>(event);
    const tags = Array.isArray(body.tags)
      ? body.tags
      : typeof body.tags === 'string'
        ? parseTags(body.tags)
        : [];

    const card = mockDb.createCard({
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

    const ocrJob = mockDb.createOcrJob(card.id, {
      requestedBy: user.id,
      payload: {
        source: 'api.scan',
        fileName: body.fileName ?? 'upload.jpg',
      },
    });

    const enrichment = mockDb.createEnrichment(card.id, {
      requestedBy: user.id,
      companyId: undefined,
    });

    return withCors(
      createSuccessResponse(
        {
          requestId,
          card,
          ocrJobId: ocrJob.id,
          enrichmentId: enrichment.id,
          confidence: ocrJob.result?.confidence ?? 0.9,
          imageUrls: {
            original: card.originalImageUrl,
            processed: card.processedImageUrl ?? null,
          },
        },
        { message: 'Card scanned successfully', statusCode: 201 }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to scan card';
    return withCors(createErrorResponse(500, message));
  }
};

const handleTag = (event: LambdaHttpEvent, requestId: string, cardId: string) => {
  try {
    const user = requireAuthenticatedUser(event);
    const body = parseBody<{ tag?: string }>(event);
    const card = mockDb.getCard(cardId);

    if (!card || card.userId !== user.id) {
      return withCors(createErrorResponse(404, 'Card not found', { code: 'CARD_NOT_FOUND' }));
    }

    if (!body.tag) {
      return withCors(createErrorResponse(400, 'Tag is required', { code: 'INVALID_INPUT' }));
    }

    const updated = mockDb.addTag(cardId, body.tag);

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
    return withCors(createErrorResponse(500, message));
  }
};

export const handler = async (event: LambdaHttpEvent) => {
  const method = event.httpMethod ?? 'GET';
  const requestId = getRequestId(event);
  const segments = getPathSegments(event);

  if (method === 'OPTIONS') {
    return buildCorsResponse();
  }

  if (segments.length < 2 || segments[0] !== 'v1' || segments[1] !== 'cards') {
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

  return withCors(createErrorResponse(405, 'Method not allowed', { code: 'METHOD_NOT_ALLOWED' }));
};
