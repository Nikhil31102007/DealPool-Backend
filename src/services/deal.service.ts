import {
    insertDeal,
    findDealById,
    listDeals,
    findNearbyDeals,
    updateDealFields,
    deleteDeal,
    Deal,
} from "../models/deal.model";
import { badRequest, notFound, forbidden } from "../utils/errors";

interface CreateDealInput {
    title: string;
    description?: string;
    category?: string;
    budgetMin?: number;
    budgetMax?: number;
    lat: number;
    lng: number;
    radiusKm?: number;
    resourceId?: string;
    skillId?: string;
}

export const createDeal = async (
    userId: string,
    input: CreateDealInput
): Promise<Deal> => {
    if (!input.title || input.lat === undefined || input.lng === undefined) {
        throw badRequest("title, lat, and lng are required", "MISSING_FIELDS");
    }

    return insertDeal({
        userId,
        title: input.title,
        description: input.description ?? null,
        category: input.category ?? null,
        budgetMin: input.budgetMin ?? null,
        budgetMax: input.budgetMax ?? null,
        lat: input.lat,
        lng: input.lng,
        radiusKm: input.radiusKm ?? 10,
        resourceId: input.resourceId ?? null,
        skillId: input.skillId ?? null,
    });
};

export const getDealById = async (id: string): Promise<Deal> => {
    const deal = await findDealById(id);

    if (!deal) {
        throw notFound("Deal not found", "DEAL_NOT_FOUND");
    }

    return deal;
};

export const listAllDeals = async (
    filters: { category?: string; status?: string },
    limit = 50,
    offset = 0
): Promise<Deal[]> => {
    return listDeals(filters, limit, offset);
};

export const listNearbyDeals = async (
    lat: number,
    lng: number,
    radiusKm: number,
    limit = 50,
    offset = 0
) => {
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
        throw badRequest("lat and lng are required", "MISSING_COORDINATES");
    }

    return findNearbyDeals(lat, lng, radiusKm || 10, limit, offset);
};

const UPDATABLE_DEAL_FIELDS = [
    "title",
    "description",
    "category",
    "budget_min",
    "budget_max",
    "radius_km",
    "status",
] as const;

export const updateDeal = async (
    id: string,
    userId: string,
    input: Record<string, unknown>
): Promise<Deal> => {
    const deal = await getDealById(id);

    if (deal.user_id !== userId) {
        throw forbidden("Not your deal", "FORBIDDEN");
    }

    const fields: Record<string, unknown> = {};

    for (const key of UPDATABLE_DEAL_FIELDS) {
        if (input[key] !== undefined) {
            fields[key] = input[key];
        }
    }

    if (Object.keys(fields).length === 0) {
        throw badRequest("No valid fields provided to update", "NO_UPDATE_FIELDS");
    }

    const updated = await updateDealFields(id, fields);

    if (!updated) {
        throw notFound("Deal not found", "DEAL_NOT_FOUND");
    }

    return updated;
};

export const deleteDealById = async (
    id: string,
    userId: string
): Promise<void> => {
    const deal = await getDealById(id);

    if (deal.user_id !== userId) {
        throw forbidden("Not your deal", "FORBIDDEN");
    }

    await deleteDeal(id);
};