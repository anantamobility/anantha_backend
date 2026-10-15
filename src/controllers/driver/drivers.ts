import type { Request, Response, NextFunction } from "express";
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

export const createDriver = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, userId } = req.body;

        if (!name?.trim() || !userId) {
            return error(res, 400, ErrorCode.VALIDATION_ERROR, "name and userId are required");
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return error(res, 404, ErrorCode.NOT_FOUND, "User not found");
        }

        const driver = await prisma.driver.create({
            data: { name: name.trim(), userId },
            include: { user: { select: userSelect } }
        });

        void logAudit({
            req,
            userId: req.user?.id!,
            userName: req.user?.name!,
            userRole: req.user?.role!,
            action: "CREATE",
            resource: "Driver",
            resourceId: driver.id,
            newData: { name: driver.name, userId: driver.userId },
            summary: `${req.user?.name} created a driver record for ${driver.name}.`
        });

        return success(res, { driver }, 201);
    } catch (err: any) {
        if (err.code === 'P2002') {
            return error(res, 409, ErrorCode.CONFLICT, "A driver with this name already exists");
        }
        next(err);
    }
}

export const getDrivers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const drivers = await prisma.driver.findMany({
            include: { user: { select: userSelect } }
        });
        return success(res, { drivers });
    } catch (err) {
        next(err);
    }
}

export const getDriverById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const driver = await prisma.driver.findUnique({
            where: { id },
            include: { user: { select: userSelect } }
        });
        if (!driver) {
            return error(res, 404, ErrorCode.NOT_FOUND, "Driver not found");
        }
        return success(res, { driver });
    } catch (err) {
        next(err);
    }
}

export const updateDriver = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const { name, userId } = req.body;

        const oldDriver = await prisma.driver.findUnique({ where: { id } });
        if (!oldDriver) {
            return error(res, 404, ErrorCode.NOT_FOUND, "Driver not found");
        }

        if (userId && userId !== oldDriver.userId) {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) {
                return error(res, 404, ErrorCode.NOT_FOUND, "User not found");
            }
        }

        const driver = await prisma.driver.update({
            where: { id },
            data: {
                name: name?.trim() || oldDriver.name,
                userId: userId || oldDriver.userId
            },
            include: { user: { select: userSelect } }
        });

        void logAudit({
            req,
            userId: req.user?.id!,
            userName: req.user?.name!,
            userRole: req.user?.role!,
            action: "UPDATE",
            resource: "Driver",
            resourceId: driver.id,
            oldData: { name: oldDriver.name, userId: oldDriver.userId },
            newData: { name: driver.name, userId: driver.userId },
            summary: `${req.user?.name} updated driver ${driver.name}.`
        });

        return success(res, { driver });
    } catch (err: any) {
        if (err.code === 'P2002') {
            return error(res, 409, ErrorCode.CONFLICT, "A driver with this name already exists");
        }
        next(err);
    }
}