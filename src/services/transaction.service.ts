import {
    findTransactionById,
    findTransactionChainByResource,
    updateTransactionCheckedOut,
    updateTransactionCompleted,
    Transaction,
} from "../models/transaction.model";
import { badRequest, conflict, forbidden, notFound } from "../utils/errors";
import {
    generateQrDataUrl,
    createHandoverToken,
    decodeAndVerifyHandoverToken,
} from "../utils/qrcode";

export const getTransactionById = async (
    id: string,
    requesterId: string
): Promise<Transaction> => {
    const transaction = await findTransactionById(id);
    if (!transaction) throw notFound("Transaction not found", "TRANSACTION_NOT_FOUND");

    if (transaction.from_user_id !== requesterId && transaction.to_user_id !== requesterId) {
        throw forbidden("Not your transaction", "FORBIDDEN");
    }

    return transaction;
};

// Privacy rule: a requester sees full detail only for links they were
// actually a party to. Every other link in the chain is redacted to
// custody-trail-only — status and timing, no identities.
export type ChainLink = Transaction | {
    id: string;
    resource_id: string | null;
    status: Transaction["status"];
    completed_at: Date | null;
    created_at: Date;
};

export const getTransactionChain = async (
    resourceId: string,
    requesterId: string
): Promise<ChainLink[]> => {
    const chain = await findTransactionChainByResource(resourceId);

    return chain.map((tx) => {
        const isParticipant =
            tx.from_user_id === requesterId || tx.to_user_id === requesterId;

        if (isParticipant) {
            return tx;
        }

        return {
            id: tx.id,
            resource_id: tx.resource_id,
            status: tx.status,
            completed_at: tx.completed_at,
            created_at: tx.created_at,
        };
    });
};

export interface QrGenerationResult {
    qrDataUrl: string;
    token: string;
    action: "checkout" | "complete";
    transactionId: string;
}

export const generateTransactionQr = async (
    transactionId: string,
    userId: string,
    requestedAction?: "checkout" | "complete"
): Promise<QrGenerationResult> => {
    const transaction = await findTransactionById(transactionId);
    if (!transaction) {
        throw notFound("Transaction not found", "TRANSACTION_NOT_FOUND");
    }

    if (transaction.from_user_id !== userId && transaction.to_user_id !== userId) {
        throw forbidden("Not a participant in this transaction", "FORBIDDEN");
    }

    if (transaction.status === "completed" || transaction.status === "cancelled") {
        throw conflict(
            `Cannot generate handover QR for transaction with status ${transaction.status}`,
            "INVALID_TRANSACTION_STATUS"
        );
    }

    let action: "checkout" | "complete";
    if (requestedAction) {
        action = requestedAction;
    } else {
        // Auto-select based on resource vs skill and current status
        if (transaction.resource_id) {
            action = transaction.status === "active" ? "complete" : "checkout";
        } else {
            action = "complete";
        }
    }

    const token = createHandoverToken({
        transactionId,
        action,
        generatorId: userId,
        timestamp: Date.now(),
    });

    const qrDataUrl = await generateQrDataUrl(token);

    return {
        qrDataUrl,
        token,
        action,
        transactionId,
    };
};

export const verifyTransactionQr = async (
    transactionId: string,
    token: string,
    scannerId: string
): Promise<Transaction> => {
    if (!token) {
        throw badRequest("QR token is required", "MISSING_FIELDS");
    }

    let payload;
    try {
        payload = decodeAndVerifyHandoverToken(token);
    } catch (err: any) {
        throw badRequest(
            err.message === "TOKEN_EXPIRED"
                ? "Handover QR code has expired"
                : "Invalid or tampered QR handover token",
            "INVALID_QR_TOKEN"
        );
    }

    if (payload.transactionId !== transactionId) {
        throw badRequest("QR token is for a different transaction", "TRANSACTION_MISMATCH");
    }

    if (payload.generatorId === scannerId) {
        throw badRequest("Cannot scan and verify your own QR code", "SELF_SCAN_NOT_ALLOWED");
    }

    const transaction = await findTransactionById(transactionId);
    if (!transaction) {
        throw notFound("Transaction not found", "TRANSACTION_NOT_FOUND");
    }

    if (transaction.from_user_id !== scannerId && transaction.to_user_id !== scannerId) {
        throw forbidden("Not authorized to verify this handover", "FORBIDDEN");
    }

    let updated: Transaction | null;
    if (payload.action === "checkout") {
        updated = await updateTransactionCheckedOut(transactionId);
    } else {
        updated = await updateTransactionCompleted(transactionId);
    }

    if (!updated) {
        throw notFound("Failed to update transaction status", "UPDATE_FAILED");
    }

    return updated;
};