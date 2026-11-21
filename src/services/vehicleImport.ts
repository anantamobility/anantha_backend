import prisma from "../database/prismaClient.js";
import { AppError } from "../utils/errors.js";
import type { AuditActor } from "../utils/log.js";
import type { CreateVehicleInput } from "../validation/vehicle.js";
import type { VehicleImportRowInput } from "../validation/vehicleImport.js";
import { createVehicle } from "./vehicle.js";

/** One row’s result after checking */
export type VehicleImportRowResult = {
  rowIndex: number; // 0 = first row, 1 = second, ...
  ok: boolean;
  errors: string[];
  /** Only set when ok — ready for createVehicle later */
  payload?: CreateVehicleInput;
};

export type VehicleImportValidateResult = {
  summary: {
    total: number;
    valid: number;
    invalid: number;
  };
  results: VehicleImportRowResult[];
};

/**
 * Check every row. Does NOT create vehicles.
 */
export async function validateVehicleImportRows(
  rows: VehicleImportRowInput[],
): Promise<VehicleImportValidateResult> {
  // 1) Collect all registration numbers and hub codes from the file
  const registrations = rows.map((row) => row.registrationNumber.trim());
  const hubCodes = [
    ...new Set(rows.map((row) => row.hubCode.trim().toUpperCase())),
  ];

  // 2) Find which registration numbers already exist in the database
  const existingVehicles = await prisma.vehicle.findMany({
    where: {
      registrationNumber: { in: registrations },
      deletedAt: null,
    },
    select: { registrationNumber: true },
  });
  const existingRegSet = new Set(
    existingVehicles.map((v) => v.registrationNumber),
  );

  // 3) Find hubs for the hub codes in the file
  const hubs = await prisma.hub.findMany({
    where: {
      hubCode: { in: hubCodes, mode: "insensitive" },
    },
    select: { id: true, hubCode: true },
  });
  // Map: "BLR01" -> hub uuid
  const hubIdByCode = new Map(
    hubs.map((h) => [h.hubCode.toUpperCase(), h.id]),
  );

  // 4) Track duplicates inside the same file
  const seenInFile = new Set<string>();

  const results: VehicleImportRowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const errors: string[] = [];

    const registrationNumber = row.registrationNumber.trim();
    const hubCodeKey = row.hubCode.trim().toUpperCase();

    // Duplicate inside this upload
    if (seenInFile.has(registrationNumber)) {
      errors.push(
        `Duplicate registrationNumber in file: ${registrationNumber}`,
      );
    } else {
      seenInFile.add(registrationNumber);
    }

    // Already in database
    if (existingRegSet.has(registrationNumber)) {
      errors.push(
        `Vehicle already exists with registrationNumber: ${registrationNumber}`,
      );
    }

    // Hub must exist
    const hubId = hubIdByCode.get(hubCodeKey);
    if (!hubId) {
      errors.push(`Hub not found for hubCode: ${row.hubCode}`);
    }

    if (errors.length > 0) {
      results.push({ rowIndex: i, ok: false, errors });
      continue;
    }

    // Build payload for createVehicle (uses hubId, not hubCode)
    const { hubCode: _hubCode, ...rest } = row;
    const payload: CreateVehicleInput = {
      ...rest,
      registrationNumber,
      hubId,
    };

    results.push({ rowIndex: i, ok: true, errors: [], payload });
  }

  const valid = results.filter((r) => r.ok).length;

  return {
    summary: {
      total: rows.length,
      valid,
      invalid: rows.length - valid,
    },
    results,
  };
}

export type VehicleImportCommitResult = {
  summary: {
    total: number;
    created: number;
    failed: number;
  };
  results: Array<{
    rowIndex: number;
    ok: boolean;
    id?: string;
    errors?: string[];
  }>;
};

/**
 * Re-validate rows, then create only the valid ones.
 * Partial success: one failed row does not stop the others.
 */
export async function importVehicles(
  rows: VehicleImportRowInput[],
  actor: AuditActor,
): Promise<VehicleImportCommitResult> {
  const validated = await validateVehicleImportRows(rows);

  const results: VehicleImportCommitResult["results"] = [];
  let created = 0;
  let failed = 0;

  for (const row of validated.results) {
    if (!row.ok || !row.payload) {
      failed += 1;
      results.push({
        rowIndex: row.rowIndex,
        ok: false,
        errors: row.errors,
      });
      continue;
    }

    try {
      const vehicle = await createVehicle(row.payload, actor);
      created += 1;
      results.push({
        rowIndex: row.rowIndex,
        ok: true,
        id: vehicle.id,
      });
    } catch (err) {
      failed += 1;
      const message =
        err instanceof AppError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to create vehicle";
      results.push({
        rowIndex: row.rowIndex,
        ok: false,
        errors: [message],
      });
    }
  }

  return {
    summary: {
      total: rows.length,
      created,
      failed,
    },
    results,
  };
}