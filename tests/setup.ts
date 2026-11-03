// tests/setup.ts
import { vi } from "vitest";

declare const process: {
  env: Record<string, string | undefined>;
};

process.env.NODE_ENV ??= "test";
process.env.JWT_SECRET ??= "test-access-secret";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret";
process.env.REDIS_URL ??= "redis://localhost:6379";

vi.mock("../src/config/redis.js", () => ({
  default: {},
  redisGet: vi.fn(async () => ({ ok: true, value: "test-session" })),
  redisSet: vi.fn(async () => true),
  redisDel: vi.fn(async () => true),
}));

vi.mock("../src/database/prismaClient.js", () => {
  const delegate = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(async () => []),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(async () => 0),
  });
  const prisma: any = {
    user: delegate(), role: delegate(), permission: delegate(),
    rider: delegate(), staff: delegate(), vehicle: delegate(),
    auditLog: delegate(), hub: delegate(),
    $disconnect: vi.fn(),
  };
  prisma.$transaction = vi.fn(async (fn: any) => fn(prisma));
  return { default: prisma };
});