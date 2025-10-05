import { randomUUID } from 'node:crypto';

import { getPrismaClient } from './prisma';

const prisma = getPrismaClient();

interface UploadsAssetRow {
  id: string;
  tenantId: string;
  userId: string | null;
  objectKey: string;
  fileName: string;
  status: string;
  checksum: string;
  contentType: string;
  sizeBytes: number;
  presignedUrl: string;
  cdnUrl: string | null;
  expiresAt: Date;
  uploadedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UploadStatus = 'pending' | 'uploaded' | 'completed';

export interface UploadRecord {
  id: string;
  tenantId: string;
  userId?: string;
  objectKey: string;
  fileName: string;
  status: UploadStatus;
  checksum: string;
  contentType: string;
  size: number;
  presignedUrl: string;
  cdnUrl: string;
  expiresAt: Date;
  uploadedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

function toUploadRecord(record: UploadsAssetRow): UploadRecord {
  return {
    id: record.id,
    tenantId: record.tenantId,
    userId: record.userId ?? undefined,
    objectKey: record.objectKey,
    fileName: record.fileName,
    status: record.status as UploadStatus,
    checksum: record.checksum,
    contentType: record.contentType,
    size: record.sizeBytes,
    presignedUrl: record.presignedUrl,
    cdnUrl: record.cdnUrl ?? `https://cdn.namecard.app/uploads/${record.id}/${record.fileName}`,
    expiresAt: record.expiresAt,
    uploadedAt: record.uploadedAt ?? undefined,
    completedAt: record.completedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function createUpload(input: {
  tenantId: string;
  userId?: string;
  fileName: string;
  checksum: string;
  contentType: string;
  size: number;
}): Promise<UploadRecord> {
  const now = new Date();
  const id = randomUUID();
  const objectKey = `uploads/${input.tenantId}/${id}/${input.fileName}`;
  const presignedUrl = `https://uploads.namecard.app/presign/${id}`;
  const cdnUrl = `https://cdn.namecard.app/uploads/${id}/${input.fileName}`;
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

  const record = await prisma.uploadsAsset.create({
    data: {
      id,
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      objectKey,
      fileName: input.fileName,
      status: 'pending',
      checksum: input.checksum,
      contentType: input.contentType,
      sizeBytes: input.size,
      presignedUrl,
      cdnUrl,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    },
  });

  return toUploadRecord(record);
}

export async function completeUpload(uploadId: string): Promise<UploadRecord> {
  const record = await prisma.uploadsAsset.findUnique({ where: { id: uploadId } });
  if (!record) {
    throw new Error('Upload not found');
  }

  const completedAt = new Date();
  const updated = await prisma.uploadsAsset.update({
    where: { id: uploadId },
    data: {
      status: 'completed',
      uploadedAt: completedAt,
      completedAt,
      updatedAt: completedAt,
    },
  });

  return toUploadRecord(updated);
}

export async function getUpload(uploadId: string): Promise<UploadRecord | null> {
  const record = await prisma.uploadsAsset.findUnique({ where: { id: uploadId } });
  return record ? toUploadRecord(record) : null;
}

export async function listUploadsForUser(userId: string, limit = 20): Promise<UploadRecord[]> {
  const records = await prisma.uploadsAsset.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return records.map(toUploadRecord);
}
