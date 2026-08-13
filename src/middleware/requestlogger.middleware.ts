// logger is a record of all requests made in a 
// consize way it contains status code id and routes to know
//  what routes are running on the server by which ip
import { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";

const logDir = path.join(process.cwd(), "logs");
const logFile = path.join(logDir, "requests.log");

fs.mkdirSync(logDir, { recursive: true });

console.log("Request logger initialized");
console.log("Log file:", logFile);

export const requestLogger = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    console.log("REQUEST LOGGER HIT");

    const start = Date.now();

    res.on("finish", () => {
        const duration = Date.now() - start;

        const log = [
            `[${new Date().toISOString()}]`,
            req.method,
            req.originalUrl,
            res.statusCode,
            `${duration}ms`,
            `IP=${req.ip}`,
        ].join(" ");

        console.log(log);

        try {
            fs.appendFileSync(
                logFile,
                log + "\n",
                "utf8"
            );
        } catch (error) {
            console.error(
                "FAILED TO WRITE REQUEST LOG:",
                error
            );
        }
    });

    next();
};