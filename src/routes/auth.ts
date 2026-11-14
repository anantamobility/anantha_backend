import {
  adminResetPassword,
  login,
  logout,
  refresh,
  signUp,
  changePass,
} from "../controllers/users/auth.js";
import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import {
  adminResetPasswordBodySchema,
  adminResetPasswordParamSchema,
} from "../validation/auth.js";

const r = Router();

r.post("/signup", signUp);
r.post("/login", login);
r.post("/logout", logout);
r.post("/tokenRefresh", refresh);
r.post("/change-password", verifyToken, changePass);
r.post(
  "/reset-password/:userId",
  verifyToken,
  validate(adminResetPasswordParamSchema, "params"),
  authorize("user", "resetPassword", { policy: false, idParam: "userId" }),
  validate(adminResetPasswordBodySchema),
  adminResetPassword
);

export default r;
