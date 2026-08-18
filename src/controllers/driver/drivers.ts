import type { Request, Response, NextFunction } from "express";
import prisma from "../../database/prismaClient.js";
import { logAudit } from "../../utils/log.js";

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
            return res.status(400).json({ message: "name and userId are required" });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
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

        res.status(201).json({ driver });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(409).json({ message: "A driver with this name already exists" });
        }
        next(error);
    }
}

export const getDrivers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const drivers = await prisma.driver.findMany({
            include: { user: { select: userSelect } }
        });
        res.json({ drivers });
    } catch (error) {
        next(error);
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
            return res.status(404).json({ message: "Driver not found" });
        }
        res.json({ driver });
    } catch (error) {
        next(error);
    }
}

export const updateDriver = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const { name, userId } = req.body;

        const oldDriver = await prisma.driver.findUnique({ where: { id } });
        if (!oldDriver) {
            return res.status(404).json({ message: "Driver not found" });
        }

        if (userId && userId !== oldDriver.userId) {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) {
                return res.status(404).json({ message: "User not found" });
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

        res.json({ driver });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(409).json({ message: "A driver with this name already exists" });
        }
        next(error);
    }
}