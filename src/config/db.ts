import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

export const connectDB = async (): Promise<void> => {
    try {
        const client = await pool.connect();
        client.release();

        console.log("PostgreSQL connected");
    } catch (error) {
        console.error(
            "PostgreSQL connection failed:",
            error
        );

        process.exit(1);
    }
};

export default pool;