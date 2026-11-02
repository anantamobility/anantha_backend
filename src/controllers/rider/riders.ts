import type { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import prisma from "../../database/prismaClient.js";
import { logAudit } from "../../utils/log.js";
import { success, error } from "../../utils/http.js";
import { ErrorCode } from "../../utils/errors.js";

const userSelect = {
    id: true,
    name: true,
    email: true,
    phoneNumber: true
};

function generateRiderCode() {
    return `RDR-${uuidv4().slice(0, 8).toUpperCase()}`;
}

export const createRider = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { fullName, userId, riderCode, phoneNumber, hubId } = req.body;

        if (!fullName?.trim() || !userId) {
            return error(res, 400, ErrorCode.VALIDATION_ERROR, "fullName and userId are required");
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return error(res, 404, ErrorCode.NOT_FOUND, "User not found");
        }

        const rider = await prisma.rider.create({
            data: {
                fullName: fullName.trim(),
                userId,
                riderCode: riderCode?.trim() || generateRiderCode(),
                phoneNumber: phoneNumber?.trim() || null,
                hubId: hubId || null
            },
            include: { user: { select: userSelect } }
        });

        void logAudit({
            req,
            userId: req.user?.id!,
            userName: req.user?.name!,
            userRole: req.user?.role!,
            action: "CREATE",
            resource: "Rider",
            resourceId: rider.id,
            newData: { fullName: rider.fullName, userId: rider.userId, riderCode: rider.riderCode },
            summary: `${req.user?.name} created a rider record for ${rider.fullName}.`
        });

        return success(res, { rider }, 201);
    } catch (err: any) {
        if (err.code === 'P2002') {
            return error(res, 409, ErrorCode.CONFLICT, "A rider with this code or user already exists");
        }
        next(err);
    }
}

export const getRiders = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const riders = await prisma.rider.findMany({
            include: { user: { select: userSelect } }
        });
        return success(res, { riders });
    } catch (err) {
        next(err);
    }
}

export const getRiderById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const rider = await prisma.rider.findUnique({
            where: { id },
            include: { user: { select: userSelect } }
        });
        if (!rider) {
            return error(res, 404, ErrorCode.NOT_FOUND, "Rider not found");
        }
        return success(res, { rider });
    } catch (err) {
        next(err);
    }
}

export const updateRider = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const { fullName, userId, riderCode, phoneNumber, hubId } = req.body;

        const oldRider = await prisma.rider.findUnique({ where: { id } });
        if (!oldRider) {
            return error(res, 404, ErrorCode.NOT_FOUND, "Rider not found");
        }

        if (userId && userId !== oldRider.userId) {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) {
                return error(res, 404, ErrorCode.NOT_FOUND, "User not found");
            }
        }

        const rider = await prisma.rider.update({
            where: { id },
            data: {
                fullName: fullName?.trim() || oldRider.fullName,
                userId: userId || oldRider.userId,
                riderCode: riderCode?.trim() || oldRider.riderCode,
                phoneNumber: phoneNumber?.trim() || oldRider.phoneNumber,
                hubId: hubId || oldRider.hubId
            },
            include: { user: { select: userSelect } }
        });

        void logAudit({
            req,
            userId: req.user?.id!,
            userName: req.user?.name!,
            userRole: req.user?.role!,
            action: "UPDATE",
            resource: "Rider",
            resourceId: rider.id,
            oldData: { fullName: oldRider.fullName, userId: oldRider.userId, riderCode: oldRider.riderCode },
            newData: { fullName: rider.fullName, userId: rider.userId, riderCode: rider.riderCode },
            summary: `${req.user?.name} updated rider ${rider.fullName}.`
        });

        return success(res, { rider });
    } catch (err: any) {
        if (err.code === 'P2002') {
            return error(res, 409, ErrorCode.CONFLICT, "A rider with this code or user already exists");
        }
        next(err);
    }
}
