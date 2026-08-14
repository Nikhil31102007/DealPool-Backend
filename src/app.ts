// iniializing the app and configuritaions
import express from "express";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.routes";
import { errorHandler } from "./middleware/error.middleware";
import { requestLogger } from "./middleware/requestlogger.middleware";

import { corsConfig } from "./config/cors";
import {
    apiRateLimiter,
    authRateLimiter,
} from "./config/ratelimit";
import adminRoutes from "./routes/admin.routes";

const app = express();
app.use(corsConfig);
app.use(express.json());
app.use(cookieParser());

app.use(requestLogger);

app.use(apiRateLimiter);

app.use(
    "/api/auth",
    authRateLimiter,
    authRoutes
);

app.use("/api/admin", adminRoutes);

app.get("/api", (_req, res) => {
    res.status(200).json({
        success: true,
        data: null,
    });
});

app.use(errorHandler);

export default app;