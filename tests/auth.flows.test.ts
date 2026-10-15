import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { redisGet, redisDel } from "../src/config/redis.js";
import { refreshToken as makeRefreshToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

let passwordHash: string;

beforeAll(async () => {
  passwordHash = await bcrypt.hash("correct-password", 10);
});

beforeEach(() => {
  prismaMock.user.findUnique.mockReset();
  (redisGet as any).mockResolvedValue({ ok: true, value: "test-session" });
});

function existingUser() {
  return {
    id: "u1",
    name: "Tester",
    email: "tester@example.com",
    phoneNumber: "1234567890",
    password: passwordHash,
    status: "ACTIVE",
    role: { name: "SUPERVISOR" },
  };
}

describe("POST /auth/login", () => {
  it("returns 200, an access token, and sets the refresh cookie on valid credentials", async () => {
    prismaMock.user.findUnique.mockResolvedValue(existingUser());

    const res = await request(app)
      .post("/auth/login")
      .send({ phone: "1234567890", password: "correct-password" });

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe("string");
    expect(res.body.accessToken.length).toBeGreaterThan(0);
    expect(res.body.user).toMatchObject({ role: "SUPERVISOR" });

    const cookies = res.headers["set-cookie"] ?? [];
    expect(cookies.join(";")).toContain("refresh_token=");
  });

  it("returns 404 on an invalid password, preserving the API contract", async () => {
    prismaMock.user.findUnique.mockResolvedValue(existingUser());

    const res = await request(app)
      .post("/auth/login")
      .send({ phone: "1234567890", password: "wrong-password" });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Invalid phone number or password.");
    expect(res.body.accessToken).toBeUndefined();
  });
});

describe("POST /auth/tokenRefresh", () => {
  it("returns 200 and a new access token for a valid refresh cookie", async () => {
    prismaMock.user.findUnique.mockResolvedValue(existingUser());

    const token = makeRefreshToken("u1", "test-session");
    const res = await request(app)
      .post("/auth/tokenRefresh")
      .set("Cookie", [`refresh_token=${token}`]);

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe("string");
    expect(res.body.accessToken.length).toBeGreaterThan(0);
  });
});

describe("POST /auth/logout", () => {
  it("clears the refresh cookie and returns 200 with the expected message", async () => {
    const token = makeRefreshToken("u1", "test-session");
    const res = await request(app)
      .post("/auth/logout")
      .set("Cookie", [`refresh_token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("cookie is cleared. user is logged out.");
    expect(redisDel).toHaveBeenCalledWith("session:u1");

    const cookies = res.headers["set-cookie"] ?? [];
    expect(cookies.join(";")).toContain("refresh_token=;");
  });
});
