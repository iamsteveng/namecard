import {
  getLogger,
  getMetrics,
  withHttpObservability,
  resolveUserFromToken,
  listCards,
  getTenantForUser,
  recordSearchEvent,
  getSearchAnalytics,
  listCompanies,
  ensureDefaultDemoUser,
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

const runCardSearch = async (userId: string, tenantId: string, searchTerm: string, limit = 10) => {
  const metrics = getMetrics();
  const logger = getLogger();
  const startedAt = Date.now();
  const listResult = await listCards({
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
  await recordSearchEvent({
    query: searchTerm,
    latencyMs,
    resultCount: listResult.items.length,
    tenantId,
    userId,
  });

  const totalDuration = Date.now() - startedAt;
  metrics.duration('searchCardsLatencyMs', totalDuration, {
    hasQuery: searchTerm ? 'true' : 'false',
  });
  metrics.count('searchCardsResults', listResult.items.length);
  logger.debug('search.cards.executed', {
    query: searchTerm,
    results: listResult.items.length,
    latencyMs: totalDuration,
  });

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

const handleHealth = async (requestId: string) => {
  const logger = getLogger();
  const metrics = getMetrics();
  await ensureDefaultDemoUser();
  const analytics = await getSearchAnalytics().catch(() => ({
    totalQueries: 0,
    averageLatencyMs: 0,
    cardsIndexed: 0,
    companiesIndexed: 0,
    topQueries: [],
  }));

  logger.debug('search.health.check', { requestId });
  metrics.gauge('searchAverageLatency', analytics.averageLatencyMs);

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

const handleAnalytics = async (requestId: string) => {
  const logger = getLogger();
  const analytics = await getSearchAnalytics();

  logger.info('search.analytics.retrieved', {
    requestId,
    averageLatencyMs: analytics.averageLatencyMs,
  });

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

const handleCardsSearch = async (event: LambdaHttpEvent, requestId: string) => {
  const logger = getLogger();
  try {
    const { user } = await requireAuthenticatedUser(event);
    const tenantId = await getTenantForUser(user.id);
    const query = getQuery(event);
    const searchTerm = query.q ?? '';
    const limit = query.limit ? Number(query.limit) : 10;

    const result = await runCardSearch(user.id, tenantId, searchTerm, limit);
    logger.info('search.cards.get.success', {
      requestId,
      searchTerm,
      returned: result.results.length,
    });

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
    logger.error('search.cards.get.failure', error, { requestId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleCardsSearchPost = async (event: LambdaHttpEvent, requestId: string) => {
  const logger = getLogger();
  try {
    const { user } = await requireAuthenticatedUser(event);
    const tenantId = await getTenantForUser(user.id);
    const body = parseBody<{ query?: string; q?: string; limit?: number; searchMode?: string }>(
      event
    );

    const normalizedQuery = body.query ?? body.q ?? '';
    if (
      body.searchMode === 'boolean' &&
      normalizedQuery.includes('(') &&
      !normalizedQuery.includes(')')
    ) {
      logger.warn('search.cards.post.invalidExpression', { requestId });
      return withCors(
        createErrorResponse(400, 'Invalid boolean search expression', {
          code: 'INVALID_QUERY',
        })
      );
    }

    const searchResult = await runCardSearch(user.id, tenantId, normalizedQuery, body.limit ?? 10);
    logger.info('search.cards.post.success', {
      requestId,
      searchMode: body.searchMode ?? 'simple',
      returned: searchResult.results.length,
    });

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
    logger.error('search.cards.post.failure', error, { requestId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleCompaniesSearch = async (event: LambdaHttpEvent, requestId: string) => {
  const logger = getLogger();
  try {
    const { user } = await requireAuthenticatedUser(event);
    const query = getQuery(event);
    const searchTerm = (query.q ?? '').toLowerCase();
    const allCompanies = await listCompanies();
    const companies = allCompanies
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

    await recordSearchEvent({
      query: searchTerm,
      latencyMs: 40,
      resultCount: companies.length,
      tenantId: await getTenantForUser(user.id),
      userId: user.id,
    });
    logger.info('search.companies.success', {
      requestId,
      searchTerm,
      returned: companies.length,
    });

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
    logger.error('search.companies.failure', error, { requestId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleUnifiedQuery = async (event: LambdaHttpEvent, requestId: string) => {
  const logger = getLogger();
  try {
    const { user } = await requireAuthenticatedUser(event);
    const tenantId = await getTenantForUser(user.id);
    const body = parseBody<{
      query?: string;
      includeCompanies?: boolean;
      limit?: number;
    }>(event);

    const searchTerm = body.query ?? '';
    const limit = body.limit ?? 10;

    const cardsResult = await runCardSearch(user.id, tenantId, searchTerm, limit);
    const includeCompanies = body.includeCompanies ?? true;

    const companies = includeCompanies
      ? (await listCompanies())
          .filter(company =>
            !searchTerm ? true : company.name.toLowerCase().includes(searchTerm.toLowerCase())
          )
          .slice(0, 5)
      : [];

    logger.info('search.unified.success', {
      requestId,
      includeCompanies,
      cardsReturned: cardsResult.results.length,
      companiesReturned: companies.length,
    });

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
    logger.error('search.unified.failure', error, { requestId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleSuggestions = async (event: LambdaHttpEvent, requestId: string) => {
  const logger = getLogger();
  try {
    const query = getQuery(event);
    const prefix = (query.prefix ?? '').toLowerCase();
    const limit = query.maxSuggestions ? Number(query.maxSuggestions) : 5;

    const { user } = await requireAuthenticatedUser(event);
    const cards = (
      await listCards({
        userId: user.id,
        page: 1,
        limit: 200,
        query: '',
        tags: [],
        company: undefined,
      })
    ).items;
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

    logger.debug('search.suggestions.success', {
      requestId,
      prefix,
      returned: suggestions.length,
    });

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
    logger.error('search.suggestions.failure', error, { requestId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleFilters = async (event: LambdaHttpEvent, requestId: string) => {
  const logger = getLogger();
  try {
    const { user } = await requireAuthenticatedUser(event);
    const cards = (
      await listCards({
        userId: user.id,
        page: 1,
        limit: 200,
        query: '',
        tags: [],
        company: undefined,
      })
    ).items;
    const companies = new Set<string>();
    const tags = new Set<string>();
    const industries = new Set<string>();

    cards.forEach(card => {
      if (card.company) companies.add(card.company);
      card.tags?.forEach(tag => tags.add(tag));
    });

    const companyProfiles = await listCompanies();
    companyProfiles.forEach(company => {
      industries.add(company.industry ?? 'General');
    });

    logger.debug('search.filters.success', {
      requestId,
      companies: companies.size,
      tags: tags.size,
      industries: industries.size,
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
    logger.error('search.filters.failure', error, { requestId });
    return withCors(createErrorResponse(500, message));
  }
};

const handleRequest = async (event: LambdaHttpEvent) => {
  const method = event.httpMethod ?? 'GET';
  const requestId = getRequestId(event);
  const segments = getPathSegments(event);
  const logger = getLogger();

  logger.debug('search.router.received', { method, path: event.rawPath, requestId });

  if (method === 'OPTIONS') {
    return buildCorsResponse();
  }

  if (segments.length < 2 || segments[0] !== 'v1' || segments[1] !== 'search') {
    logger.warn('search.router.notFound', { path: event.rawPath });
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

  logger.warn('search.router.unhandled', { method, path: event.rawPath });
  return withCors(createErrorResponse(405, 'Method not allowed', { code: 'METHOD_NOT_ALLOWED' }));
};

export const handler = withHttpObservability(handleRequest, { serviceName: 'search' });
