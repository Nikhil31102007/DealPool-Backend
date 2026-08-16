export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 50;

export interface PaginationParams {
    limit: number;
    offset: number;
}

export interface PaginatedResult<T> {
    items: T[];
    pagination: {
        limit: number;
        offset: number;
        total: number;
        hasMore: boolean;
    };
}

/**
 * Parses and clamps ?limit=&offset= from a request query.
 * limit is capped at MAX_PAGE_SIZE regardless of what the client asks for —
 * this is the actual "don't let the server get hammered" protection.
 */
export const parsePagination = (query: {
    limit?: unknown;
    offset?: unknown;
}): PaginationParams => {
    const rawLimit = Number(query.limit);
    const rawOffset = Number(query.offset);

    const limit =
        Number.isFinite(rawLimit) && rawLimit > 0
            ? Math.min(Math.floor(rawLimit), MAX_PAGE_SIZE)
            : DEFAULT_PAGE_SIZE;

    const offset =
        Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;

    return { limit, offset };
};

export const buildPaginatedResult = <T>(
    items: T[],
    total: number,
    limit: number,
    offset: number
): PaginatedResult<T> => ({
    items,
    pagination: {
        limit,
        offset,
        total,
        hasMore: offset + items.length < total,
    },
});