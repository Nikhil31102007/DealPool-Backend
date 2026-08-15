import pool from "../config/db";
import {
    insertOffer,
    findOfferById,
    listOffersForDeal,
    updateOfferStatus,
    rejectOtherOffers,
    Offer,
} from "../models/offer.model";
import { getDealById } from "./deal.service";
import { badRequest, notFound, forbidden, conflict } from "../utils/errors";
import { updateDealStatus, findDealById } from "../models/deal.model";
import {
    insertTransaction,
    findLatestTransactionForResource,
} from "../models/transaction.model";
import { updateResourceHolder } from "../models/resource.model";

import { Deal } from "../models/deal.model";

interface CreateOfferInput {
    price?: number;
    terms?: string;
}

export const createOffer = async (
    dealId: string,
    providerId: string,
    input: CreateOfferInput
): Promise<Offer> => {
    const deal = await getDealById(dealId);

    if (deal.status !== "open") {
        throw conflict("Deal is not open for offers", "DEAL_NOT_OPEN");
    }

    if (deal.user_id === providerId) {
        throw badRequest("Cannot offer on your own deal", "CANNOT_OFFER_OWN_DEAL");
    }

    return insertOffer({
        dealId,
        providerId,
        price: input.price ?? null,
        terms: input.terms ?? null,
    });
};

export const listOffers = async (dealId: string): Promise<Offer[]> => {
    await getDealById(dealId);
    return listOffersForDeal(dealId);
};

export const withdrawOffer = async (
    offerId: string,
    providerId: string
): Promise<Offer> => {
    const offer = await findOfferById(offerId);

    if (!offer) {
        throw notFound("Offer not found", "OFFER_NOT_FOUND");
    }

    if (offer.provider_id !== providerId) {
        throw forbidden("Not your offer", "FORBIDDEN");
    }

    if (offer.status !== "pending") {
        throw conflict("Offer is not pending", "OFFER_NOT_PENDING");
    }

    const updated = await updateOfferStatus(offerId, "withdrawn");

    return updated!;
};

export const rejectOffer = async (
    offerId: string,
    requesterId: string
): Promise<Offer> => {
    const offer = await findOfferById(offerId);

    if (!offer) {
        throw notFound("Offer not found", "OFFER_NOT_FOUND");
    }

    const deal = await getDealById(offer.deal_id);

    if (deal.user_id !== requesterId) {
        throw forbidden("Not your deal", "FORBIDDEN");
    }

    if (offer.status !== "pending") {
        throw conflict("Offer is not pending", "OFFER_NOT_PENDING");
    }

    const updated = await updateOfferStatus(offerId, "rejected");

    return updated!;
};

export const acceptOffer = async (
    offerId: string,
    requesterId: string
): Promise<Offer> => {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const offer = await findOfferById(offerId, client);
        if (!offer) throw notFound("Offer not found", "OFFER_NOT_FOUND");

        const deal = await findDealById(offer.deal_id, client);
        if (!deal) throw notFound("Deal not found", "DEAL_NOT_FOUND");
        if (deal.user_id !== requesterId) throw forbidden("Not your deal", "FORBIDDEN");

        // Offer-specific check MUST run before the deal-status check.
        // Once an offer is accepted, deal.status flips to "offer_accepted", which would
        // otherwise mask a re-accept attempt behind DEAL_NOT_OPEN instead of the more
        // specific OFFER_NOT_PENDING.
        if (offer.status !== "pending") throw conflict("Offer is not pending", "OFFER_NOT_PENDING");
        if (deal.status !== "open") throw conflict("Deal is not open", "DEAL_NOT_OPEN");

        await rejectOtherOffers(deal.id, offerId, client);
        const acceptedOffer = await updateOfferStatus(offerId, "accepted", client);
        await updateDealStatus(deal.id, "offer_accepted", client);

        // deal.user_id = current holder/poster offering the resource (or skill provider's counterpart)
        // offer.provider_id = the person receiving it at their offered price
        if (deal.resource_id) {
            const parent = await findLatestTransactionForResource(deal.resource_id, client);

            await insertTransaction({
                dealId: deal.id,
                offerId,
                fromUserId: deal.user_id,
                toUserId: offer.provider_id,
                resourceId: deal.resource_id,
                skillId: null,
                parentTransactionId: parent?.id ?? null,
            }, client);

            await updateResourceHolder(deal.resource_id, offer.provider_id, client);
        } else if (deal.skill_id) {
            await insertTransaction({
                dealId: deal.id,
                offerId,
                fromUserId: offer.provider_id, // skill provider performs the work
                toUserId: deal.user_id,          // deal poster receives it
                resourceId: null,
                skillId: deal.skill_id,
                parentTransactionId: null,
            }, client);
        }

        await client.query("COMMIT");
        return acceptedOffer!;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};