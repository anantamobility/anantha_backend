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
      "client:read",
      "collection:read",
      "deposit:read",
      "hub:read",
      "inventory:read",
      "rental:read",
      "rider:read",
      "service:read",
      "spare:read",
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

  it("grants SUPERVISOR full client and ratecard management", () => {
    expect(buckets.SUPERVISOR).toEqual(
      expect.arrayContaining([
        "client:create",
        "client:read",
        "client:update",
        "client:status:update",
        "ratecard:create",
        "ratecard:read",
        "ratecard:update",
        "ratecard:status:update",
        "ratecardAssignment:create",
        "ratecardAssignment:read",
        "ratecardAssignment:update",
        "ratecardAssignment:delete",
      ])
    );
  });

  it("grants SUPERVISOR the full rental and financial workflow", () => {
    expect(buckets.SUPERVISOR).toEqual(
      expect.arrayContaining([
        "rental:create",
        "rental:assign",
        "rental:activate",
        "rental:close",
        "deposit:receive",
        "deposit:refund",
        "deposit:adjust",
        "collection:create",
        "collection:due:generate",
      ])
    );
  });

  it("limits dashboards and reports to ADMIN and SUPERVISOR", () => {
    expect(buckets.ADMIN).toEqual(
      expect.arrayContaining(["dashboard:read", "report:read"])
    );
    expect(buckets.SUPERVISOR).toEqual(
      expect.arrayContaining(["dashboard:read", "report:read"])
    );
    expect(buckets.OPERATOR).not.toContain("dashboard:read");
    expect(buckets.OPERATOR).not.toContain("report:read");
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
