import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../src/storage/index.js", () => ({
  storage: {
    driver: "local",
    put: vi.fn(async () => undefined),
    get: vi.fn(async () => Buffer.from("file-data")),
    delete: vi.fn(async () => undefined),
  },
}));

import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { storage } from "../src/storage/index.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;
const storageMock = storage as any;

const RIDER_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const MISSING_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a6c";
const DOCUMENT_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a7d";
const VERIFICATION_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a8e";

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

function existingDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: DOCUMENT_ID,
    documentType: "PVC",
    status: "PENDING",
    title: "PVC certificate",
    fileName: "pvc.pdf",
    mimeType: "application/pdf",
    fileSize: 4,
    storageKey: `riders/${RIDER_ID}/${DOCUMENT_ID}.pdf`,
    storageBucket: null,
    issueDate: null,
    expiryDate: null,
    riderId: RIDER_ID,
    verificationId: VERIFICATION_ID,
    staffId: null,
    vehicleId: null,
    clientId: null,
    userId: null,
    verifiedById: null,
    verifiedAt: null,
    uploadedById: "u1",
    notes: null,
    metadata: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  prismaMock.user.findUnique.mockReset();
  prismaMock.rider.findUnique.mockReset();
  prismaMock.rider.findFirst.mockReset();
  prismaMock.riderVerification.findUnique.mockReset();
  prismaMock.document.findFirst.mockReset();
  prismaMock.document.findMany.mockReset();
  prismaMock.document.count.mockReset();
  prismaMock.document.create.mockReset();
  prismaMock.document.update.mockReset();
  prismaMock.auditLog.create.mockReset();

  storageMock.put.mockReset().mockResolvedValue(undefined);
  storageMock.get.mockReset().mockResolvedValue(Buffer.from("file-data"));
  storageMock.delete.mockReset().mockResolvedValue(undefined);
});

