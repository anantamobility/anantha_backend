import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

const SPARE_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4d01";
const HUB_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4d02";
const SERVICE_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4d03";
const VEHICLE_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4d04";

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

function spareRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: SPARE_ID,
    partNumber: "BRK-PAD-01",
    name: "Brake Pad",
    category: "Brakes",
    description: null,
    unitOfMeasure: "UNIT",
    purchasePrice: "180.0000",
    unitCost: "200.0000",
    minimumStock: 5,
    currency: "INR",
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function movementRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4d10",
    spareId: SPARE_ID,
    movementType: "OPENING_STOCK",
    quantity: 10,
    quantityDelta: 10,
    unitCost: null,
    hubId: HUB_ID,
    fromHubId: null,
    toHubId: HUB_ID,
    serviceId: null,
    vehicleId: null,
    movedById: "u1",
    referenceType: null,
    referenceId: null,
    idempotencyKey: null,
    notes: null,
    movedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    spare: {
      id: SPARE_ID,
      partNumber: "BRK-PAD-01",
      name: "Brake Pad",
      unitOfMeasure: "UNIT",
    },
    hub: { id: HUB_ID, name: "Central", code: "HUB-01" },
    movedBy: { id: "u1", name: "Tester" },
    ...overrides,
  };
}

beforeEach(() => {
  Object.values(prismaMock).forEach((delegate: any) => {
    if (delegate && typeof delegate === "object") {
      Object.values(delegate).forEach((fn: any) => {
        if (typeof fn?.mockReset === "function") fn.mockReset();
      });
    }
  });
  prismaMock.auditLog.create.mockResolvedValue({});
  prismaMock.inventoryBalance.upsert.mockResolvedValue({});
  prismaMock.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.inventoryMovement.findMany.mockResolvedValue([]);
  prismaMock.inventoryMovement.count.mockResolvedValue(0);
  prismaMock.spare.findMany.mockResolvedValue([]);
  prismaMock.spare.count.mockResolvedValue(0);
});

describe("POST /spares", () => {
  it("creates a spare and maps sku to the unique part number", async () => {
    authenticate([{ resource: "spare", action: "create" }]);
    prismaMock.spare.create.mockResolvedValue(spareRecord());

    const res = await request(app)
      .post("/spares")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        sku: "BRK-PAD-01",
        name: "Brake Pad",
        unitCost: "200.00",
        minimumStock: 5,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.spare).toMatchObject({
      id: SPARE_ID,
      sku: "BRK-PAD-01",
    });
    expect(prismaMock.spare.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          partNumber: "BRK-PAD-01",
          unitCost: expect.anything(),
        }),
      })
    );
  });
});

describe("POST /inventory/opening-stock", () => {
  it("records an inbound opening stock movement and updates the balance cache", async () => {
    authenticate([{ resource: "inventory", action: "opening-stock" }]);
    prismaMock.inventoryMovement.findUnique.mockResolvedValue(null);
    prismaMock.hub.findUnique.mockResolvedValue({
      id: HUB_ID,
      isActive: true,
    });
    prismaMock.spare.findUnique.mockResolvedValue(spareRecord());
    prismaMock.inventoryMovement.create.mockResolvedValue(movementRecord());

    const res = await request(app)
      .post("/inventory/opening-stock")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        spareId: SPARE_ID,
        hubId: HUB_ID,
        quantity: 10,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.duplicate).toBe(false);
    expect(prismaMock.inventoryBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          spareId: SPARE_ID,
          hubId: HUB_ID,
          onHand: 10,
        }),
        update: expect.objectContaining({
          onHand: { increment: 10 },
        }),
      })
    );
    expect(prismaMock.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: "OPENING_STOCK",
          quantityDelta: 10,
        }),
      })
    );
  });
});

describe("POST /inventory/consume", () => {
  it("deducts stock, records a service spare line and creates a linked charge", async () => {
    authenticate([{ resource: "inventory", action: "consume" }]);
    prismaMock.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      serviceNumber: "SVC-ABC123",
      status: "IN_PROGRESS",
      responsibleParty: "RIDER",
      vehicleId: VEHICLE_ID,
      vehicle: { hubId: HUB_ID },
    });
    prismaMock.serviceSpare.findUnique.mockResolvedValue(null);
    prismaMock.spare.findUnique.mockResolvedValue(spareRecord());
    prismaMock.hub.findUnique.mockResolvedValue({
      id: HUB_ID,
      isActive: true,
    });
    prismaMock.inventoryMovement.create.mockResolvedValue(
      movementRecord({
        movementType: "SERVICE_CONSUMPTION",
        quantityDelta: -2,
        serviceId: SERVICE_ID,
      })
    );
    prismaMock.serviceSpare.create.mockResolvedValue({
      id: "spareline1",
      serviceId: SERVICE_ID,
      spareId: SPARE_ID,
      quantity: 2,
      unitCost: "200",
      lineCost: "400",
      inventoryMovementId: "mov1",
      createdAt: new Date(),
    });
    prismaMock.serviceCharge.create.mockResolvedValue({ id: "charge1" });

    const res = await request(app)
      .post("/inventory/consume")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        serviceId: SERVICE_ID,
        spareId: SPARE_ID,
        quantity: 2,
      });

    expect(res.status).toBe(201);
    expect(prismaMock.inventoryBalance.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { onHand: { decrement: 2 } },
      })
    );
    expect(prismaMock.serviceCharge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chargeType: "SPARE_PARTS",
          costAmount: expect.anything(),
          sourceType: "ServiceSpare",
          serviceSpareId: "spareline1",
        }),
      })
    );
  });

  it("returns the existing service spare without deducting stock twice on retry", async () => {
    authenticate([{ resource: "inventory", action: "consume" }]);
    prismaMock.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      serviceNumber: "SVC-ABC123",
      status: "IN_PROGRESS",
      responsibleParty: "RIDER",
      vehicleId: VEHICLE_ID,
      vehicle: { hubId: HUB_ID },
    });
    prismaMock.spare.findUnique.mockResolvedValue(spareRecord());
    prismaMock.serviceSpare.findUnique.mockResolvedValue({
      id: "spareline1",
      serviceId: SERVICE_ID,
      spareId: SPARE_ID,
      quantity: 2,
      unitCost: "200",
      lineCost: "400",
      inventoryMovementId: "mov1",
      createdAt: new Date(),
    });

    const res = await request(app)
      .post("/inventory/consume")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        serviceId: SERVICE_ID,
        spareId: SPARE_ID,
        quantity: 2,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.duplicate).toBe(true);
    expect(prismaMock.inventoryBalance.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.serviceCharge.create).not.toHaveBeenCalled();
  });

  it("rejects consumption when available stock is insufficient", async () => {
    authenticate([{ resource: "inventory", action: "consume" }]);
    prismaMock.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      serviceNumber: "SVC-ABC123",
      status: "IN_PROGRESS",
      responsibleParty: "RIDER",
      vehicleId: VEHICLE_ID,
      vehicle: { hubId: HUB_ID },
    });
    prismaMock.serviceSpare.findUnique.mockResolvedValue(null);
    prismaMock.spare.findUnique.mockResolvedValue(spareRecord());
    prismaMock.hub.findUnique.mockResolvedValue({
      id: HUB_ID,
      isActive: true,
    });
    prismaMock.inventoryBalance.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .post("/inventory/consume")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        serviceId: SERVICE_ID,
        spareId: SPARE_ID,
        quantity: 2,
      });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/insufficient stock/i);
    expect(prismaMock.serviceSpare.create).not.toHaveBeenCalled();
  });
});
