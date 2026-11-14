import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { redisDel } from "../src/config/redis.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;
const ACTOR_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5a";
const TARGET_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

function authUser(
  permissions: { resource: string; action: string }[],
  id = ACTOR_ID
) {
  return {
    id,
    name: "Admin",
    status: "ACTIVE",
    role: { name: "ADMIN", permissions },
    staffProfile: null,
  };
}

beforeEach(() => {
  prismaMock.user.findUnique.mockReset();
  prismaMock.user.update.mockReset();
  prismaMock.auditLog.create.mockReset();
  (redisDel as any).mockReset();
  (redisDel as any).mockResolvedValue(true);
});

describe("POST /auth/reset-password/:userId", () => {
  it("resets another user's password, revokes sessions, and audits", async () => {
    const perms = [{ resource: "user", action: "resetPassword" }];
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === ACTOR_ID) {
        return authUser(perms);
      }
      if (args?.where?.id === TARGET_ID) {
        return {
          id: TARGET_ID,
          name: "Target",
          deletedAt: null,
          role: { name: "OPERATOR" },
        };
      }
      return null;
    });
    prismaMock.user.update.mockResolvedValue({ id: TARGET_ID });

    const res = await request(app)
      .post(`/auth/reset-password/${TARGET_ID}`)
      .set("Authorization", `Bearer ${accessToken(ACTOR_ID)}`)
      .send({ newPassword: "NewPass123" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe(TARGET_ID);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: { passwordHash: expect.any(String) },
    });
    const hashed = prismaMock.user.update.mock.calls[0][0].data.passwordHash;
    expect(await bcrypt.compare("NewPass123", hashed)).toBe(true);
    expect(redisDel).toHaveBeenCalledWith(`session:${TARGET_ID}`);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "PASSWORD_RESET",
        resource: "User",
        resourceId: TARGET_ID,
      }),
    });
  });

  it("rejects self-reset through the admin endpoint", async () => {
    const perms = [{ resource: "user", action: "resetPassword" }];
    prismaMock.user.findUnique.mockResolvedValue(authUser(perms));

    const res = await request(app)
      .post(`/auth/reset-password/${ACTOR_ID}`)
      .set("Authorization", `Bearer ${accessToken(ACTOR_ID)}`)
      .send({ newPassword: "NewPass123" });

    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the target user is missing", async () => {
    const perms = [{ resource: "user", action: "resetPassword" }];
    prismaMock.user.findUnique.mockImplementation(async (args: any) => {
      if (args?.where?.id === ACTOR_ID) return authUser(perms);
      return null;
    });

    const res = await request(app)
      .post(`/auth/reset-password/${TARGET_ID}`)
      .set("Authorization", `Bearer ${accessToken(ACTOR_ID)}`)
      .send({ newPassword: "NewPass123" });

    expect(res.status).toBe(404);
  });

  it("returns 403 without user:resetPassword", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      authUser([{ resource: "user", action: "read" }])
    );

    const res = await request(app)
      .post(`/auth/reset-password/${TARGET_ID}`)
      .set("Authorization", `Bearer ${accessToken(ACTOR_ID)}`)
      .send({ newPassword: "NewPass123" });

    expect(res.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("returns 400 for a weak password", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      authUser([{ resource: "user", action: "resetPassword" }])
    );

    const res = await request(app)
      .post(`/auth/reset-password/${TARGET_ID}`)
      .set("Authorization", `Bearer ${accessToken(ACTOR_ID)}`)
      .send({ newPassword: "short" });

    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
