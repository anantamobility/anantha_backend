import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as userService from "../../services/user.js";
import type {
  AssignUserRoleInput,
  ChangeUserStatusInput,
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
} from "../../validation/user.js";

export const createUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await userService.createUser(
      req.body as CreateUserInput,
      getAuditActor(req)
    );
    return success(res, { user }, 201);
  } catch (err) {
    next(err);
  }
};

export const getUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await userService.listUsers(
      req.query as unknown as ListUsersQuery,
      req.user
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getUserById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await userService.getUserById(
      req.params.id as string,
      req.user
    );
    return success(res, { user });
  } catch (err) {
    next(err);
  }
};

export const updateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await userService.updateUser(
      req.params.id as string,
      req.body as UpdateUserInput,
      getAuditActor(req)
    );
    return success(res, { user });
  } catch (err) {
    next(err);
  }
};

export const assignUserRole = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await userService.assignUserRole(
      req.params.id as string,
      req.body as AssignUserRoleInput,
      getAuditActor(req)
    );
    return success(res, { user });
  } catch (err) {
    next(err);
  }
};

export const changeUserStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await userService.changeUserStatus(
      req.params.id as string,
      req.body as ChangeUserStatusInput,
      getAuditActor(req)
    );
    return success(res, { user });
  } catch (err) {
    next(err);
  }
};

export const revokeUserSessions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await userService.revokeUserSessions(
      req.params.id as string,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const deleteUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await userService.deleteUser(
      req.params.id as string,
      getAuditActor(req)
    );
    return success(res, { message: "User deleted successfully" });
  } catch (err) {
    next(err);
  }
};
