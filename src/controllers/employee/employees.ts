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

export const createEmployee = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, userId } = req.body;

        if (!name?.trim() || !userId) {
            return error(res, 400, ErrorCode.VALIDATION_ERROR, "name and userId are required");
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return error(res, 404, ErrorCode.NOT_FOUND, "User not found");
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

        return success(res, { employee }, 201);
    } catch (err: any) {
        if (err.code === 'P2002') {
            return error(res, 409, ErrorCode.CONFLICT, "An employee with this name already exists");
        }
        next(err);
    }
}

export const getEmployees = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const employees = await prisma.employee.findMany({
            include: { user: { select: userSelect } }
        });
        return success(res, { employees });
    } catch (err) {
        next(err);
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
            return error(res, 404, ErrorCode.NOT_FOUND, "Employee not found");
        }
        return success(res, { employee });
    } catch (err) {
        next(err);
    }
}

export const updateEmployee = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const { name, userId } = req.body;

        const oldEmployee = await prisma.employee.findUnique({ where: { id } });
        if (!oldEmployee) {
            return error(res, 404, ErrorCode.NOT_FOUND, "Employee not found");
        }

        if (userId && userId !== oldEmployee.userId) {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) {
                return error(res, 404, ErrorCode.NOT_FOUND, "User not found");
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

        return success(res, { employee });
    } catch (err: any) {
        if (err.code === 'P2002') {
            return error(res, 409, ErrorCode.CONFLICT, "An employee with this name already exists");
        }
        next(err);
    }
}