import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import * as ledgerService from "../../services/ledger.js";
import type { ListLedgerQuery } from "../../validation/ledger.js";

export const getLedgerEntries = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await ledgerService.listLedgerEntries(
      req.query as unknown as ListLedgerQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};
