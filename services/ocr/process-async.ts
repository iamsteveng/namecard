import type { Context, SQSEvent, SQSRecord } from 'aws-lambda';

import { logger, textractService, s3Service } from '@namecard/serverless-shared';

async function handleRecord(record: SQSRecord) {
  try {
    const body = JSON.parse(record.body);
    let fileBuffer: Buffer;
    let mimeType: string;

    if (body.file) {
      fileBuffer = Buffer.from(body.file, 'base64');
      mimeType = body.mimeType || 'image/png';
    } else if (body.ocrKey) {
      const bucket = body.bucket as string | undefined;
      mimeType = body.mimeType || 'image/jpeg';
      fileBuffer = await s3Service.downloadFile(body.ocrKey, bucket);
    } else {
      throw new Error('Unsupported OCR queue payload');
    }

    const result = await textractService.extractText(fileBuffer, mimeType);

    logger.info('Async OCR processing completed', {
      messageId: record.messageId,
      confidence: result.confidence,
      blocks: result.blocks.length,
    });
  } catch (error) {
    logger.error(
      'Failed to process OCR SQS message',
      error instanceof Error ? error : undefined,
      { messageId: record.messageId }
    );
    throw error;
  }
}

export const handler = async (event: SQSEvent, context: Context): Promise<void> => {
  logger.logRequest('SQS', 'process-async', {
    requestId: context.awsRequestId,
    functionName: context.functionName,
    recordCount: event.Records.length,
  });

  for (const record of event.Records) {
    await handleRecord(record);
  }
};
