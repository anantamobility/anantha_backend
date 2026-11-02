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

export const createStaff = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { fullName, userId, employeeCode, phoneNumber, hubId, jobTitle } = req.body;

        if (!fullName?.trim() || !userId) {
            return error(res, 400, ErrorCode.VALIDATION_ERROR, "fullName and userId are required");
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return error(res, 404, ErrorCode.NOT_FOUND, "User not found");
        }

        const staff = await prisma.staff.create({
            data: {
                fullName: fullName.trim(),
                userId,
                employeeCode: employeeCode?.trim() || null,
                phoneNumber: phoneNumber?.trim() || null,
                hubId: hubId || null,
                jobTitle: jobTitle?.trim() || null
            },
            include: { user: { select: userSelect } }
        });

        void logAudit({
            req,
            userId: req.user?.id!,
            userName: req.user?.name!,
            userRole: req.user?.role!,
            action: "CREATE",
            resource: "Staff",
            resourceId: staff.id,
            newData: { fullName: staff.fullName, userId: staff.userId, employeeCode: staff.employeeCode },
            summary: `${req.user?.name} created a staff record for ${staff.fullName}.`
        });

        return success(res, { staff }, 201);
    } catch (err: any) {
        if (err.code === 'P2002') {
            return error(res, 409, ErrorCode.CONFLICT, "A staff member with this code or user already exists");
        }
        next(err);
    }
}

export const getStaff = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const staff = await prisma.staff.findMany({
            include: { user: { select: userSelect } }
        });
        return success(res, { staff });
    } catch (err) {
        next(err);
    }
}

export const getStaffById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const staff = await prisma.staff.findUnique({
            where: { id },
            include: { user: { select: userSelect } }
        });
        if (!staff) {
            return error(res, 404, ErrorCode.NOT_FOUND, "Staff not found");
        }
        return success(res, { staff });
    } catch (err) {
        next(err);
    }
}

export const updateStaff = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id as string;
        const { fullName, userId, employeeCode, phoneNumber, hubId, jobTitle } = req.body;

        const oldStaff = await prisma.staff.findUnique({ where: { id } });
        if (!oldStaff) {
            return error(res, 404, ErrorCode.NOT_FOUND, "Staff not found");
        }

        if (userId && userId !== oldStaff.userId) {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) {
                return error(res, 404, ErrorCode.NOT_FOUND, "User not found");
            }
        }

        const staff = await prisma.staff.update({
            where: { id },
            data: {
                fullName: fullName?.trim() || oldStaff.fullName,
                userId: userId || oldStaff.userId,
                employeeCode: employeeCode?.trim() || oldStaff.employeeCode,
                phoneNumber: phoneNumber?.trim() || oldStaff.phoneNumber,
                hubId: hubId || oldStaff.hubId,
                jobTitle: jobTitle?.trim() || oldStaff.jobTitle
            },
            include: { user: { select: userSelect } }
        });

        void logAudit({
            req,
            userId: req.user?.id!,
            userName: req.user?.name!,
            userRole: req.user?.role!,
            action: "UPDATE",
            resource: "Staff",
            resourceId: staff.id,
            oldData: { fullName: oldStaff.fullName, userId: oldStaff.userId, employeeCode: oldStaff.employeeCode },
            newData: { fullName: staff.fullName, userId: staff.userId, employeeCode: staff.employeeCode },
            summary: `${req.user?.name} updated staff ${staff.fullName}.`
        });

        return success(res, { staff });
    } catch (err: any) {
        if (err.code === 'P2002') {
            return error(res, 409, ErrorCode.CONFLICT, "A staff member with this code or user already exists");
        }
        next(err);
    }
}
