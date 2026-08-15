// runs every .sql file in /migrations that hasn't been applied yet,
// in filename order, tracked via a schema_migrations table
import { readdir, readFile } from "fs/promises";
import path from "path";
import pool from "../src/config/db";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

const ensureMigrationsTable = async (): Promise<void> => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS public.schema_migrations (
            name text NOT NULL,
            applied_at timestamp with time zone NOT NULL DEFAULT now(),
            CONSTRAINT schema_migrations_pkey PRIMARY KEY (name)
        )
    `);
};

const getAppliedMigrations = async (): Promise<Set<string>> => {
    const result = await pool.query(
        `SELECT name FROM public.schema_migrations`
    );

    return new Set(result.rows.map((row) => row.name as string));
};

const getMigrationFiles = async (): Promise<string[]> => {
    const files = await readdir(MIGRATIONS_DIR);

    return files
        .filter((file) => file.endsWith(".sql"))
        .sort();
};

const runMigration = async (
    fileName: string
): Promise<void> => {
    const filePath = path.join(MIGRATIONS_DIR, fileName);
    const sql = await readFile(filePath, "utf-8");

    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
            `INSERT INTO public.schema_migrations (name) VALUES ($1)`,
            [fileName]
        );
        await client.query("COMMIT");

        console.log(`applied ${fileName}`);
    } catch (error) {
        await client.query("ROLLBACK");

        console.error(`failed ${fileName}`);

        throw error;
    } finally {
        client.release();
    }
};

const migrate = async (): Promise<void> => {
    await ensureMigrationsTable();

    const [applied, files] = await Promise.all([
        getAppliedMigrations(),
        getMigrationFiles(),
    ]);

    const pending = files.filter(
        (file) => !applied.has(file)
    );

    if (pending.length === 0) {
        console.log("No pending migrations. Database is up to date.");
        await pool.end();
        return;
    }

    console.log(`Found ${pending.length} pending migration(s):`);
    pending.forEach((file) => console.log(`  - ${file}`));
    console.log("");

    for (const file of pending) {
        await runMigration(file);
    }

    console.log("\nAll migrations applied successfully.");

    await pool.end();
};

migrate().catch((error) => {
    console.error("Migration run failed:", error);
    process.exit(1);
});