import prisma from "../database/prismaClient.js";
import {
  DocumentStatus,
  DocumentType,
  Prisma,
  VerificationStatus,
  VerificationType,
} from "../generated/prisma/client.js";
import {
  AppError,
  ErrorCode,
  rethrowPrismaError,
} from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import type {
  ApproveVerificationInput,
  RejectVerificationInput,
  SubmitVerificationInput,
} from "../validation/rider.js";

export const verificationUserSelect = {
  id: true,
  name: true,
} as const;

export const verificationDocumentSelect = {
  id: true,
  documentType: true,
  status: true,
  title: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  storageKey: true,
  storageBucket: true,
  issueDate: true,
  expiryDate: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const verificationSelect = {
  id: true,
  riderId: true,
  type: true,
  status: true,
  submittedAt: true,
  completedAt: true,
  expiresAt: true,
  verifiedById: true,
  rejectionReason: true,
  documentId: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  verifiedBy: { select: verificationUserSelect },
  documents: { select: verificationDocumentSelect },
} as const;

export const verificationHistorySelect = {
  id: true,
  verificationId: true,
  riderId: true,
  type: true,
  previousStatus: true,
  status: true,
  submittedAt: true,
  reviewedById: true,
  rejectionReason: true,
  notes: true,
  changedAt: true,
  reviewedBy: { select: verificationUserSelect },
} as const;

// Re-submission is only allowed after a previous rejection or expiry. Pending
// or verified processes must be resolved before a new submission.
const CAN_SUBMIT_FROM = new Set<VerificationStatus>([
  VerificationStatus.NOT_SUBMITTED,
  VerificationStatus.REJECTED,
  VerificationStatus.EXPIRED,
]);

// SUBMITTED is retained for compatibility with existing data created before
// UNDER_REVIEW was introduced.
const CAN_REVIEW_FROM = new Set<VerificationStatus>([
  VerificationStatus.PENDING,
  VerificationStatus.SUBMITTED,
  VerificationStatus.UNDER_REVIEW,
]);

function expectedDocumentType(type: VerificationType): DocumentType {
  return type === VerificationType.PVC ? DocumentType.PVC : DocumentType.BGV;
}

async function assertRiderExists(
  tx: Prisma.TransactionClient,
  riderId: string
) {
  const rider = await tx.rider.findUnique({
    where: { id: riderId },
    select: { id: true, fullName: true, riderCode: true, deletedAt: true },
  });

  if (!rider || rider.deletedAt) {
    throw new AppError("Rider not found", 404, ErrorCode.NOT_FOUND);
  }

  return rider;
}

async function getOrCreateVerification(
  tx: Prisma.TransactionClient,
  riderId: string,
  type: VerificationType
) {
  const existing = await tx.riderVerification.findUnique({
    where: { riderId_type: { riderId, type } },
  });

  if (existing) return existing;

  const created = await tx.riderVerification.create({
    data: {
      riderId,
      type,
      status: VerificationStatus.NOT_SUBMITTED,
      version: 0,
    },
  });

  await tx.riderVerificationHistory.create({
    data: {
      verificationId: created.id,
      riderId,
      type,
      previousStatus: null,
      status: VerificationStatus.NOT_SUBMITTED,
      notes: "Verification initialised",
    },
  });

  return created;
}

async function getVerificationOrThrow(
  tx: Prisma.TransactionClient,
  riderId: string,
  type: VerificationType
) {
  const verification = await tx.riderVerification.findUnique({
    where: { riderId_type: { riderId, type } },
  });

  if (!verification) {
    throw new AppError("Verification not found", 404, ErrorCode.NOT_FOUND);
  }

  return verification;
}

export async function listRiderVerifications(riderId: string) {
  await prisma.$transaction(async (tx) => {
    await assertRiderExists(tx, riderId);
  });

  const verifications = await prisma.riderVerification.findMany({
    where: { riderId },
    select: verificationSelect,
    orderBy: { type: "asc" },
  });

  return { verifications };
}

export async function getRiderVerification(
  riderId: string,
  type: VerificationType
) {
  return prisma.$transaction(async (tx) => {
    await assertRiderExists(tx, riderId);

    const verification = await tx.riderVerification.findUnique({
      where: { riderId_type: { riderId, type } },
      select: {
        ...verificationSelect,
        history: {
          select: verificationHistorySelect,
          orderBy: [{ changedAt: "desc" }, { id: "desc" }],
        },
      },
    });

    if (!verification) {
      throw new AppError("Verification not found", 404, ErrorCode.NOT_FOUND);
    }

    return verification;
  });
}

export async function submitRiderVerification(
  riderId: string,
  type: VerificationType,
  input: SubmitVerificationInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const rider = await assertRiderExists(tx, riderId);
      const verification = await getOrCreateVerification(tx, riderId, type);

      if (!CAN_SUBMIT_FROM.has(verification.status)) {
        throw new AppError(
          `Cannot submit a ${type} verification in status ${verification.status}`,
          409,
          ErrorCode.CONFLICT
        );
      }

      const documentIds = [...new Set(input.documentIds ?? [])];
      if (documentIds.length > 0) {
        const documents = await tx.document.findMany({
          where: {
            id: { in: documentIds },
            riderId,
            deletedAt: null,
          },
          select: { id: true, documentType: true },
        });

        if (documents.length !== documentIds.length) {
          throw new AppError(
            "One or more documents do not belong to this rider",
            400,
            ErrorCode.VALIDATION_ERROR
          );
        }

        if (
          documents.some(
            (document) =>
              document.documentType !== expectedDocumentType(type)
          )
        ) {
          throw new AppError(
            `Only ${type} documents can be attached to a ${type} verification`,
            400,
            ErrorCode.VALIDATION_ERROR
          );
        }

        await tx.document.updateMany({
          where: {
            id: { in: documentIds },
            riderId,
            deletedAt: null,
          },
          data: { verificationId: verification.id },
        });
      }

      const previousStatus = verification.status;
      const submittedAt = new Date();

      const updateResult = await tx.riderVerification.updateMany({
        where: {
          id: verification.id,
          status: previousStatus,
          version: verification.version,
        },
        data: {
          status: VerificationStatus.PENDING,
          submittedAt,
          completedAt: null,
          rejectionReason: null,
          ...(input.expiresAt !== undefined
            ? { expiresAt: input.expiresAt }
            : {}),
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new AppError(
          "Verification was modified concurrently; please retry",
          409,
          ErrorCode.CONFLICT
        );
      }

      const history = await tx.riderVerificationHistory.create({
        data: {
          verificationId: verification.id,
          riderId,
          type,
          previousStatus,
          status: VerificationStatus.PENDING,
          submittedAt,
          notes: input.notes ?? null,
        },
        select: verificationHistorySelect,
      });

      const updated = await tx.riderVerification.findUnique({
        where: { id: verification.id },
        select: verificationSelect,
      });

      await logAudit({
        ...actor,
        action: "SUBMIT",
        resource: "RiderVerification",
        resourceId: verification.id,
        oldData: { status: previousStatus },
        newData: { status: VerificationStatus.PENDING, submittedAt },
        summary: `${actor.userName} submitted ${type} verification for rider ${rider.riderCode}.`,
        db: tx,
        throwOnError: true,
      });

      return { verification: updated, history };
    });
  } catch (err) {
    rethrowPrismaError(err, "Verification could not be submitted");
  }
}

