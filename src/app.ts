// initializing the app here we will
// import all our modules from different files and 
// initialize the server not that resuable but 
// structurally very common
import express from 'express'
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.routes"
import { errorHandler } from './middleware/error.middleware';
import { ApiResponse } from './utils/responseApi';
import { Request, Response } from "express";


const app = express();
app.use(express.json());
app.use(cookieParser()); 

app.use("/api/auth",authRoutes)

app.get("/api",(req : Request,res : Response)=>{
    const response : ApiResponse ={
        success : true,
        data : null
    } 
    return res.status(200).json({
        response
    })
    })

app.use(errorHandler)

export default app;

