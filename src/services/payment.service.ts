import crypto from "crypto";
import pool from "../config/db";
import {
    getRazorpayInstance,
    getRazorpayKeyId,
    getRazorpayKeySecret,
    getRazorpayWebhookSecret,
} from "../config/razorpay";
import {
    findPaymentById,
    findPaymentByOrderId,
    findPaymentsByTransactionId,
    insertPayment,
    updatePaymentStatus,
    updatePaymentSuccess,
    Payment,
} from "../models/payment.model";
import {
    findTransactionById,
    updateTransactionStatus,
    Transaction,
} from "../models/transaction.model";
import { findOfferById } from "../models/offer.model";
import { badRequest, conflict, forbidden, notFound } from "../utils/errors";

export interface CreateOrderResult {
    paymentId: string;
    orderId: string;
    amount: number; // in paise (for Razorpay client)
    amountInRupees: number;
    currency: string;
    keyId: string;
    transactionId: string;
}

export interface VerifyPaymentInput {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
}

export interface VerifyPaymentResult {
    payment: Payment;
    transaction: Transaction;
}

export const createPaymentOrder = async (
    transactionId: string,
    payerId: string
): Promise<CreateOrderResult> => {
    if (!transactionId) {
        throw badRequest("Transaction ID is required", "MISSING_FIELDS");
    }

    const transaction = await findTransactionById(transactionId);
    if (!transaction) {
        throw notFound("Transaction not found", "TRANSACTION_NOT_FOUND");
    }

    // Direction convention: to_user_id is the receiver/consumer who pays
    if (transaction.to_user_id !== payerId) {
        throw forbidden(
            "Only the transaction recipient/payer can initiate payment",
            "FORBIDDEN"
        );
    }

    if (transaction.status === "completed" || transaction.status === "cancelled") {
        throw conflict(
            `Transaction is ${transaction.status} and not eligible for payment`,
            "INVALID_TRANSACTION_STATUS"
        );
    }

    const offer = await findOfferById(transaction.offer_id);
    if (!offer) {
        throw notFound("Linked offer not found", "OFFER_NOT_FOUND");
    }

    const price = Number(offer.price);
    if (!price || price <= 0) {
        throw badRequest("This transaction has no payable amount", "NO_PAYMENT_REQUIRED");
    }

    const existingPayments = await findPaymentsByTransactionId(transactionId);
    const capturedPayment = existingPayments.find((p) => p.status === "captured");
    if (capturedPayment) {
        throw conflict("Transaction is already paid", "ALREADY_PAID");
    }

    const razorpay = getRazorpayInstance();
    const amountInPaise = Math.round(price * 100);
    // Razorpay receipt length must be <= 40 chars
    const receipt = `tx_${transaction.id.replace(/-/g, "").slice(0, 30)}`;

    let order;
    try {
        order = await razorpay.orders.create({
            amount: amountInPaise,
            currency: "INR",
            receipt,
            notes: {
                transactionId: transaction.id,
                dealId: transaction.deal_id,
                payerId: transaction.to_user_id,
                payeeId: transaction.from_user_id,
            },
        });
    } catch (err: any) {
        throw badRequest(
            err?.error?.description || err?.message || "Failed to create Razorpay order",
            "RAZORPAY_ERROR"
        );
    }

    const payment = await insertPayment({
        transactionId: transaction.id,
        payerId: transaction.to_user_id,
        payeeId: transaction.from_user_id,
        amount: price,
        currency: "INR",
        razorpayOrderId: order.id,
        status: "created",
    });

    return {
        paymentId: payment.id,
        orderId: order.id,
        amount: order.amount as number,
        amountInRupees: price,
        currency: order.currency,
        keyId: getRazorpayKeyId(),
        transactionId: transaction.id,
    };
};

