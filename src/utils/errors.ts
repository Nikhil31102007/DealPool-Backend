// keeping all known types of common errors into a specific
//  place so that we can just use them when we need
// this magic is centralized errorhandling
// each of them are instances of class 
export class AppError extends Error {
    constructor(
        public statusCode: number,
        public code: string,
        message: string
    ) {
        super(message);
        this.name = "AppError";

        Error.captureStackTrace?.(this, this.constructor);
    }
}

export const badRequest = (
    message = "Bad request",
    code = "BAD_REQUEST"
) => new AppError(400, code, message);

export const unauthorized = (
    message = "Unauthorized",
    code = "UNAUTHORIZED"
) => new AppError(401, code, message);

export const forbidden = (
    message = "Forbidden",
    code = "FORBIDDEN"
) => new AppError(403, code, message);

export const notFound = (
    message = "Resource not found",
    code = "NOT_FOUND"
) => new AppError(404, code, message);

export const conflict = (
    message = "Conflict",
    code = "CONFLICT"
) => new AppError(409, code, message);