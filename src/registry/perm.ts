export type PermissionDef = {
  resource: string;
  actions: string[];
  description?: string;
};

export const PERMISSION_REGISTRY = [
  {
    resource: 'user',
    actions: ['create','read', 'update', 'delete']
  },
  {
    resource: 'role',
    actions: ['read', 'create', 'assign_perm', 'delete']
  },
  {
    resource: 'auditLog',
    actions: ['read']
  },
  {
    resource: 'driver',
    actions: ['create', 'read', 'update']
  },
  {
    resource: 'employee',
    actions: ['create', 'read', 'update']
  },
  {
    resource: 'vehicle',
    actions: ['create', 'read', 'update']
  }
] as const; // <--- 'as const' is CRITICAL for type safety

/** Canonical action vocabulary. Every registry action must be one of these keys. */
export const ACTION_DEFINITIONS = {
  create: "Create a new record of the resource.",
  read: "Fetch or query existing records of the resource.",
  update: "Modify an existing record of the resource.",
  delete: "Remove an existing record of the resource.",
  assign_perm: "Attach or detach permissions on a role (the 'set' operation).",
} as const;

// This creates a union type: "user" | "role" | "auditLog"
export type AppResource = typeof PERMISSION_REGISTRY[number]['resource'];

// This creates a union type: "create" | "read" | "update" | ...
export type AppAction = typeof PERMISSION_REGISTRY[number]['actions'][number];
