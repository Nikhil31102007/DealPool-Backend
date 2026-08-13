import rateLimit from "express-rate-limit";

export const apiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1000,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        error: {
            message: "Too many requests",
            code: "RATE_LIMIT_EXCEEDED",
        },
    },
});

export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        error: {
            message: "Too many authentication attempts",
            code: "AUTH_RATE_LIMIT_EXCEEDED",
        },
    },
});