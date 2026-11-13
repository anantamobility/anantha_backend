import type { NextFunction, Request, Response } from "express"
import bcrypt from "bcryptjs"
import prisma from "../../database/prismaClient.js"
import jwt from 'jsonwebtoken'
import envConfig from "../../config/env.js"
import { v4 as uuidv4 } from "uuid";
import { redisGet, redisSet, redisDel } from "../../config/redis.js";
import { validatePasswordStrength } from "../../validation/auth.js";
import { logAudit } from "../../utils/log.js";

const isProd = envConfig.nodeEnv === "prod";
const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
};

export const signUp = async(req: Request,res: Response, next: NextFunction) => {
    try {
        const {fullName, phone, password} = req.body

        if (!fullName?.trim() || !password) {
            return res.status(400).json({message: "fullname or password missing"})
        }
        if (!phone || phone.length !== 10 || isNaN(Number(phone))) {
            return res.status(400).json({ message: "Invalid phone number. It must be exactly 10 digits." });
        }

        const hashedPassword = await bcrypt.hash(password,10)

        const newUser = await prisma.$transaction(async (tx) => {
            const supervisorRole = await tx.role.findUnique({ 
                where: { name: 'SUPERVISOR' } 
            });

            if (!supervisorRole) {
                throw new Error("System Error: 'SUPERVISOR' role not found. Please seed the database.");
            }

            const user = await tx.user.create({
                data: {
                    name: fullName.trim(),
                    phoneNumber: phone,
                    passwordHash: hashedPassword,
                    status: 'ACTIVE',
                    role: { 
                        connect: { id: supervisorRole.id } 
                    }
                },
                include: { role: true } 
            });

            return user
        });
        console.log('Created user:', newUser)

        const sessionId = uuidv4();
        const sessionSaved = await redisSet(
            `session:${newUser.id}`,
            sessionId,
            604800
        );

        if (!sessionSaved) {
            console.warn("Redis unavailable: signup session was not persisted");
        }
        
        const accessToken = jwt.sign(
            { userId: String(newUser?.id), role: String(newUser?.role.name), sessionId }, 
            envConfig.jwtSecret,
            {expiresIn:"4h"}
        )

        const refreshToken = jwt.sign(
            { userId: String(newUser?.id), sessionId },
            envConfig.jwtRefreshSecret,
            {expiresIn:"7d"}
        )
        res
        .cookie('refresh_token', refreshToken, cookieOptions)
        .json({ 
            accessToken: accessToken,
            refreshToken,
            user:{
                name: newUser.name,
                email: newUser.email,
                phoneNumber: newUser.phoneNumber,
                role: newUser.role.name,
                status: newUser.status
            } 
        })

    } catch (error) {
        if ((error as any).code === 'P2002') {
            return res.status(409).json({ message: "Account with this phoneNumber already exists" });
        }
        next(error)
    }
}

export const login = async(req: Request, res: Response, next: NextFunction) => {
    try {
        const {phone, password} = req.body

        if (!phone || !password) {
             return res.status(400).json({ message: "phone number and password are required" });
        }
        const user = await prisma.user.findUnique({
            where: { phoneNumber: phone },
            include:{
                role: true
            },
        })

        // Generic error message prevents malicious user enumeration
        if(!user){
            res
            .status(404)
            .json({message:`Invalid phone number or password.`})
            return
        }

        if (user.deletedAt || user.status !== "ACTIVE") {
            res.status(403).json({ message: "Account is not active. Contact an administrator." })
            return
        }

        const isMatch = await bcrypt.compare(password,String(user?.passwordHash))
        if(!isMatch){
            await logAudit({
                req,
                userId: user.id,
                userName: user.name,
                userRole: user.role.name,
                action: "LOGIN_FAILED",
                resource: "User",
                resourceId: user.id,
                status: "FAILURE",
                summary: `Failed login attempt for user ${user.name}.`,
                throwOnError: false,
            });
            res
            .status(404)
            .json({message: `Invalid phone number or password.`})
            return
        }
        const sessionId = uuidv4();
        const sessionSaved = await redisSet(
            `session:${user.id}`,
            sessionId,
            604800
        );

        if (!sessionSaved) {
            console.warn("Redis unavailable: login session was not persisted");
        }

        await logAudit({
            req,
            userId: user.id,
            userName: user.name,
            userRole: user.role.name,
            action: "LOGIN",
            resource: "User",
            resourceId: user.id,
            summary: `User ${user.name} signed in.`,
            throwOnError: false,
        });
        const accessToken = jwt.sign(
            { userId: String(user?.id), role: String(user?.role.name), sessionId: sessionId }, 
            envConfig.jwtSecret,
            {expiresIn:"4h"}
        )

        const refreshToken = jwt.sign(
            { userId: String(user?.id), sessionId: sessionId },
            envConfig.jwtRefreshSecret,
            {expiresIn:"7d"}
        )
        res
        .cookie('refresh_token', refreshToken, cookieOptions)
        .json({
            accessToken: accessToken,
            refreshToken,
            user:{           
                name: user.name,
                email: user.email,
                phoneNumber: user.phoneNumber,
                role: user.role.name,
                status: user.status
            }
        })
    }catch (error) {
        next(error)
    }
}

