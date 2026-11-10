import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request } from "express";
import prisma from "../database/prismaClient.js";
import envConfig from "../config/env.js";
import { redisDel } from "../config/redis.js";
import { AppError, ErrorCode } from "../utils/errors.js";
import { logAudit } from "../utils/log.js";
import { consumeRateLimit } from "../utils/rateLimit.js";
import { deliverPasswordReset } from "./notification.js";
import type {
  ForgotPasswordInput,
  ResetPasswordInput,
} from "../validation/auth.js";

const INVALID_RESET_MESSAGE = "Invalid or expired reset token";
const GENERIC_FORGOT_MESSAGE =
  "If an active account matches the supplied details, password reset instructions will be sent.";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function clientIp(req: Request) {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function normalizeIdentifier(input: ForgotPasswordInput) {
  if (input.email) return { email: input.email.trim().toLowerCase() };
  if (input.phone) return { phone: input.phone.trim() };
  const identifier = input.identifier?.trim() ?? "";
  if (identifier.includes("@")) {
    return { email: identifier.toLowerCase() };
  }
  return { phone: identifier };
}

async function auditPasswordEvent(input: {
  req: Request;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  summary: string;
  newData?: Record<string, unknown>;
}) {
  await logAudit({
    req: input.req,
    userId: input.userId,
    userName: input.userName,
    userRole: input.userRole,
    action: input.action,
    resource: "User",
    resourceId: input.userId,
    newData: input.newData,
    summary: input.summary,
    throwOnError: false,
  });
}

export async function requestPasswordReset(
  input: ForgotPasswordInput,
  req: Request
): Promise<{ message: string }> {
  const ip = clientIp(req);
  const identifier = normalizeIdentifier(input);
  const rateKey = `forgot-password:${ip}:${identifier.email ?? identifier.phone ?? "unknown"}`;

  const limit = consumeRateLimit(
    rateKey,
    envConfig.passwordResetMaxRequestsPerHour,
    60 * 60 * 1000
  );

  if (!limit.allowed) {
    throw new AppError(
      "Too many password reset requests. Please try again later.",
      429,
      ErrorCode.CONFLICT
    );
  }

  const user = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [
        ...(identifier.email ? [{ email: identifier.email }] : []),
        ...(identifier.phone ? [{ phoneNumber: identifier.phone }] : []),
      ],
    },
    include: { role: { select: { name: true } } },
  });

  if (!user || user.status !== "ACTIVE") {
    return { message: GENERIC_FORGOT_MESSAGE };
  }

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(
    Date.now() + envConfig.passwordResetTokenTtlMinutes * 60 * 1000
  );
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });

    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        requestedIp: ip,
      },
    });
  });

  const delivery = await deliverPasswordReset({
    toEmail: user.email,
    toPhone: user.phoneNumber,
    name: user.name,
    token: rawToken,
    expiresAt,
  });

  await auditPasswordEvent({
    req,
    userId: user.id,
    userName: user.name,
    userRole: user.role?.name ?? "UNKNOWN",
    action: "PASSWORD_RESET_REQUEST",
    newData: {
      channel: delivery.channel,
      provider: delivery.provider,
      delivered: delivery.delivered,
      ...(delivery.delivered ? {} : { reason: delivery.reason ?? "not_delivered" }),
      expiresAt,
    },
    summary: `Password reset requested for user ${user.name}. Delivery ${delivery.delivered ? "accepted" : "not performed"}.`,
  });

  return { message: GENERIC_FORGOT_MESSAGE };
}

export async function resetPassword(
  input: ResetPasswordInput,
  req: Request
): Promise<{ message: string }> {
  const tokenHash = hashToken(input.token);
  const now = new Date();

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: {
      user: { include: { role: { select: { name: true } } } },
    },
  });

  if (
    !record ||
    record.usedAt ||
    record.expiresAt.getTime() <= now.getTime() ||
    !record.user ||
    record.user.deletedAt ||
    record.user.status !== "ACTIVE"
  ) {
    throw new AppError(
      INVALID_RESET_MESSAGE,
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 10);

  await prisma.$transaction(async (tx) => {
    const consumed = await tx.passwordResetToken.updateMany({
      where: {
        id: record.id,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    if (consumed.count === 0) {
      throw new AppError(
        INVALID_RESET_MESSAGE,
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }

    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });

    await tx.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: now },
    });
  });

  const sessionRevoked = await redisDel(`session:${record.userId}`);
  if (!sessionRevoked) {
    console.warn(
      "Redis unavailable: password reset completed but existing sessions could not be revoked"
    );
  }

  await auditPasswordEvent({
    req,
    userId: record.userId,
    userName: record.user.name,
    userRole: record.user.role?.name ?? "UNKNOWN",
    action: "PASSWORD_RESET_COMPLETED",
    summary: `Password reset completed for user ${record.user.name}; existing sessions revoked.`,
  });

  return { message: "Password has been reset. Please sign in again." };
}
