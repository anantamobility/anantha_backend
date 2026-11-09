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
    resource: 'rider',
    actions: [
      'create',
      'read',
      'update',
      'status:update',
      'history:read',
      'document:upload',
      'document:read',
      'document:delete',
      'verification:read',
      'verification:submit',
      'verification:review',
    ]
  },
  {
    resource: 'staff',
    actions: ['create', 'read', 'update', 'delete']
  },
  {
    resource: 'vehicle',
    actions: ['create', 'read', 'update', 'delete', 'status:update', 'history:read']
  },
  {
    resource: 'hub',
    actions: ['create', 'read', 'update', 'delete']
  },
  {
    resource: 'client',
    actions: ['create', 'read', 'update', 'status:update']
  },
  {
    resource: 'ratecard',
    actions: ['create', 'read', 'update', 'status:update']
  },
  {
    resource: 'ratecardAssignment',
    actions: ['create', 'read', 'update', 'delete']
  },
  {
    resource: 'rental',
    actions: ['create', 'read', 'update', 'assign', 'activate', 'close']
  },
  {
    resource: 'deposit',
    actions: ['read', 'receive', 'refund', 'adjust']
  },
  {
    resource: 'collection',
    actions: ['create', 'read', 'update', 'due:generate']
  }
] as const; // <--- 'as const' is CRITICAL for type safety

/** Canonical action vocabulary. Every registry action must be one of these keys. */
export const ACTION_DEFINITIONS = {
  create: "Create a new record of the resource.",
  read: "Fetch or query existing records of the resource.",
  update: "Modify an existing record of the resource.",
  delete: "Remove an existing record of the resource.",
  assign_perm: "Attach or detach permissions on a role (the 'set' operation).",
  "status:update": "Change the operational status of a resource.",
  "history:read": "Read the status change history of a resource.",
  "document:upload": "Upload a document and its metadata.",
  "document:read": "Read document metadata or securely download a document.",
  "document:delete": "Soft-delete a document and remove its stored file.",
  "verification:read": "Read verification status and verification history.",
  "verification:submit": "Submit a PVC or BGV verification for review.",
  "verification:review": "Approve or reject a PVC or BGV verification.",
  assign: "Assign a vehicle or other resource to a record.",
  activate: "Activate a record that is ready for operation.",
  close: "Close or complete an operational record.",
  receive: "Record an inbound financial receipt.",
  refund: "Record an outbound refund.",
  adjust: "Record an approved financial adjustment.",
  "due:generate": "Generate collection dues from a billing schedule.",
} as const;

// This creates a union type: "user" | "role" | "auditLog"
export type AppResource = typeof PERMISSION_REGISTRY[number]['resource'];

// This creates a union type: "create" | "read" | "update" | ...
export type AppAction = typeof PERMISSION_REGISTRY[number]['actions'][number];
