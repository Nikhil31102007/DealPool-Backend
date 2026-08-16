import pool from "../config/db";
import type { PoolClient } from "pg";

export interface Resource {
    id: string;
    owner_id: string;
    title: string;
    description: string | null;
    category: string | null;
    condition: string | null;
    lat: number;
    lng: number;
    is_available: boolean;
    current_holder_id: string;
    created_at: Date;
    updated_at: Date;
}

const SELECT_LIST = `
    id, owner_id, title, description, category, condition,
    ST_Y(location::geometry) AS lat,
    ST_X(location::geometry) AS lng,
    is_available, current_holder_id, created_at, updated_at
`;

export const insertResource = async (params: {
    ownerId: string; title: string; description: string | null;
    category: string | null; condition: string | null;
    lat: number; lng: number;
}): Promise<Resource> => {
    const result = await pool.query(
        `
        INSERT INTO resources (
            owner_id, title, description, category, condition, location, current_holder_id
        )
        VALUES ($1, $2, $3, $4, $5, ST_MakePoint($6, $7)::geography, $1)
        RETURNING ${SELECT_LIST}
        `,
        [params.ownerId, params.title, params.description, params.category, params.condition, params.lng, params.lat]
    );
    return result.rows[0];
};

export const findResourceById = async (
    id: string,
    client?: PoolClient
): Promise<Resource | null> => {
    const executor = client ?? pool;
    const result = await executor.query(
        `SELECT ${SELECT_LIST} FROM resources WHERE id = $1`,
        [id]
    );
    return result.rows[0] ?? null;
};

export const listResourcesByOwner = async (
    ownerId: string,
    limit: number,
    offset: number
): Promise<Resource[]> => {
    const result = await pool.query(
        `
        SELECT ${SELECT_LIST}
        FROM resources
        WHERE owner_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
        `,
        [ownerId, limit, offset]
    );
    return result.rows;
};

export const countResourcesByOwner = async (ownerId: string): Promise<number> => {
    const result = await pool.query(
        `SELECT COUNT(*)::int AS count FROM resources WHERE owner_id = $1`,
        [ownerId]
    );
    return result.rows[0].count;
};

export const findNearbyResources = async (
    lat: number, lng: number, radiusKm: number, limit: number, offset: number
): Promise<(Resource & { distance_km: number })[]> => {
    const result = await pool.query(
        `
        SELECT ${SELECT_LIST},
            ST_Distance(location, ST_MakePoint($1, $2)::geography) / 1000 AS distance_km
        FROM resources
        WHERE is_available = true
          AND ST_DWithin(location, ST_MakePoint($1, $2)::geography, $3 * 1000)
        ORDER BY location <-> ST_MakePoint($1, $2)::geography
        LIMIT $4 OFFSET $5
        `,
        [lng, lat, radiusKm, limit, offset]
    );
    return result.rows;
};

export const countNearbyResources = async (
    lat: number, lng: number, radiusKm: number
): Promise<number> => {
    const result = await pool.query(
        `
        SELECT COUNT(*)::int AS count
        FROM resources
        WHERE is_available = true
          AND ST_DWithin(location, ST_MakePoint($1, $2)::geography, $3 * 1000)
        `,
        [lng, lat, radiusKm]
    );
    return result.rows[0].count;
};

export const updateResourceFields = async (
    id: string,
    fields: Record<string, unknown>
): Promise<Resource | null> => {
    const keys = Object.keys(fields);
    if (keys.length === 0) return findResourceById(id);

    const setClauses = keys.map((key, index) => `${key} = $${index + 2}`);
    const values = keys.map((key) => fields[key]);

    const result = await pool.query(
        `
        UPDATE resources
        SET ${setClauses.join(", ")}, updated_at = now()
        WHERE id = $1
        RETURNING ${SELECT_LIST}
        `,
        [id, ...values]
    );
    return result.rows[0] ?? null;
};

export const updateResourceHolder = async (
    id: string,
    newHolderId: string,
    client?: PoolClient
): Promise<Resource | null> => {
    const executor = client ?? pool;
    const result = await executor.query(
        `
        UPDATE resources
        SET current_holder_id = $2, updated_at = now()
        WHERE id = $1
        RETURNING ${SELECT_LIST}
        `,
        [id, newHolderId]
    );
    return result.rows[0] ?? null;
};

export const deleteResource = async (id: string): Promise<Resource | null> => {
    const result = await pool.query(
        `DELETE FROM resources WHERE id = $1 RETURNING ${SELECT_LIST}`,
        [id]
    );
    return result.rows[0] ?? null;
};