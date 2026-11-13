import prisma from "../database/prismaClient.js";
import type { Request } from "express";
import type { Prisma } from "../generated/prisma/client.js";
import type { UserContext } from "../types/express.js";
import { AppError, ErrorCode } from "./errors.js";

export interface AuditActor {
  req: Request;
  user: UserContext;
  userId: string;
  userName: string;
  userRole: string;
}

/**
 * Builds the audit actor from the authenticated request. Routes using audit
 * logging must run verifyToken first.
 */
export function getAuditActor(req: Request): AuditActor {
  const user = req.user;
  if (!user) {
    throw new AppError("Unauthenticated audit actor", 401, ErrorCode.UNAUTHORIZED);
  }
  return {
    req,
    user,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
  };
}

interface AuditParams {
  req: Request;          // Pass full request to extract IP/UserAgent
  userId: string;        // The actor (Admin/Manager ID)
  userName: string,
  userRole: string,
  action: string;        // 'UPDATE', 'CREATE', 'DELETE', 'APPROVE', etc.
  resource: string;      // 'user', 'role'
  resourceId: string;    // ID of the target resource
  oldData?: any;         // State BEFORE change (pass null for Create)
  newData?: any;         // State AFTER change (pass null for Delete)
  status?: 'SUCCESS' | 'FAILURE';
  summary: string;
  db?: Prisma.TransactionClient; // Transaction client, so audit commits with the change
  throwOnError?: boolean;        // When true, audit failures roll back the transaction
}

export const logAudit = async({
    req,
    userId,
    userName,
    userRole,
    action,
    resource,
    resourceId,
    oldData,
    newData,
    status = 'SUCCESS',
    summary,
    db = prisma,
    throwOnError = false
}: AuditParams) =>{
    try {
        let changes: any = {}

        if(action==='UPDATE' && oldData && newData){
            Object.keys(newData).forEach( (key) => {
                const oldVal = oldData[key];
                const newVal = newData[key];

                if (key === 'updatedAt' || key === 'createdAt') return;

                if( JSON.stringify(oldVal) !== JSON.stringify(newVal) ){
                    changes[key] = {
                        old: oldVal ?? null,
                        new: newVal ?? null
                    }
                }
            })
            if (Object.keys(changes).length === 0) changes = "No field changes detected";
        } else {
            if (oldData) changes.old = oldData;
            if (newData) changes.new = newData;
        }

        const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
        const userAgent = req.get('User-Agent') || 'Unknown';
        await db.auditLog.create({
            data: {
              userId,
              userName,
              userRole,
              action,
              resource,
              resourceId,
              ipAddress,
              userAgent,
              status,
              changes: changes,
              summary
            }
        });

    } catch (error) {
        console.error("FAILED TO LOG AUDIT:", error);
        if (throwOnError) throw error;
    }
}
