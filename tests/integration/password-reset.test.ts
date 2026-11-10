import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import prisma from "../../src/database/prismaClient.js";
import { auth, createUserRecord, login, resetDatabase, seedRbac } from "./helpers.js";

let adminToken: string;
let userId: string;
const phoneNumber = "9000000200";
const email = "reset.integration@anantha.test";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

beforeAll(async () => {
  await resetDatabase();
  await seedRbac();

  const admin = await createUserRecord({
    name: "Reset Admin",
    phoneNumber: "9000000201",
    role: "ADMIN",
  });
  adminToken = await login(app, admin.phoneNumber);

  const user = await createUserRecord({
    name: "Reset User",
    phoneNumber,
    email,
    role: "OPERATOR",
  });
  userId = user.id;
});

describe("password reset flow", () => {
  it("returns a generic response without exposing the reset token", async () => {
    const response = await request(app)
      .post("/auth/forgot-password")
      .send({ email });

    expect(response.status).toBe(200);
    expect(response.body.message).toMatch(/if an active account/i);
    expect(JSON.stringify(response.body)).not.toContain("token");

    const record = await prisma.passwordResetToken.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    expect(record).not.toBeNull();
    expect(record!.usedAt).toBeNull();
    expect(record!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(record!.tokenHash).toHaveLength(64);
  });

  it("resets the password, invalidates the token and revokes sessions", async () => {
    const userToken = await login(app, phoneNumber, "Password123");
    const rawToken = randomBytes(32).toString("base64url");
    const record = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    await prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { tokenHash: hashToken(rawToken) },
    });

    const reset = await request(app)
      .post("/auth/reset-password")
      .send({ token: rawToken, newPassword: "NewPassword456" });
    expect(reset.status).toBe(200);

    const staleSession = await request(app)
      .get("/users/" + userId)
      .set(auth(userToken));
    expect(staleSession.status).toBe(401);

    const oldLogin = await request(app)
      .post("/auth/login")
      .send({ phone: phoneNumber, password: "Password123" });
    expect(oldLogin.status).toBe(404);

    const newLogin = await request(app)
      .post("/auth/login")
      .send({ phone: phoneNumber, password: "NewPassword456" });
    expect(newLogin.status).toBe(200);

    const reused = await request(app)
      .post("/auth/reset-password")
      .send({ token: rawToken, newPassword: "AnotherPass789" });
    expect(reused.status).toBe(400);
  });

  it("rejects weak passwords and expired tokens", async () => {
    const weak = await request(app)
      .post("/auth/reset-password")
      .send({ token: "x".repeat(32), newPassword: "short" });
    expect(weak.status).toBe(400);

    const rawToken = randomBytes(32).toString("base64url");
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    const expired = await request(app)
      .post("/auth/reset-password")
      .send({ token: rawToken, newPassword: "ValidPassword123" });
    expect(expired.status).toBe(400);
  });

  it("returns the same generic response for unknown accounts", async () => {
    const response = await request(app)
      .post("/auth/forgot-password")
      .send({ email: "missing.integration@anantha.test" });
    expect(response.status).toBe(200);
    expect(response.body.message).toMatch(/if an active account/i);
  });

  it("rate-limits repeated requests for the same identifier", async () => {
    const identifier = "rate.limit.integration@anantha.test";
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const response = await request(app)
        .post("/auth/forgot-password")
        .send({ email: identifier });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 5).every((status) => status === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});
