// handles role based auth it helps in admin panel
import { Request, Response, NextFunction } from "express";

import { unauthorized, forbidden } from "../utils/errors";
import type { UserRole } from "../utils/types";

export const requireRole = (...roles: UserRole[]) => {
    return (
        req: Request,
        _res: Response,
        next: NextFunction
    ): void => {

        if (!req.user) {
            next(unauthorized("Authentication required"));
            return;
        }

        if (!roles.includes(req.user.role)) {
            next(forbidden("You do not have permission to access this resource"));
            return;
        }

        next();
    };
};