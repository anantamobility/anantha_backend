import { basename } from "node:path";
import { v4 as uuidv4 } from "uuid";
import envConfig from "../config/env.js";
import prisma from "../database/prismaClient.js";
import {
  DocumentType,
  Prisma,
} from "../generated/prisma/client.js";
import { storage } from "../storage/index.js";
import { safeDocumentExtension } from "../storage/mime.js";
import {
  AppError,
  ErrorCode,
  rethrowPrismaError,
} from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import type {
  ListRiderDocumentsQuery,
  RiderDocumentMetadata,
} from "../validation/rider.js";

export const riderDocumentSelect = {
  id: true,
  documentType: true,
  title: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  storageKey: true,
  storageBucket: true,
  issueDate: true,
  expiryDate: true,
  documentNumber: true,
  riderId: true,
  staffId: true,
  vehicleId: true,
  notes: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function assertRiderExists(riderId: string) {
  const rider = await prisma.rider.findUnique({
    where: { id: riderId },
    select: { id: true, fullName: true, riderCode: true, deletedAt: true },
  });

  if (!rider || rider.deletedAt) {
    throw new AppError("Rider not found", 404, ErrorCode.NOT_FOUND);
  }

  return rider;
}

export async function listRiderDocuments(
  riderId: string,
  query: ListRiderDocumentsQuery
) {
  await assertRiderExists(riderId);

  const { page, limit, documentType } = query;
  const where: Prisma.DocumentWhereInput = {
    riderId,
    deletedAt: null,
  };
  if (documentType) where.documentType = documentType;

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      select: riderDocumentSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.document.count({ where }),
  ]);

  return {
    documents,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getRiderDocument(riderId: string, documentId: string) {
  await assertRiderExists(riderId);

  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      riderId,
      deletedAt: null,
    },
    select: riderDocumentSelect,
  });

  if (!document) {
    throw new AppError("Document not found", 404, ErrorCode.NOT_FOUND);
  }

  return document;
}

export async function uploadRiderDocument(
  riderId: string,
  file: Express.Multer.File | undefined,
  metadata: RiderDocumentMetadata,
  actor: AuditActor
) {
  if (!file) {
    throw new AppError("A document file is required", 400, ErrorCode.VALIDATION_ERROR);
  }

  if (file.size > envConfig.storageMaxFileBytes) {
    throw new AppError(
      `File exceeds the ${envConfig.storageMaxFileBytes} byte limit`,
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  const rider = await assertRiderExists(riderId);
  const extension = safeDocumentExtension(file.originalname, file.mimetype);

  const documentId = uuidv4();
  const storageKey = `riders/${riderId}/${documentId}${extension}`;

  await storage.put(storageKey, file.buffer, file.mimetype);

  try {
    return await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          id: documentId,
          documentType: metadata.documentType as DocumentType,
          title: metadata.title,
          fileName: basename(file.originalname).slice(0, 255),
          mimeType: file.mimetype,
          fileSize: file.size,
          storageKey,
          storageBucket: null,
          issueDate: metadata.issueDate ?? null,
          expiryDate: metadata.expiryDate ?? null,
          riderId,
          notes: metadata.notes ?? null,
        },
        select: riderDocumentSelect,
      });

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "RiderDocument",
        resourceId: document.id,
        newData: {
          riderId,
          documentType: document.documentType,
          title: document.title,
          mimeType: document.mimeType,
          fileSize: document.fileSize,
        },
        summary: `${actor.userName} uploaded a ${document.documentType} document for rider ${rider.riderCode}.`,
        db: tx,
        throwOnError: true,
      });

      return document;
    });
  } catch (err) {
    // Do not leave an orphaned file if the metadata write fails.
    await storage.delete(storageKey).catch(() => undefined);
    rethrowPrismaError(err, "Document metadata could not be saved");
  }
}

export async function deleteRiderDocument(
  riderId: string,
  documentId: string,
  actor: AuditActor
) {
  try {
    const deleted = await prisma.$transaction(async (tx) => {
      await assertRiderExists(riderId);

      const existing = await tx.document.findFirst({
        where: {
          id: documentId,
          riderId,
          deletedAt: null,
        },
        select: riderDocumentSelect,
      });

      if (!existing) {
        throw new AppError("Document not found", 404, ErrorCode.NOT_FOUND);
      }

      const document = await tx.document.update({
        where: { id: documentId },
        data: { deletedAt: new Date() },
        select: riderDocumentSelect,
      });

      await logAudit({
        ...actor,
        action: "DELETE",
        resource: "RiderDocument",
        resourceId: documentId,
        oldData: {
          riderId,
          documentType: existing.documentType,
          title: existing.title,
          storageKey: existing.storageKey,
        },
        summary: `${actor.userName} deleted a ${existing.documentType} document for rider ${riderId}.`,
        db: tx,
        throwOnError: true,
      });

      return { document, storageKey: existing.storageKey };
    });

    await storage.delete(deleted.storageKey).catch((err) => {
      console.error("Failed to remove document from storage:", err?.message);
    });

    return deleted.document;
  } catch (err) {
    rethrowPrismaError(err, "Document could not be deleted");
  }
}

export async function downloadRiderDocument(
  riderId: string,
  documentId: string
) {
  const document = await getRiderDocument(riderId, documentId);
  const buffer = await storage.get(document.storageKey);
  return { document, buffer };
}
