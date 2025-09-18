import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import {
  getPrismaClient,
  logger,
  createSuccessResponse,
  createErrorResponse,
  getRequestId,
  getIdFromPath,
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
    logger.info('Cards token claims debug', {
      hasSub: Boolean(decoded.sub),
      hasUsername: Boolean(decoded.username || decoded['cognito:username']),
      hasEmail: Boolean(decoded.email),
    });
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

  logger.logRequest('GET', '/cards/:id', {
    requestId,
    functionName: context.functionName,
  });

  try {
    // Verify authentication
    const authHeader = event.headers?.['authorization'] || event.headers?.['Authorization'];
    const user = await getUserFromAuthHeader(authHeader);
    logger.info('Cards get-by-id auth debug', {
      hasAuth: Boolean(authHeader),
      hasUser: Boolean(user),
    });
    
    if (!user) {
      return createErrorResponse('User not authenticated', 401, requestId);
    }

    const id = getIdFromPath(event);
    
    if (!id) {
      return createErrorResponse('Card ID is required', 400, requestId);
    }

    const prisma = await getPrismaClient();

    const card = await prisma.card.findFirst({
      where: { 
        id,
        userId: user.id,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        companies: {
          include: {
            company: {
              include: {
                enrichments: {
                  where: {
                    status: 'enriched',
                  },
                  orderBy: { enrichedAt: 'desc' },
                },
                newsArticles: {
                  orderBy: { publishedDate: 'desc' },
                  take: 5,
                },
              },
            },
          },
        },
        enrichments: {
          orderBy: { createdAt: 'desc' },
        },
        calendarEvents: {
          orderBy: { eventDate: 'desc' },
          take: 5,
        },
      },
    });

    if (!card) {
      const duration = Date.now() - startTime;
      logger.logResponse(404, duration, { requestId, functionName: context.functionName });
      
      return createErrorResponse('Card not found', 404, requestId);
    }

    // Build enrichment data structure (simplified version)
    let enrichmentData = null;

    if (card.companies && card.companies.length > 0) {
      const primaryCompany = card.companies[0];
      const company = primaryCompany.company;

      if (company) {
        enrichmentData = {
          personData: null,
          companyData: {
            name: company.name,
            domain: company.domain,
            website: company.website,
            description: company.description,
            industry: company.industry,
            headquarters: company.headquarters,
            location: company.location,
            size: company.size,
            employeeCount: company.employeeCount,
            founded: company.founded,
            confidence: company.overallEnrichmentScore ? company.overallEnrichmentScore / 100 : 0.8,
            lastUpdated: company.lastEnrichmentDate || company.lastUpdated,
          },
          citations: [],
          personConfidence: 0,
          companyConfidence: company.overallEnrichmentScore ? company.overallEnrichmentScore / 100 : 0.8,
          overallConfidence: company.overallEnrichmentScore ? company.overallEnrichmentScore / 100 : 0.8,
          lastUpdated: company.lastEnrichmentDate || company.lastUpdated,
        };
      }
    }

    // If no company data available, create empty enrichment structure
    if (!enrichmentData) {
      enrichmentData = {
        personData: null,
        companyData: null,
        citations: [],
        personConfidence: 0,
        companyConfidence: 0,
        overallConfidence: 0,
        lastUpdated: new Date(),
      };
    }

    const cardWithEnrichment = {
      ...card,
      enrichmentData,
    };

    const duration = Date.now() - startTime;
    logger.logResponse(200, duration, { requestId, functionName: context.functionName });

    return createSuccessResponse(
      { card: cardWithEnrichment },
      200,
      'Card retrieved successfully',
      requestId
    );
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    logger.error('Get card by ID failed', error, { requestId });
    logger.logResponse(500, duration, { requestId, functionName: context.functionName });
    
    return createErrorResponse('Failed to retrieve card', 500, requestId);
  }
};
