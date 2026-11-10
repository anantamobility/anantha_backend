import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import prisma from "../../src/database/prismaClient.js";
import { auth, createUserRecord, login, resetDatabase, seedRbac } from "./helpers.js";

let adminToken: string;
let operatorToken: string;
let hubAId: string;
let hubBId: string;

beforeAll(async () => {
  await resetDatabase();
  await seedRbac();

  const admin = await createUserRecord({
    name: "Scope Admin",
    phoneNumber: "9000000300",
    role: "ADMIN",
  });
  adminToken = await login(app, admin.phoneNumber);

  const operator = await createUserRecord({
    name: "Hub Operator",
    phoneNumber: "9000000301",
    role: "OPERATOR",
  });

  const hubA = await request(app)
    .post("/hubs")
    .set(auth(adminToken))
    .send({ name: "Scope Hub A", code: "SCOPE-A" });
  expect(hubA.status).toBe(201);
  hubAId = hubA.body.data.hub.id;

  const hubB = await request(app)
    .post("/hubs")
    .set(auth(adminToken))
    .send({ name: "Scope Hub B", code: "SCOPE-B" });
  expect(hubB.status).toBe(201);
  hubBId = hubB.body.data.hub.id;

  await prisma.staff.create({
    data: {
      userId: operator.id,
      fullName: operator.name,
      hubId: hubAId,
    },
  });

  operatorToken = await login(app, operator.phoneNumber);
});

async function createClient(name: string, code: string) {
  const response = await request(app)
    .post("/clients")
    .set(auth(adminToken))
    .send({ name, type: "CORPORATE", clientCode: code });
  expect(response.status).toBe(201);
  return response.body.data.client.id as string;
}

async function createRateCard(name: string, code: string, category: string) {
  const response = await request(app)
    .post("/ratecards")
    .set(auth(adminToken))
    .send({
      name,
      code,
      dailyRate: "1000.00",
      vehicleCategory: category,
      effectiveFrom: "2026-01-01",
    });
  expect(response.status).toBe(201);
  return response.body.data.rateCard.id as string;
}

async function createRider(fullName: string, phoneNumber: string) {
  const response = await request(app)
    .post("/riders")
    .set(auth(adminToken))
    .send({
      fullName,
      phoneNumber,
      rentalType: "B2C",
      b2cMode: "INDIVIDUAL_RIDER",
      hubId: hubAId,
    });
  expect(response.status).toBe(201);
  return response.body.data.rider.id as string;
}

describe("soft deletes", () => {
  it("soft-deletes clients, riders and ratecards and hides them from reads", async () => {
    const clientId = await createClient("Delete Client", "DEL-CLIENT");
    const rateCardId = await createRateCard("Delete Ratecard", "DEL-RATE", "Sedan");
    const riderId = await createRider("Delete Rider", "9000000310");

    for (const [path, id] of [
      ["/clients", clientId],
      ["/ratecards", rateCardId],
      ["/riders", riderId],
    ] as const) {
      const deleted = await request(app)
        .delete(`${path}/${id}`)
        .set(auth(adminToken));
      expect(deleted.status, `${path} delete`).toBe(200);

      const missing = await request(app)
        .get(`${path}/${id}`)
        .set(auth(adminToken));
      expect(missing.status, `${path} get after delete`).toBe(404);
    }

    const clientRow = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    const riderRow = await prisma.rider.findUniqueOrThrow({ where: { id: riderId } });
    const rateCardRow = await prisma.rateCard.findUniqueOrThrow({ where: { id: rateCardId } });
    expect(clientRow.deletedAt).not.toBeNull();
    expect(riderRow.deletedAt).not.toBeNull();
    expect(rateCardRow.deletedAt).not.toBeNull();

    const list = await request(app)
      .get("/ratecards?search=DEL-RATE")
      .set(auth(adminToken));
    expect(list.body.data.rateCards).toHaveLength(0);
  });

  it("refuses deletion while dependencies exist", async () => {
    const clientId = await createClient("Assigned Client", "ASSIGNED-CLIENT");
    const rateCardId = await createRateCard("Assigned Ratecard", "ASSIGNED-RATE", "SUV");

    const assignment = await request(app)
      .post("/ratecard-assignments")
      .set(auth(adminToken))
      .send({ clientId, rateCardId, status: "ACTIVE" });
    expect(assignment.status).toBe(201);

    const clientDelete = await request(app)
      .delete(`/clients/${clientId}`)
      .set(auth(adminToken));
    expect(clientDelete.status).toBe(409);
    expect(clientDelete.body.error.message).toMatch(/active ratecard assignments/i);

    const rateCardDelete = await request(app)
      .delete(`/ratecards/${rateCardId}`)
      .set(auth(adminToken));
    expect(rateCardDelete.status).toBe(409);
    expect(rateCardDelete.body.error.message).toMatch(/assignments/i);

    const clientRow = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    expect(clientRow.deletedAt).toBeNull();
  });
});

describe("hub scoping and PBAC defaults", () => {
  it("scopes non-admin list and detail reads to their assigned hub", async () => {
    const vehicleA = await request(app)
      .post("/vehicles")
      .set(auth(adminToken))
      .send({ registrationNumber: "SCOPEAA1", hubId: hubAId });
    expect(vehicleA.status).toBe(201);

    const vehicleB = await request(app)
      .post("/vehicles")
      .set(auth(adminToken))
      .send({ registrationNumber: "SCOPEBB1", hubId: hubBId });
    expect(vehicleB.status).toBe(201);

    const list = await request(app)
      .get("/vehicles")
      .set(auth(operatorToken));
    expect(list.status).toBe(200);
    expect(list.body.data.vehicles.map((v: { id: string }) => v.id)).toEqual([
      vehicleA.body.data.vehicle.id,
    ]);

    const otherHubVehicle = await request(app)
      .get(`/vehicles/${vehicleB.body.data.vehicle.id}`)
      .set(auth(operatorToken));
    expect(otherHubVehicle.status).toBe(403);

    const ownHubVehicle = await request(app)
      .get(`/vehicles/${vehicleA.body.data.vehicle.id}`)
      .set(auth(operatorToken));
    expect(ownHubVehicle.status).toBe(200);

    const requestedOtherHub = await request(app)
      .get(`/vehicles?hubId=${hubBId}`)
      .set(auth(operatorToken));
    expect(requestedOtherHub.status).toBe(403);

    const hubs = await request(app)
      .get("/hubs")
      .set(auth(operatorToken));
    expect(hubs.status).toBe(200);
    expect(hubs.body.data.hubs.map((h: { id: string }) => h.id)).toEqual([hubAId]);

    const otherHub = await request(app)
      .get(`/hubs/${hubBId}`)
      .set(auth(operatorToken));
    expect(otherHub.status).toBe(403);
  });


  it("denies unregistered permissions by default", async () => {
    const unauthorized = await request(app)
      .post("/hubs")
      .set(auth(operatorToken))
      .send({ name: "Forbidden Hub", code: "FORBIDDEN" });
    expect(unauthorized.status).toBe(403);

    const unauthenticated = await request(app).get("/vehicles");
    expect(unauthenticated.status).toBe(401);
  });
});
