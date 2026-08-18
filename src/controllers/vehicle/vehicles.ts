import type { Request, Response, NextFunction } from "express";
import prisma from "../../database/prismaClient.js";
import { logAudit } from "../../utils/log.js";

export const createVehicle = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { registrationNumber } = req.body;

        if (!registrationNumber?.trim()) {
            return res.status(400).json({ message: "registrationNumber is required" });
        }
        if (registrationNumber.trim().length > 10) {
            return res.status(400).json({ message: "registrationNumber must be at most 10 characters" });
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

        res.status(201).json({ vehicle });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(409).json({ message: "A vehicle with this registration number already exists" });
        }
        next(error);
    }
}

export const getVehicles = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const vehicles = await prisma.vehicle.findMany();
        res.json({ vehicles });
    } catch (error) {
        next(error);
    }
}

export const getVehicleById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const vehicle = await prisma.vehicle.findUnique({ where: { id } });
        if (!vehicle) {
            return res.status(404).json({ message: "Vehicle not found" });
        }
        res.json({ vehicle });
    } catch (error) {
        next(error);
    }
}

export const updateVehicle = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const { registrationNumber } = req.body;

        const oldVehicle = await prisma.vehicle.findUnique({ where: { id } });
        if (!oldVehicle) {
            return res.status(404).json({ message: "Vehicle not found" });
        }

        if (registrationNumber && registrationNumber.trim().length > 10) {
            return res.status(400).json({ message: "registrationNumber must be at most 10 characters" });
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

        res.json({ vehicle });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(409).json({ message: "A vehicle with this registration number already exists" });
        }
        next(error);
    }
}