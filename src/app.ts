import express, { type Request, type Response } from 'express'
import morgan from 'morgan'
import globalErrorHandler from './middleware/errorHandler.js'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import './config/redis.js';

import authRouter from './routes/auth.js'
import pbacRouter from './routes/pbac.js'
import ridersRouter from './routes/riders.js'
import staffRouter from './routes/staff.js'
import vehiclesRouter from './routes/vehicles.js'
import hubsRouter from './routes/hubs.js'
import clientsRouter from './routes/clients.js'
import ratecardsRouter from './routes/ratecards.js'
import ratecardAssignmentsRouter from './routes/ratecardAssignments.js'
import rentalsRouter from './routes/rentals.js'
import collectionsRouter from './routes/collections.js'

const app = express()
app.use(express.json({limit: '1mb'}))
app.use(cookieParser())
app.use(morgan('dev'))

const options = {
    origin: ['http://localhost:8080', 'http://localhost:5173'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};
app.use(cors(options))

app.use("/auth", authRouter)
app.use("/pbac", pbacRouter)
app.use("/riders", ridersRouter)
app.use("/staff", staffRouter)
app.use("/vehicles", vehiclesRouter)
app.use("/hubs", hubsRouter)
app.use("/clients", clientsRouter)
app.use("/ratecards", ratecardsRouter)
app.use("/ratecard-assignments", ratecardAssignmentsRouter)
app.use("/rentals", rentalsRouter)
app.use("/collections", collectionsRouter)

app.use(globalErrorHandler)

app.get("/health",(req:Request,res:Response)=>{
    res.json({message:"server healthy."})
})

export default app;
