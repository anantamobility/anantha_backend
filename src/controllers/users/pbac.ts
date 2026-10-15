import type { Request, Response, NextFunction } from "express";
import prisma from "../../database/prismaClient.js";
import { logAudit } from "../../utils/log.js";
import { success, error } from "../../utils/http.js";
import { ErrorCode } from "../../utils/errors.js";

export const getRolesAndPerms = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // 1. Fetch ALL Roles with their currently assigned permissions
        // This answers: "What is checked right now?"
        const roles = await prisma.role.findMany({
            include: { permissions: true },
        });

        // 2. Fetch ALL Possible Permissions
        // This answers: "What checkboxes should exist?"
        const allPermissions = await prisma.permission.findMany({
            orderBy: { resource: "asc" }
        });

        // 3. Transform permissions into 'Entities' format for Frontend
        // Output: [{ name: "user", actions: [{name: "create", id: "123"}] }]
        const entities = allPermissions.reduce((acc: any, perm: any) => {
            const { resource, action, id } = perm;
            
            let entity = acc.find((e:any) => e.name === resource);
            if (!entity) {
                entity = { name: resource, actions: [] };
                acc.push(entity);
            }
            
            // We include ID so the frontend can send it back later
            entity.actions.push({ name: action, id: id });
            
            return acc;
        }, [] as { name: string, actions: { name: string, id: string }[] }[]);

        return success(res, { roles, entities });
        
    } catch (err) {
        next(err);
    }
}

export const updatePermsOnRole = async(req: Request, res: Response, next: NextFunction) =>{
    try {
        const { permissions: newPerms } = req.body
        const { id }  = req.params
        if (!id) return error(res, 400, ErrorCode.VALIDATION_ERROR, "Role id missing")

        // Validate payload shape: must be an array of permission id strings (empty array is valid = clear all)
        if (!Array.isArray(newPerms) || !newPerms.every((p) => typeof p === "string")) {
            return error(res, 400, ErrorCode.VALIDATION_ERROR, "Invalid payload: 'permissions' must be an array of permission id strings.");
        }

        // Verify the role exists (and capture current perms for the audit diff)
        const role = await prisma.role.findUnique({
            where: { id: id as string },
            include: { permissions: true }
        });
        if (!role) {
            return error(res, 404, ErrorCode.NOT_FOUND, "Role not found");
        }

        // Verify every permission id exists before `set` (otherwise Prisma throws P2025/P2003 -> generic 500)
        const found = await prisma.permission.findMany({
            where: { id: { in: newPerms } },
            select: { id: true }
        });
        const foundIds = new Set(found.map((p) => p.id));
        const missing = newPerms.filter((pid: string) => !foundIds.has(pid));
        if (missing.length > 0) {
            return error(res, 400, ErrorCode.VALIDATION_ERROR, `Some permission ids do not exist: ${missing.join(", ")}`);
        }

        const formattedPermIds = newPerms.map((permId: string)=>({
            id: permId
        }))

        const updated = await prisma.role.update({
            where:{
                id: id as string
            },
            data:{
                permissions: {set: formattedPermIds}
            },
            include: { permissions: true }
        })

        void logAudit({
            req,
            userId: req.user?.id!,
            userName: req.user?.name!,
            userRole: req.user?.role!,
            action: "UPDATE",
            resource: "Role",
            resourceId: role.id,
            oldData: { permissions: role.permissions.map(p => `${p.resource}:${p.action}`) },
            newData: { permissions: updated.permissions.map(p => `${p.resource}:${p.action}`) },
            summary: `${req.user?.name} updated permissions on role ${role.name}.`
        })

        return success(res, { message: "updated permissions." });
    } catch (err) {
        next(err)
    }
}

export const addRole = async(req: Request, res: Response, next: NextFunction) => {
    try {
        const { newRoleName } = req.body;
        const newRole = await prisma.role.create({
            data:{
                name: newRoleName
            }
        })
        return success(res, { newRole }, 201);
    } catch (err) {
        next(err)
    }
}
