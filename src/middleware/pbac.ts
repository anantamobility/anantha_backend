import type { Request, Response, NextFunction } from "express";
import prisma from "../database/prismaClient.js";
import { type AppResource, type AppAction } from "../registry/perm.js";
import { PolicyRegistry } from "../registry/policy.js";
import { getModelDelegate } from "../registry/models.js";
import { error } from "../utils/http.js";
import { ErrorCode } from "../utils/errors.js";


interface AuthOptions {
    policy?: boolean;      // If false, skips DB fetch & policy check (Use for Lists). Default: true
    idParam?: string;      // Name of the route param (e.g., 'tripId'). Default: 'id'
    lookupField?: string;  // DB column to search (e.g., 'userId'). Default: 'id'
}

export const authorize = (
    resource: AppResource, 
    action: AppAction, 
    options: AuthOptions = {}
) => {
    // Set Defaults
    const { 
        policy = true,       // Default: Always check policy unless told otherwise
        idParam = 'id', 
        lookupField = 'id' 
    } = options;

    return async (req: Request, res: Response, next: NextFunction) => {
        const user = req.user;
        if (!user) {
            // Optional: Allow OPTIONS requests to pass through without auth
            if (req.method === 'OPTIONS') return next();
            
            return error(res, 401, ErrorCode.UNAUTHORIZED, "Unauthorized: No user found");
        }

        // ---------------------------------------------------------
        // 1. RBAC CHECK (Always runs)
        // Checks: "Does this role have the 'trip:read' string?"
        // ---------------------------------------------------------
        const permissionString = `${resource}:${action}`;
        if (!user.permissions.includes(permissionString)) {
            return error(res, 403, ErrorCode.FORBIDDEN, `Forbidden: Missing ${permissionString}`);
        }

        // If policy is disabled (e.g., for "Get All Trips"), stop here.
        if (!policy) {
            return next();
        }

        // ---------------------------------------------------------
        // 2. CONTEXT PREPARATION (PBAC)
        // ---------------------------------------------------------
        let contextData: any = null;

        // CASE A: CREATE (Context is req.body)
        if (action === 'create') {
            contextData = req.body;
        } 
        
        // CASE B: READ/UPDATE/DELETE (Context is DB Record)
        else {
            let resourceId = req.params[idParam];

            // [Smart Self-Lookup]: If no ID in URL, try using the User's ID
            // Useful for /profile routes where the ID is implied
            if (!resourceId && user) {
                if (lookupField === 'userId') resourceId = user.id; // looking for profile by userId
                else if (resource === 'user') resourceId = user.id; // looking for user by id
            }

            if (!resourceId) {
                // If we reached here, we needed an ID for a policy check but didn't find one.
                console.log(`Missing ID parameter: ${idParam}`)
                return error(res, 400, ErrorCode.VALIDATION_ERROR, `Missing ID parameter: ${idParam}`);
            }

            // Dynamic DB Fetch
            const modelDelegate = getModelDelegate(resource);
            if (!modelDelegate) {
                return error(res, 400, ErrorCode.VALIDATION_ERROR, "Unknown resource");
            }

            contextData = await modelDelegate.findFirst({
                where: { [lookupField]: resourceId }
            });

            if (!contextData) {
              console.log(`${resource} not found, in pbac check.`)
              return error(res, 404, ErrorCode.NOT_FOUND, `${resource} not found`);
            }
        }

        // ---------------------------------------------------------
        // 3. POLICY CHECK
        // Checks: "Is this specific record allowed for this user?"
        // ---------------------------------------------------------
        const policyHandler = PolicyRegistry[resource]?.[action];
        
        if (policyHandler) {
            const isAllowed = policyHandler(user, contextData);
            if (!isAllowed) {
                return error(res, 403, ErrorCode.FORBIDDEN,
                    `Policy violation: You cannot ${action} this specific ${resource}.`
                );
            }
        }

        // 4. ATTACH CONTEXT (Optimization)
        // We attach this so your Controller doesn't have to fetch the same data again.
        if (action !== 'create') {
            req.resource = contextData;
        }

        next();
    };
};