describe("POST /riders/:id/documents", () => {
  it("uploads a PDF with safe generated storage key and metadata", async () => {
    authenticate([{ resource: "rider", action: "document:upload" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.riderVerification.findUnique.mockResolvedValue({
      id: VERIFICATION_ID,
    });
    prismaMock.document.create.mockResolvedValue(
      existingDocument({ fileName: "pvc.pdf" })
    );

    const res = await request(app)
      .post(`/riders/${RIDER_ID}/documents`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .field("documentType", "PVC")
      .field("title", "PVC certificate")
      .field("verificationType", "PVC")
      .attach("file", Buffer.from("%PDF"), {
        filename: "my pvc certificate.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.document.id).toBe(DOCUMENT_ID);

    expect(storageMock.put).toHaveBeenCalledTimes(1);
    const [key, buffer, contentType] = storageMock.put.mock.calls[0];
    expect(key).toMatch(
      new RegExp(`^riders/${RIDER_ID}/[0-9a-f-]+\\.pdf$`)
    );
    expect(key).not.toContain("my pvc certificate");
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(contentType).toBe("application/pdf");

    expect(prismaMock.document.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentType: "PVC",
        status: "PENDING",
        title: "PVC certificate",
        fileName: "my pvc certificate.pdf",
        mimeType: "application/pdf",
        riderId: RIDER_ID,
        verificationId: VERIFICATION_ID,
        uploadedById: "u1",
      }),
      select: expect.any(Object),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CREATE",
        resource: "RiderDocument",
      }),
    });
  });

  it("rejects an unsupported MIME type without storing the file", async () => {
    authenticate([{ resource: "rider", action: "document:upload" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());

    const res = await request(app)
      .post(`/riders/${RIDER_ID}/documents`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .field("documentType", "PVC")
      .field("title", "PVC certificate")
      .attach("file", Buffer.from("hello"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(storageMock.put).not.toHaveBeenCalled();
    expect(prismaMock.document.create).not.toHaveBeenCalled();
  });

  it("rejects a file whose extension does not match its MIME type", async () => {
    authenticate([{ resource: "rider", action: "document:upload" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());

    const res = await request(app)
      .post(`/riders/${RIDER_ID}/documents`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .field("documentType", "PVC")
      .field("title", "PVC certificate")
      .attach("file", Buffer.from("%PDF"), {
        filename: "pvc.txt",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(storageMock.put).not.toHaveBeenCalled();
  });

  it("rejects an oversized file", async () => {
    authenticate([{ resource: "rider", action: "document:upload" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());

    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);

    const res = await request(app)
      .post(`/riders/${RIDER_ID}/documents`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .field("documentType", "PVC")
      .field("title", "PVC certificate")
      .attach("file", oversized, {
        filename: "pvc.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(storageMock.put).not.toHaveBeenCalled();
  });

  it("rejects metadata that does not match the linked verification type", async () => {
    authenticate([{ resource: "rider", action: "document:upload" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());

    const res = await request(app)
      .post(`/riders/${RIDER_ID}/documents`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .field("documentType", "BGV")
      .field("title", "BGV certificate")
      .field("verificationType", "PVC")
      .attach("file", Buffer.from("%PDF"), {
        filename: "bgv.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(storageMock.put).not.toHaveBeenCalled();
  });

  it("returns 400 when no file is included", async () => {
    authenticate([{ resource: "rider", action: "document:upload" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());

    const res = await request(app)
      .post(`/riders/${RIDER_ID}/documents`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .field("documentType", "PVC")
      .field("title", "PVC certificate");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 403 without document:upload", async () => {
    authenticate([{ resource: "rider", action: "document:read" }]);

    const res = await request(app)
      .post(`/riders/${RIDER_ID}/documents`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .field("documentType", "PVC")
      .field("title", "PVC certificate")
      .attach("file", Buffer.from("%PDF"), {
        filename: "pvc.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(403);
    expect(storageMock.put).not.toHaveBeenCalled();
  });
});

describe("GET /riders/:id/documents", () => {
  it("lists non-deleted rider documents with pagination", async () => {
    authenticate([{ resource: "rider", action: "document:read" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.document.findMany.mockResolvedValue([existingDocument()]);
    prismaMock.document.count.mockResolvedValue(1);

    const res = await request(app)
      .get(`/riders/${RIDER_ID}/documents?documentType=PVC`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents).toHaveLength(1);
    expect(res.body.data.pagination.total).toBe(1);

    const args = prismaMock.document.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      riderId: RIDER_ID,
      deletedAt: null,
      documentType: "PVC",
    });
  });

  it("returns 404 when the rider does not exist", async () => {
    authenticate([{ resource: "rider", action: "document:read" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/riders/${MISSING_ID}/documents`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(prismaMock.document.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /riders/:id/documents/:documentId", () => {
  it("returns metadata for a document owned by the rider", async () => {
    authenticate([{ resource: "rider", action: "document:read" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.document.findFirst.mockResolvedValue(existingDocument());

    const res = await request(app)
      .get(`/riders/${RIDER_ID}/documents/${DOCUMENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.document.id).toBe(DOCUMENT_ID);
    expect(prismaMock.document.findFirst).toHaveBeenCalledWith({
      where: {
        id: DOCUMENT_ID,
        riderId: RIDER_ID,
        deletedAt: null,
      },
      select: expect.any(Object),
    });
  });

  it("returns 404 for a document belonging to another rider", async () => {
    authenticate([{ resource: "rider", action: "document:read" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.document.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/riders/${RIDER_ID}/documents/${DOCUMENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for a malformed document id", async () => {
    authenticate([{ resource: "rider", action: "document:read" }]);

    const res = await request(app)
      .get(`/riders/${RIDER_ID}/documents/not-a-uuid`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.document.findFirst).not.toHaveBeenCalled();
  });
});

describe("GET /riders/:id/documents/:documentId/download", () => {
  it("streams a private document with safe headers", async () => {
    authenticate([{ resource: "rider", action: "document:read" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.document.findFirst.mockResolvedValue(existingDocument());

    const res = await request(app)
      .get(`/riders/${RIDER_ID}/documents/${DOCUMENT_ID}/download`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain(
      'attachment; filename="pvc.pdf"'
    );
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.body.toString()).toBe("file-data");
    expect(storageMock.get).toHaveBeenCalledWith(existingDocument().storageKey);
  });

  it("returns 403 without document:read", async () => {
    authenticate([{ resource: "rider", action: "document:upload" }]);

    const res = await request(app)
      .get(`/riders/${RIDER_ID}/documents/${DOCUMENT_ID}/download`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(403);
    expect(storageMock.get).not.toHaveBeenCalled();
  });
});

describe("DELETE /riders/:id/documents/:documentId", () => {
  it("soft-deletes metadata, audits, and removes the stored file", async () => {
    authenticate([{ resource: "rider", action: "document:delete" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.document.findFirst.mockResolvedValue(existingDocument());
    prismaMock.document.update.mockResolvedValue(
      existingDocument({ deletedAt: new Date("2026-01-03T00:00:00.000Z") })
    );

    const res = await request(app)
      .delete(`/riders/${RIDER_ID}/documents/${DOCUMENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe("Document deleted successfully");
    expect(prismaMock.document.update).toHaveBeenCalledWith({
      where: { id: DOCUMENT_ID },
      data: { deletedAt: expect.any(Date) },
      select: expect.any(Object),
    });
    expect(storageMock.delete).toHaveBeenCalledWith(
      existingDocument().storageKey
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "DELETE",
        resource: "RiderDocument",
        resourceId: DOCUMENT_ID,
      }),
    });
  });

  it("returns 404 for a missing document", async () => {
    authenticate([{ resource: "rider", action: "document:delete" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.document.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/riders/${RIDER_ID}/documents/${DOCUMENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(prismaMock.document.update).not.toHaveBeenCalled();
    expect(storageMock.delete).not.toHaveBeenCalled();
  });

  it("returns 403 without document:delete", async () => {
    authenticate([{ resource: "rider", action: "document:read" }]);

    const res = await request(app)
      .delete(`/riders/${RIDER_ID}/documents/${DOCUMENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(403);
    expect(prismaMock.document.update).not.toHaveBeenCalled();
  });
});
