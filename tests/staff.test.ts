import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

const STAFF_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const MISSING_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a6c";
const USER_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a7d";
const OTHER_USER_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a8e";
const HUB_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a9f";
const OTHER_HUB_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b0a";

const safeUser = {
  id: USER_ID,
  name: "Alice",
  email: "alice@example.com",
  phoneNumber: "1234567890",
};

function authUser(permissions: { resource: string; action: string }[]) {
  return {
    id: "u1",
    name: "Tester",
    status: "ACTIVE",
    role: { name: "ADMIN", permissions },
  };
}

function authenticate(permissions: { resource: string; action: string }[]) {
  prismaMock.user.findUnique.mockResolvedValue(authUser(permissions));
}

function existingStaff(overrides: Record<string, unknown> = {}) {
  return {
    id: STAFF_ID,
    userId: null,
    employeeCode: "EMP-1",
    fullName: "Alice",
    phoneNumber: "1234567890",
    hubId: null,
    jobTitle: "Agent",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  prismaMock.user.findUnique.mockReset();
  prismaMock.hub.findUnique.mockReset();
  prismaMock.staff.findUnique.mockReset();
  prismaMock.staff.findFirst.mockReset();
  prismaMock.staff.findMany.mockReset();
  prismaMock.staff.count.mockReset();
  prismaMock.staff.create.mockReset();
  prismaMock.staff.update.mockReset();
  prismaMock.staff.delete.mockReset();
  prismaMock.auditLog.create.mockReset();
});

describe("POST /staff", () => {
  it("creates a staff record with valid user and hub relations, then audits it", async () => {
    prismaMock.user.findUnique.mockImplementation(
      (args: { where: { id: string } }) => {
        if (args.where.id === "u1") {
          return Promise.resolve(authUser([{ resource: "staff", action: "create" }]));
        }
        if (args.where.id === USER_ID) return Promise.resolve({ id: USER_ID });
        return Promise.resolve(null);
      }
    );
    prismaMock.hub.findUnique.mockResolvedValue({ id: HUB_ID });
    prismaMock.staff.create.mockResolvedValue(
      existingStaff({
        userId: USER_ID,
        hubId: HUB_ID,
        user: safeUser,
      })
    );

    const res = await request(app)
      .post("/staff")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        fullName: "Alice",
        userId: USER_ID,
        hubId: HUB_ID,
        employeeCode: "EMP-1",
        jobTitle: "Agent",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      data: { staff: { id: STAFF_ID, fullName: "Alice" } },
    });
    expect(prismaMock.staff.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fullName: "Alice",
        userId: USER_ID,
        hubId: HUB_ID,
        employeeCode: "EMP-1",
        jobTitle: "Agent",
        status: "ACTIVE",
      }),
      include: { user: { select: expect.any(Object) } },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CREATE",
        resource: "Staff",
        resourceId: STAFF_ID,
      }),
    });
  });

  it("returns 400 for an invalid payload without touching the database", async () => {
    authenticate([{ resource: "staff", action: "create" }]);

    const res = await request(app)
      .post("/staff")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ employeeCode: "EMP-1" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.staff.create).not.toHaveBeenCalled();
  });

  it("returns 409 when the staff code or linked user already exists", async () => {
    authenticate([{ resource: "staff", action: "create" }]);
    prismaMock.staff.create.mockRejectedValue({ code: "P2002" });

    const res = await request(app)
      .post("/staff")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ fullName: "Alice", employeeCode: "EMP-1" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the linked user does not exist", async () => {
    prismaMock.user.findUnique.mockImplementation(
      (args: { where: { id: string } }) => {
        if (args.where.id === "u1") {
          return Promise.resolve(authUser([{ resource: "staff", action: "create" }]));
        }
        return Promise.resolve(null);
      }
    );

    const res = await request(app)
      .post("/staff")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ fullName: "Alice", userId: USER_ID });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.message).toBe("User not found");
    expect(prismaMock.staff.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the linked hub does not exist", async () => {
    authenticate([{ resource: "staff", action: "create" }]);
    prismaMock.hub.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/staff")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ fullName: "Alice", hubId: HUB_ID });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.message).toBe("Hub not found");
    expect(prismaMock.staff.create).not.toHaveBeenCalled();
  });

  it("returns 401 without authentication", async () => {
    const res = await request(app)
      .post("/staff")
      .send({ fullName: "Alice" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(prismaMock.staff.create).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks staff:create", async () => {
    authenticate([{ resource: "staff", action: "read" }]);

    const res = await request(app)
      .post("/staff")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ fullName: "Alice" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prismaMock.staff.create).not.toHaveBeenCalled();
  });
});

