// iniializing the app and configuritaions
import express from "express";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.route";
import { errorHandler } from "./middleware/error.middleware";
import { requestLogger } from "./middleware/requestlogger.middleware";

import { corsConfig } from "./config/cors";
import {
    apiRateLimiter,
    authRateLimiter,
} from "./config/ratelimit";
import adminRoutes from "./routes/admin.route";
import dealRoutes from "./routes/deal.route";
import offerRoutes from "./routes/offer.route";
import resourceRoutes from "./routes/resource.route";
import skillRoutes from "./routes/skill.route";
import transactionRoutes from "./routes/transaction.route";
import paymentRoutes from "./routes/payment.route";


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

app.use("/api/deals",dealRoutes);

app.use("/api/offers", offerRoutes);

app.use("/api/resources", resourceRoutes);

app.use("/api/skills", skillRoutes);

app.use("/api/transactions", transactionRoutes);

app.use("/api/payments", paymentRoutes);    

app.get("/api", (_req, res) => {
    res.status(200).json({
        success: true,
        data: null,
    });
});

app.use(errorHandler);

export default app;