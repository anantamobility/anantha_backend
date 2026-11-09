import type { NextFunction, Request, Response } from "express";
import { success } from "../utils/http.js";
import { getDashboard } from "../services/dashboard.js";
import { getStatusTrends } from "../services/trends.js";
import type { DashboardQuery } from "../validation/dashboard.js";

export const getDashboardSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const dashboard = await getDashboard(
      req.query as unknown as DashboardQuery
    );
    return success(res, { dashboard });
  } catch (err) {
    next(err);
  }
};

export const getTrends = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const trends = await getStatusTrends(
      req.query as unknown as DashboardQuery
    );
    return success(res, { trends });
  } catch (err) {
    next(err);
  }
};
