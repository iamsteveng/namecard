import logger from 'file:///Users/steveng/Documents/git/namecard_search/services/shared/dist/logger-stub.js';
export const handler = async (event, context) => {
    const startTime = Date.now();
    logger.logRequest(event.httpMethod, event.path, {
        requestId: context.awsRequestId,
        functionName: context.functionName,
    });
    try {
        // Enrichment service health check
        const healthCheck = {
            status: 'healthy',
            sources: {
                perplexity: { available: true, configured: true },
                clearbit: { available: false, configured: false },
                linkedin: { available: false, configured: false },
            },
            timestamp: new Date().toISOString(),
        };
        const response = {
            status: healthCheck.status,
            sources: healthCheck.sources,
            availableSources: ['perplexity'],
            timestamp: healthCheck.timestamp,
        };
        const duration = Date.now() - startTime;
        logger.logResponse(200, duration, {
            requestId: context.awsRequestId,
            functionName: context.functionName,
        });
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response),
        };
    }
    catch (error) {
        logger.error('Enrichment health check failed', error instanceof Error ? error : undefined, { requestId: context.awsRequestId });
        const duration = Date.now() - startTime;
        logger.logResponse(503, duration, {
            requestId: context.awsRequestId,
            functionName: context.functionName,
        });
        return {
            statusCode: 503,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'error',
                message: 'Health check failed',
                error: error.message,
            }),
        };
    }
};
