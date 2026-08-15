import pool from "../config/db";
import type { PoolClient } from "pg";

export interface Offer {
    id: string;
    deal_id: string;
    provider_id: string;
    price: number | null;
    terms: string | null;
    status: "pending" | "accepted" | "rejected" | "withdrawn";
    created_at: Date;
    updated_at: Date;
}

export const insertOffer = async (params: {
    dealId: string;
    providerId: string;
    price: number | null;
    terms: string | null;
}): Promise<Offer> => {
    const result = await pool.query(
        `
        INSERT INTO offers (deal_id, provider_id, price, terms)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        `,
        [params.dealId, params.providerId, params.price, params.terms]
    );

    return result.rows[0];
};

export const findOfferById = async (
    id: string,
    client?: PoolClient
): Promise<Offer | null> => {
    const executor = client ?? pool;

    const result = await executor.query(
        `SELECT * FROM offers WHERE id = $1`,
        [id]
    );

    return result.rows[0] ?? null;
};

export const listOffersForDeal = async (
    dealId: string
): Promise<Offer[]> => {
    const result = await pool.query(
        `SELECT * FROM offers WHERE deal_id = $1 ORDER BY created_at DESC`,
        [dealId]
    );

    return result.rows;
};

export const updateOfferStatus = async (
    id: string,
    status: string,
    client?: PoolClient
): Promise<Offer | null> => {
    const executor = client ?? pool;

    const result = await executor.query(
        `
        UPDATE offers
        SET status = $2, updated_at = now()
        WHERE id = $1
        RETURNING *
        `,
        [id, status]
    );

    return result.rows[0] ?? null;
};

export const rejectOtherOffers = async (
    dealId: string,
    exceptOfferId: string,
    client: PoolClient
): Promise<void> => {
    await client.query(
        `
        UPDATE offers
        SET status = 'rejected', updated_at = now()
        WHERE deal_id = $1 AND id != $2 AND status = 'pending'
        `,
        [dealId, exceptOfferId]
    );
};