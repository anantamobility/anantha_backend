import { randomBytes } from "node:crypto";
import prisma from "../database/prismaClient.js";
import { AppError } from "../utils/errors.js";
import type { AuditActor } from "../utils/log.js";
import type { CreateStaffInput } from "../validation/staff.js";
import type { StaffImportRowInput } from "../validation/staffImport.js";
import { createStaff } from "./staff.js";

/** Payload ready for createStaff after hub/role resolution (password added at import). */
export type StaffImportReadyPayload = Omit<CreateStaffInput, "password" | "roleId"> & {
  roleName: string;
};

export type StaffImportRowResult = {
  rowIndex: number;
  ok: boolean;
  errors: string[];
  payload?: StaffImportReadyPayload;
};

export type StaffImportValidateResult = {
  summary: {
    total: number;
    valid: number;
    invalid: number;
  };
  results: StaffImportRowResult[];
};

export type StaffImportCommitResult = {
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
    fullName?: string;
    temporaryPassword?: string;
    errors?: string[];
  }>;
};

const STAFF_IMPORT_ROLES = new Set(["ADMIN", "SUPERVISOR"]);

function buildAddress(row: StaffImportRowInput): CreateStaffInput["address"] {
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
export function generateTempStaffPassword(): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let password = "";
  for (let i = 0; i < bytes.length; i++) {
    password += alphabet[bytes[i]! % alphabet.length];
  }
  if (!/[A-Za-z]/.test(password)) password = `A${password.slice(1)}`;
  if (!/[0-9]/.test(password)) password = `${password.slice(0, -1)}7`;
  return password;
}

/**
 * Check every row. Does NOT create staff or users.
 */
