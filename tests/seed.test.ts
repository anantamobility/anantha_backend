import { describe, it, expect } from "vitest";
import { getRolePermissionBuckets } from "../src/database/seed.js";
import { PERMISSION_REGISTRY } from "../src/registry/perm.js";

const registryKeys = PERMISSION_REGISTRY.flatMap((group) =>
  group.actions.map((action) => `${group.resource}:${action}`)
);

describe("getRolePermissionBuckets", () => {
  const buckets = getRolePermissionBuckets(PERMISSION_REGISTRY);

  it("grants OPERATOR exactly the read-only operational permissions", () => {
    expect([...buckets.OPERATOR].sort()).toEqual([
      "hub:read",
      "rider:read",
      "staff:read",
      "vehicle:read",
    ]);
  });

  it("grants ADMIN every permission key in the registry", () => {
    for (const key of registryKeys) {
      expect(buckets.ADMIN).toContain(key);
    }
    expect(buckets.ADMIN).toHaveLength(registryKeys.length);
  });

  it("grants SUPERVISOR user:read but not user:create", () => {
    expect(buckets.SUPERVISOR).toContain("user:read");
    expect(buckets.SUPERVISOR).not.toContain("user:create");
  });

  it("produces deterministic buckets for an arbitrary registry", () => {
    const custom = [
      { resource: "alpha", actions: ["read", "create"] },
      { resource: "vehicle", actions: ["read"] },
    ] as const;

    const result = getRolePermissionBuckets(custom);

    expect(result.ADMIN).toEqual(["alpha:read", "alpha:create", "vehicle:read"]);
    expect(result.OPERATOR).toEqual(["vehicle:read"]);
    expect(result.SUPERVISOR).toEqual([]);
  });
});
