// src/utils/http.ts
import type { Response } from "express";

export type ApiSuccessBody<T> = { success: true; data: T };
export type ApiErrorBody = { message: string };

export function success<T>(res: Response, data: T, status = 200): Response {
	const body: ApiSuccessBody<T> = { success: true, data };
	return res.status(status).json(body);
}

/**
 * Error responses stay flat and small: `{ message }`.
 * The HTTP status is the machine signal; `message` is what a human should read.
 */
export function error(res: Response, status: number, message: string): Response {
	const body: ApiErrorBody = { message };
	return res.status(status).json(body);
}
