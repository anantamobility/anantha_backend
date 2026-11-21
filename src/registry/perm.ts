export type PermissionDef = {
  resource: string;
  actions: string[];
  description?: string;
};

export const PERMISSION_REGISTRY = [
  {
    resource: 'user',
    actions: ['create', 'read', 'update', 'delete', 'role:assign', 'status:update', 'session:revoke', 'resetPassword']
  },
  {
    resource: 'role',
    actions: ['read', 'create', 'edit', 'assign_perm', 'delete']
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
      'delete',
      'status:update',
      'document:upload',
      'document:read',
      'document:delete',
    ]
  },
  {
    resource: 'staff',
    actions: ['create', 'read', 'update', 'delete']
  },
  {
    resource: 'vehicle',
    actions: ['create', 'read', 'update', 'delete', 'status:update']
  },
  {
    resource: 'hub',
    actions: ['create', 'read', 'update', 'delete']
  },
  {
    resource: 'client',
    actions: ['create', 'read', 'update', 'delete', 'status:update']
  },
  {
    resource: 'rateCard',
    actions: ['create', 'read', 'update', 'delete', 'status:update']
  },
  {
    resource: 'rental',
    actions: ['create', 'read', 'update', 'assign', 'activate', 'close']
  },
  {
    resource: 'rentalDue',
    actions: ['read', 'generate']
  },
  {
    resource: 'deposit',
    actions: ['read', 'receive', 'refund', 'adjust']
  },
  {
    resource: 'collection',
    actions: ['create', 'read']
  },
  {
    resource: 'ledgerEntry',
    actions: ['create', 'read', 'adjust']
  },
  {
    resource: 'riderPayStatement',
    actions: ['generate', 'read', 'approve', 'pay', 'reconcile']
  },
  {
    resource: 'service',
    actions: [
      'create',
      'read',
      'update',
      'start',
      'await-parts',
      'resume',
      'complete',
      'close',
      'cancel',
      'approve-responsibility',
      'assign-replacement',
      'return-replacement',
      'charge:manage',
    ]
  },
  {
    resource: 'sparePart',
    actions: ['create', 'read', 'update', 'status:update']
  },
  {
    resource: 'inventoryMovement',
    actions: [
      'read',
      'opening-stock',
      'stock-in',
      'adjust',
      'consume',
      'return',
      'damage',
    ]
  },
  {
    resource: 'dashboard',
    actions: ['read'],
  },
  {
    resource: 'report',
    actions: ['read'],
  }
] as const; // <--- 'as const' is CRITICAL for type safety

/** Canonical action vocabulary. Every registry action must be one of these keys. */
export const ACTION_DEFINITIONS = {
  create: "Create a new record of the resource.",
  read: "Fetch or query existing records of the resource.",
  update: "Modify an existing record of the resource.",
  delete: "Remove an existing record of the resource.",
  assign_perm: "Attach or detach permissions on a role (the 'set' operation).",
  edit: "Rename or relabel an existing record without changing its meaning.",
  "role:assign": "Assign or change the role of a user account.",
  "session:revoke": "Revoke all active sessions and refresh tokens for a user.",
  resetPassword: "Administratively reset another user's password.",
  "status:update": "Change the operational status of a resource.",
  "document:upload": "Upload a document and its metadata.",
  "document:read": "Read document metadata or securely download a document.",
  "document:delete": "Soft-delete a document and remove its stored file.",
  assign: "Assign a vehicle or other resource to a record.",
  activate: "Activate a record that is ready for operation.",
  close: "Close or complete an operational record.",
  receive: "Record an inbound financial receipt.",
  refund: "Record an outbound refund.",
  adjust: "Record an approved financial adjustment.",
  generate: "Generate a derived financial record such as a pay statement.",
  approve: "Approve a pending financial record.",
  pay: "Disburse a payable financial record.",
  reconcile: "Reconcile or reverse a financial record after verification.",
  start: "Start work on a service order and begin vehicle downtime.",
  complete: "Complete service work and restore the vehicle.",
  cancel: "Cancel a service order and release any downtime it holds.",
  "await-parts": "Place an in-progress service order into the awaiting-parts state.",
  resume: "Resume service work after awaiting parts.",
  "approve-responsibility": "Investigate and approve damage responsibility for a service order.",
  "assign-replacement": "Assign a replacement vehicle while the original is in service.",
  "return-replacement": "Return a replacement vehicle and finalize replacement billing.",
  "charge:manage": "Record or update service charges and cost components.",
  "opening-stock": "Record opening stock for a spare at a hub.",
  "stock-in": "Record purchased or inward stock for a spare.",
  consume: "Consume spare parts against a service order.",
  return: "Return unused spare parts from a service order to stock.",
  damage: "Write off damaged spare stock.",
} as const;

// This creates a union type: "user" | "role" | "auditLog"
export type AppResource = typeof PERMISSION_REGISTRY[number]['resource'];

// This creates a union type: "create" | "read" | "update" | ...
export type AppAction = typeof PERMISSION_REGISTRY[number]['actions'][number];