async function reviewRiderVerification(
  riderId: string,
  type: VerificationType,
  decision: "VERIFIED" | "REJECTED",
  rejectionReason: string | null,
  notes: string | null,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const rider = await assertRiderExists(tx, riderId);
      const verification = await getVerificationOrThrow(tx, riderId, type);

      if (!CAN_REVIEW_FROM.has(verification.status)) {
        throw new AppError(
          `Cannot review a ${type} verification in status ${verification.status}`,
          409,
          ErrorCode.CONFLICT
        );
      }

      if (decision === VerificationStatus.VERIFIED) {
        const documentCount = await tx.document.count({
          where: {
            riderId,
            documentType: expectedDocumentType(type),
            deletedAt: null,
            status: { not: DocumentStatus.REJECTED },
          },
        });

        if (documentCount === 0) {
          throw new AppError(
            `At least one ${type} document is required before approval`,
            409,
            ErrorCode.CONFLICT
          );
        }
      }

      const previousStatus = verification.status;
      const completedAt = new Date();

      const updateResult = await tx.riderVerification.updateMany({
        where: {
          id: verification.id,
          status: previousStatus,
          version: verification.version,
        },
        data: {
          status: decision,
          verifiedById: actor.userId,
          completedAt,
          rejectionReason,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new AppError(
          "Verification was modified concurrently; please retry",
          409,
          ErrorCode.CONFLICT
        );
      }

      const history = await tx.riderVerificationHistory.create({
        data: {
          verificationId: verification.id,
          riderId,
          type,
          previousStatus,
          status: decision,
          submittedAt: verification.submittedAt,
          reviewedById: actor.userId,
          rejectionReason,
          notes,
        },
        select: verificationHistorySelect,
      });

      const updated = await tx.riderVerification.findUnique({
        where: { id: verification.id },
        select: verificationSelect,
      });

      await logAudit({
        ...actor,
        action:
          decision === VerificationStatus.VERIFIED ? "APPROVE" : "REJECT",
        resource: "RiderVerification",
        resourceId: verification.id,
        oldData: { status: previousStatus },
        newData: {
          status: decision,
          rejectionReason,
          previousStatus,
        },
        summary: `${actor.userName} ${
          decision === VerificationStatus.VERIFIED ? "approved" : "rejected"
        } ${type} verification for rider ${rider.riderCode}.`,
        db: tx,
        throwOnError: true,
      });

      return { verification: updated, history };
    });
  } catch (err) {
    rethrowPrismaError(err, "Verification could not be reviewed");
  }
}

export async function approveRiderVerification(
  riderId: string,
  type: VerificationType,
  input: ApproveVerificationInput,
  actor: AuditActor
) {
  return reviewRiderVerification(
    riderId,
    type,
    VerificationStatus.VERIFIED,
    null,
    input.notes ?? null,
    actor
  );
}

export async function rejectRiderVerification(
  riderId: string,
  type: VerificationType,
  input: RejectVerificationInput,
  actor: AuditActor
) {
  return reviewRiderVerification(
    riderId,
    type,
    VerificationStatus.REJECTED,
    input.reason,
    input.notes ?? null,
    actor
  );
}
