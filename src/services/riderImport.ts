import { randomBytes } from "node:crypto";
import prisma from "../database/prismaClient.js";
import { AppError } from "../utils/errors.js";
import type { AuditActor } from "../utils/log.js";
import type { CreateRiderInput } from "../validation/rider.js";
import type { RiderImportRowInput } from "../validation/riderImport.js";
import { createRider } from "./rider.js";

/** Payload ready for createRider after hub/client resolution (password added at import). */
export type RiderImportReadyPayload = Omit<CreateRiderInput, "password">;

export type RiderImportRowResult = {
  rowIndex: number;
  ok: boolean;
  errors: string[];
  payload?: RiderImportReadyPayload;
};

export type RiderImportValidateResult = {
  summary: {
    total: number;
    valid: number;
    invalid: number;
  };
  results: RiderImportRowResult[];
};

export type RiderImportCommitResult = {
  summary: {
    total: number;
    created: number;
    failed: number;
  };
  results: Array<{
    rowIndex: number;
    ok: boolean;
    id?: string;
    phoneNumber?: string;
    temporaryPassword?: string;
    errors?: string[];
  }>;
};

function buildAddress(row: RiderImportRowInput): CreateRiderInput["address"] {
  const address = {
    line1: row.addressLine1 ?? undefined,
    line2: row.addressLine2 ?? undefined,
    city: row.addressCity ?? undefined,
    state: row.addressState ?? undefined,
    postalCode: row.addressPostalCode ?? undefined,
    country: row.addressCountry ?? undefined,
  };

  const hasAny = Object.values(address).some(
    (value) => value !== undefined && value !== null && value !== "",
  );
  return hasAny ? address : null;
}

/**
 * Strong temp password: letter + number, length >= 12.
 * Returned once in the import response; never written to audit logs as plaintext.
 */
export function generateTempRiderPassword(): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let password = "";
  for (let i = 0; i < bytes.length; i++) {
    password += alphabet[bytes[i]! % alphabet.length];
  }
  // Guarantee at least one letter and one digit for strongPasswordSchema.
  if (!/[A-Za-z]/.test(password)) password = `A${password.slice(1)}`;
  if (!/[0-9]/.test(password)) password = `${password.slice(0, -1)}7`;
  return password;
}

/**
 * Check every row. Does NOT create riders or users.
 */