export async function validateStaffImportRows(
  rows: StaffImportRowInput[],
): Promise<StaffImportValidateResult> {
  const phones = rows.map((row) => row.phoneNumber.trim());
  const emails = rows
    .map((row) => row.email?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));
  const employeeCodes = rows
    .map((row) => row.employeeCode?.trim())
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
  const roleNames = [
    ...new Set(rows.map((row) => row.roleName.trim()).filter(Boolean)),
  ];

  const staffUniqueOr = [
    ...(employeeCodes.length ? [{ employeeCode: { in: employeeCodes } }] : []),
    ...(aadhars.length ? [{ aadharNumber: { in: aadhars } }] : []),
    ...(pans.length ? [{ panNumber: { in: pans } }] : []),
  ];

  const [
    existingUsersByPhone,
    existingUsersByEmail,
    existingStaff,
    hubs,
    roles,
  ] = await Promise.all([
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
    staffUniqueOr.length
      ? prisma.staff.findMany({
          where: {
            deletedAt: null,
            OR: staffUniqueOr,
          },
          select: {
            employeeCode: true,
            aadharNumber: true,
            panNumber: true,
          },
        })
      : Promise.resolve(
          [] as {
            employeeCode: string | null;
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
    roleNames.length
      ? prisma.role.findMany({
          where: { name: { in: roleNames } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  const existingPhoneSet = new Set(
    existingUsersByPhone.map((user) => user.phoneNumber),
  );
  const existingEmailSet = new Set(
    existingUsersByEmail
      .map((user) => user.email?.toLowerCase())
      .filter((value): value is string => Boolean(value)),
  );
  const existingEmployeeCodeSet = new Set(
    existingStaff
      .map((staff) => staff.employeeCode)
      .filter((value): value is string => Boolean(value)),
  );
  const existingAadharSet = new Set(
    existingStaff
      .map((staff) => staff.aadharNumber)
      .filter((value): value is string => Boolean(value)),
  );
  const existingPanSet = new Set(
    existingStaff
      .map((staff) => staff.panNumber)
      .filter((value): value is string => Boolean(value)),
  );
  const hubIdByCode = new Map(
    hubs.map((hub) => [hub.hubCode.toUpperCase(), hub.id]),
  );
  const roleByName = new Map(roles.map((role) => [role.name, role.name]));

  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();
  const seenEmployeeCodes = new Set<string>();
  const seenAadhars = new Set<string>();
  const seenPans = new Set<string>();

  const results: StaffImportRowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const errors: string[] = [];

    const phoneNumber = row.phoneNumber.trim();
    const email = row.email?.trim().toLowerCase() || null;
    const employeeCode = row.employeeCode?.trim() || null;
    const aadharNumber = row.aadharNumber?.trim() || null;
    const panNumber = row.panNumber?.trim() || null;
    const hubCodeKey = row.hubCode?.trim().toUpperCase() || null;
    const roleName = row.roleName.trim();

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

    if (employeeCode) {
      if (seenEmployeeCodes.has(employeeCode)) {
        errors.push(`Duplicate employeeCode in file: ${employeeCode}`);
      } else {
        seenEmployeeCodes.add(employeeCode);
      }
      if (existingEmployeeCodeSet.has(employeeCode)) {
        errors.push(`Staff already exists with employeeCode: ${employeeCode}`);
      }
    }

    if (aadharNumber) {
      if (seenAadhars.has(aadharNumber)) {
        errors.push(`Duplicate aadharNumber in file: ${aadharNumber}`);
      } else {
        seenAadhars.add(aadharNumber);
      }
      if (existingAadharSet.has(aadharNumber)) {
        errors.push(`Staff already exists with aadharNumber: ${aadharNumber}`);
      }
    }

    if (panNumber) {
      if (seenPans.has(panNumber)) {
        errors.push(`Duplicate panNumber in file: ${panNumber}`);
      } else {
        seenPans.add(panNumber);
      }
      if (existingPanSet.has(panNumber)) {
        errors.push(`Staff already exists with panNumber: ${panNumber}`);
      }
    }

    if (roleName === "RIDER") {
      errors.push("roleName RIDER is not allowed for staff import");
    } else if (!STAFF_IMPORT_ROLES.has(roleName)) {
      errors.push(
        `roleName must be ADMIN or SUPERVISOR (got: ${roleName})`,
      );
    } else if (!roleByName.has(roleName)) {
      errors.push(`Role not found for roleName: ${roleName}`);
    }

    let hubId: string | null = null;
    if (hubCodeKey) {
      hubId = hubIdByCode.get(hubCodeKey) ?? null;
      if (!hubId) {
        errors.push(`Hub not found for hubCode: ${row.hubCode}`);
      }
    }

    if (errors.length > 0) {
      results.push({ rowIndex: i, ok: false, errors });
      continue;
    }

    const payload: StaffImportReadyPayload = {
      fullName: row.fullName.trim(),
      gender: row.gender,
      phoneNumber,
      email,
      roleName,
      hubId,
      employeeCode,
      dateOfBirth: row.dateOfBirth ?? null,
      department: row.department ?? null,
      jobTitle: row.jobTitle ?? null,
      status: row.status,
      employmentType: row.employmentType ?? null,
      workMode: row.workMode ?? null,
      educationalQualification: row.educationalQualification ?? null,
      bloodGroup: row.bloodGroup ?? null,
      address: buildAddress(row),
      alternatePhone: row.alternatePhone ?? null,
      emergencyContactName: row.emergencyContactName ?? null,
      emergencyContactPhone: row.emergencyContactPhone ?? null,
      anniversary: row.anniversary ?? null,
      dateOfJoining: row.dateOfJoining ?? null,
      probationEndDate: row.probationEndDate ?? null,
      dateOfLastWorkingDay: row.dateOfLastWorkingDay ?? null,
      dateOfRelieving: row.dateOfRelieving ?? null,
      aadharNumber,
      panNumber,
      bankName: row.bankName ?? null,
      branch: row.branch ?? null,
      bankAccountNumber: row.bankAccountNumber ?? null,
      bankIfsc: row.bankIfsc ?? null,
      bankHolderName: row.bankHolderName ?? null,
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
 * Re-validate rows, generate temp passwords, create only valid staff.
 * Partial success: one failed row does not stop the others.
 */
export async function importStaff(
  rows: StaffImportRowInput[],
  actor: AuditActor,
): Promise<StaffImportCommitResult> {
  const validated = await validateStaffImportRows(rows);

  const results: StaffImportCommitResult["results"] = [];
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

    const temporaryPassword = generateTempStaffPassword();

    try {
      const staff = await createStaff(
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
        id: staff.id,
        phoneNumber: row.payload.phoneNumber,
        fullName: row.payload.fullName,
        temporaryPassword,
      });
    } catch (err) {
      failed += 1;
      const message =
        err instanceof AppError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to create staff";
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
