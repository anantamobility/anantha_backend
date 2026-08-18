import type { Request, Response, NextFunction } from "express";
import prisma from "../../database/prismaClient.js";
import { logAudit } from "../../utils/log.js";

const userSelect = {
    id: true,
    name: true,
    email: true,
    phoneNumber: true
};

export const createEmployee = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, userId } = req.body;

        if (!name?.trim() || !userId) {
            return res.status(400).json({ message: "name and userId are required" });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const employee = await prisma.employee.create({
            data: { name: name.trim(), userId },
            include: { user: { select: userSelect } }
        });

        void logAudit({
            req,
            userId: req.user?.id!,
            userName: req.user?.name!,
            userRole: req.user?.role!,
            action: "CREATE",
            resource: "Employee",
            resourceId: employee.id,
            newData: { name: employee.name, userId: employee.userId },
            summary: `${req.user?.name} created an employee record for ${employee.name}.`
        });

        res.status(201).json({ employee });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(409).json({ message: "An employee with this name already exists" });
        }
        next(error);
    }
}

export const getEmployees = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employees = await prisma.employee.findMany({
            include: { user: { select: userSelect } }
        });
        res.json({ employees });
    } catch (error) {
        next(error);
    }
}

export const getEmployeeById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const employee = await prisma.employee.findUnique({
            where: { id },
            include: { user: { select: userSelect } }
        });
        if (!employee) {
            return res.status(404).json({ message: "Employee not found" });
        }
        res.json({ employee });
    } catch (error) {
        next(error);
    }
}

export const updateEmployee = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const { name, userId } = req.body;

        const oldEmployee = await prisma.employee.findUnique({ where: { id } });
        if (!oldEmployee) {
            return res.status(404).json({ message: "Employee not found" });
        }

        if (userId && userId !== oldEmployee.userId) {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
        }

        const employee = await prisma.employee.update({
            where: { id },
            data: {
                name: name?.trim() || oldEmployee.name,
                userId: userId || oldEmployee.userId
            },
            include: { user: { select: userSelect } }
        });

        void logAudit({
            req,
            userId: req.user?.id!,
            userName: req.user?.name!,
            userRole: req.user?.role!,
            action: "UPDATE",
            resource: "Employee",
            resourceId: employee.id,
            oldData: { name: oldEmployee.name, userId: oldEmployee.userId },
            newData: { name: employee.name, userId: employee.userId },
            summary: `${req.user?.name} updated employee ${employee.name}.`
        });

        res.json({ employee });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(409).json({ message: "An employee with this name already exists" });
        }
        next(error);
    }
}