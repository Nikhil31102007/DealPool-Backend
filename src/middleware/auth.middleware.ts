import { Request, Response, NextFunction } from "express";
import { verifyFirebaseToken, findProfile } from "../services/auth.service";

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

        const decoded = await verifyFirebaseToken(token);
        const profile = await findProfile(decoded.uid);

        if (!profile) {
            res.status(401).json({
                success: false,
                error: {
                    message: "User profile not found",
                    code: "PROFILE_NOT_FOUND",
                },
            });
            return;
        }

        req.user = {
            uid: decoded.uid,
            email: decoded.email,
            role: profile.role,
        };

        next();
    } catch (error) {
        next(error);
    }
};