import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

const RENTAL_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const CLIENT_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a7d";
const RIDER_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a8e";
const VEHICLE_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a9f";
const ASSIGNMENT_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b01";
const MISSING_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b02";

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

function rentalDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: RENTAL_ID,
    rentalNumber: "RN-ABC12345",
    rentalType: "B2C",
    b2cMode: "AML_RIDER",
    b2bRiderMgmt: null,
    clientId: CLIENT_ID,
    riderId: RIDER_ID,
    hubId: null,
    rateCardId: null,
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: null,
    expectedEndDate: null,
    status: "DRAFT",
    agreementRef: null,
    billingFrequency: null,
    collectionPeriod: "MONTHLY",
    currency: "INR",
    dailyRate: "500.0000",
    weeklyRate: null,
    fortnightlyRate: null,
    monthlyRate: "12000.0000",
    securityDepositRequired: "2000.00",
    version: 0,
    notes: null,
    activatedAt: null,
    closedAt: null,
    finalOutstandingAmount: null,
    finalDepositBalance: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

const createBody = {
  rentalType: "B2C",
  b2cMode: "AML_RIDER",
  clientId: CLIENT_ID,
  riderId: RIDER_ID,
  startDate: "2026-01-01T00:00:00.000Z",
  collectionPeriod: "MONTHLY",
  securityDepositAmount: "2000",
  manualPricing: { dailyRate: "500", monthlyRate: "12000" },
};

beforeEach(() => {
  Object.values(prismaMock).forEach((delegate: any) => {
    if (delegate && typeof delegate === "object") {
      Object.values(delegate).forEach((fn: any) => {
        if (typeof fn?.mockReset === "function") fn.mockReset();
      });
    }
  });
  prismaMock.rental.findMany.mockResolvedValue([]);
  prismaMock.rental.count.mockResolvedValue(0);
  prismaMock.rentalCollectionDue.findMany.mockResolvedValue([]);
  prismaMock.collection.findMany.mockResolvedValue([]);
  prismaMock.vehicleAssignment.findMany.mockResolvedValue([]);
  prismaMock.rentalLedgerEntry.upsert.mockResolvedValue({});
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe("POST /rentals", () => {
  it("creates a DRAFT rental with manual pricing and its security deposit", async () => {
    authenticate([{ resource: "rental", action: "create" }]);
    prismaMock.client.findUnique.mockResolvedValue({
      id: CLIENT_ID,
      type: "INDIVIDUAL",
      isActive: true,
      deletedAt: null,
    });
    prismaMock.rider.findUnique.mockResolvedValue({
      id: RIDER_ID,
      clientId: CLIENT_ID,
      status: "ACTIVE",
      rentalType: "B2C",
      b2cMode: "AML_RIDER",
      b2bRiderMgmt: null,
      deletedAt: null,
    });
    prismaMock.rental.findUnique.mockResolvedValue(
      rentalDetail({ status: "DRAFT" })
    );
    prismaMock.rental.create.mockResolvedValue(rentalDetail());
    prismaMock.deposit.upsert.mockResolvedValue({ id: "dep1" });
    prismaMock.rental.findUniqueOrThrow.mockResolvedValue(rentalDetail());

    const res = await request(app)
      .post("/rentals")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send(createBody);

    expect(res.status).toBe(201);
    expect(res.body.data.rental).toMatchObject({
      id: RENTAL_ID,
      rentalNumber: "RN-ABC12345",
    });
    expect(prismaMock.rental.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rentalType: "B2C",
          clientId: CLIENT_ID,
          status: "DRAFT",
          collectionPeriod: "MONTHLY",
          securityDepositRequired: "2000",
          dailyRate: "500",
          monthlyRate: "12000",
        }),
      })
    );
    expect(prismaMock.deposit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { rentalId: RENTAL_ID },
        create: expect.objectContaining({
          payerType: "RIDER",
          clientId: null,
          riderId: RIDER_ID,
          amountRequired: expect.anything(),
        }),
      })
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "CREATE", resource: "Rental" }),
    });
  });

  it("does not create a deposit when the required amount is zero", async () => {
    authenticate([{ resource: "rental", action: "create" }]);
    prismaMock.client.findUnique.mockResolvedValue({
      id: CLIENT_ID,
      type: "INDIVIDUAL",
      isActive: true,
      deletedAt: null,
    });
    prismaMock.rider.findUnique.mockResolvedValue({
      id: RIDER_ID,
      clientId: CLIENT_ID,
      status: "ACTIVE",
      rentalType: "B2C",
      b2cMode: "AML_RIDER",
      b2bRiderMgmt: null,
      deletedAt: null,
    });
    prismaMock.rental.create.mockResolvedValue(rentalDetail());
    prismaMock.rental.findUniqueOrThrow.mockResolvedValue(rentalDetail());

    const res = await request(app)
      .post("/rentals")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ ...createBody, securityDepositAmount: "0" });

    expect(res.status).toBe(201);
    expect(prismaMock.deposit.upsert).not.toHaveBeenCalled();
  });

  it("rejects B2B rentals for a non-corporate client", async () => {
    authenticate([{ resource: "rental", action: "create" }]);
    prismaMock.client.findUnique.mockResolvedValue({
      id: CLIENT_ID,
      type: "INDIVIDUAL",
      isActive: true,
      deletedAt: null,
    });

    const res = await request(app)
      .post("/rentals")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        ...createBody,
        rentalType: "B2B",
        b2cMode: undefined,
        b2bRiderMgmt: "AML_MANAGED",
      });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/CORPORATE/);
    expect(prismaMock.rental.create).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid rental classification", async () => {
    authenticate([{ resource: "rental", action: "create" }]);

    const res = await request(app)
      .post("/rentals")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ ...createBody, b2cMode: undefined });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.rental.create).not.toHaveBeenCalled();
  });
});

