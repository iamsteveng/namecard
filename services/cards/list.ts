import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import {
  getPrismaClient,
  logger,
  createSuccessResponse,
  createErrorResponse,
  getRequestId,
  getQueryParameter,
  cognitoService,
} from '@namecard/serverless-shared';

async function getUserFromAuthHeader(authHeader: string | undefined) {
  if (!authHeader) return null;
  try {
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length < 2 || parts[0].toLowerCase() !== 'bearer') return null;
    const token = parts[1];
    logger.info('Cards token raw debug', {
      hasHeader: Boolean(authHeader),
      tokenPresent: Boolean(token),
      dotCount: token.split('.').length - 1,
    });
    const payload = token.split('.')[1];
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const decodedJson = Buffer.from(padded, 'base64').toString();
    logger.info('Cards token payload length', { len: decodedJson.length });
    const decoded = JSON.parse(decodedJson);
    const cognitoId = decoded.sub || decoded.username || decoded['cognito:username'];
    const email = decoded.email as string | undefined;
    // Mask email for logs
    const maskedEmail = email ? email.replace(/(^.).*(@.*$)/, '$1***$2') : undefined;
    logger.info('Cards token claims debug', {
      hasSub: Boolean(decoded.sub),
      hasUsername: Boolean(decoded.username || decoded['cognito:username']),
      hasEmail: Boolean(email),
      email: maskedEmail,
    });
    // Validate JWT signature via Cognito and extract userId claim
    const verified = await cognitoService.verifyToken(token);
    const userId = (verified as any).userId || (verified as any)['custom:userId'] || (verified as any).sub;
    if (!userId || typeof userId !== 'string') return null;
    logger.info('Cards verified token', { hasUserId: Boolean(userId) });
    return { id: userId } as any;
  } catch (err: any) {
    logger.error('Cards token parse failed', err);
    return null;
  }
}

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();
  const requestId = getRequestId(event);

  logger.logRequest('GET', '/cards', {
    requestId,
    functionName: context.functionName,
  });

  try {
    // Verify authentication
    const authHeader = event.headers?.['authorization'] || event.headers?.['Authorization'];
    const user = await getUserFromAuthHeader(authHeader);
    logger.info('Cards list auth debug', {
      hasAuth: Boolean(authHeader),
      hasUser: Boolean(user),
    });
    
    if (!user) {
      return createErrorResponse('User not authenticated', 401, requestId);
    }

    const prisma = await getPrismaClient();

    // Get query parameters
    const page = parseInt(getQueryParameter(event, 'page', '1')!) || 1;
    const limit = Math.min(parseInt(getQueryParameter(event, 'limit', '20')!) || 20, 100);
    const sort = getQueryParameter(event, 'sort', 'desc') as 'asc' | 'desc';
    const sortBy = getQueryParameter(event, 'sortBy', 'createdAt')!;

    const q = getQueryParameter(event, 'q');
    const tags = getQueryParameter(event, 'tags');
    const company = getQueryParameter(event, 'company');
    const dateFrom = getQueryParameter(event, 'dateFrom');
    const dateTo = getQueryParameter(event, 'dateTo');

    const skip = (page - 1) * limit;

    // Build where clause for filtering
    const where: any = { userId: user.id };

    if (company) {
      where.company = { contains: company, mode: 'insensitive' };
    }

    if (tags) {
      if (tags.includes(',')) {
        where.tags = { hasSome: tags.split(',') };
      } else {
        where.tags = { has: tags };
      }
    }

    if (dateFrom || dateTo) {
      where.scanDate = {};
      if (dateFrom) {
        where.scanDate.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.scanDate.lte = new Date(dateTo);
      }
    }

    // If there's a search query, add text search
    if (q && q.trim().length > 0) {
      where.OR = [
        { name: { contains: q.trim(), mode: 'insensitive' } },
        { company: { contains: q.trim(), mode: 'insensitive' } },
        { title: { contains: q.trim(), mode: 'insensitive' } },
        { email: { contains: q.trim(), mode: 'insensitive' } },
        { phone: { contains: q.trim(), mode: 'insensitive' } },
      ];
    }

    // Execute queries in parallel
    const [cards, total] = await Promise.all([
      prisma.card.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sort,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          companies: {
            include: {
              company: {
                select: { id: true, name: true, industry: true },
              },
            },
          },
        },
      }),
      prisma.card.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    const response = {
      cards,
      pagination: {
        page,
        limit,
        sort,
        sortBy,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      filters: { q, tags, company, dateFrom, dateTo },
    };

    const duration = Date.now() - startTime;
    logger.logResponse(200, duration, { requestId, functionName: context.functionName });

    return createSuccessResponse(response, 200, 'Cards retrieved successfully', requestId);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('Cards list error', error);
    logger.error('Cards listing failed', error, { requestId });
    logger.logResponse(500, duration, { requestId, functionName: context.functionName });
    
    return createErrorResponse('Failed to retrieve cards', 500, requestId);
  }
};
