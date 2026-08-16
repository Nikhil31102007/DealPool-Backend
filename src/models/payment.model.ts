import pool from "../config/db";
import type { PoolClient } from "pg";

export interface Payment {
    id: string;
    transaction_id: string;
    payer_id: string;
    payee_id: string;
    amount: number;
    currency: string;
    razorpay_order_id: string;
    razorpay_payment_id: string | null;
    razorpay_signature: string | null;
    status: "created" | "captured" | "failed" | "refunded";
    created_at: Date;
    updated_at: Date;
}

export const insertPayment = async (
    params: {
        transactionId: string;
        payerId: string;
        payeeId: string;
        amount: number;
        currency?: string;
        razorpayOrderId: string;
        status?: "created" | "captured" | "failed" | "refunded";
    },
    client?: PoolClient
): Promise<Payment> => {
    const executor = client ?? pool;
    const result = await executor.query(
        `
        INSERT INTO payments (
            transaction_id, payer_id, payee_id, amount,
            currency, razorpay_order_id, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        `,
        [
            params.transactionId,
            params.payerId,
            params.payeeId,
            params.amount,
            params.currency ?? "INR",
            params.razorpayOrderId,
            params.status ?? "created",
        ]
    );

    return result.rows[0];
};

export const findPaymentById = async (
    id: string,
    client?: PoolClient
): Promise<Payment | null> => {
    const executor = client ?? pool;
    const result = await executor.query(
        `SELECT * FROM payments WHERE id = $1`,
        [id]
    );

    return result.rows[0] ?? null;
};

export const findPaymentByOrderId = async (
    orderId: string,
    client?: PoolClient
): Promise<Payment | null> => {
    const executor = client ?? pool;
    const result = await executor.query(
        `SELECT * FROM payments WHERE razorpay_order_id = $1`,
        [orderId]
    );

    return result.rows[0] ?? null;
};

export const findPaymentsByTransactionId = async (
    transactionId: string,
    client?: PoolClient
): Promise<Payment[]> => {
    const executor = client ?? pool;
    const result = await executor.query(
        `SELECT * FROM payments WHERE transaction_id = $1 ORDER BY created_at DESC`,
        [transactionId]
    );

    return result.rows;
};

export const findLatestPaymentForTransaction = async (
    transactionId: string,
    client?: PoolClient
): Promise<Payment | null> => {
    const executor = client ?? pool;
    const result = await executor.query(
        `
        SELECT * FROM payments
        WHERE transaction_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [transactionId]
    );

    return result.rows[0] ?? null;
};

export const updatePaymentSuccess = async (
    orderId: string,
    paymentId: string,
    signature: string,
    client?: PoolClient
): Promise<Payment | null> => {
    const executor = client ?? pool;
    const result = await executor.query(
        `
        UPDATE payments
        SET
            status = 'captured',
            razorpay_payment_id = $2,
            razorpay_signature = $3,
            updated_at = now()
        WHERE razorpay_order_id = $1
        RETURNING *
        `,
        [orderId, paymentId, signature]
    );

    return result.rows[0] ?? null;
};

export const updatePaymentStatus = async (
    orderId: string,
    status: "created" | "captured" | "failed" | "refunded",
    client?: PoolClient
): Promise<Payment | null> => {
    const executor = client ?? pool;
    const result = await executor.query(
        `
        UPDATE payments
        SET status = $2, updated_at = now()
        WHERE razorpay_order_id = $1
        RETURNING *
        `,
        [orderId, status]
    );

    return result.rows[0] ?? null;
};
