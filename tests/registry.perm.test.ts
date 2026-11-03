import { describe, it, expect } from "vitest";
import {
  PERMISSION_REGISTRY,
  ACTION_DEFINITIONS,
} from "../src/registry/perm.js";

describe("PERMISSION_REGISTRY", () => {
  it("declares at least one action for every permission group", () => {
    for (const group of PERMISSION_REGISTRY) {
      expect(group.actions.length).toBeGreaterThan(0);
    }
  });

  it("only uses actions defined in ACTION_DEFINITIONS", () => {
    const knownActions = new Set(Object.keys(ACTION_DEFINITIONS));
    for (const group of PERMISSION_REGISTRY) {
      for (const action of group.actions) {
        expect(
          knownActions.has(action),
          `Unknown action "${action}" on resource "${group.resource}"`
        ).toBe(true);
      }
    }
  });

  it("registers full hub CRUD and staff deletion", () => {
    const byResource = new Map(
      PERMISSION_REGISTRY.map((group) => [group.resource, group.actions])
    );

    expect(byResource.get("hub")).toEqual([
      "create",
      "read",
      "update",
      "delete",
    ]);
    expect(byResource.get("staff")).toContain("delete");
  });
});

describe("ACTION_DEFINITIONS", () => {
  it("documents assign_perm with a non-empty description referencing a role", () => {
    const description = ACTION_DEFINITIONS.assign_perm;
    expect(typeof description).toBe("string");
    expect(description.length).toBeGreaterThan(0);
    expect(description).toMatch(/role/i);
  });
});
