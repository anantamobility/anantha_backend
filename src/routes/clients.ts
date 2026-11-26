import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.js";
import { changeClientStatusSchema, clientContractParamsSchema, createClientContractSchema, createClientSchema, listClientsQuerySchema, updateClientContractSchema, updateClientSchema } from "../validation/client.js";
import { generateClientDuesSchema, listClientCollectionsQuerySchema, listClientDuesQuerySchema } from "../validation/clientFinance.js";
import { changeClientStatus, createClient, createClientContract, deleteClient, getClientById, getClients, updateClient, updateClientContract } from "../controllers/client/client.controller.js";
import { generateClientDues, getClientCollections, getClientDues, getClientFinancials } from "../controllers/client/client-finance.controller.js";

const r = Router();

r.post("/", verifyToken, authorize("client", "create"), validate(createClientSchema), createClient);
r.get("/", verifyToken, authorize("client", "read", { policy: false }), validate(listClientsQuerySchema, "query"), getClients);
r.get("/:id", verifyToken, validate(idParamSchema, "params"), authorize("client", "read"), getClientById);
r.patch("/:id", verifyToken, validate(idParamSchema, "params"), authorize("client", "update"), validate(updateClientSchema), updateClient);
r.delete("/:id", verifyToken, validate(idParamSchema, "params"), authorize("client", "delete"), deleteClient);
r.patch("/:id/status", verifyToken, validate(idParamSchema, "params"), authorize("client", "status:update"), validate(changeClientStatusSchema), changeClientStatus);
r.post("/:id/contract", verifyToken, validate(idParamSchema, "params"), authorize("client", "update"), validate(createClientContractSchema), createClientContract);
r.patch("/:id/contracts/:contractId", verifyToken, validate(clientContractParamsSchema, "params"), authorize("client", "update"), validate(updateClientContractSchema), updateClientContract);


// Commented for route review + frontend integration.

// r.get("/:id/financials", verifyToken, validate(idParamSchema, "params"), authorize("client", "read", { policy: false }), getClientFinancials);
r.get("/:id/dues", verifyToken, validate(idParamSchema, "params"), authorize("rentalDue", "read", { policy: false }), validate(listClientDuesQuerySchema, "query"), getClientDues);
r.get("/:id/collections", verifyToken, validate(idParamSchema, "params"), authorize("collection", "read", { policy: false }), validate(listClientCollectionsQuerySchema, "query"), getClientCollections);

// used for bulk due generation.
//r.post("/:id/dues/generate", verifyToken, validate(idParamSchema, "params"), authorize("rentalDue", "generate", { policy: false }), validate(generateClientDuesSchema), generateClientDues);




export default r;
