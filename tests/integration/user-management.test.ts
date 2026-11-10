import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import prisma from "../../src/database/prismaClient.js";
import {
  auth,
  createUserRecord,
  login,
  resetDatabase,
  seedRbac,
} from "./helpers.js";

let adminToken: string;
let adminId: string;
let operatorToken: string;

beforeAll(async () => {
  await resetDatabase();
  await seedRbac();

  const admin = await createUserRecord({
    name: "Integration Admin",
    phoneNumber: "9000000001",
    email: "admin.integration@anantha.test",
    role: "ADMIN",
  });
  adminId = admin.id;
  adminToken = await login(app, admin.phoneNumber);

  const operator = await createUserRecord({
    name: "Audit Reader",
    phoneNumber: "9000000002",
    email: "operator.integration@anantha.test",
    role: "OPERATOR",
  });
  operatorToken = await login(app, operator.phoneNumber);
});

describe("user management and security", () => {
  it("creates, lists and reads a user without exposing password hashes", async () => {
    const created = await request(app)
      .post("/users")
      .set(auth(adminToken))
      .send({
        name: "Managed Supervisor",
        phoneNumber: "9000000100",
        email: "managed.supervisor@anantha.test",
        password: "Password123",
        roleName: "SUPERVISOR",
      });

    expect(created.status).toBe(201);
    expect(created.body.data.user.role.name).toBe("SUPERVISOR");
    expect(created.body.data.user.passwordHash).toBeUndefined();

    const listed = await request(app)
      .get("/users?search=managed.supervisor")
      .set(auth(adminToken));
    expect(listed.status).toBe(200);
    expect(listed.body.data.users).toHaveLength(1);

    const detail = await request(app)
      .get(`/users/${created.body.data.user.id}`)
      .set(auth(adminToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data.user.email).toBe("managed.supervisor@anantha.test");
    expect(detail.body.data.user.passwordHash).toBeUndefined();
  });

  it("assigns roles and prevents unprotected administrative changes", async () => {
    const roles = await prisma.role.findMany({ where: { name: { in: ["SUPERVISOR", "OPERATOR"] } } });
    const supervisorRole = roles.find((role) => role.name === "SUPERVISOR")!;
    const operatorRole = roles.find((role) => role.name === "OPERATOR")!;

    const created = await request(app)
      .post("/users")
      .set(auth(adminToken))
      .send({
        name: "Promoted User",
        phoneNumber: "9000000101",
        password: "Password123",
        roleId: operatorRole.id,
      });
    expect(created.status).toBe(201);

    const promoted = await request(app)
      .patch(`/users/${created.body.data.user.id}/role`)
      .set(auth(adminToken))
      .send({ roleId: supervisorRole.id, reason: "integration promotion" });
    expect(promoted.status).toBe(200);
    expect(promoted.body.data.user.role.name).toBe("SUPERVISOR");

    const selfDemotion = await request(app)
      .patch(`/users/${adminId}/role`)
      .set(auth(adminToken))
      .send({ roleId: operatorRole.id });
    expect(selfDemotion.status).toBe(409);

    const selfDelete = await request(app)
      .delete(`/users/${adminId}`)
      .set(auth(adminToken));
    expect(selfDelete.status).toBe(409);
  });

  it("suspends accounts, revokes sessions and blocks stale tokens", async () => {
    const created = await request(app)
      .post("/users")
      .set(auth(adminToken))
      .send({
        name: "Session User",
        phoneNumber: "9000000102",
        password: "Password123",
        roleName: "OPERATOR",
      });
    const userId = created.body.data.user.id as string;
    const sessionToken = await login(app, "9000000102", "Password123");

    const suspended = await request(app)
      .patch(`/users/${userId}/status`)
      .set(auth(adminToken))
      .send({ status: "SUSPENDED", reason: "integration suspension" });
    expect(suspended.status).toBe(200);

    const stale = await request(app)
      .get(`/users/${userId}`)
      .set(auth(sessionToken));
    expect(stale.status).toBe(401);

    const badLogin = await request(app)
      .post("/auth/login")
      .send({ phone: "9000000102", password: "Password123" });
    expect(badLogin.status).toBe(403);

    await request(app)
      .patch(`/users/${userId}/status`)
      .set(auth(adminToken))
      .send({ status: "ACTIVE" });
    const freshToken = await login(app, "9000000102", "Password123");

    const revoked = await request(app)
      .post(`/users/${userId}/revoke-sessions`)
      .set(auth(adminToken));
    expect(revoked.status).toBe(200);

    const afterRevoke = await request(app)
      .get(`/users/${userId}`)
      .set(auth(freshToken));
    expect(afterRevoke.status).toBe(401);
  });

  it("soft-deletes users and excludes them from normal reads", async () => {
    const created = await request(app)
      .post("/users")
      .set(auth(adminToken))
      .send({
        name: "Deleted User",
        phoneNumber: "9000000103",
        password: "Password123",
        roleName: "OPERATOR",
      });
    const userId = created.body.data.user.id as string;

    const deleted = await request(app)
      .delete(`/users/${userId}`)
      .set(auth(adminToken));
    expect(deleted.status).toBe(200);

    const detail = await request(app)
      .get(`/users/${userId}`)
      .set(auth(adminToken));
    expect(detail.status).toBe(404);

    const listed = await request(app)
      .get("/users?search=9000000103")
      .set(auth(adminToken));
    expect(listed.body.data.users).toHaveLength(0);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.status).toBe("SUSPENDED");
  });

  it("records audit events and protects the audit log endpoint", async () => {
    const forbidden = await request(app)
      .get("/audit-logs")
      .set(auth(operatorToken));
    expect(forbidden.status).toBe(403);

    const response = await request(app)
      .get("/audit-logs?resource=User&action=CREATE")
      .set(auth(adminToken));
    expect(response.status).toBe(200);
    expect(response.body.data.auditLogs.length).toBeGreaterThan(0);
    expect(response.body.data.auditLogs[0].resource).toBe("User");
  });

  it("rejects duplicate phone numbers with a conflict", async () => {
    const first = await request(app)
      .post("/users")
      .set(auth(adminToken))
      .send({
        name: "Duplicate One",
        phoneNumber: "9000000104",
        password: "Password123",
        roleName: "OPERATOR",
      });
    expect(first.status).toBe(201);

    const duplicate = await request(app)
      .post("/users")
      .set(auth(adminToken))
      .send({
        name: "Duplicate Two",
        phoneNumber: "9000000104",
        password: "Password123",
        roleName: "OPERATOR",
      });
    expect(duplicate.status).toBe(409);
  });
});
