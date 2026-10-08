import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { createEmployee, getEmployees, getEmployeeById, updateEmployee } from "../controllers/employee/employees.js"

const r = Router()

r.post("/", verifyToken, authorize("employee", "create"), createEmployee)
r.get("/", verifyToken, authorize("employee", "read", { policy: false }), getEmployees)
r.get("/:id", verifyToken, authorize("employee", "read"), getEmployeeById)
r.put("/:id", verifyToken, authorize("employee", "update"), updateEmployee)

export default r