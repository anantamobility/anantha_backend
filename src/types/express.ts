import type { UserContext } from "./user.js";

declare global {
  namespace Express {
    interface Request {
      user?: UserContext;
      resource?: unknown;
    }
  }
}

declare module "express-serve-static-core" {
  interface Request {
    user?: UserContext;
    resource?: unknown;
  }
}

export type { UserContext };
