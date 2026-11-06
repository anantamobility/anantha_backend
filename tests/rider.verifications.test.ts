import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

const RIDER_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const MISSING_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a6c";
const VERIFICATION_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a7d";
const DOCUMENT_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a8e";
const HISTORY_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a9f";

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

function existingRider(overrides: Record<string, unknown> = {}) {
  return {
    id: RIDER_ID,
    riderCode: "RDR-ABC12345",
    fullName: "Ravi Kumar",
    deletedAt: null,
    ...overrides,
  };
}

function existingVerification(overrides: Record<string, unknown> = {}) {
  return {
    id: VERIFICATION_ID,
    riderId: RIDER_ID,
    type: "PVC",
    status: "NOT_SUBMITTED",
    submittedAt: null,
    completedAt: null,
    expiresAt: null,
    verifiedById: null,
    rejectionReason: null,
    documentId: null,
    version: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    verifiedBy: null,
    documents: [],
    ...overrides,
  };
}

beforeEach(() => {
  prismaMock.user.findUnique.mockReset();
  prismaMock.rider.findUnique.mockReset();
  prismaMock.rider.findFirst.mockReset();
  prismaMock.riderVerification.findUnique.mockReset();
  prismaMock.riderVerification.findMany.mockReset();
  prismaMock.riderVerification.updateMany.mockReset();
  prismaMock.riderVerificationHistory.create.mockReset();
  prismaMock.document.findMany.mockReset();
  prismaMock.document.count.mockReset();
  prismaMock.document.updateMany.mockReset();
  prismaMock.auditLog.create.mockReset();
});

