import prisma from "../../database/prismaClient.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { VehicleReportQuery } from "../../validation/reports.js";
import {
  reportDateRange,
  reportPagination,
  type ReportResult,
} from "./common.js";

const columns = [
  { key: "registrationNumber", header: "Registration Number" },
  { key: "make", header: "Make" },
  { key: "model", header: "Model" },
  { key: "year", header: "Year" },
  { key: "color", header: "Color" },
  { key: "vin", header: "VIN" },
  { key: "status", header: "Status" },
  { key: "isActive", header: "Active" },
  { key: "hubCode", header: "Hub Code" },
  { key: "hubName", header: "Hub" },
  { key: "currentRiderCode", header: "Current Rider Code" },
  { key: "currentRiderName", header: "Current Rider" },
  { key: "currentRentalNumber", header: "Current Rental" },
  { key: "assignmentStartDate", header: "Assignment Start" },
  { key: "serviceCount", header: "Services" },
  { key: "assignmentCount", header: "Assignments" },
  { key: "acquiredAt", header: "Acquired At" },
  { key: "retiredAt", header: "Retired At" },
  { key: "createdAt", header: "Created At" },
];

export async function vehicleReport(
  query: VehicleReportQuery
): Promise<ReportResult> {
  const { startDate, endDate } = reportDateRange(query);
  const where: Prisma.VehicleWhereInput = {
    deletedAt: null,
    createdAt: { gte: startDate, lte: endDate },
  };

  if (query.status) where.status = query.status;
  if (query.isActive !== undefined) where.isActive = query.isActive;
  if (query.hubId) where.hubId = query.hubId;
  if (query.search) {
    where.OR = [
      { registrationNumber: { contains: query.search, mode: "insensitive" } },
      { make: { contains: query.search, mode: "insensitive" } },
      { model: { contains: query.search, mode: "insensitive" } },
      { vin: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      select: {
        registrationNumber: true,
        make: true,
        model: true,
        year: true,
        color: true,
        vin: true,
        status: true,
        isActive: true,
        acquiredAt: true,
        retiredAt: true,
        createdAt: true,
        hub: { select: { code: true, name: true } },
        assignments: {
          where: { status: "ACTIVE" },
          orderBy: { startDate: "desc" },
          take: 1,
          select: {
            startDate: true,
            rider: { select: { riderCode: true, fullName: true } },
            rental: { select: { rentalNumber: true } },
          },
        },
        _count: {
          select: {
            services: true,
            assignments: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.vehicle.count({ where }),
  ]);

  return {
    name: "vehicles",
    columns,
    filters: {
      startDate,
      endDate,
      status: query.status,
      isActive: query.isActive,
      hubId: query.hubId,
      search: query.search,
    },
    rows: rows.map((row) => {
      const assignment = row.assignments[0];
      return {
        registrationNumber: row.registrationNumber,
        make: row.make ?? "",
        model: row.model ?? "",
        year: row.year ?? "",
        color: row.color ?? "",
        vin: row.vin ?? "",
        status: row.status,
        isActive: row.isActive,
        hubCode: row.hub?.code ?? "",
        hubName: row.hub?.name ?? "",
        currentRiderCode: assignment?.rider?.riderCode ?? "",
        currentRiderName: assignment?.rider?.fullName ?? "",
        currentRentalNumber: assignment?.rental?.rentalNumber ?? "",
        assignmentStartDate: assignment?.startDate,
        serviceCount: row._count.services,
        assignmentCount: row._count.assignments,
        acquiredAt: row.acquiredAt,
        retiredAt: row.retiredAt,
        createdAt: row.createdAt,
      };
    }),
    pagination: reportPagination(query, total),
  };
}
