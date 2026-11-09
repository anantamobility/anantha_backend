import prisma from "../../database/prismaClient.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { SparesReportQuery } from "../../validation/reports.js";
import {
  decimal,
  moneyString,
  reportDateRange,
  reportPagination,
  type ReportResult,
} from "./common.js";

const columns = [
  { key: "partNumber", header: "Part Number" },
  { key: "name", header: "Spare Name" },
  { key: "category", header: "Category" },
  { key: "unitOfMeasure", header: "Unit" },
  { key: "purchasePrice", header: "Purchase Price" },
  { key: "unitCost", header: "Unit Cost" },
  { key: "minimumStock", header: "Minimum Stock" },
  { key: "onHand", header: "On Hand" },
  { key: "reserved", header: "Reserved" },
  { key: "available", header: "Available" },
  { key: "stockValue", header: "Stock Value" },
  { key: "belowMinimum", header: "Below Minimum" },
  { key: "isActive", header: "Active" },
  { key: "createdAt", header: "Created At" },
];

type SpareRow = Awaited<ReturnType<typeof findSpares>>[number];

async function findSpares(
  where: Prisma.SpareWhereInput,
  page?: { skip: number; take: number },
  hubId?: string
) {
  return prisma.spare.findMany({
    where,
    select: {
      partNumber: true,
      name: true,
      category: true,
      unitOfMeasure: true,
      purchasePrice: true,
      unitCost: true,
      minimumStock: true,
      isActive: true,
      createdAt: true,
      balances: {
        where: hubId ? { hubId } : undefined,
        select: { onHand: true, reserved: true },
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: page?.skip,
    take: page?.take,
  });
}

function mapSpare(row: SpareRow) {
  const onHand = row.balances.reduce(
    (sum, balance) => sum + balance.onHand,
    0
  );
  const reserved = row.balances.reduce(
    (sum, balance) => sum + balance.reserved,
    0
  );
  const available = onHand - reserved;
  const stockValue = decimal(row.unitCost).mul(onHand);

  return {
    partNumber: row.partNumber,
    name: row.name,
    category: row.category ?? "",
    unitOfMeasure: row.unitOfMeasure,
    purchasePrice: row.purchasePrice ? moneyString(row.purchasePrice) : "",
    unitCost: moneyString(row.unitCost),
    minimumStock: row.minimumStock,
    onHand,
    reserved,
    available,
    stockValue: moneyString(stockValue),
    belowMinimum: onHand < row.minimumStock,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

export async function sparesReport(
  query: SparesReportQuery
): Promise<ReportResult> {
  const { startDate, endDate } = reportDateRange(query);
  const where: Prisma.SpareWhereInput = {
    createdAt: { gte: startDate, lte: endDate },
  };

  if (query.category) where.category = query.category;
  if (query.isActive !== undefined) where.isActive = query.isActive;
  if (query.spareId) where.id = query.spareId;
  if (query.hubId) where.balances = { some: { hubId: query.hubId } };
  if (query.search) {
    where.OR = [
      { partNumber: { contains: query.search, mode: "insensitive" } },
      { name: { contains: query.search, mode: "insensitive" } },
      { category: { contains: query.search, mode: "insensitive" } },
    ];
  }

  let rows: Array<Record<string, unknown>>;
  let total: number;

  if (query.belowMinimum) {
    const allRows = await findSpares(where, undefined, query.hubId);
    const mapped = allRows.map(mapSpare).filter((row) => row.belowMinimum);
    total = mapped.length;
    rows = mapped.slice(
      (query.page - 1) * query.limit,
      query.page * query.limit
    );
  } else {
    const [rawRows, count] = await Promise.all([
      findSpares(
        where,
        {
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        },
        query.hubId
      ),
      prisma.spare.count({ where }),
    ]);
    total = count;
    rows = rawRows.map(mapSpare);
  }

  return {
    name: "spares",
    columns,
    filters: {
      startDate,
      endDate,
      category: query.category,
      isActive: query.isActive,
      belowMinimum: query.belowMinimum,
      hubId: query.hubId,
      spareId: query.spareId,
      search: query.search,
    },
    rows,
    pagination: reportPagination(query, total),
  };
}
