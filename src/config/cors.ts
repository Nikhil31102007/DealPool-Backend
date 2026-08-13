// security featurer that decides how will our api 
// communicate with other origins
import cors from "cors";

const allowedOrigins = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
];

export const corsConfig = cors({
    origin: (origin, callback) => {
        if (!origin) {
            callback(null, true);
            return;
        }

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
});