describe("GET /staff", () => {
  it("lists staff with a pagination envelope and excludes deleted records", async () => {
    authenticate([{ resource: "staff", action: "read" }]);
    prismaMock.staff.findMany.mockResolvedValue([existingStaff()]);
    prismaMock.staff.count.mockResolvedValue(1);

    const res = await request(app)
      .get("/staff")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.staff).toHaveLength(1);
    expect(res.body.data.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });

    const args = prismaMock.staff.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ deletedAt: null });
    expect(args).toMatchObject({ skip: 0, take: 20 });
  });

  it("applies pagination, search, hub, and status filters", async () => {
    authenticate([{ resource: "staff", action: "read" }]);
    prismaMock.staff.findMany.mockResolvedValue([]);
    prismaMock.staff.count.mockResolvedValue(11);

    const res = await request(app)
      .get(`/staff?page=2&limit=5&search=alice&hubId=${HUB_ID}&status=ACTIVE`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination).toMatchObject({
      page: 2,
      limit: 5,
      total: 11,
      totalPages: 3,
    });

    const args = prismaMock.staff.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ skip: 5, take: 5 });
    expect(args.where).toMatchObject({
      deletedAt: null,
      hubId: HUB_ID,
      status: "ACTIVE",
    });
    expect(args.where.OR).toEqual(
      expect.arrayContaining([
        { fullName: { contains: "alice", mode: "insensitive" } },
        { employeeCode: { contains: "alice", mode: "insensitive" } },
      ])
    );
  });

  it("returns 400 for invalid filters", async () => {
    authenticate([{ resource: "staff", action: "read" }]);

    const res = await request(app)
      .get("/staff?status=UNKNOWN")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.staff.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks staff:read", async () => {
    authenticate([{ resource: "staff", action: "update" }]);

    const res = await request(app)
      .get("/staff")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(403);
    expect(prismaMock.staff.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /staff/:id", () => {
  it("returns one staff record without exposing sensitive user fields", async () => {
    authenticate([{ resource: "staff", action: "read" }]);
    prismaMock.staff.findFirst.mockResolvedValue(existingStaff());
    prismaMock.staff.findUnique.mockResolvedValue(
      existingStaff({ userId: USER_ID, user: safeUser })
    );

    const res = await request(app)
      .get(`/staff/${STAFF_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.staff.user).toEqual(safeUser);
    expect(res.body.data.staff.user).not.toHaveProperty("passwordHash");

    const args = prismaMock.staff.findUnique.mock.calls[0][0];
    expect(args.include.user.select).not.toHaveProperty("passwordHash");
  });

  it("returns 404 for a nonexistent staff record", async () => {
    authenticate([{ resource: "staff", action: "read" }]);
    prismaMock.staff.findFirst.mockResolvedValue(existingStaff());
    prismaMock.staff.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/staff/${MISSING_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 for a soft-deleted staff record", async () => {
    authenticate([{ resource: "staff", action: "read" }]);
    prismaMock.staff.findFirst.mockResolvedValue(
      existingStaff({ deletedAt: new Date() })
    );
    prismaMock.staff.findUnique.mockResolvedValue(
      existingStaff({ deletedAt: new Date() })
    );

    const res = await request(app)
      .get(`/staff/${STAFF_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("PATCH /staff/:id", () => {
  it("updates a staff record and records before/after audit data", async () => {
    authenticate([{ resource: "staff", action: "update" }]);
    const oldStaff = existingStaff();
    prismaMock.staff.findFirst.mockResolvedValue(oldStaff);
    prismaMock.staff.findUnique.mockResolvedValue(oldStaff);
    prismaMock.staff.update.mockResolvedValue(
      existingStaff({ jobTitle: "Team Lead" })
    );

    const res = await request(app)
      .patch(`/staff/${STAFF_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ jobTitle: "Team Lead" });

    expect(res.status).toBe(200);
    expect(res.body.data.staff.jobTitle).toBe("Team Lead");
    expect(prismaMock.staff.update).toHaveBeenCalledWith({
      where: { id: STAFF_ID },
      data: { jobTitle: "Team Lead" },
      include: { user: { select: expect.any(Object) } },
    });

    const audit = prismaMock.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      action: "UPDATE",
      resource: "Staff",
      resourceId: STAFF_ID,
    });
    expect(audit.changes.jobTitle).toEqual({ old: "Agent", new: "Team Lead" });
  });

  it("returns 400 for an invalid update payload", async () => {
    authenticate([{ resource: "staff", action: "update" }]);
    prismaMock.staff.findFirst.mockResolvedValue(existingStaff());

    const res = await request(app)
      .patch(`/staff/${STAFF_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "RETIRED" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.staff.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the update would duplicate a unique value", async () => {
    authenticate([{ resource: "staff", action: "update" }]);
    prismaMock.staff.findFirst.mockResolvedValue(existingStaff());
    prismaMock.staff.findUnique.mockResolvedValue(existingStaff());
    prismaMock.staff.update.mockRejectedValue({ code: "P2002" });

    const res = await request(app)
      .patch(`/staff/${STAFF_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ employeeCode: "EMP-2" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("returns 404 when changing to a hub that does not exist", async () => {
    authenticate([{ resource: "staff", action: "update" }]);
    prismaMock.staff.findFirst.mockResolvedValue(existingStaff());
    prismaMock.staff.findUnique.mockResolvedValue(existingStaff());
    prismaMock.hub.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/staff/${STAFF_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ hubId: OTHER_HUB_ID });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Hub not found");
    expect(prismaMock.staff.update).not.toHaveBeenCalled();
  });

  it("returns 404 when changing to a user that does not exist", async () => {
    prismaMock.user.findUnique.mockImplementation(
      (args: { where: { id: string } }) => {
        if (args.where.id === "u1") {
          return Promise.resolve(authUser([{ resource: "staff", action: "update" }]));
        }
        return Promise.resolve(null);
      }
    );
    prismaMock.staff.findFirst.mockResolvedValue(existingStaff());
    prismaMock.staff.findUnique.mockResolvedValue(existingStaff());

    const res = await request(app)
      .patch(`/staff/${STAFF_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ userId: OTHER_USER_ID });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("User not found");
    expect(prismaMock.staff.update).not.toHaveBeenCalled();
  });

  it("returns 404 when updating a nonexistent staff record", async () => {
    authenticate([{ resource: "staff", action: "update" }]);
    prismaMock.staff.findFirst.mockResolvedValue(existingStaff());
    prismaMock.staff.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/staff/${MISSING_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ jobTitle: "Nope" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 403 when the role lacks staff:update", async () => {
    authenticate([{ resource: "staff", action: "read" }]);

    const res = await request(app)
      .patch(`/staff/${STAFF_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ jobTitle: "Nope" });

    expect(res.status).toBe(403);
    expect(prismaMock.staff.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /staff/:id", () => {
  it("soft-deletes staff without deleting the linked user or staff row", async () => {
    authenticate([{ resource: "staff", action: "delete" }]);
    prismaMock.staff.findFirst.mockResolvedValue(existingStaff());
    prismaMock.staff.findUnique.mockResolvedValue(existingStaff());
    prismaMock.staff.update.mockResolvedValue(
      existingStaff({ deletedAt: new Date("2026-01-02T00:00:00.000Z") })
    );

    const res = await request(app)
      .delete(`/staff/${STAFF_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe("Staff deleted successfully");
    expect(prismaMock.staff.update).toHaveBeenCalledWith({
      where: { id: STAFF_ID },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prismaMock.staff.delete).not.toHaveBeenCalled();
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "DELETE",
        resource: "Staff",
        resourceId: STAFF_ID,
      }),
    });
  });

  it("returns 404 when deleting a nonexistent staff record", async () => {
    authenticate([{ resource: "staff", action: "delete" }]);
    prismaMock.staff.findFirst.mockResolvedValue(existingStaff());
    prismaMock.staff.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/staff/${MISSING_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(prismaMock.staff.update).not.toHaveBeenCalled();
  });

  it("returns 404 when deleting an already soft-deleted staff record", async () => {
    authenticate([{ resource: "staff", action: "delete" }]);
    prismaMock.staff.findFirst.mockResolvedValue(
      existingStaff({ deletedAt: new Date() })
    );
    prismaMock.staff.findUnique.mockResolvedValue(
      existingStaff({ deletedAt: new Date() })
    );

    const res = await request(app)
      .delete(`/staff/${STAFF_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(prismaMock.staff.update).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks staff:delete", async () => {
    authenticate([{ resource: "staff", action: "update" }]);

    const res = await request(app)
      .delete(`/staff/${STAFF_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(403);
    expect(prismaMock.staff.update).not.toHaveBeenCalled();
  });
});
