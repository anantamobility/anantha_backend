import express, { type Request, type Response } from 'express'
import morgan from 'morgan'
import globalErrorHandler from './middleware/errorHandler.js'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import './config/redis.js';

import authRouter from './routes/auth.js'
import pbacRouter from './routes/pbac.js'

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

app.use(globalErrorHandler)

app.get("/health",(req:Request,res:Response)=>{
    res.json({message:"server healthy."})
})

export default app;
