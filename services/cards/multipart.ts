import type { LambdaHttpEvent } from '@namecard/shared';

export interface MultipartField {
  name: string;
  value: string;
}

export interface MultipartFile {
  fieldName: string;
  fileName?: string;
  contentType?: string;
  content: Buffer;
}

export interface ParsedMultipartForm {
  fields: Record<string, string>;
  files: Record<string, MultipartFile>;
}

const CRLF = Buffer.from('\r\n');

const getBoundary = (contentTypeHeader?: string | null): string | null => {
  if (!contentTypeHeader) {
    return null;
  }
  const match = /boundary=([^;]+)/i.exec(contentTypeHeader);
  return match ? match[1].trim() : null;
};

const indexOfBuffer = (buffer: Buffer, search: Buffer, start = 0) => buffer.indexOf(search, start);

const sliceBuffer = (buffer: Buffer, start: number, end: number) => buffer.subarray(start, end);

export const parseMultipartForm = (event: LambdaHttpEvent): ParsedMultipartForm => {
  const contentTypeHeader = event.headers?.['content-type'] ?? event.headers?.['Content-Type'];
  const boundary = getBoundary(contentTypeHeader ?? null);
  if (!boundary) {
    throw new Error('Multipart boundary not found in content-type header.');
  }

  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const bodyBuffer = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64')
    : Buffer.from(event.body ?? '', 'utf8');

  const parts: Array<{ headers: string; content: Buffer }> = [];
  let position = 0;

  while (position < bodyBuffer.length) {
    const boundaryIndex = indexOfBuffer(bodyBuffer, boundaryBuffer, position);
    if (boundaryIndex === -1) {
      break;
    }

    const nextLineIndex = indexOfBuffer(bodyBuffer, CRLF, boundaryIndex + boundaryBuffer.length);
    if (nextLineIndex === -1) {
      break;
    }

    position = nextLineIndex + CRLF.length;

    const headersEnd = indexOfBuffer(bodyBuffer, Buffer.from('\r\n\r\n'), position);
    if (headersEnd === -1) {
      break;
    }

    const headersBuffer = sliceBuffer(bodyBuffer, position, headersEnd);
    const headers = headersBuffer.toString('utf8');
    const contentStart = headersEnd + 4;

    const nextBoundaryIndex = indexOfBuffer(bodyBuffer, boundaryBuffer, contentStart);
    if (nextBoundaryIndex === -1) {
      break;
    }

    let contentEnd = nextBoundaryIndex - CRLF.length;
    if (contentEnd < contentStart) {
      contentEnd = contentStart;
    }

    const content = sliceBuffer(bodyBuffer, contentStart, contentEnd);
    parts.push({ headers, content });

    const boundarySuffixIndex = nextBoundaryIndex + boundaryBuffer.length;
    const isFinalBoundary =
      boundarySuffixIndex + 1 < bodyBuffer.length &&
      bodyBuffer[boundarySuffixIndex] === 45 &&
      bodyBuffer[boundarySuffixIndex + 1] === 45; // '--'

    position = boundarySuffixIndex + (isFinalBoundary ? 2 : CRLF.length);
    if (isFinalBoundary) {
      break;
    }
  }

  const fields: Record<string, string> = {};
  const files: Record<string, MultipartFile> = {};

  parts.forEach(part => {
    const headerLines = part.headers.split(/\r?\n/).map(line => line.trim());
    const dispositionLine = headerLines.find(line => line.toLowerCase().startsWith('content-disposition'));
    if (!dispositionLine) {
      return;
    }

    const fieldNameMatch = /name="([^"]+)"/.exec(dispositionLine);
    if (!fieldNameMatch) {
      return;
    }

    const fieldName = fieldNameMatch[1];
    const fileNameMatch = /filename="([^"]*)"/.exec(dispositionLine);
    const contentTypeLine = headerLines.find(line => line.toLowerCase().startsWith('content-type'));
    const contentType = contentTypeLine ? contentTypeLine.split(':')[1]?.trim() : undefined;

    if (fileNameMatch) {
      files[fieldName] = {
        fieldName,
        fileName: fileNameMatch[1] || undefined,
        contentType,
        content: part.content,
      };
      return;
    }

    fields[fieldName] = part.content.toString('utf8');
  });

  return { fields, files };
};
