import type { NextFunction, Request, Response } from "express";
import prisma from "../../database/prismaClient.js";
import { ErrorCode } from "../../utils/errors.js";
import { error, success } from "../../utils/http.js";
import { getAuditActor, logAudit } from "../../utils/log.js";
import type {
	AssignRolePermissionsInput,
	CreateRoleInput,
	RenameRoleInput,
} from "../../validation/pbac.js";

type PermissionEntity = { name: string; actions: { name: string; id: string }[] };

const permissionKey = (permission: { resource: string; action: string }) => `${permission.resource}:${permission.action}`;

const isDuplicate = (err: unknown) => typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";

export const getRolesAndPerms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const [roles, permissions] = await Promise.all([
			prisma.role.findMany({ include: { permissions: true }, orderBy: { name: "asc" } }),
			prisma.permission.findMany({ orderBy: [{ resource: "asc" }, { action: "asc" }] }),
		]);

		const entities: PermissionEntity[] = [];
		for (const permission of permissions) {
			let entity = entities.find((candidate) => candidate.name === permission.resource);
			if (!entity) {
				entity = { name: permission.resource, actions: [] };
				entities.push(entity);
			}
			entity.actions.push({ name: permission.action, id: permission.id });
		}

		success(res, { roles, entities });
	} catch (err) {
		next(err);
	}
};

export const updatePermsOnRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const roleId = req.params.id as string;
		const { permissions } = req.body as AssignRolePermissionsInput;
		const actor = getAuditActor(req);

		const role = await prisma.role.findUnique({
			where: { id: roleId },
			include: { permissions: true },
		});
		if (!role) {
			error(res, 404, ErrorCode.NOT_FOUND, "Role not found");
			return;
		}

		const known = await prisma.permission.findMany({
			where: { id: { in: permissions } },
			select: { id: true },
		});
		const knownIds = new Set(known.map((permission) => permission.id));
		const missing = permissions.filter((permissionId) => !knownIds.has(permissionId));
		if (missing.length > 0) {
			error(res, 400, ErrorCode.VALIDATION_ERROR, `Unknown permission ids: ${missing.join(", ")}`);
			return;
		}

		const updated = await prisma.role.update({
			where: { id: roleId },
			data: { permissions: { set: permissions.map((id) => ({ id })) } },
			include: { permissions: true },
		});

		await logAudit({
			...actor,
			action: "UPDATE",
			resource: "Role",
			resourceId: role.id,
			oldData: { permissions: role.permissions.map(permissionKey) },
			newData: { permissions: updated.permissions.map(permissionKey) },
			summary: `${actor.userName} updated permissions on role ${role.name}.`,
		});

		success(res, { role: updated });
	} catch (err) {
		next(err);
	}
};

export const addRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const { newRoleName } = req.body as CreateRoleInput;
		const actor = getAuditActor(req);

		const role = await prisma.role.create({ data: { name: newRoleName } });

		await logAudit({
			...actor,
			action: "CREATE",
			resource: "Role",
			resourceId: role.id,
			newData: { name: role.name },
			summary: `${actor.userName} created role ${role.name}.`,
		});

		success(res, { role }, 201);
	} catch (err) {
		if (isDuplicate(err)) {
			error(res, 409, ErrorCode.CONFLICT, "A role with this name already exists");
			return;
		}
		next(err);
	}
};

export const renameRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const roleId = req.params.id as string;
		const { name } = req.body as RenameRoleInput;
		const actor = getAuditActor(req);

		const role = await prisma.role.findUnique({
			where: { id: roleId },
			select: { id: true, name: true },
		});
		if (!role) {
			error(res, 404, ErrorCode.NOT_FOUND, "Role not found");
			return;
		}

		if (role.name === name) {
			success(res, { role });
			return;
		}

		const updated = await prisma.role.update({
			where: { id: role.id },
			data: { name },
		});

		await logAudit({
			...actor,
			action: "UPDATE",
			resource: "Role",
			resourceId: role.id,
			oldData: { name: role.name },
			newData: { name: updated.name },
			summary: `${actor.userName} renamed role ${role.name} to ${updated.name}.`,
		});

		success(res, { role: updated });
	} catch (err) {
		if (isDuplicate(err)) {
			error(res, 409, ErrorCode.CONFLICT, "A role with this name already exists");
			return;
		}
		next(err);
	}
};
