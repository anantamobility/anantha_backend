import prisma from "../../database/prismaClient.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { CollectionsReportQuery } from "../../validation/reports.js";
import {
  moneyString,
  reportDateRange,
  reportPagination,
  type ReportResult,
} from "./common.js";

const columns = [
  { key: "id", header: "Collection ID" },
  { key: "receivedAt", header: "Received At" },
  { key: "payerType", header: "Payer Type" },
  { key: "clientCode", header: "Client Code" },
  { key: "clientName", header: "Client" },
  { key: "riderCode", header: "Rider Code" },
  { key: "riderName", header: "Rider" },
  { key: "rentalNumber", header: "Rental" },
  { key: "rentalType", header: "Rental Type" },
  { key: "hubCode", header: "Hub Code" },
  { key: "hubName", header: "Hub" },
  { key: "amount", header: "Amount" },
  { key: "currency", header: "Currency" },
  { key: "paymentMethod", header: "Payment Method" },
  { key: "referenceNumber", header: "Reference" },
  { key: "status", header: "Status" },
  { key: "receivedBy", header: "Received By" },
  { key: "reconciledAt", header: "Reconciled At" },
  { key: "notes", header: "Notes" },
];

export async function collectionsReport(
  query: CollectionsReportQuery
): Promise<ReportResult> {
  const { startDate, endDate } = reportDateRange(query);
  const where: Prisma.CollectionWhereInput = {
    receivedAt: { gte: startDate, lte: endDate },
  };

  if (query.status) where.status = query.status;
  if (query.payerType) where.payerType = query.payerType;
  if (query.paymentMethod) where.paymentMethod = query.paymentMethod;
  if (query.clientId) where.clientId = query.clientId;
  if (query.riderId) where.riderId = query.riderId;
  if (query.rentalId) where.rentalId = query.rentalId;
  if (query.hubId) where.rental = { hubId: query.hubId };
  if (query.search) {
    where.OR = [
      { referenceNumber: { contains: query.search, mode: "insensitive" } },
      { idempotencyKey: { contains: query.search, mode: "insensitive" } },
      { notes: { contains: query.search, mode: "insensitive" } },
      { client: { name: { contains: query.search, mode: "insensitive" } } },
      { client: { clientCode: { contains: query.search, mode: "insensitive" } } },
      { rider: { fullName: { contains: query.search, mode: "insensitive" } } },
      { rider: { riderCode: { contains: query.search, mode: "insensitive" } } },
      { rental: { rentalNumber: { contains: query.search, mode: "insensitive" } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.collection.findMany({
      where,
      select: {
        id: true,
        receivedAt: true,
        payerType: true,
        amount: true,
        currency: true,
        paymentMethod: true,
        referenceNumber: true,
        status: true,
        notes: true,
        reconciledAt: true,
        client: { select: { clientCode: true, name: true } },
        rider: { select: { riderCode: true, fullName: true } },
        rental: {
          select: {
            rentalNumber: true,
            rentalType: true,
            hub: { select: { code: true, name: true } },
          },
        },
        receivedBy: { select: { name: true } },
      },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.collection.count({ where }),
  ]);

  return {
    name: "collections",
    columns,
    filters: {
      startDate,
      endDate,
      status: query.status,
      payerType: query.payerType,
      paymentMethod: query.paymentMethod,
      hubId: query.hubId,
      clientId: query.clientId,
      riderId: query.riderId,
      rentalId: query.rentalId,
      search: query.search,
    },
    rows: rows.map((row) => ({
      id: row.id,
      receivedAt: row.receivedAt,
      payerType: row.payerType,
      clientCode: row.client?.clientCode ?? "",
      clientName: row.client?.name ?? "",
      riderCode: row.rider?.riderCode ?? "",
      riderName: row.rider?.fullName ?? "",
      rentalNumber: row.rental?.rentalNumber ?? "",
      rentalType: row.rental?.rentalType ?? "",
      hubCode: row.rental?.hub?.code ?? "",
      hubName: row.rental?.hub?.name ?? "",
      amount: moneyString(row.amount),
      currency: row.currency,
      paymentMethod: row.paymentMethod,
      referenceNumber: row.referenceNumber ?? "",
      status: row.status,
      receivedBy: row.receivedBy?.name ?? "",
      reconciledAt: row.reconciledAt,
      notes: row.notes ?? "",
    })),
    pagination: reportPagination(query, total),
  };
}
