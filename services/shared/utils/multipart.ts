import type { APIGatewayProxyEvent } from 'aws-lambda';

import logger from './lambdaLogger.js';

export interface MultipartFile {
  fieldName: string;
  filename: string;
  contentType: string;
  content: Buffer;
  size: number;
}

export interface MultipartFormData {
  files: MultipartFile[];
  fields: Record<string, string>;
}

function extractBoundary(contentType: string): string | null {
  const match = /boundary=([^;]+)/i.exec(contentType);
  return match ? match[1] : null;
}

function trimTrailingCrlf(data: string): string {
  if (data.endsWith('\r\n')) {
    return data.slice(0, -2);
  }
  return data;
}

export function parseMultipartFormData(event: APIGatewayProxyEvent): MultipartFormData {
  const headers = event.headers || {};
  const contentType = headers['content-type'] || headers['Content-Type'];

  if (!contentType) {
    throw new Error('Missing content-type header for multipart parsing');
  }

  const boundary = extractBoundary(contentType);

  if (!boundary) {
    throw new Error('Unable to determine multipart boundary');
  }

  if (!event.body) {
    throw new Error('Empty request body');
  }

  const bodyBuffer = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : Buffer.from(event.body, 'utf8');

  const bodyString = bodyBuffer.toString('latin1');
  const boundaryMarker = `--${boundary}`;
  const endBoundaryMarker = `--${boundary}--`;

  const segments = bodyString.split(boundaryMarker).filter(segment => {
    const trimmed = segment.trim();
    return trimmed.length > 0 && trimmed !== '--';
  });

  const files: MultipartFile[] = [];
  const fields: Record<string, string> = {};

  for (const segment of segments) {
    const cleanedSegment = segment
      .replace(/^\r?\n/, '')
      .replace(endBoundaryMarker, '')
      .trim();

    if (!cleanedSegment) {
      continue;
    }

    const separatorIndex = cleanedSegment.indexOf('\r\n\r\n');
    if (separatorIndex === -1) {
      logger.warn('Multipart segment missing header separator');
      continue;
    }

    const rawHeaders = cleanedSegment.slice(0, separatorIndex);
    const rawContent = cleanedSegment.slice(separatorIndex + 4); // Skip CRLFCRLF

    const headerLines = rawHeaders.split(/\r\n/);
    const headerMap: Record<string, string> = {};

    for (const line of headerLines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) {
        continue;
      }
      const name = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();
      headerMap[name] = value;
    }

    const contentDisposition = headerMap['content-disposition'];
    if (!contentDisposition) {
      logger.warn('Skipping multipart segment without content-disposition header');
      continue;
    }

    const nameMatch = /name="([^"]+)"/i.exec(contentDisposition);
    const filenameMatch = /filename="([^"]*)"/i.exec(contentDisposition);

    if (!nameMatch) {
      logger.warn('Skipping multipart segment with invalid content-disposition', {
        contentDisposition,
      });
      continue;
    }

    const fieldName = nameMatch[1];

    if (filenameMatch && filenameMatch[1]) {
      const filename = filenameMatch[1];
      const contentTypeHeader = headerMap['content-type'] || 'application/octet-stream';
      const trimmedContent = trimTrailingCrlf(rawContent);
      const contentBuffer = Buffer.from(trimmedContent, 'latin1');

      files.push({
        fieldName,
        filename,
        contentType: contentTypeHeader,
        content: contentBuffer,
        size: contentBuffer.length,
      });
    } else {
      fields[fieldName] = trimTrailingCrlf(rawContent);
    }
  }

  return { files, fields };
}

export function findFile(formData: MultipartFormData, fieldName: string): MultipartFile | undefined {
  return formData.files.find(file => file.fieldName === fieldName);
}
