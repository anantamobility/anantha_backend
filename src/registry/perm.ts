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
  }
] as const; // <--- 'as const' is CRITICAL for type safety

// This creates a union type: "user" | "role" | "auditLog"
export type AppResource = typeof PERMISSION_REGISTRY[number]['resource'];

// This creates a union type: "create" | "read" | "update" | ...
export type AppAction = typeof PERMISSION_REGISTRY[number]['actions'][number];