describe("GET /rentals", () => {
  it("lists rentals with filters and pagination", async () => {
    authenticate([{ resource: "rental", action: "read" }]);
    prismaMock.rental.findMany.mockResolvedValue([rentalDetail()]);
    prismaMock.rental.count.mockResolvedValue(11);

    const res = await request(app)
      .get(
        `/rentals?page=2&limit=5&status=ACTIVE&rentalType=B2C&clientId=${CLIENT_ID}&search=RN`
      )
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination).toEqual({
      page: 2,
      limit: 5,
      total: 11,
      totalPages: 3,
    });
    const args = prismaMock.rental.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ skip: 5, take: 5 });
    expect(args.where).toMatchObject({
      status: "ACTIVE",
      rentalType: "B2C",
      clientId: CLIENT_ID,
    });
    expect(args.where.OR).toBeDefined();
  });

  it("returns a rental with its financial summary", async () => {
    authenticate([{ resource: "rental", action: "read" }]);
    prismaMock.rental.findFirst.mockResolvedValue(rentalDetail());
    prismaMock.rental.findUnique.mockResolvedValue(rentalDetail());

    const res = await request(app)
      .get(`/rentals/${RENTAL_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.rental.id).toBe(RENTAL_ID);
    expect(res.body.data.financialSummary).toMatchObject({
      dueCount: 0,
      openDueCount: 0,
    });
  });

  it("returns 404 when the rental does not exist", async () => {
    authenticate([{ resource: "rental", action: "read" }]);
    prismaMock.rental.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/rentals/${MISSING_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
  });
});

describe("PATCH /rentals/:id/assign-vehicle", () => {
  it("creates an assignment and deploys an IDLE vehicle", async () => {
    authenticate([{ resource: "rental", action: "assign" }]);
    prismaMock.rental.findFirst.mockResolvedValue(rentalDetail());
    prismaMock.rental.findUnique.mockResolvedValue(
      rentalDetail({ riderId: RIDER_ID, hubId: null })
    );
    prismaMock.vehicleAssignment.count.mockResolvedValue(0);
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: VEHICLE_ID,
      registrationNumber: "KA01AB1234",
      status: "IDLE",
      isActive: true,
      version: 0,
      deletedAt: null,
    });
    prismaMock.vehicleAssignment.create.mockResolvedValue({
      id: ASSIGNMENT_ID,
      vehicleId: VEHICLE_ID,
      status: "ACTIVE",
    });
    prismaMock.vehicle.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app)
      .patch(`/rentals/${RENTAL_ID}/assign-vehicle`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ vehicleId: VEHICLE_ID });

    expect(res.status).toBe(200);
    expect(res.body.data.assignment).toMatchObject({
      id: ASSIGNMENT_ID,
      vehicleId: VEHICLE_ID,
    });
    expect(prismaMock.vehicleAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rentalId: RENTAL_ID,
          vehicleId: VEHICLE_ID,
          status: "ACTIVE",
        }),
      })
    );
    expect(prismaMock.vehicle.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "DEPLOYED" }),
      })
    );
  });

  it("allows multiple active vehicles on a B2B rental", async () => {
    authenticate([{ resource: "rental", action: "assign" }]);
    prismaMock.rental.findFirst.mockResolvedValue(rentalDetail());
    prismaMock.rental.findUnique.mockResolvedValue(
      rentalDetail({
        rentalType: "B2B",
        b2cMode: null,
        b2bRiderMgmt: "CLIENT_MANAGED",
        riderId: null,
      })
    );
    prismaMock.vehicleAssignment.count.mockResolvedValue(0);
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: VEHICLE_ID,
      registrationNumber: "KA01AB1234",
      status: "IDLE",
      isActive: true,
      version: 0,
      deletedAt: null,
    });
    prismaMock.vehicleAssignment.create.mockResolvedValue({
      id: ASSIGNMENT_ID,
      vehicleId: VEHICLE_ID,
      status: "ACTIVE",
    });
    prismaMock.vehicle.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app)
      .patch(`/rentals/${RENTAL_ID}/assign-vehicle`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ vehicleId: VEHICLE_ID });

    expect(res.status).toBe(200);
    expect(prismaMock.vehicleAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rentalId: RENTAL_ID,
          vehicleId: VEHICLE_ID,
          status: "ACTIVE",
        }),
      })
    );
    // The per-rental single-vehicle guard is skipped for B2B agreements.
    expect(prismaMock.vehicleAssignment.count).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { rentalId: RENTAL_ID, status: "ACTIVE" },
      })
    );
  });
});

describe("PATCH /rentals/:id/activate", () => {
  it("activates a rental that has an active vehicle assignment", async () => {
    authenticate([{ resource: "rental", action: "activate" }]);
    prismaMock.rental.findFirst.mockResolvedValue(rentalDetail());
    prismaMock.rental.findUnique.mockResolvedValue(
      rentalDetail({ status: "DRAFT" })
    );
    prismaMock.vehicleAssignment.count.mockResolvedValue(1);
    prismaMock.rental.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.rental.findUniqueOrThrow.mockResolvedValue(
      rentalDetail({ status: "ACTIVE" })
    );

    const res = await request(app)
      .patch(`/rentals/${RENTAL_ID}/activate`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.rental.status).toBe("ACTIVE");
    expect(prismaMock.rental.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ACTIVE" }),
      })
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "ACTIVATE", resource: "Rental" }),
    });
  });

  it("rejects activation without an active assignment", async () => {
    authenticate([{ resource: "rental", action: "activate" }]);
    prismaMock.rental.findFirst.mockResolvedValue(rentalDetail());
    prismaMock.rental.findUnique.mockResolvedValue(
      rentalDetail({ status: "DRAFT" })
    );
    prismaMock.vehicleAssignment.count.mockResolvedValue(0);

    const res = await request(app)
      .patch(`/rentals/${RENTAL_ID}/activate`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/active vehicle assignment/);
  });
});

describe("PATCH /rentals/:id/close", () => {
  it("completes the rental, generates final dues and stores settlement", async () => {
    authenticate([{ resource: "rental", action: "close" }]);
    const activeRental = rentalDetail({ status: "ACTIVE" });
    prismaMock.rental.findFirst.mockResolvedValue(activeRental);
    prismaMock.rental.findUnique.mockResolvedValue(activeRental);
    prismaMock.rental.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.rental.update.mockResolvedValue(
      rentalDetail({ status: "COMPLETED" })
    );
    prismaMock.rentalCollectionDue.findMany.mockResolvedValue([]);
    prismaMock.rentalCollectionDue.upsert.mockResolvedValue({
      id: "due-1",
    });
    prismaMock.rentalCollectionDue.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.deposit.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/rentals/${RENTAL_ID}/close`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ endDate: "2026-01-15T00:00:00.000Z" });

    expect(res.status).toBe(200);
    expect(res.body.data.rental.status).toBe("COMPLETED");
    expect(res.body.data.settlement).toMatchObject({
      totalCharges: expect.anything(),
      depositBalance: expect.anything(),
      vehicleDispositions: [],
    });
    expect(prismaMock.rental.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "COMPLETED",
          finalOutstandingAmount: expect.anything(),
          finalDepositBalance: expect.anything(),
        }),
      })
    );
    expect(prismaMock.rentalCollectionDue.upsert).toHaveBeenCalled();
  });

  it("rejects closing a DRAFT rental", async () => {
    authenticate([{ resource: "rental", action: "close" }]);
    prismaMock.rental.findFirst.mockResolvedValue(rentalDetail());
    prismaMock.rental.findUnique.mockResolvedValue(
      rentalDetail({ status: "DRAFT" })
    );

    const res = await request(app)
      .patch(`/rentals/${RENTAL_ID}/close`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({});

    expect(res.status).toBe(409);
    expect(prismaMock.rental.update).not.toHaveBeenCalled();
  });
});
