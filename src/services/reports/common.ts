import type { Response } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import { resolveTrendRange } from "../trends.js";

export type ReportColumn = {
  key: string;
  header: string;
};

export type ReportResult = {
  name: string;
  columns: ReportColumn[];
  filters: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

export type ReportQuery = {
  page: number;
  limit: number;
  format: "json" | "csv";
  startDate?: Date;
  endDate?: Date;
  search?: string;
  [key: string]: unknown;
};

export function reportDateRange(query: ReportQuery) {
  return resolveTrendRange(query);
}

export function reportPagination(
  query: ReportQuery,
  total: number,
  limit = query.limit
) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    page: query.page,
    limit,
    total,
    totalPages,
    hasNextPage: query.page < totalPages,
    hasPreviousPage: query.page > 1,
  };
}

export function decimal(value: unknown): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  return new Prisma.Decimal(value as string | number | Prisma.Decimal);
}

export function moneyString(value: unknown): string {
  return decimal(value).toFixed(2);
}

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function csvCell(value: unknown): string {
  const raw = csvValue(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

export function csvLine(values: unknown[]): string {
  return `${values.map(csvCell).join(",")}\r\n`;
}

export function startCsv(
  res: Response,
  filename: string,
  columns: ReportColumn[]
) {
  res.status(200);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename.replace(/[^a-zA-Z0-9_.-]/g, "_")}.csv"`
  );
  res.write(csvLine(columns.map((column) => column.header)));
}

export function writeCsvRows(
  res: Response,
  columns: ReportColumn[],
  rows: Array<Record<string, unknown>>
) {
  for (const row of rows) {
    res.write(csvLine(columns.map((column) => row[column.key])));
  }
}
