import type { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;

    // FIX: Manually restore the prototype chain
    Object.setPrototypeOf(this, new.target.prototype);

    Error.captureStackTrace(this, this.constructor);
  }
}

function globalErrorHandler(err: any ,req: Request, res: Response, next: NextFunction) {
  console.error('Global error handler:', err.message, " ", err.stack);
 
  let message = 'Internal Server Error'
  const statusCode = err.statusCode || 500;

  if (err instanceof AppError) {
    message = err.message;
  }

  res.status(statusCode).json({
    success: false,
    error: {
      status: statusCode,
      message: message,
    },
  })
} 

export default globalErrorHandler
