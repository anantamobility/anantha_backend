import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { reportHandler } from "../controllers/reports.js";
import {
  b2bReportQuerySchema,
  b2cReportQuerySchema,
  collectionsReportQuerySchema,
  hubReportQuerySchema,
  inventoryReportQuerySchema,
  riderReportQuerySchema,
  serviceReportQuerySchema,
  sparesReportQuerySchema,
  staffReportQuerySchema,
  vehicleReportQuerySchema,
} from "../validation/reports.js";
import { collectionsReport } from "../services/reports/collections.js";
import { hubReport } from "../services/reports/hub.js";
import { b2bReport, b2cReport } from "../services/reports/rentals.js";
import { riderReport } from "../services/reports/rider.js";
import { vehicleReport } from "../services/reports/vehicle.js";
import { serviceReport } from "../services/reports/service.js";
import { sparesReport } from "../services/reports/spares.js";
import { inventoryReport } from "../services/reports/inventory.js";
import { staffReport } from "../services/reports/staff.js";

const r = Router();

function reportRoute(path: string, schema: Parameters<typeof validate>[0], service: Parameters<typeof reportHandler>[0]) {
  r.get(
    path,
    verifyToken,
    authorize("report", "read", { policy: false }),
    validate(schema, "query"),
    reportHandler(service)
  );
}

reportRoute("/collections", collectionsReportQuerySchema, collectionsReport);
reportRoute("/hubs", hubReportQuerySchema, hubReport);
reportRoute("/b2c", b2cReportQuerySchema, b2cReport);
reportRoute("/b2b", b2bReportQuerySchema, b2bReport);
reportRoute("/riders", riderReportQuerySchema, riderReport);
reportRoute("/vehicles", vehicleReportQuerySchema, vehicleReport);
reportRoute("/services", serviceReportQuerySchema, serviceReport);
reportRoute("/spares", sparesReportQuerySchema, sparesReport);
reportRoute("/inventory", inventoryReportQuerySchema, inventoryReport);
reportRoute("/staff", staffReportQuerySchema, staffReport);

export default r;
