import prisma from "../../database/prismaClient.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { HubReportQuery } from "../../validation/reports.js";
import {
  decimal,
  moneyString,
  reportDateRange,
  reportPagination,
  type ReportResult,
} from "./common.js";

const columns = [
  { key: "code", header: "Hub Code" },
  { key: "name", header: "Hub Name" },
  { key: "contactPhone", header: "Contact Phone" },
  { key: "contactEmail", header: "Contact Email" },
  { key: "isActive", header: "Active" },
  { key: "address", header: "Address" },
  { key: "vehicleCount", header: "Vehicles" },
  { key: "riderCount", header: "Riders" },
  { key: "staffCount", header: "Staff" },
  { key: "rentalCount", header: "Rentals" },
  { key: "stockOnHand", header: "Stock On Hand" },
  { key: "stockValue", header: "Stock Value" },
  { key: "createdAt", header: "Created At" },
];

export async function hubReport(query: HubReportQuery): Promise<ReportResult> {
  const { startDate, endDate } = reportDateRange(query);
  const where: Prisma.HubWhereInput = {
    createdAt: { gte: startDate, lte: endDate },
  };

  if (query.isActive !== undefined) where.isActive = query.isActive;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { code: { contains: query.search, mode: "insensitive" } },
      { contactPhone: { contains: query.search, mode: "insensitive" } },
      { contactEmail: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.hub.findMany({
      where,
      select: {
        code: true,
        name: true,
        contactPhone: true,
        contactEmail: true,
        isActive: true,
        address: true,
        createdAt: true,
        _count: {
          select: {
            vehicles: true,
            riders: true,
            staff: true,
            rentals: true,
          },
        },
        inventoryBalances: {
          select: {
            onHand: true,
            spare: { select: { unitCost: true } },
          },
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.hub.count({ where }),
  ]);

  return {
    name: "hubs",
    columns,
    filters: {
      startDate,
      endDate,
      isActive: query.isActive,
      search: query.search,
    },
    rows: rows.map((row) => {
      const stockOnHand = row.inventoryBalances.reduce(
        (sum, balance) => sum + balance.onHand,
        0
      );
      const stockValue = row.inventoryBalances.reduce(
        (sum, balance) => sum.add(decimal(balance.spare.unitCost).mul(balance.onHand)),
        decimal(0)
      );

      return {
        code: row.code,
        name: row.name,
        contactPhone: row.contactPhone ?? "",
        contactEmail: row.contactEmail ?? "",
        isActive: row.isActive,
        address: row.address ?? "",
        vehicleCount: row._count.vehicles,
        riderCount: row._count.riders,
        staffCount: row._count.staff,
        rentalCount: row._count.rentals,
        stockOnHand,
        stockValue: moneyString(stockValue),
        createdAt: row.createdAt,
      };
    }),
    pagination: reportPagination(query, total),
  };
}
