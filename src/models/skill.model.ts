import pool from "../config/db";
import type { PoolClient } from "pg";

export interface Skill {
    id: string;
    user_id: string;
    name: string;
    description: string | null;
    category: string | null;
    is_available: boolean;
    created_at: Date;
    updated_at: Date;
}

const SELECT_LIST = `
    id,
    user_id,
    name,
    description,
    category,
    is_available,
    created_at,
    updated_at
`;

export const insertSkill = async (params: {
    userId: string;
    name: string;
    description: string | null;
    category: string | null;
}): Promise<Skill> => {
    const result = await pool.query(
        `
        INSERT INTO skills (user_id, name, description, category)
        VALUES ($1, $2, $3, $4)
        RETURNING ${SELECT_LIST}
        `,
        [params.userId, params.name, params.description, params.category]
    );
    return result.rows[0];
};

export const findSkillById = async (
    id: string,
    client?: PoolClient
): Promise<Skill | null> => {
    const executor = client ?? pool;
    const result = await executor.query(
        `SELECT ${SELECT_LIST} FROM skills WHERE id = $1`,
        [id]
    );
    return result.rows[0] ?? null;
};

export const listSkillsByUser = async (
    userId: string,
    limit: number,
    offset: number
): Promise<Skill[]> => {
    const result = await pool.query(
        `
        SELECT ${SELECT_LIST}
        FROM skills
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
        `,
        [userId, limit, offset]
    );
    return result.rows;
};

export const countSkillsByUser = async (userId: string): Promise<number> => {
    const result = await pool.query(
        `SELECT COUNT(*)::int AS count FROM skills WHERE user_id = $1`,
        [userId]
    );
    return result.rows[0].count;
};

export const updateSkillFields = async (
    id: string,
    fields: Record<string, unknown>
): Promise<Skill | null> => {
    const keys = Object.keys(fields);
    if (keys.length === 0) return findSkillById(id);

    const setClauses = keys.map((key, index) => `${key} = $${index + 2}`);
    const values = keys.map((key) => fields[key]);

    const result = await pool.query(
        `
        UPDATE skills
        SET ${setClauses.join(", ")}, updated_at = now()
        WHERE id = $1
        RETURNING ${SELECT_LIST}
        `,
        [id, ...values]
    );
    return result.rows[0] ?? null;
};

export const deleteSkill = async (id: string): Promise<Skill | null> => {
    const result = await pool.query(
        `DELETE FROM skills WHERE id = $1 RETURNING ${SELECT_LIST}`,
        [id]
    );
    return result.rows[0] ?? null;
};