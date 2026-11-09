import prisma from "../../database/prismaClient.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { StaffReportQuery } from "../../validation/reports.js";
import {
  reportDateRange,
  reportPagination,
  type ReportResult,
} from "./common.js";

const columns = [
  { key: "employeeCode", header: "Employee Code" },
  { key: "fullName", header: "Full Name" },
  { key: "phoneNumber", header: "Phone" },
  { key: "email", header: "Email" },
  { key: "jobTitle", header: "Job Title" },
  { key: "status", header: "Status" },
  { key: "hubCode", header: "Hub Code" },
  { key: "hubName", header: "Hub" },
  { key: "payoutCount", header: "Payouts" },
  { key: "createdAt", header: "Created At" },
];

export async function staffReport(
  query: StaffReportQuery
): Promise<ReportResult> {
  const { startDate, endDate } = reportDateRange(query);
  const where: Prisma.StaffWhereInput = {
    deletedAt: null,
    createdAt: { gte: startDate, lte: endDate },
  };

  if (query.status) where.status = query.status;
  if (query.hubId) where.hubId = query.hubId;
  if (query.search) {
    where.OR = [
      { employeeCode: { contains: query.search, mode: "insensitive" } },
      { fullName: { contains: query.search, mode: "insensitive" } },
      { phoneNumber: { contains: query.search, mode: "insensitive" } },
      { jobTitle: { contains: query.search, mode: "insensitive" } },
      { user: { email: { contains: query.search, mode: "insensitive" } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.staff.findMany({
      where,
      select: {
        employeeCode: true,
        fullName: true,
        phoneNumber: true,
        jobTitle: true,
        status: true,
        createdAt: true,
        user: { select: { email: true } },
        hub: { select: { code: true, name: true } },
        _count: { select: { payouts: true } },
      },
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.staff.count({ where }),
  ]);

  return {
    name: "staff",
    columns,
    filters: {
      startDate,
      endDate,
      status: query.status,
      hubId: query.hubId,
      search: query.search,
    },
    rows: rows.map((row) => ({
      employeeCode: row.employeeCode ?? "",
      fullName: row.fullName,
      phoneNumber: row.phoneNumber ?? "",
      email: row.user?.email ?? "",
      jobTitle: row.jobTitle ?? "",
      status: row.status,
      hubCode: row.hub?.code ?? "",
      hubName: row.hub?.name ?? "",
      payoutCount: row._count.payouts,
      createdAt: row.createdAt,
    })),
    pagination: reportPagination(query, total),
  };
}
