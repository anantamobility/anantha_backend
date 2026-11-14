import prisma from "../../database/prismaClient.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { RiderReportQuery } from "../../validation/reports.js";
import {
  reportDateRange,
  reportPagination,
  type ReportResult,
} from "./common.js";

const columns = [
  { key: "riderCode", header: "Rider Code" },
  { key: "fullName", header: "Full Name" },
  { key: "phoneNumber", header: "Phone" },
  { key: "email", header: "Email" },
  { key: "status", header: "Status" },
  { key: "rentalType", header: "Rental Type" },
  { key: "b2cMode", header: "B2C Mode" },
  { key: "b2bRiderMgmt", header: "B2B Rider Management" },
  { key: "clientCode", header: "Client Code" },
  { key: "clientName", header: "Client" },
  { key: "hubCode", header: "Hub Code" },
  { key: "hubName", header: "Hub" },
  { key: "rentalCount", header: "Rentals" },
  { key: "depositCount", header: "Deposits" },
  { key: "collectionCount", header: "Collections" },
  { key: "onboardedAt", header: "Onboarded At" },
  { key: "createdAt", header: "Created At" },
];

export async function riderReport(
  query: RiderReportQuery
): Promise<ReportResult> {
  const { startDate, endDate } = reportDateRange(query);
  const where: Prisma.RiderWhereInput = {
    deletedAt: null,
    createdAt: { gte: startDate, lte: endDate },
  };

  if (query.status) where.status = query.status;
  if (query.rentalType) where.rentalType = query.rentalType;
  if (query.hubId) where.hubId = query.hubId;
  if (query.clientId) where.clientId = query.clientId;
  if (query.search) {
    where.OR = [
      { riderCode: { contains: query.search, mode: "insensitive" } },
      { fullName: { contains: query.search, mode: "insensitive" } },
      { phoneNumber: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.rider.findMany({
      where,
      select: {
        riderCode: true,
        fullName: true,
        phoneNumber: true,
        email: true,
        status: true,
        rentalType: true,
        b2cMode: true,
        b2bRiderMgmt: true,
        onboardedAt: true,
        createdAt: true,
        client: { select: { clientCode: true, name: true } },
        hub: { select: { code: true, name: true } },
        _count: {
          select: {
            rentals: true,
            deposits: true,
            collections: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.rider.count({ where }),
  ]);

  return {
    name: "riders",
    columns,
    filters: {
      startDate,
      endDate,
      status: query.status,
      rentalType: query.rentalType,
      hubId: query.hubId,
      clientId: query.clientId,
      search: query.search,
    },
    rows: rows.map((row) => ({
      riderCode: row.riderCode,
      fullName: row.fullName,
      phoneNumber: row.phoneNumber ?? "",
      email: row.email ?? "",
      status: row.status,
      rentalType: row.rentalType ?? "",
      b2cMode: row.b2cMode ?? "",
      b2bRiderMgmt: row.b2bRiderMgmt ?? "",
      clientCode: row.client?.clientCode ?? "",
      clientName: row.client?.name ?? "",
      hubCode: row.hub?.code ?? "",
      hubName: row.hub?.name ?? "",
      rentalCount: row._count.rentals,
      depositCount: row._count.deposits,
      collectionCount: row._count.collections,
      onboardedAt: row.onboardedAt,
      createdAt: row.createdAt,
    })),
    pagination: reportPagination(query, total),
  };
}
