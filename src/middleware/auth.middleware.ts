import {
    Request,
    Response,
    NextFunction,
} from "express";
import { verifyFirebaseToken } from "../services/auth.service";

export const authMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const token = req.cookies?.accessToken;

        if (!token) {
            res.status(401).json({
                success: false,
                error: {
                    message: "Authentication required",
                    code: "UNAUTHORIZED",
                },
            });
            return;
        }

        const decoded =
            await verifyFirebaseToken(token);

        req.user = decoded;

        next();
    } catch (error) {
        next(error);
    }
};