import type { Request, Response, NextFunction } from "express";
import prisma from "../../database/prismaClient.js";
import { logAudit } from "../../utils/log.js";
import { error , success } from "../../utils/http.js";
import { ErrorCode } from "../../utils/errors.js";

export const createVehicle = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { registrationNumber } = req.body;

        if (!registrationNumber?.trim()) {
            return error(res, 400, ErrorCode.VALIDATION_ERROR, "registrationNumber is required");
        }
        if (registrationNumber.trim().length > 10) {
            return error(res, 400, ErrorCode.VALIDATION_ERROR, "registrationNumber must be at most 10 characters");
        }

        const vehicle = await prisma.vehicle.create({
            data: { registrationNumber: registrationNumber.trim() }
        });

        void logAudit({
            req,
            userId: req.user?.id!,
            userName: req.user?.name!,
            userRole: req.user?.role!,
            action: "CREATE",
            resource: "Vehicle",
            resourceId: vehicle.id,
            newData: { registrationNumber: vehicle.registrationNumber },
            summary: `${req.user?.name} created vehicle ${vehicle.registrationNumber}.`
        });

        return success(res, { vehicle } , 201);
    } catch (err: any) {
        if (err.code === 'P2002') {
            return error(res, 409, ErrorCode.CONFLICT, "A vehicle with this registration number already exists");
        }
        next(err);
    }
}

export const getVehicles = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const vehicles = await prisma.vehicle.findMany();
        return success(res, { vehicles });
    } catch (err) {
        next(err);
    }
}

export const getVehicleById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const vehicle = await prisma.vehicle.findUnique({ where: { id } });
        if (!vehicle) {
            return error(res, 404, ErrorCode.NOT_FOUND, "Vehicle not found")
        }
        return success(res, { vehicle });
    } catch (err) {
        next(err);
    }
}

export const updateVehicle = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const { registrationNumber } = req.body;

        const oldVehicle = await prisma.vehicle.findUnique({ where: { id } });
        if (!oldVehicle) {
            return error(res, 404, ErrorCode.NOT_FOUND, "Vehicle not found");
        }

        if (registrationNumber && registrationNumber.trim().length > 10) {
            return error(res, 400, ErrorCode.VALIDATION_ERROR, "registrationNumber must be at most 10 characters");
        }

        const vehicle = await prisma.vehicle.update({
            where: { id },
            data: { registrationNumber: registrationNumber?.trim() || oldVehicle.registrationNumber }
        });

        void logAudit({
            req,
            userId: req.user?.id!,
            userName: req.user?.name!,
            userRole: req.user?.role!,
            action: "UPDATE",
            resource: "Vehicle",
            resourceId: vehicle.id,
            oldData: { registrationNumber: oldVehicle.registrationNumber },
            newData: { registrationNumber: vehicle.registrationNumber },
            summary: `${req.user?.name} updated vehicle ${vehicle.registrationNumber}.`
        });

        return success(res, { vehicle });
    } catch (err: any) {
        if (err.code === 'P2002') {
            return error(res, 409, ErrorCode.CONFLICT, "A vehicle with this registration number already exists");
        }
        next(err);
    }
}