// using them at the last of our app will save 
// us from random crashes it is just an middleware
// that runs on every request sent onto our app.ts 
// using this  if it is an instance of the error class
//  we made and defined  we get where an error occurs
// it is a modular code can be reused anytime wanted  

import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors";
import type { ApiResponse } from "../utils/responseApi";

export const errorHandler = (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
): void => {
    console.error(err);

    if (err instanceof AppError) {
        const response: ApiResponse = {
            success: false,
            error: {
                code: err.code,
                message: err.message
            }
        };

        res.status(err.statusCode).json(response);
        return;
    }

    const response: ApiResponse = {
        success: false,
        error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Internal server error"
        }
    };

    res.status(500).json(response);
};