import prisma from "../../database/prismaClient.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { ServiceReportQuery } from "../../validation/reports.js";
import {
  decimal,
  moneyString,
  reportDateRange,
  reportPagination,
  type ReportResult,
} from "./common.js";

const columns = [
  { key: "serviceNumber", header: "Service Number" },
  { key: "status", header: "Status" },
  { key: "serviceType", header: "Service Type" },
  { key: "responsibleParty", header: "Responsible Party" },
  { key: "vehicleRegistration", header: "Vehicle" },
  { key: "rentalNumber", header: "Rental" },
  { key: "hubCode", header: "Hub Code" },
  { key: "hubName", header: "Hub" },
  { key: "reportedAt", header: "Reported At" },
  { key: "startedAt", header: "Started At" },
  { key: "completedAt", header: "Completed At" },
  { key: "closedAt", header: "Closed At" },
  { key: "downtimeStart", header: "Downtime Start" },
  { key: "downtimeEnd", header: "Downtime End" },
  { key: "downtimeHours", header: "Downtime Hours" },
  { key: "costAmount", header: "Total Cost" },
  { key: "billableAmount", header: "Total Billable" },
  { key: "sparesCost", header: "Spares Cost" },
  { key: "reportedBy", header: "Reported By" },
  { key: "approvedBy", header: "Approved By" },
  { key: "description", header: "Description" },
];

export async function serviceReport(
  query: ServiceReportQuery
): Promise<ReportResult> {
  const { startDate, endDate } = reportDateRange(query);
  const where: Prisma.ServiceWhereInput = {
    reportedAt: { gte: startDate, lte: endDate },
  };

  if (query.status) where.status = query.status;
  if (query.serviceType) where.serviceType = query.serviceType;
  if (query.responsibleParty) {
    where.responsibleParty = query.responsibleParty;
  }
  if (query.vehicleId) where.vehicleId = query.vehicleId;
  if (query.rentalId) where.rentalId = query.rentalId;
  if (query.hubId) where.vehicle = { hubId: query.hubId };
  if (query.search) {
    where.OR = [
      { serviceNumber: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
      {
        vehicle: {
          registrationNumber: { contains: query.search, mode: "insensitive" },
        },
      },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.service.findMany({
      where,
      select: {
        serviceNumber: true,
        status: true,
        serviceType: true,
        responsibleParty: true,
        reportedAt: true,
        startedAt: true,
        completedAt: true,
        closedAt: true,
        downtimeStart: true,
        downtimeEnd: true,
        description: true,
        vehicle: {
          select: {
            registrationNumber: true,
            hub: { select: { code: true, name: true } },
          },
        },
        rental: { select: { rentalNumber: true } },
        reportedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        charges: {
          select: { costAmount: true, billableAmount: true },
        },
        spares: { select: { lineCost: true } },
      },
      orderBy: [{ reportedAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.service.count({ where }),
  ]);

  return {
    name: "services",
    columns,
    filters: {
      startDate,
      endDate,
      status: query.status,
      serviceType: query.serviceType,
      responsibleParty: query.responsibleParty,
      vehicleId: query.vehicleId,
      rentalId: query.rentalId,
      hubId: query.hubId,
      search: query.search,
    },
    rows: rows.map((row) => {
      const costAmount = row.charges.reduce(
        (sum, charge) => sum.add(decimal(charge.costAmount)),
        decimal(0)
      );
      const billableAmount = row.charges.reduce(
        (sum, charge) => sum.add(decimal(charge.billableAmount)),
        decimal(0)
      );
      const sparesCost = row.spares.reduce(
        (sum, spare) => sum.add(decimal(spare.lineCost)),
        decimal(0)
      );
      const downtimeHours =
        row.downtimeStart && row.downtimeEnd
          ? Number(
              (
                (row.downtimeEnd.getTime() - row.downtimeStart.getTime()) /
                3_600_000
              ).toFixed(2)
            )
          : "";

      return {
        serviceNumber: row.serviceNumber,
        status: row.status,
        serviceType: row.serviceType,
        responsibleParty: row.responsibleParty,
        vehicleRegistration: row.vehicle.registrationNumber,
        rentalNumber: row.rental?.rentalNumber ?? "",
        hubCode: row.vehicle.hub?.code ?? "",
        hubName: row.vehicle.hub?.name ?? "",
        reportedAt: row.reportedAt,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        closedAt: row.closedAt,
        downtimeStart: row.downtimeStart,
        downtimeEnd: row.downtimeEnd,
        downtimeHours,
        costAmount: moneyString(costAmount),
        billableAmount: moneyString(billableAmount),
        sparesCost: moneyString(sparesCost),
        reportedBy: row.reportedBy?.name ?? "",
        approvedBy: row.approvedBy?.name ?? "",
        description: row.description ?? "",
      };
    }),
    pagination: reportPagination(query, total),
  };
}
