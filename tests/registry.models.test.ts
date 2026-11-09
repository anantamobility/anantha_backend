import { describe, it, expect } from "vitest";
import { MODEL_REGISTRY, getModelDelegate } from "../src/registry/models.js";
import { PERMISSION_REGISTRY } from "../src/registry/perm.js";
import prisma from "../src/database/prismaClient.js";

const approvedResources = [
  ...new Set(PERMISSION_REGISTRY.map((group) => group.resource)),
].sort();

const prismaMock = prisma as unknown as Record<string, unknown>;

describe("MODEL_REGISTRY", () => {
  it("has exactly the same keys as the permission registry resources", () => {
    const registryKeys = Object.keys(MODEL_REGISTRY).sort();
    expect(registryKeys).toEqual(approvedResources);
    expect(registryKeys).toHaveLength(approvedResources.length);
  });

  it("maps every approved resource to its Prisma delegate", () => {
    for (const resource of approvedResources) {
      const delegate = {
        ratecard: prismaMock.rateCard,
        ratecardAssignment: prismaMock.rateCardAssignment,
      }[resource] ?? prismaMock[resource];
      expect(getModelDelegate(resource)).toBe(delegate);
    }
  });

  it("maps ratecard resources to their Prisma delegates", () => {
    expect(getModelDelegate("ratecard")).toBe(prismaMock.rateCard);
    expect(getModelDelegate("ratecardAssignment")).toBe(
      prismaMock.rateCardAssignment
    );
  });
});

describe("getModelDelegate", () => {
  it("maps the hub resource to its Prisma delegate", () => {
    expect(getModelDelegate("hub")).toBe(prismaMock.hub);
  });

  it("returns null for prototype-pollution keys (__proto__)", () => {
    expect(getModelDelegate("__proto__")).toBeNull();
  });

  it("returns null for other non-approved resources", () => {
    expect(getModelDelegate("constructor")).toBeNull();
    expect(getModelDelegate("totally-unknown")).toBeNull();
  });
});
