import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.js";
import {
  closeRentalSchema,
  createRentalSchema,
  listRentalsQuerySchema,
} from "../validation/rental.js";
import {
  generateDuesSchema,
  listRentalDuesQuerySchema,
} from "../validation/collection.js";
import {
  closeRental,
  createRental,
  generateRentalDues,
  getRentalById,
  getRentalDues,
  getRentals,
} from "../controllers/rental/rental.js";

const r = Router();

r.post(
  "/",
  verifyToken,
  authorize("rental", "create"),
  validate(createRentalSchema),
  createRental
);
r.get(
  "/",
  verifyToken,
  authorize("rental", "read", { policy: false }),
  validate(listRentalsQuerySchema, "query"),
  getRentals
);

// Commented for route review + frontend integration.
// Uncomment one route at a time after review.

// Collection dues and rental collections
// r.get(
//   "/:id/dues",
//   verifyToken,
//   validate(idParamSchema, "params"),
//   authorize("rentalDue", "read", { policy: false }),
//   validate(listRentalDuesQuerySchema, "query"),
//   getRentalDues
// );

//needs deep review later
// r.post(
//   "/:id/dues/generate",
//   verifyToken,
//   validate(idParamSchema, "params"),
//   authorize("rentalDue", "generate", { policy: false }),
//   validate(generateDuesSchema),
//   generateRentalDues
// );

// Lifecycle
// r.patch(
//   "/:id/close",
//   verifyToken,
//   validate(idParamSchema, "params"),
//   authorize("rental", "close"),
//   validate(closeRentalSchema),
//   closeRental
// );

r.get(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("rental", "read"),
  getRentalById
);

export default r;
