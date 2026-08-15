import {
    findTransactionById, findTransactionChainByResource, Transaction,
} from "../models/transaction.model";
import { forbidden, notFound } from "../utils/errors";

export const getTransactionById = async (
    id: string, requesterId: string
): Promise<Transaction> => {
    const transaction = await findTransactionById(id);
    if (!transaction) throw notFound("Transaction not found", "TRANSACTION_NOT_FOUND");

    if (transaction.from_user_id !== requesterId && transaction.to_user_id !== requesterId) {
        throw forbidden("Not your transaction", "FORBIDDEN");
    }

    return transaction;
};

// Privacy rule: a requester sees full detail (price lives on the linked
// offer, not on the transaction row itself, but from_user_id/to_user_id
// here is what identifies "which link is mine") only for links they were
// actually a party to. Every other link in the chain is redacted to
// custody-trail-only — status and timing, no identities.
type ChainLink = Transaction | {
    id: string;
    resource_id: string | null;
    status: Transaction["status"];
    completed_at: Date | null;
    created_at: Date;
};

export const getTransactionChain = async (
    resourceId: string, requesterId: string
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