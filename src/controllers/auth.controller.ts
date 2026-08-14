import { Request, Response, NextFunction } from "express";
import {
    loginUser,
    registerUser,
    getProfile,
    refreshFirebaseToken,
    googleLoginUser,
    updateProfile,
} from "../services/auth.service";
import type { ApiResponse } from "../utils/responseApi";

const accessTokenCookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 1000,
    path: "/",
};

const refreshTokenCookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 24 * 60 * 60 * 1000,
    path: "/",
};

export const register = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { email, password } = req.body;

        const { profile, token, refreshToken } = await registerUser(email, password);

        res.cookie("accessToken", token, accessTokenCookieOptions);
        res.cookie("refreshToken", refreshToken, refreshTokenCookieOptions);

        const response: ApiResponse<typeof profile> = {
            success: true,
            data: profile,
        };

        res.status(201).json(response);
    } catch (error) {
        next(error);
    }
};

export const login = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { email, password } = req.body;

        const { profile, token, refreshToken } = await loginUser(email, password);

        res.cookie("accessToken", token, accessTokenCookieOptions);
        res.cookie("refreshToken", refreshToken, refreshTokenCookieOptions);

        const response: ApiResponse<typeof profile> = {
            success: true,
            data: profile,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const refresh = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const refreshToken = req.cookies?.refreshToken;

        if (!refreshToken) {
            res.status(401).json({
                success: false,
                message: "Refresh token not found",
            });
            return;
        }

        const refreshed = await refreshFirebaseToken(refreshToken);

        res.cookie("accessToken", refreshed.token, accessTokenCookieOptions);
        res.cookie("refreshToken", refreshed.refreshToken, refreshTokenCookieOptions);

        const response: ApiResponse<null> = {
            success: true,
            data: null,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const me = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const profile = await getProfile(req.user!.uid);

        const response: ApiResponse<typeof profile> = {
            success: true,
            data: profile,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const logout = (_req: Request, res: Response): void => {
    res.clearCookie("accessToken", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
    });

    res.clearCookie("refreshToken", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
    });

    const response: ApiResponse<null> = {
        success: true,
        data: null,
    };

    res.status(200).json(response);
};

export const googleLogin = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            res.status(401).json({
                success: false,
                error: {
                    message: "Firebase ID token is required",
                    code: "INVALID_TOKEN",
                },
            });
            return;
        }

        const { profile, token } = await googleLoginUser(idToken);

        res.cookie("accessToken", token, accessTokenCookieOptions);

        const response: ApiResponse<typeof profile> = {
            success: true,
            data: profile,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const updateMe = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { username, email, profile_photo } = req.body;

        const profile = await updateProfile(req.user!.uid, {
            username,
            email,
            profile_photo,
        });

        const response: ApiResponse<typeof profile> = {
            success: true,
            data: profile,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};