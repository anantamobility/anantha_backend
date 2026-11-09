import type { NextFunction, Request, Response } from "express";
import { success } from "../utils/http.js";
import { resolveTrendRange } from "../services/trends.js";
import {
  startCsv,
  writeCsvRows,
  type ReportResult,
} from "../services/reports/common.js";
import type { ReportQuery } from "../services/reports/common.js";

type ReportService = (query: ReportQuery) => Promise<ReportResult>;

const CSV_BATCH_SIZE = 100;

function normalizeQuery(query: ReportQuery): ReportQuery {
  const { startDate, endDate } = resolveTrendRange(query);
  return { ...query, startDate, endDate };
}

export function reportHandler(service: ReportService) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = normalizeQuery(req.query as unknown as ReportQuery);

      if (query.format === "csv") {
        let page = 1;
        let totalPages = 1;
        let columns: ReportResult["columns"] = [];
        let started = false;

        const batchQuery = { ...query, page, limit: CSV_BATCH_SIZE };

        while (page <= totalPages) {
          const result = await service(batchQuery);

          if (!started) {
            columns = result.columns;
            totalPages = Math.max(result.pagination.totalPages, 1);
            startCsv(res, result.name, columns);
            started = true;
          }

          if (result.rows.length > 0) {
            writeCsvRows(res, columns, result.rows);
          }

          if (result.rows.length < CSV_BATCH_SIZE) break;
          page += 1;
          batchQuery.page = page;
        }

        res.end();
        return;
      }

      const result = await service(query);
      return success(res, { report: result });
    } catch (err) {
      if (res.headersSent) {
        res.end();
        return;
      }
      next(err);
    }
  };
}
