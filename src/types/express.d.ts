import type { AuthUser } from "../utils/types";

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}

export {};