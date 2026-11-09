import prisma from "../../database/prismaClient.js";
import { Prisma } from "../../generated/prisma/client.js";
import type {
  B2BReportQuery,
  B2CReportQuery,
} from "../../validation/reports.js";
import {
  decimal,
  moneyString,
  reportDateRange,
  reportPagination,
  type ReportResult,
} from "./common.js";

const columns = [
  { key: "rentalNumber", header: "Rental Number" },
  { key: "rentalType", header: "Rental Type" },
  { key: "status", header: "Status" },
  { key: "clientCode", header: "Client Code" },
  { key: "clientName", header: "Client" },
  { key: "riderCode", header: "Rider Code" },
  { key: "riderName", header: "Rider" },
  { key: "hubCode", header: "Hub Code" },
  { key: "hubName", header: "Hub" },
  { key: "startDate", header: "Start Date" },
  { key: "expectedEndDate", header: "Expected End Date" },
  { key: "endDate", header: "End Date" },
  { key: "billingFrequency", header: "Billing Frequency" },
  { key: "collectionPeriod", header: "Collection Period" },
  { key: "weeklyRate", header: "Weekly Rate" },
  { key: "monthlyRate", header: "Monthly Rate" },
  { key: "currency", header: "Currency" },
  { key: "totalDue", header: "Total Due" },
  { key: "totalCollected", header: "Total Collected" },
  { key: "totalOutstanding", header: "Total Outstanding" },
  { key: "overdueOutstanding", header: "Overdue Outstanding" },
  { key: "securityDepositRequired", header: "Security Deposit Required" },
  { key: "finalOutstandingAmount", header: "Final Outstanding" },
  { key: "activatedAt", header: "Activated At" },
  { key: "closedAt", header: "Closed At" },
  { key: "createdAt", header: "Created At" },
];

export async function rentalReport(
  query: B2CReportQuery | B2BReportQuery,
  rentalType: "B2C" | "B2B"
): Promise<ReportResult> {
  const { startDate, endDate } = reportDateRange(query);
  const where: Prisma.RentalWhereInput = {
    rentalType,
    startDate: { gte: startDate, lte: endDate },
  };

  if (query.status) where.status = query.status;
  if (query.clientId) where.clientId = query.clientId;
  if (query.riderId) where.riderId = query.riderId;
  if (query.hubId) where.hubId = query.hubId;
  if (query.search) {
    where.OR = [
      { rentalNumber: { contains: query.search, mode: "insensitive" } },
      { agreementRef: { contains: query.search, mode: "insensitive" } },
      { client: { name: { contains: query.search, mode: "insensitive" } } },
      { client: { clientCode: { contains: query.search, mode: "insensitive" } } },
      { rider: { fullName: { contains: query.search, mode: "insensitive" } } },
      { rider: { riderCode: { contains: query.search, mode: "insensitive" } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.rental.findMany({
      where,
      select: {
        id: true,
        rentalNumber: true,
        rentalType: true,
        status: true,
        startDate: true,
        expectedEndDate: true,
        endDate: true,
        billingFrequency: true,
        collectionPeriod: true,
        weeklyRate: true,
        monthlyRate: true,
        currency: true,
        securityDepositRequired: true,
        finalOutstandingAmount: true,
        activatedAt: true,
        closedAt: true,
        createdAt: true,
        client: { select: { clientCode: true, name: true } },
        rider: { select: { riderCode: true, fullName: true } },
        hub: { select: { code: true, name: true } },
        collectionDues: {
          select: {
            status: true,
            amountDue: true,
            amountCollected: true,
            outstandingAmount: true,
          },
        },
      },
      orderBy: [{ startDate: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.rental.count({ where }),
  ]);

  return {
    name: rentalType === "B2C" ? "b2c-rentals" : "b2b-rentals",
    columns,
    filters: {
      startDate,
      endDate,
      status: query.status,
      hubId: query.hubId,
      clientId: query.clientId,
      riderId: query.riderId,
      search: query.search,
    },
    rows: rows.map((row) => {
      const totalDue = row.collectionDues.reduce(
        (sum, due) => sum.add(decimal(due.amountDue)),
        decimal(0)
      );
      const totalCollected = row.collectionDues.reduce(
        (sum, due) => sum.add(decimal(due.amountCollected)),
        decimal(0)
      );
      const totalOutstanding = row.collectionDues.reduce(
        (sum, due) => sum.add(decimal(due.outstandingAmount)),
        decimal(0)
      );
      const overdueOutstanding = row.collectionDues.reduce(
        (sum, due) =>
          due.status === "OVERDUE"
            ? sum.add(decimal(due.outstandingAmount))
            : sum,
        decimal(0)
      );

      return {
        rentalNumber: row.rentalNumber,
        rentalType: row.rentalType,
        status: row.status,
        clientCode: row.client.clientCode,
        clientName: row.client.name,
        riderCode: row.rider?.riderCode ?? "",
        riderName: row.rider?.fullName ?? "",
        hubCode: row.hub?.code ?? "",
        hubName: row.hub?.name ?? "",
        startDate: row.startDate,
        expectedEndDate: row.expectedEndDate,
        endDate: row.endDate,
        billingFrequency: row.billingFrequency ?? "",
        collectionPeriod: row.collectionPeriod,
        weeklyRate: row.weeklyRate ? moneyString(row.weeklyRate) : "",
        monthlyRate: row.monthlyRate ? moneyString(row.monthlyRate) : "",
        currency: row.currency,
        totalDue: moneyString(totalDue),
        totalCollected: moneyString(totalCollected),
        totalOutstanding: moneyString(totalOutstanding),
        overdueOutstanding: moneyString(overdueOutstanding),
        securityDepositRequired: row.securityDepositRequired
          ? moneyString(row.securityDepositRequired)
          : "",
        finalOutstandingAmount: row.finalOutstandingAmount
          ? moneyString(row.finalOutstandingAmount)
          : "",
        activatedAt: row.activatedAt,
        closedAt: row.closedAt,
        createdAt: row.createdAt,
      };
    }),
    pagination: reportPagination(query, total),
  };
}

export function b2cReport(query: B2CReportQuery) {
  return rentalReport(query, "B2C");
}

export function b2bReport(query: B2BReportQuery) {
  return rentalReport(query, "B2B");
}
