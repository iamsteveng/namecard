import { mockDb } from '@namecard/shared';
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

const SUPPORTED_METHODS = ['GET', 'POST', 'OPTIONS'];

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

const runCardSearch = (userId: string, searchTerm: string, limit = 10) => {
  const listResult = mockDb.listCards({
    userId,
    page: 1,
    limit,
    query: searchTerm,
    tags: [],
    company: undefined,
  });

  const highlights = listResult.items.map(card => ({
    cardId: card.id,
    snippet: searchTerm
      ? `Match on ${searchTerm} in ${card.company ?? 'card details'}`
      : 'Indexed card record',
  }));

  const latencyMs = Math.floor(Math.random() * 30) + 35;
  mockDb.recordSearch(searchTerm, latencyMs, listResult.items.length);

  const results = listResult.items.map((card, index) => ({
    item: card,
    rank: Number((1 - index / Math.max(listResult.items.length, 1)).toFixed(4)),
    highlights: highlights.find(highlight => highlight.cardId === card.id)?.snippet ?? null,
  }));

  return {
    results,
    highlights,
    latencyMs,
    searchMeta: {
      query: searchTerm,
      totalMatches: listResult.total,
      executionTime: `${latencyMs}ms`,
      page: 1,
      limit,
    },
  };
};

const handleHealth = (requestId: string) => {
  const analytics = mockDb.getSearchAnalytics();

  return withCors(
    createSuccessResponse(
      {
        service: 'search',
        status: 'ok',
        requestId,
        analytics,
        search: {
          status: 'ok',
          latencyMs: analytics.averageLatencyMs,
          indexes: {
            cardsIndexed: analytics.cardsIndexed,
            companiesIndexed: analytics.companiesIndexed,
          },
        },
      },
      { message: 'Search service healthy' }
    )
  );
};

const handleAnalytics = (requestId: string) => {
  const analytics = mockDb.getSearchAnalytics();

  return withCors(
    createSuccessResponse(
      {
        requestId,
        analytics,
      },
      { message: 'Search analytics retrieved' }
    )
  );
};

