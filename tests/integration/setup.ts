import { vi } from "vitest";
import "dotenv/config";

const base =
  process.env.TEST_DATABASE_URL ??
  (() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL or TEST_DATABASE_URL is required for integration tests");
    }
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.set("schema", "anantha_test");
    return url.toString();
  })();

process.env.DATABASE_URL = base;
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "integration-refresh-secret";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.NOTIFICATION_EMAIL_PROVIDER = "none";
process.env.NOTIFICATION_SMS_PROVIDER = "none";

const store = new Map<string, string>();

vi.mock("../../src/config/redis.js", () => ({
  default: {},
  redisGet: vi.fn(async (key: string) => ({
    ok: true as const,
    value: store.get(key) ?? null,
  })),
  redisSet: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
    return true;
  }),
  redisDel: vi.fn(async (key: string) => {
    store.delete(key);
    return true;
  }),
}));

export function clearRedisMock() {
  store.clear();
}