export async function validateRiderImportRows(
  rows: RiderImportRowInput[],
): Promise<RiderImportValidateResult> {
  const phones = rows.map((row) => row.phoneNumber.trim());
  const emails = rows
    .map((row) => row.email?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));
  const aadhars = rows
    .map((row) => row.aadharNumber?.trim())
    .filter((value): value is string => Boolean(value));
  const pans = rows
    .map((row) => row.panNumber?.trim())
    .filter((value): value is string => Boolean(value));

  const hubCodes = [
    ...new Set(
      rows
        .map((row) => row.hubCode?.trim().toUpperCase())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const clientCodes = [
    ...new Set(
      rows
        .map((row) => row.clientCode?.trim().toUpperCase())
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const riderUniqueOr = [
    ...(aadhars.length ? [{ aadharNumber: { in: aadhars } }] : []),
    ...(pans.length ? [{ panNumber: { in: pans } }] : []),
  ];

  const [existingUsersByPhone, existingUsersByEmail, existingRiders, hubs, clients] =
    await Promise.all([
      prisma.user.findMany({
        where: { phoneNumber: { in: phones }, deletedAt: null },
        select: { phoneNumber: true },
      }),
      emails.length
        ? prisma.user.findMany({
            where: {
              email: { in: emails, mode: "insensitive" },
              deletedAt: null,
            },
            select: { email: true },
          })
        : Promise.resolve([] as { email: string | null }[]),
      riderUniqueOr.length
        ? prisma.rider.findMany({
            where: {
              deletedAt: null,
              OR: riderUniqueOr,
            },
            select: {
              aadharNumber: true,
              panNumber: true,
            },
          })
        : Promise.resolve(
            [] as {
              aadharNumber: string | null;
              panNumber: string | null;
            }[],
          ),
      hubCodes.length
        ? prisma.hub.findMany({
            where: { hubCode: { in: hubCodes, mode: "insensitive" } },
            select: { id: true, hubCode: true },
          })
        : Promise.resolve([] as { id: string; hubCode: string }[]),
      clientCodes.length
        ? prisma.client.findMany({
            where: {
              clientCode: { in: clientCodes, mode: "insensitive" },
              deletedAt: null,
            },
            select: { id: true, clientCode: true },
          })
        : Promise.resolve(
            [] as { id: string; clientCode: string | null }[],
          ),
    ]);

  const existingPhoneSet = new Set(
    existingUsersByPhone.map((user) => user.phoneNumber),
  );
  const existingEmailSet = new Set(
    existingUsersByEmail
      .map((user) => user.email?.toLowerCase())
      .filter((value): value is string => Boolean(value)),
  );
  const existingAadharSet = new Set(
    existingRiders
      .map((rider) => rider.aadharNumber)
      .filter((value): value is string => Boolean(value)),
  );
  const existingPanSet = new Set(
    existingRiders
      .map((rider) => rider.panNumber)
      .filter((value): value is string => Boolean(value)),
  );
  const hubIdByCode = new Map(
    hubs.map((hub) => [hub.hubCode.toUpperCase(), hub.id]),
  );
  const clientIdByCode = new Map(
    clients
      .filter((client) => client.clientCode)
      .map((client) => [client.clientCode!.toUpperCase(), client.id]),
  );

  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();
  const seenAadhars = new Set<string>();
  const seenPans = new Set<string>();

  const results: RiderImportRowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const errors: string[] = [];

    const phoneNumber = row.phoneNumber.trim();
    const email = row.email?.trim().toLowerCase() || null;
    const aadharNumber = row.aadharNumber?.trim() || null;
    const panNumber = row.panNumber?.trim() || null;
    const hubCodeKey = row.hubCode?.trim().toUpperCase() || null;
    const clientCodeKey = row.clientCode?.trim().toUpperCase() || null;

    if (seenPhones.has(phoneNumber)) {
      errors.push(`Duplicate phoneNumber in file: ${phoneNumber}`);
    } else {
      seenPhones.add(phoneNumber);
    }
    if (existingPhoneSet.has(phoneNumber)) {
      errors.push(`User already exists with phoneNumber: ${phoneNumber}`);
    }

    if (email) {
      if (seenEmails.has(email)) {
        errors.push(`Duplicate email in file: ${email}`);
      } else {
        seenEmails.add(email);
      }
      if (existingEmailSet.has(email)) {
        errors.push(`User already exists with email: ${email}`);
      }
    }

    if (aadharNumber) {
      if (seenAadhars.has(aadharNumber)) {
        errors.push(`Duplicate aadharNumber in file: ${aadharNumber}`);
      } else {
        seenAadhars.add(aadharNumber);
      }
      if (existingAadharSet.has(aadharNumber)) {
        errors.push(`Rider already exists with aadharNumber: ${aadharNumber}`);
      }
    }

    if (panNumber) {
      if (seenPans.has(panNumber)) {
        errors.push(`Duplicate panNumber in file: ${panNumber}`);
      } else {
        seenPans.add(panNumber);
      }
      if (existingPanSet.has(panNumber)) {
        errors.push(`Rider already exists with panNumber: ${panNumber}`);
      }
    }

    let hubId: string | null = null;
    if (hubCodeKey) {
      hubId = hubIdByCode.get(hubCodeKey) ?? null;
      if (!hubId) {
        errors.push(`Hub not found for hubCode: ${row.hubCode}`);
      }
    }

    let clientId: string | null = null;
    if (clientCodeKey) {
      clientId = clientIdByCode.get(clientCodeKey) ?? null;
      if (!clientId) {
        errors.push(`Client not found for clientCode: ${row.clientCode}`);
      }
    }

    if (row.rentalType === "B2B" && !clientId && clientCodeKey) {
      // already pushed not-found; keep
    }

    if (errors.length > 0) {
      results.push({ rowIndex: i, ok: false, errors });
      continue;
    }

    const payload: RiderImportReadyPayload = {
      fullName: row.fullName.trim(),
      phoneNumber,
      email,
      dateOfBirth: row.dateOfBirth ?? null,
      gender: row.gender ?? null,
      address: buildAddress(row),
      emergencyContactName: row.emergencyContactName ?? null,
      emergencyContactPhone: row.emergencyContactPhone ?? null,
      aadharNumber,
      panNumber,
      licenseNumber: row.licenseNumber ?? null,
      medicalReportExpiryDate: row.medicalReportExpiryDate ?? null,
      agreementDate: row.agreementDate ?? null,
      policeVerificationValidUpto: row.policeVerificationValidUpto ?? null,
      backgroundVerificationExpiryDate:
        row.backgroundVerificationExpiryDate ?? null,
      dateOfLastWorkingDay: row.dateOfLastWorkingDay ?? null,
      bankName: row.bankName ?? null,
      branch: row.branch ?? null,
      rentalType: row.rentalType,
      b2cMode: row.b2cMode ?? null,
      b2bRiderMgmt: row.b2bRiderMgmt ?? null,
      clientId,
      hubId,
    };

    results.push({ rowIndex: i, ok: true, errors: [], payload });
  }

  const valid = results.filter((result) => result.ok).length;

  return {
    summary: {
      total: rows.length,
      valid,
      invalid: rows.length - valid,
    },
    results,
  };
}

/**
 * Re-validate rows, generate temp passwords, create only valid riders.
 * Partial success: one failed row does not stop the others.
 */
export async function importRiders(
  rows: RiderImportRowInput[],
  actor: AuditActor,
): Promise<RiderImportCommitResult> {
  const validated = await validateRiderImportRows(rows);

  const results: RiderImportCommitResult["results"] = [];
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

    const temporaryPassword = generateTempRiderPassword();

    try {
      const rider = await createRider(
        {
          ...row.payload,
          password: temporaryPassword,
        },
        actor,
      );
      created += 1;
      results.push({
        rowIndex: row.rowIndex,
        ok: true,
        id: rider.id,
        phoneNumber: row.payload.phoneNumber,
        temporaryPassword,
      });
    } catch (err) {
      failed += 1;
      const message =
        err instanceof AppError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to create rider";
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
