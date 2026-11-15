import type { Prisma } from "../generated/prisma/client.js";

/**
 * Sequential codes like S001, R001. Call inside the Prisma transaction that
 * creates the row: two concurrent creates can read the same last number, and
 * the unique constraint rejects the loser with 409 instead of duplicating.
 *
 * Only codes of the form `<PREFIX><digits>` take part in the sequence, so
 * hand-entered codes such as RDR-DEMO-001 are ignored rather than breaking it.
 */
function nextCode(codes: string[], prefix: string) {
  const highest = codes.reduce((max, code) => {
    const value = Number(code.slice(prefix.length));
    return Number.isInteger(value) && value > max ? value : max;
  }, 0);
  return `${prefix}${(highest + 1).toString().padStart(3, "0")}`;
}

export async function generateEmployeeId(tx: Prisma.TransactionClient) {
  const PREFIX = "S";

  const rows = await tx.staff.findMany({
    where: { employeeCode: { startsWith: PREFIX } },
    select: { employeeCode: true },
  });

  return nextCode(
    rows.map((row) => row.employeeCode as string),
    PREFIX
  );
}

export async function generateRiderId(tx: Prisma.TransactionClient) {
  const PREFIX = "R";

  const rows = await tx.rider.findMany({
    where: { riderCode: { startsWith: PREFIX } },
    select: { riderCode: true },
  });

  return nextCode(
    rows.map((row) => row.riderCode),
    PREFIX
  );
}
