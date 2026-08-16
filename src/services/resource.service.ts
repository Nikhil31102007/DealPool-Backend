import {
    insertResource, findResourceById, listResourcesByOwner, countResourcesByOwner,
    findNearbyResources, countNearbyResources, updateResourceFields, deleteResource, Resource,
} from "../models/resource.model";
import { badRequest, notFound, forbidden } from "../utils/errors";
import { parsePagination, buildPaginatedResult, PaginatedResult } from "../utils/pagination";

interface CreateResourceInput {
    title: string; description?: string; category?: string;
    condition?: string; lat: number; lng: number;
}

export const createResource = async (
    ownerId: string, input: CreateResourceInput
): Promise<Resource> => {
    if (!input.title || input.lat === undefined || input.lng === undefined) {
        throw badRequest("title, lat, and lng are required", "MISSING_FIELDS");
    }
    return insertResource({
        ownerId,
        title: input.title,
        description: input.description ?? null,
        category: input.category ?? null,
        condition: input.condition ?? null,
        lat: input.lat,
        lng: input.lng,
    });
};

export const getResourceById = async (id: string): Promise<Resource> => {
    const resource = await findResourceById(id);
    if (!resource) throw notFound("Resource not found", "RESOURCE_NOT_FOUND");
    return resource;
};

export const listMyResources = async (
    ownerId: string,
    rawQuery: { limit?: unknown; offset?: unknown }
): Promise<PaginatedResult<Resource>> => {
    const { limit, offset } = parsePagination(rawQuery);

    const [items, total] = await Promise.all([
        listResourcesByOwner(ownerId, limit, offset),
        countResourcesByOwner(ownerId),
    ]);

    return buildPaginatedResult(items, total, limit, offset);
};

export const listNearbyResources = async (
    lat: number, lng: number, radiusKm: number,
    rawQuery: { limit?: unknown; offset?: unknown }
): Promise<PaginatedResult<Resource & { distance_km: number }>> => {
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
        throw badRequest("lat and lng are required", "MISSING_COORDINATES");
    }

    const { limit, offset } = parsePagination(rawQuery);
    const effectiveRadius = radiusKm || 10;

    const [items, total] = await Promise.all([
        findNearbyResources(lat, lng, effectiveRadius, limit, offset),
        countNearbyResources(lat, lng, effectiveRadius),
    ]);

    return buildPaginatedResult(items, total, limit, offset);
};

const UPDATABLE_RESOURCE_FIELDS = [
    "title", "description", "category", "condition", "is_available",
] as const;
// current_holder_id deliberately excluded — only the transaction flow
// (acceptOffer) is allowed to move custody.

export const updateResource = async (
    id: string, userId: string, input: Record<string, unknown>
): Promise<Resource> => {
    const resource = await getResourceById(id);
    if (resource.owner_id !== userId) {
        throw forbidden("Not your resource", "FORBIDDEN");
    }

    const fields: Record<string, unknown> = {};
    for (const key of UPDATABLE_RESOURCE_FIELDS) {
        if (input[key] !== undefined) fields[key] = input[key];
    }

    if (Object.keys(fields).length === 0) {
        throw badRequest("No valid fields provided to update", "NO_UPDATE_FIELDS");
    }

    const updated = await updateResourceFields(id, fields);
    if (!updated) throw notFound("Resource not found", "RESOURCE_NOT_FOUND");
    return updated;
};

export const deleteResourceById = async (id: string, userId: string): Promise<void> => {
    const resource = await getResourceById(id);
    if (resource.owner_id !== userId) {
        throw forbidden("Not your resource", "FORBIDDEN");
    }
    await deleteResource(id);
};