describe("GET /riders/:id/verifications", () => {
  it("lists PVC and BGV independently", async () => {
    authenticate([{ resource: "rider", action: "verification:read" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.riderVerification.findMany.mockResolvedValue([
      existingVerification({ type: "BGV", status: "PENDING" }),
      existingVerification({ type: "PVC", status: "VERIFIED" }),
    ]);

    const res = await request(app)
      .get(`/riders/${RIDER_ID}/verifications`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.verifications).toHaveLength(2);
    expect(
      res.body.data.verifications.map((v: any) => [v.type, v.status])
    ).toEqual([
      ["BGV", "PENDING"],
      ["PVC", "VERIFIED"],
    ]);
  });

  it("returns 404 for a missing rider", async () => {
    authenticate([{ resource: "rider", action: "verification:read" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/riders/${MISSING_ID}/verifications`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("GET /riders/:id/verifications/:type", () => {
  it("returns one verification with its document and history", async () => {
    authenticate([{ resource: "rider", action: "verification:read" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.riderVerification.findUnique.mockResolvedValue(
      existingVerification({
        status: "REJECTED",
        rejectionReason: "Blurred document",
        documents: [{ id: DOCUMENT_ID, documentType: "PVC" }],
        history: [
          {
            id: HISTORY_ID,
            previousStatus: "PENDING",
            status: "REJECTED",
            rejectionReason: "Blurred document",
            reviewedBy: { id: "u1", name: "Tester" },
          },
        ],
      })
    );

    const res = await request(app)
      .get(`/riders/${RIDER_ID}/verifications/PVC`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.verification.status).toBe("REJECTED");
    expect(res.body.data.verification.rejectionReason).toBe(
      "Blurred document"
    );
    expect(res.body.data.verification.history).toHaveLength(1);
  });

  it("returns 400 for an invalid verification type", async () => {
    authenticate([{ resource: "rider", action: "verification:read" }]);

    const res = await request(app)
      .get(`/riders/${RIDER_ID}/verifications/UNKNOWN`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.riderVerification.findUnique).not.toHaveBeenCalled();
  });
});

describe("POST /riders/:id/verifications/:type/submit", () => {
  it("submits PVC with valid documents and records history", async () => {
    authenticate([{ resource: "rider", action: "verification:submit" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.riderVerification.findUnique
      .mockResolvedValueOnce(existingVerification())
      .mockResolvedValueOnce(
        existingVerification({ status: "PENDING", submittedAt: new Date() })
      );
    prismaMock.document.findMany.mockResolvedValue([
      { id: DOCUMENT_ID, documentType: "PVC" },
    ]);
    prismaMock.document.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.riderVerification.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.riderVerificationHistory.create.mockResolvedValue({
      id: HISTORY_ID,
      previousStatus: "NOT_SUBMITTED",
      status: "PENDING",
    });

    const res = await request(app)
      .post(`/riders/${RIDER_ID}/verifications/PVC/submit`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ documentIds: [DOCUMENT_ID] });

    expect(res.status).toBe(200);
    expect(res.body.data.verification.status).toBe("PENDING");
    expect(prismaMock.document.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [DOCUMENT_ID] },
        riderId: RIDER_ID,
        deletedAt: null,
      },
      data: { verificationId: VERIFICATION_ID },
    });
    expect(prismaMock.riderVerification.updateMany).toHaveBeenCalledWith({
      where: {
        id: VERIFICATION_ID,
        status: "NOT_SUBMITTED",
        version: 0,
      },
      data: expect.objectContaining({
        status: "PENDING",
        rejectionReason: null,
        version: { increment: 1 },
      }),
    });
    expect(prismaMock.riderVerificationHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        verificationId: VERIFICATION_ID,
        previousStatus: "NOT_SUBMITTED",
        status: "PENDING",
      }),
      select: expect.any(Object),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "SUBMIT",
        resource: "RiderVerification",
        resourceId: VERIFICATION_ID,
      }),
    });
  });

  it("rejects submission when a document belongs to another rider", async () => {
    authenticate([{ resource: "rider", action: "verification:submit" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.riderVerification.findUnique.mockResolvedValue(
      existingVerification()
    );
    prismaMock.document.findMany.mockResolvedValue([
      { id: DOCUMENT_ID, documentType: "PVC" },
    ]);

    const res = await request(app)
      .post(`/riders/${RIDER_ID}/verifications/PVC/submit`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        documentIds: [DOCUMENT_ID, "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b0a"],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.riderVerification.updateMany).not.toHaveBeenCalled();
  });

  it("rejects submission from a pending or verified state", async () => {
    authenticate([{ resource: "rider", action: "verification:submit" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.riderVerification.findUnique.mockResolvedValue(
      existingVerification({ status: "PENDING" })
    );

    const res = await request(app)
      .post(`/riders/${RIDER_ID}/verifications/PVC/submit`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.riderVerification.updateMany).not.toHaveBeenCalled();
  });

  it("allows re-submission after rejection and preserves the old rejection in history", async () => {
    authenticate([{ resource: "rider", action: "verification:submit" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.riderVerification.findUnique
      .mockResolvedValueOnce(
        existingVerification({
          status: "REJECTED",
          rejectionReason: "Blurred document",
        })
      )
      .mockResolvedValueOnce(existingVerification({ status: "PENDING" }));
    prismaMock.riderVerification.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.riderVerificationHistory.create.mockResolvedValue({
      id: HISTORY_ID,
      previousStatus: "REJECTED",
      status: "PENDING",
    });

    const res = await request(app)
      .post(`/riders/${RIDER_ID}/verifications/PVC/submit`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(prismaMock.riderVerification.updateMany).toHaveBeenCalledWith({
      where: {
        id: VERIFICATION_ID,
        status: "REJECTED",
        version: 0,
      },
      data: expect.objectContaining({
        status: "PENDING",
        rejectionReason: null,
      }),
    });
    expect(prismaMock.riderVerificationHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        previousStatus: "REJECTED",
        status: "PENDING",
      }),
      select: expect.any(Object),
    });
  });

  it("rejects a stale concurrent submission", async () => {
    authenticate([{ resource: "rider", action: "verification:submit" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.riderVerification.findUnique.mockResolvedValue(
      existingVerification()
    );
    prismaMock.riderVerification.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .post(`/riders/${RIDER_ID}/verifications/PVC/submit`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.riderVerificationHistory.create).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("POST /riders/:id/verifications/:type/approve", () => {
  it("approves a pending verification with a required document", async () => {
    authenticate([{ resource: "rider", action: "verification:review" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.riderVerification.findUnique
      .mockResolvedValueOnce(existingVerification({ status: "PENDING" }))
      .mockResolvedValueOnce(existingVerification({ status: "VERIFIED" }));
    prismaMock.document.count.mockResolvedValue(1);
    prismaMock.riderVerification.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.riderVerificationHistory.create.mockResolvedValue({
      id: HISTORY_ID,
      previousStatus: "PENDING",
      status: "VERIFIED",
    });

    const res = await request(app)
      .post(`/riders/${RIDER_ID}/verifications/PVC/approve`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ notes: "Clear document" });

    expect(res.status).toBe(200);
    expect(res.body.data.verification.status).toBe("VERIFIED");
    expect(prismaMock.riderVerification.updateMany).toHaveBeenCalledWith({
      where: {
        id: VERIFICATION_ID,
        status: "PENDING",
        version: 0,
      },
      data: expect.objectContaining({
        status: "VERIFIED",
        verifiedById: "u1",
        rejectionReason: null,
        version: { increment: 1 },
      }),
    });
    expect(prismaMock.riderVerificationHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reviewedById: "u1",
        previousStatus: "PENDING",
        status: "VERIFIED",
      }),
      select: expect.any(Object),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "APPROVE",
        resource: "RiderVerification",
      }),
    });
  });

  it("blocks approval when no matching document exists", async () => {
    authenticate([{ resource: "rider", action: "verification:review" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.riderVerification.findUnique.mockResolvedValue(
      existingVerification({ status: "PENDING" })
    );
    prismaMock.document.count.mockResolvedValue(0);

    const res = await request(app)
      .post(`/riders/${RIDER_ID}/verifications/PVC/approve`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.riderVerification.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects a stale concurrent review", async () => {
    authenticate([{ resource: "rider", action: "verification:review" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.riderVerification.findUnique.mockResolvedValue(
      existingVerification({ status: "PENDING" })
    );
    prismaMock.document.count.mockResolvedValue(1);
    prismaMock.riderVerification.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .post(`/riders/${RIDER_ID}/verifications/PVC/approve`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.riderVerificationHistory.create).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("POST /riders/:id/verifications/:type/reject", () => {
  it("rejects with a mandatory reason and records it", async () => {
    authenticate([{ resource: "rider", action: "verification:review" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.riderVerification.findUnique
      .mockResolvedValueOnce(existingVerification({ status: "PENDING" }))
      .mockResolvedValueOnce(
        existingVerification({
          status: "REJECTED",
          rejectionReason: "Blurred document",
        })
      );
    prismaMock.riderVerification.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.riderVerificationHistory.create.mockResolvedValue({
      id: HISTORY_ID,
      previousStatus: "PENDING",
      status: "REJECTED",
      rejectionReason: "Blurred document",
    });

    const res = await request(app)
      .post(`/riders/${RIDER_ID}/verifications/PVC/reject`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ reason: "Blurred document" });

    expect(res.status).toBe(200);
    expect(res.body.data.verification.rejectionReason).toBe(
      "Blurred document"
    );
    expect(prismaMock.riderVerification.updateMany).toHaveBeenCalledWith({
      where: {
        id: VERIFICATION_ID,
        status: "PENDING",
        version: 0,
      },
      data: expect.objectContaining({
        status: "REJECTED",
        rejectionReason: "Blurred document",
        verifiedById: "u1",
      }),
    });
    expect(prismaMock.riderVerificationHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rejectionReason: "Blurred document",
        reviewedById: "u1",
      }),
      select: expect.any(Object),
    });
  });

  it("returns 400 when the rejection reason is missing", async () => {
    authenticate([{ resource: "rider", action: "verification:review" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());

    const res = await request(app)
      .post(`/riders/${RIDER_ID}/verifications/PVC/reject`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.riderVerification.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an invalid transition from NOT_SUBMITTED", async () => {
    authenticate([{ resource: "rider", action: "verification:review" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.riderVerification.findUnique.mockResolvedValue(
      existingVerification({ status: "NOT_SUBMITTED" })
    );

    const res = await request(app)
      .post(`/riders/${RIDER_ID}/verifications/PVC/reject`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ reason: "No documents" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.riderVerification.updateMany).not.toHaveBeenCalled();
  });

  it("returns 403 without verification:review", async () => {
    authenticate([{ resource: "rider", action: "verification:submit" }]);

    const res = await request(app)
      .post(`/riders/${RIDER_ID}/verifications/PVC/reject`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ reason: "No documents" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prismaMock.riderVerification.updateMany).not.toHaveBeenCalled();
  });
});
