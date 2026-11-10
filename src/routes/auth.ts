import { login, logout, refresh, signUp, changePass, forgotPassword, resetPasswordController } from "../controllers/users/auth.js";
import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { validate } from "../middleware/validate.js";
import { forgotPasswordSchema, resetPasswordSchema } from "../validation/auth.js";

const r = Router()

r.post("/signup",signUp)
r.post("/login",login)
r.post("/logout",logout)
r.post("/tokenRefresh",refresh)
r.post("/change-password", verifyToken, changePass)
r.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword)
r.post("/reset-password", validate(resetPasswordSchema), resetPasswordController)

export default r
