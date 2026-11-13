import type { Request, Response, NextFunction } from "express";
import "../types/express.js";
import jwt from 'jsonwebtoken'
import envConfig from "../config/env.js";
import prisma from "../database/prismaClient.js";
import { redisGet } from "../config/redis.js";
import { error } from "../utils/http.js";
import { ErrorCode } from "../utils/errors.js";

export const verifyToken = async(req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization
        
        if (!authHeader || !authHeader.startsWith("Bearer")){
            return error(res, 401, ErrorCode.UNAUTHORIZED, "Unauthorized. middleware check failed")
        }

        const accessToken = authHeader.split(' ')[1] as string

        const decoded = jwt.verify(accessToken, envConfig.jwtSecret) as any;

        const sessionResult = await redisGet(`session:${decoded.userId}`);

        if (!sessionResult.ok) {
            console.warn("Redis unavailable, skipping session check");
        } else if (!sessionResult.value || sessionResult.value !== decoded.sessionId) {
            return error(res, 401, ErrorCode.UNAUTHORIZED, "Session expired or invalid");
        }

        const userWithRole = await prisma.user.findUnique({
                where: { id: decoded.userId },
                include: {
                    role: { include: { permissions: true } },
                    staffProfile: { select: { id: true, hubId: true } }
                }
        });

        if (!userWithRole || userWithRole.deletedAt) {
            return error(res, 401, ErrorCode.UNAUTHORIZED, "User no longer exists");
        }
        if (userWithRole.status !== "ACTIVE") {
            return error(res, 403, ErrorCode.FORBIDDEN, "Account is not active");
        }

        req.user = {
                id: userWithRole.id,
                name: userWithRole.name,
                role: userWithRole.role.name,
                status: userWithRole.status,
                permissions: userWithRole.role.permissions.map(p => `${p.resource}:${p.action}`),
                attributes: {
                    hubId: userWithRole.staffProfile?.hubId ?? null,
                }
        };
        next();   
    } catch (err: any) {
        if (err.name === 'TokenExpiredError') {
            return error(res, 401, ErrorCode.UNAUTHORIZED, "TOKEN_EXPIRED");
        }
        console.error("Auth Middleware Error:", err);
        return error(res, 403, ErrorCode.FORBIDDEN, "Invalid token or internal error");
    }
}
