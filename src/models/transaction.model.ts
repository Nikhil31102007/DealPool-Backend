import pool from "../config/db";
import type { PoolClient } from "pg";

export interface Transaction {
    id: string;
    deal_id: string;
    offer_id: string;
    from_user_id: string;
    to_user_id: string;
    resource_id: string | null;
    skill_id: string | null;
    parent_transaction_id: string | null;
    status: "agreement_created" | "confirmed" | "active" | "completed" | "disputed" | "cancelled";
    checked_out_at: Date | null;
    returned_at: Date | null;
    completed_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export const insertTransaction = async (
    params: {
        dealId: string;
        offerId: string;
        fromUserId: string;
        toUserId: string;
        resourceId: string | null;
        skillId: string | null;
        parentTransactionId: string | null;
    },
    client?: PoolClient
): Promise<Transaction> => {
    const executor = client ?? pool;
    const result = await executor.query(
        `
        INSERT INTO transactions (
            deal_id, offer_id, from_user_id, to_user_id,
            resource_id, skill_id, parent_transaction_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        `,
        [
            params.dealId, params.offerId, params.fromUserId, params.toUserId,
            params.resourceId, params.skillId, params.parentTransactionId,
        ]
    );
    return result.rows[0];
};

export const findTransactionById = async (
    id: string,
    client?: PoolClient
): Promise<Transaction | null> => {
    const executor = client ?? pool;
    const result = await executor.query(
        `SELECT * FROM transactions WHERE id = $1`,
        [id]
    );
    return result.rows[0] ?? null;
};

export const findLatestTransactionForResource = async (
    resourceId: string,
    client?: PoolClient
): Promise<Transaction | null> => {
    const executor = client ?? pool;
    const result = await executor.query(
        `
        SELECT * FROM transactions
        WHERE resource_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [resourceId]
    );
    return result.rows[0] ?? null;
};

// Walks the chain oldest -> newest via a recursive CTE on parent_transaction_id
export const findTransactionChainByResource = async (
    resourceId: string
): Promise<Transaction[]> => {
    const result = await pool.query(
        `
        WITH RECURSIVE chain AS (
            SELECT * FROM transactions
            WHERE resource_id = $1 AND parent_transaction_id IS NULL

            UNION ALL

            SELECT t.* FROM transactions t
            INNER JOIN chain c ON t.parent_transaction_id = c.id
        )
        SELECT * FROM chain ORDER BY created_at ASC
        `,
        [resourceId]
    );
    return result.rows;
};

export const updateTransactionStatus = async (
    id: string,
    status: string,
    client?: PoolClient
): Promise<Transaction | null> => {
    const executor = client ?? pool;
    const result = await executor.query(
        `
        UPDATE transactions
        SET status = $2, updated_at = now()
        WHERE id = $1
        RETURNING *
        `,
        [id, status]
    );
    return result.rows[0] ?? null;
};