export const verifyPayment = async (
    input: VerifyPaymentInput,
    payerId: string
): Promise<VerifyPaymentResult> => {
    if (!input.razorpayOrderId || !input.razorpayPaymentId || !input.razorpaySignature) {
        throw badRequest("Missing payment verification parameters", "MISSING_FIELDS");
    }

    const payment = await findPaymentByOrderId(input.razorpayOrderId);
    if (!payment) {
        throw notFound("Payment record not found for this order", "PAYMENT_NOT_FOUND");
    }

    if (payment.payer_id !== payerId) {
        throw forbidden("Not authorized to verify this payment", "FORBIDDEN");
    }

    if (payment.status === "captured") {
        const transaction = await findTransactionById(payment.transaction_id);
        return { payment, transaction: transaction! };
    }

    const keySecret = getRazorpayKeySecret();
    const generatedSignature = crypto
        .createHmac("sha256", keySecret)
        .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
        .digest("hex");

    if (generatedSignature !== input.razorpaySignature) {
        await updatePaymentStatus(input.razorpayOrderId, "failed");
        throw badRequest("Invalid payment signature", "INVALID_SIGNATURE");
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const updatedPayment = await updatePaymentSuccess(
            input.razorpayOrderId,
            input.razorpayPaymentId,
            input.razorpaySignature,
            client
        );

        const updatedTransaction = await updateTransactionStatus(
            payment.transaction_id,
            "confirmed",
            client
        );

        await client.query("COMMIT");

        return {
            payment: updatedPayment!,
            transaction: updatedTransaction!,
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

export const getPaymentById = async (
    paymentId: string,
    userId: string
): Promise<Payment> => {
    const payment = await findPaymentById(paymentId);
    if (!payment) {
        throw notFound("Payment not found", "PAYMENT_NOT_FOUND");
    }

    if (payment.payer_id !== userId && payment.payee_id !== userId) {
        throw forbidden("Not your payment record", "FORBIDDEN");
    }

    return payment;
};

export const getPaymentsForTransaction = async (
    transactionId: string,
    userId: string
): Promise<Payment[]> => {
    const transaction = await findTransactionById(transactionId);
    if (!transaction) {
        throw notFound("Transaction not found", "TRANSACTION_NOT_FOUND");
    }

    if (transaction.from_user_id !== userId && transaction.to_user_id !== userId) {
        throw forbidden("Not your transaction", "FORBIDDEN");
    }

    return findPaymentsByTransactionId(transactionId);
};

export const handleRazorpayWebhook = async (
    rawBody: string | Buffer,
    signature: string
): Promise<{ success: boolean; event?: string }> => {
    const webhookSecret = getRazorpayWebhookSecret();

    if (webhookSecret) {
        const expectedSignature = crypto
            .createHmac("sha256", webhookSecret)
            .update(rawBody)
            .digest("hex");

        if (expectedSignature !== signature) {
            throw badRequest("Invalid webhook signature", "INVALID_WEBHOOK_SIGNATURE");
        }
    }

    const payload = JSON.parse(
        typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")
    );

    const event = payload.event;

    if (event === "payment.captured" || event === "order.paid") {
        const paymentEntity = payload.payload?.payment?.entity;
        const orderId = paymentEntity?.order_id;
        const paymentId = paymentEntity?.id;

        if (orderId && paymentId) {
            const payment = await findPaymentByOrderId(orderId);
            if (payment && payment.status !== "captured") {
                const client = await pool.connect();
                try {
                    await client.query("BEGIN");
                    await updatePaymentSuccess(orderId, paymentId, "webhook_verified", client);
                    await updateTransactionStatus(payment.transaction_id, "confirmed", client);
                    await client.query("COMMIT");
                } catch (err) {
                    await client.query("ROLLBACK");
                    throw err;
                } finally {
                    client.release();
                }
            }
        }
    } else if (event === "payment.failed") {
        const orderId = payload.payload?.payment?.entity?.order_id;
        if (orderId) {
            await updatePaymentStatus(orderId, "failed");
        }
    }

    return { success: true, event };
};
