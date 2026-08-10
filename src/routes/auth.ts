import { login, logout, refresh, signUp, changePass, forgotPassword } from "../controllers/users/auth.js";
import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";

const r = Router()

r.post("/signup",signUp)
r.post("/login",login)
r.post("/logout",logout)
r.post("/tokenRefresh",refresh)
r.post("/change-password", verifyToken, changePass)
r.post("/forgot-password", verifyToken, forgotPassword)

export default r
