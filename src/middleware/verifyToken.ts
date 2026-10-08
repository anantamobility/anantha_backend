import type { Request, Response, NextFunction } from "express";
import jwt from 'jsonwebtoken'
import envConfig from "../config/env.js";
import prisma from "../database/prismaClient.js";
import { redisGet } from "../config/redis.js";

export const verifyToken = async(req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization
        
        if (!authHeader || !authHeader.startsWith("Bearer")){
            return res.status(401).json({message: "Unauthorized. middleware check failed"})
        }

        const accessToken = authHeader.split(' ')[1] as string

        const decoded = jwt.verify(accessToken, envConfig.jwtSecret) as any;

        const sessionResult = await redisGet(`session:${decoded.userId}`);

        if (!sessionResult.ok) {
            console.warn("Redis unavailable, skipping session check");
        } else if (!sessionResult.value || sessionResult.value !== decoded.sessionId) {
            return res.status(401).json({
                message: "Session expired or invalid"
            });
        }

        const userWithRole = await prisma.user.findUnique({
                where: { id: decoded.userId },
                include: {
                    role: { include: { permissions: true } }
                }
        });

        if (!userWithRole) return res.status(401).json({ message: "User no longer exists" });

        req.user = {
                id: userWithRole.id,
                name: userWithRole.name,
                role: userWithRole.role.name,
                status: userWithRole.status,
                permissions: userWithRole.role.permissions.map(p => `${p.resource}:${p.action}`),
                attributes: {}
        };
        next();   
    } catch (error: any) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: "TOKEN_EXPIRED" });
        }
        console.error("Auth Middleware Error:", error);
        return res.status(403).json({ message: "Invalid token or internal error" });
    }
}
