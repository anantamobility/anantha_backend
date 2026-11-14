import express, { type Request, type Response } from 'express'
import morgan from 'morgan'
import globalErrorHandler from './middleware/errorHandler.js'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import './config/redis.js';
import './types/express.js';
import envConfig from "./config/env.js"

import authRouter from './routes/auth.js'
import usersRouter from './routes/users.js'
import auditLogsRouter from './routes/auditLogs.js'
import pbacRouter from './routes/pbac.js'
import ridersRouter from './routes/riders.js'
import staffRouter from './routes/staff.js'
import vehiclesRouter from './routes/vehicles.js'
import hubsRouter from './routes/hubs.js'
import clientsRouter from './routes/clients.js'
import ratecardsRouter from './routes/ratecards.js'
import rentalsRouter from './routes/rentals.js'
import collectionsRouter from './routes/collections.js'
import earningsRouter from './routes/earnings.js'
import payStatementsRouter from './routes/payStatements.js'
import payoutsRouter from './routes/payouts.js'
import servicesRouter from './routes/services.js'
import sparesRouter from './routes/spares.js'
import inventoryRouter from './routes/inventory.js'
import dashboardRouter from './routes/dashboard.js'
import reportsRouter from './routes/reports.js'

const app = express()
app.use(express.json({limit: '1mb'}))
app.use(cookieParser())
app.use(morgan('dev'))

const options = {
    origin: ['http://localhost:8080', 'http://localhost:5173', envConfig.frontendUrl],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};
app.use(cors(options))

app.use("/auth", authRouter)
app.use("/users", usersRouter)
app.use("/audit-logs", auditLogsRouter)
app.use("/pbac", pbacRouter)
app.use("/riders", ridersRouter)
app.use("/staff", staffRouter)
app.use("/vehicles", vehiclesRouter)
app.use("/hubs", hubsRouter)
app.use("/clients", clientsRouter)
app.use("/ratecards", ratecardsRouter)
app.use("/rentals", rentalsRouter)
app.use("/collections", collectionsRouter)
app.use("/earnings", earningsRouter)
app.use("/pay-statements", payStatementsRouter)
app.use("/payouts", payoutsRouter)
app.use("/services", servicesRouter)
app.use("/spares", sparesRouter)
app.use("/inventory", inventoryRouter)
app.use("/dashboard", dashboardRouter)
app.use("/reports", reportsRouter)

app.use(globalErrorHandler)

app.get("/health",(req:Request,res:Response)=>{
    res.json({message:"server healthy."})
})

export default app;
