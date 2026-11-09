import prisma from "../../database/prismaClient.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { InventoryReportQuery } from "../../validation/reports.js";
import {
  decimal,
  moneyString,
  reportDateRange,
  reportPagination,
  type ReportResult,
} from "./common.js";

const columns = [
  { key: "partNumber", header: "Part Number" },
  { key: "spareName", header: "Spare Name" },
  { key: "category", header: "Category" },
  { key: "hubCode", header: "Hub Code" },
  { key: "hubName", header: "Hub" },
  { key: "onHand", header: "On Hand" },
  { key: "reserved", header: "Reserved" },
  { key: "available", header: "Available" },
  { key: "minimumStock", header: "Minimum Stock" },
  { key: "belowMinimum", header: "Below Minimum" },
  { key: "unitCost", header: "Unit Cost" },
  { key: "stockValue", header: "Stock Value" },
  { key: "updatedAt", header: "Updated At" },
];

const select = {
  onHand: true,
  reserved: true,
  updatedAt: true,
  spare: {
    select: {
      partNumber: true,
      name: true,
      category: true,
      minimumStock: true,
      unitCost: true,
    },
  },
  hub: { select: { code: true, name: true } },
} satisfies Prisma.InventoryBalanceSelect;

type BalanceRow = Prisma.InventoryBalanceGetPayload<{ select: typeof select }>;

function mapBalance(row: BalanceRow) {
  const available = row.onHand - row.reserved;
  return {
    partNumber: row.spare.partNumber,
    spareName: row.spare.name,
    category: row.spare.category ?? "",
    hubCode: row.hub.code,
    hubName: row.hub.name,
    onHand: row.onHand,
    reserved: row.reserved,
    available,
    minimumStock: row.spare.minimumStock,
    belowMinimum: row.onHand < row.spare.minimumStock,
    unitCost: moneyString(row.spare.unitCost),
    stockValue: moneyString(decimal(row.spare.unitCost).mul(row.onHand)),
    updatedAt: row.updatedAt,
  };
}

export async function inventoryReport(
  query: InventoryReportQuery
): Promise<ReportResult> {
  const { startDate, endDate } = reportDateRange(query);
  const where: Prisma.InventoryBalanceWhereInput = {
    updatedAt: { gte: startDate, lte: endDate },
  };

  if (query.hubId) where.hubId = query.hubId;
  if (query.spareId) where.spareId = query.spareId;
  if (query.search) {
    where.OR = [
      {
        spare: {
          partNumber: { contains: query.search, mode: "insensitive" },
        },
      },
      { spare: { name: { contains: query.search, mode: "insensitive" } } },
      { hub: { code: { contains: query.search, mode: "insensitive" } } },
      { hub: { name: { contains: query.search, mode: "insensitive" } } },
    ];
  }

  let rows: Array<Record<string, unknown>>;
  let total: number;

  if (query.belowMinimum) {
    const allRows = await prisma.inventoryBalance.findMany({
      where,
      select,
      orderBy: [{ hub: { code: "asc" } }, { spare: { name: "asc" } }],
    });
    const mapped = allRows.map(mapBalance).filter((row) => row.belowMinimum);
    total = mapped.length;
    rows = mapped.slice(
      (query.page - 1) * query.limit,
      query.page * query.limit
    );
  } else {
    const [rawRows, count] = await Promise.all([
      prisma.inventoryBalance.findMany({
        where,
        select,
        orderBy: [{ hub: { code: "asc" } }, { spare: { name: "asc" } }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.inventoryBalance.count({ where }),
    ]);
    total = count;
    rows = rawRows.map(mapBalance);
  }

  return {
    name: "inventory",
    columns,
    filters: {
      startDate,
      endDate,
      hubId: query.hubId,
      spareId: query.spareId,
      belowMinimum: query.belowMinimum,
      search: query.search,
    },
    rows,
    pagination: reportPagination(query, total),
  };
}
