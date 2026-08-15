import pool from "../config/db";
import type { UserRole } from "../utils/types";

export interface Profile {
    id: string;
    firebase_uid: string;
    username: string;
    email: string;
    profile_photo: string | null;
    role: UserRole;
    avg_rating: string;
    rating_count: number;
    created_at: Date;
    updated_at: Date;
}

export const findProfileByFirebaseUid = async (
    uid: string
): Promise<Profile | null> => {
    const result = await pool.query(
        `SELECT * FROM profiles WHERE firebase_uid = $1`,
        [uid]
    );
    return result.rows[0] ?? null;
};

export const findProfileByEmail = async (
    email: string
): Promise<Profile | null> => {
    const result = await pool.query(
        `SELECT * FROM profiles WHERE email = $1`,
        [email]
    );
    return result.rows[0] ?? null;
};

export const findProfileById = async (
    id: string
): Promise<Profile | null> => {
    const result = await pool.query(
        `SELECT * FROM profiles WHERE id = $1`,
        [id]
    );
    return result.rows[0] ?? null;
};

export const insertProfile = async (params: {
    firebaseUid: string;
    username: string;
    email: string | null;
    profilePhoto: string | null;
}): Promise<Profile> => {
    const result = await pool.query(
        `
        INSERT INTO profiles (firebase_uid, username, email, profile_photo)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        `,
        [params.firebaseUid, params.username, params.email, params.profilePhoto]
    );
    return result.rows[0];
};

/**
 * Called from auth.service.ts's updateProfile() with req.user!.uid, which is
 * the POSTGRES profiles.id (per authMiddleware) — NOT the firebase_uid.
 * Must match on id, not firebase_uid.
 */
export const updateProfileFields = async (
    id: string,
    fields: Record<string, unknown>
): Promise<Profile | null> => {
    const keys = Object.keys(fields);
    if (keys.length === 0) return findProfileById(id);

    const setClauses = keys.map((key, index) => `${key} = $${index + 2}`);
    const values = keys.map((key) => fields[key]);

    const result = await pool.query(
        `
        UPDATE profiles
        SET ${setClauses.join(", ")}, updated_at = now()
        WHERE id = $1
        RETURNING *
        `,
        [id, ...values]
    );

    return result.rows[0] ?? null;
};

export const listProfiles = async (
    limit: number,
    offset: number
): Promise<Profile[]> => {
    const result = await pool.query(
        `SELECT * FROM profiles ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
    );
    return result.rows;
};

export const updateProfileRole = async (
    id: string,
    role: UserRole
): Promise<Profile | null> => {
    const result = await pool.query(
        `UPDATE profiles SET role = $2, updated_at = now() WHERE id = $1 RETURNING *`,
        [id, role]
    );
    return result.rows[0] ?? null;
};

export const deleteProfile = async (
    id: string
): Promise<Profile | null> => {
    const result = await pool.query(
        `DELETE FROM profiles WHERE id = $1 RETURNING *`,
        [id]
    );
    return result.rows[0] ?? null;
};