export const refresh = async(req: Request, res: Response, next: NextFunction) => {
    // cookie takes priority (web), body is fallback (mobile)
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken
    if(!refreshToken) return res.status(401).json({message: "Unauthorized. refresh token not found"})

    try {
        const decoded = jwt.verify(refreshToken, envConfig.jwtRefreshSecret) as { userId: string, sessionId: string };

        const sessionResult = await redisGet(`session:${decoded.userId}`);

        if (!sessionResult.ok) {
            console.warn("Redis unavailable: skipping session check during refresh");
        } else if (
            !sessionResult.value ||
            sessionResult.value !== decoded.sessionId
        ) {
            res.clearCookie("refresh_token", cookieOptions);

            return res.status(403).json({
                message: "Session expired or logged in elsewhere."
            });
        }
        const foundUser = await prisma.user.findUnique({
            where: { id: decoded.userId },
            include:{role: true}
        });

        if (!foundUser || foundUser.deletedAt) {
            return res.status(401).json({ message: "Unauthorized: User not found" });
        }
        if (foundUser.status !== "ACTIVE") {
            return res.status(403).json({ message: "Account is not active" });
        }

        const accessToken = jwt.sign(
            { 
                userId: String(foundUser.id), 
                role: String(foundUser.role.name),
                sessionId: decoded.sessionId
            },
            envConfig.jwtSecret,
            { expiresIn: "4h" }
        );

        res.json({ 
            accessToken,
            user:{
                name: foundUser.name,
                email: foundUser.email,
                phoneNumber: foundUser.phoneNumber,
                role: foundUser.role.name,
                status: foundUser.status
            } 
        });
    } catch (error) {
        return res.status(403).json({ message: "Forbidden: Invalid or Expired Token" });
    }
    
}

export const logout = async(req: Request, res: Response)=>{
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken
    if(!refreshToken) return res.sendStatus(204)

    try {
        const decoded = jwt.verify(refreshToken, envConfig.jwtRefreshSecret) as { userId: string }
        const deleted = await redisDel(`session:${decoded.userId}`);

        if (!deleted) {
            console.warn("Redis unavailable: logout session could not be invalidated");
        }

        const loggedOutUser = await prisma.user.findUnique({
            where: { id: decoded.userId },
            include: { role: true },
        });
        if (loggedOutUser) {
            await logAudit({
                req,
                userId: loggedOutUser.id,
                userName: loggedOutUser.name,
                userRole: loggedOutUser.role.name,
                action: "LOGOUT",
                resource: "User",
                resourceId: loggedOutUser.id,
                summary: `User ${loggedOutUser.name} signed out.`,
                throwOnError: false,
            });
        }
    } catch {
        // token expired/invalid — nothing to invalidate
    }

    res.clearCookie('refresh_token', cookieOptions)

    res.json({message:"cookie is cleared. user is logged out."})
}

export const changePass = async(req: Request, res: Response,next: NextFunction) => {
    try {
        const {oldpassword, newPassword} = req.body
        if (!newPassword) {
            return res.status(400).json({ message: "New password is required." });
        }
        const strengthError = validatePasswordStrength(newPassword);
        if (strengthError) {
            return res.status(400).json({ message: strengthError });
        }
        const userId = req.user?.id
        if(!userId) return res.status(404).json({message: "user id not found. Unauthorized."})
        
        const foundUser = await prisma.user.findUnique({ where: { id: userId }})
        if (!foundUser) return res.status(401).json({message: "user not found. Unauthorized."})
        const isMatch = await bcrypt.compare(oldpassword, foundUser?.passwordHash)

        if(isMatch){
            const hashedNewPassword = await bcrypt.hash(newPassword,10)
            await prisma.user.update({
                where:{
                    id: userId
                },
                data:{
                    passwordHash: hashedNewPassword
                }
            })

            const deleted = await redisDel(`session:${userId}`);

            if (!deleted) {
                console.warn("Redis unavailable: password-change session could not be invalidated");
            }

            await logAudit({
                req,
                userId: userId!,
                userName: foundUser.name,
                userRole: req.user?.role ?? "UNKNOWN",
                action: "PASSWORD_CHANGE",
                resource: "User",
                resourceId: userId!,
                summary: `User ${foundUser.name} changed their password.`,
                throwOnError: false,
            });

            res.status(200).json({message: "password updated"})
        }else{
            res.status(400).json({message:"old password is wrong. Enter current password correctly."})
        }

    } catch (error) {
        next(error)
    }
}