const handleCardsSearch = (event: LambdaHttpEvent, requestId: string) => {
  try {
    const user = requireAuthenticatedUser(event);
    const query = getQuery(event);
    const searchTerm = query.q ?? '';
    const limit = query.limit ? Number(query.limit) : 10;

    const result = runCardSearch(user.id, searchTerm, limit);

    return withCors(
      createSuccessResponse(
        {
          requestId,
          results: result.results,
          searchMeta: result.searchMeta,
          highlights: result.highlights,
          latencyMs: result.latencyMs,
        },
        { message: 'Card search completed' }
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

const handleCardsSearchPost = (event: LambdaHttpEvent, requestId: string) => {
  try {
    const user = requireAuthenticatedUser(event);
    const body = parseBody<{ query?: string; q?: string; limit?: number; searchMode?: string }>(event);

    const normalizedQuery = body.query ?? body.q ?? '';
    if (body.searchMode === 'boolean' && normalizedQuery.includes('(') && !normalizedQuery.includes(')')) {
      return withCors(
        createErrorResponse(400, 'Invalid boolean search expression', {
          code: 'INVALID_QUERY',
        })
      );
    }

    const searchResult = runCardSearch(user.id, normalizedQuery, body.limit ?? 10);

    return withCors(
      createSuccessResponse(
        {
          requestId,
          results: searchResult.results,
          searchMeta: {
            ...searchResult.searchMeta,
            mode: body.searchMode ?? 'simple',
          },
          latencyMs: searchResult.latencyMs,
        },
        { message: 'Card search completed' }
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

const handleCompaniesSearch = (event: LambdaHttpEvent, requestId: string) => {
  try {
    void requireAuthenticatedUser(event);
    const query = getQuery(event);
    const searchTerm = (query.q ?? '').toLowerCase();
    const companies = mockDb
      .listCompanies()
      .filter(company =>
        !searchTerm
          ? true
          : company.name.toLowerCase().includes(searchTerm) ||
            (company.industry ?? '').toLowerCase().includes(searchTerm)
      )
      .slice(0, query.limit ? Number(query.limit) : 5)
      .map(company => ({
        ...company,
        score: 0.8,
        highlights: searchTerm
          ? [`Matched ${searchTerm} in company profile`]
          : ['Included in company index'],
      }));

    mockDb.recordSearch(searchTerm, 40, companies.length);

    return withCors(
      createSuccessResponse(
        {
          requestId,
          query: searchTerm,
          companies,
        },
        { message: 'Company search completed' }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to search companies';
    return withCors(createErrorResponse(500, message));
  }
};

const handleUnifiedQuery = (event: LambdaHttpEvent, requestId: string) => {
  try {
    const user = requireAuthenticatedUser(event);
    const body = parseBody<{
      query?: string;
      includeCompanies?: boolean;
      limit?: number;
    }>(event);

    const searchTerm = body.query ?? '';
    const limit = body.limit ?? 10;

    const cardsResult = runCardSearch(user.id, searchTerm, limit);
    const includeCompanies = body.includeCompanies ?? true;

    const companies = includeCompanies
      ? mockDb
          .listCompanies()
          .filter(company =>
            !searchTerm
              ? true
              : company.name.toLowerCase().includes(searchTerm.toLowerCase())
          )
          .slice(0, 5)
      : [];

    return withCors(
      createSuccessResponse(
        {
          requestId,
          query: searchTerm,
          latencyMs: cardsResult.latencyMs,
          cards: cardsResult.results.map(result => result.item),
          highlights: cardsResult.highlights,
          companies,
          results: cardsResult.results,
          searchMeta: cardsResult.searchMeta,
        },
        { message: 'Search query processed' }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to process search query';
    return withCors(createErrorResponse(500, message));
  }
};

const handleSuggestions = (event: LambdaHttpEvent, requestId: string) => {
  try {
    const query = getQuery(event);
    const prefix = (query.prefix ?? '').toLowerCase();
    const limit = query.maxSuggestions ? Number(query.maxSuggestions) : 5;

    const user = requireAuthenticatedUser(event);
    const cards = mockDb.listCards({
      userId: user.id,
      page: 1,
      limit: 100,
      query: '',
      tags: [],
      company: undefined,
    }).items;
    const pool = new Set<string>();
    cards.forEach(card => {
      if (card.name) pool.add(card.name);
      if (card.company) pool.add(card.company);
      card.tags?.forEach(tag => pool.add(tag));
    });

    const suggestions = Array.from(pool)
      .filter(value => (prefix ? value.toLowerCase().includes(prefix) : true))
      .slice(0, limit)
      .map(value => ({ text: value, type: 'card' }));

    return withCors({
      statusCode: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(suggestions),
    });
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to fetch suggestions';
    return withCors(createErrorResponse(500, message));
  }
};

const handleFilters = (event: LambdaHttpEvent, requestId: string) => {
  try {
    const cards = mockDb.listCards({
      userId: requireAuthenticatedUser(event).id,
      page: 1,
      limit: 100,
      query: '',
      tags: [],
      company: undefined,
    }).items;
    const companies = new Set<string>();
    const tags = new Set<string>();
    const industries = new Set<string>();

    cards.forEach(card => {
      if (card.company) companies.add(card.company);
      card.tags?.forEach(tag => tags.add(tag));
    });

    mockDb.listCompanies().forEach(company => {
      industries.add(company.industry ?? 'General');
    });

    return withCors(
      createSuccessResponse(
        {
          requestId,
          filters: {
            companies: Array.from(companies),
            tags: Array.from(tags),
            industries: Array.from(industries),
          },
        },
        { message: 'Filter metadata available' }
      )
    );
  } catch (error) {
    if ('statusCode' in (error as any)) {
      return withCors(error as any);
    }
    const message = error instanceof Error ? error.message : 'Unable to fetch filters';
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

  if (segments.length < 2 || segments[0] !== 'v1' || segments[1] !== 'search') {
    return withCors(createErrorResponse(404, 'Route not found', { code: 'NOT_FOUND' }));
  }

  const tail = segments.slice(2);

  if (tail.length === 0 || tail[0] === 'health') {
    return handleHealth(requestId);
  }

  if (tail[0] === 'analytics' && method === 'GET') {
    return handleAnalytics(requestId);
  }

  if (tail[0] === 'cards' && method === 'GET') {
    return handleCardsSearch(event, requestId);
  }

  if (tail[0] === 'cards' && method === 'POST') {
    return handleCardsSearchPost(event, requestId);
  }

  if (tail[0] === 'suggestions' && method === 'GET') {
    return handleSuggestions(event, requestId);
  }

  if (tail[0] === 'filters' && method === 'GET') {
    return handleFilters(event, requestId);
  }

  if (tail[0] === 'companies' && method === 'GET') {
    return handleCompaniesSearch(event, requestId);
  }

  if (tail[0] === 'query' && method === 'POST') {
    return handleUnifiedQuery(event, requestId);
  }

  return withCors(createErrorResponse(405, 'Method not allowed', { code: 'METHOD_NOT_ALLOWED' }));
};
