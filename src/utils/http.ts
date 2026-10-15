// src/utils/http.ts
import type { Response } from "express";

export type ApiSuccessBody<T> = { success: true; data: T };
export type ApiErrorBody = { success: false; error: { code: string; message: string } };

export function success<T>(res: Response, data: T, status = 200): Response {
  const body: ApiSuccessBody<T> = { success: true, data };
  return res.status(status).json(body);
}

export function error(res: Response, status: number, code: string, message: string): Response {
  const body: ApiErrorBody = { success: false, error: { code, message } };
  return res.status(status).json(body);
}