import pool from "../config/db";
import type { PoolClient } from "pg";

export interface Deal {
    id: string;
    user_id: string;
    title: string;
    description: string | null;
    category: string | null;
    budget_min: number | null;
    budget_max: number | null;
    lat: number;
    lng: number;
    radius_km: number;
    status: "open" | "offer_accepted" | "completed" | "cancelled";
    resource_id: string | null;
    skill_id: string | null;
    created_at: Date;
    updated_at: Date;
}

const SELECT_LIST = `
    id,
    user_id,
    title,
    description,
    category,
    budget_min,
    budget_max,
    ST_Y(location::geometry) AS lat,
    ST_X(location::geometry) AS lng,
    radius_km,
    status,
    resource_id,
    skill_id,
    created_at,
    updated_at
`;

export const insertDeal = async (params: {
    userId: string;
    title: string;
    description: string | null;
    category: string | null;
    budgetMin: number | null;
    budgetMax: number | null;
    lat: number;
    lng: number;
    radiusKm: number;
    resourceId?: string | null;
    skillId?: string | null;
}): Promise<Deal> => {
    const result = await pool.query(
        `
        INSERT INTO deals (
            user_id, title, description, category,
            budget_min, budget_max, location, radius_km
            , resource_id, skill_id
        )
        VALUES (
            $1, $2, $3, $4, $5, $6,
            ST_MakePoint($7, $8)::geography, $9,
            $10, $11
        )
        RETURNING ${SELECT_LIST}
        `,
        [
            params.userId,
            params.title,
            params.description,
            params.category,
            params.budgetMin,
            params.budgetMax,
            params.lng,
            params.lat,
            params.radiusKm,
            params.resourceId ?? null,
            params.skillId ?? null,
        ]
    );

    return result.rows[0];
};

export const findDealById = async (
    id: string,
    client?: PoolClient
): Promise<Deal | null> => {
    const executor = client ?? pool;
    const result = await executor.query(
        // FOR UPDATE locks the row for the duration of the transaction —
        // serializes concurrent offer accepts on the same deal so only the
        // first sees status = 'open'. Outside a transaction it's a no-op.
        `SELECT ${SELECT_LIST} FROM deals WHERE id = $1${client ? " FOR UPDATE" : ""}`,
        [id]
    );

    return result.rows[0] ?? null;
};

export const listDeals = async (
    filters: { category?: string; status?: string },
    limit: number,
    offset: number
): Promise<Deal[]> => {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters.category) {
        values.push(filters.category);
        conditions.push(`category = $${values.length}`);
    }

    if (filters.status) {
        values.push(filters.status);
        conditions.push(`status = $${values.length}`);
    }

    const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    values.push(limit);
    const limitIndex = values.length;

    values.push(offset);
    const offsetIndex = values.length;

    const result = await pool.query(
        `
        SELECT ${SELECT_LIST}
        FROM deals
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${limitIndex} OFFSET $${offsetIndex}
        `,
        values
    );

    return result.rows;
};

export const findNearbyDeals = async (
    lat: number,
    lng: number,
    radiusKm: number,
    limit: number,
    offset: number
): Promise<(Deal & { distance_km: number })[]> => {
    const result = await pool.query(
        `
        SELECT
            ${SELECT_LIST},
            ST_Distance(location, ST_MakePoint($1, $2)::geography) / 1000 AS distance_km
        FROM deals
        WHERE status = 'open'
          AND ST_DWithin(location, ST_MakePoint($1, $2)::geography, $3 * 1000)
        ORDER BY location <-> ST_MakePoint($1, $2)::geography
        LIMIT $4 OFFSET $5
        `,
        [lng, lat, radiusKm, limit, offset]
    );

    return result.rows;
};

export const updateDealFields = async (
    id: string,
    fields: Record<string, unknown>
): Promise<Deal | null> => {
    const keys = Object.keys(fields);

    if (keys.length === 0) {
        return findDealById(id);
    }

    const setClauses = keys.map((key, index) => `${key} = $${index + 2}`);
    const values = keys.map((key) => fields[key]);

    const result = await pool.query(
        `
        UPDATE deals
        SET ${setClauses.join(", ")}, updated_at = now()
        WHERE id = $1
        RETURNING ${SELECT_LIST}
        `,
        [id, ...values]
    );

    return result.rows[0] ?? null;
};

export const updateDealStatus = async (
    id: string,
    status: string,
    client?: PoolClient
): Promise<Deal | null> => {
    const executor = client ?? pool;

    const result = await executor.query(
        `
        UPDATE deals
        SET status = $2, updated_at = now()
        WHERE id = $1
        RETURNING ${SELECT_LIST}
        `,
        [id, status]
    );

    return result.rows[0] ?? null;
};

export const deleteDeal = async (id: string): Promise<Deal | null> => {
    const result = await pool.query(
        `DELETE FROM deals WHERE id = $1 RETURNING ${SELECT_LIST}`,
        [id]
    );

    return result.rows[0] ?? null;
};