import { Request, Response, NextFunction } from "express";
import {
    loginUser,
    registerUser,
    getProfile,
} from "../services/auth.service";
import type { ApiResponse } from "../utils/responseApi";

export const register = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { email, password, name } = req.body;

        const { profile, token } = await registerUser(
            email,
            password,
            name
        );

        res.cookie("accessToken", token, {
            httpOnly: true,
            sameSite: "lax",
            maxAge: 60 * 60 * 1000,
            path: "/",
        });

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

        const { profile, token } = await loginUser(
            email,
            password
        );

        res.cookie("accessToken", token, {
            httpOnly: true,
            sameSite: "lax",
            maxAge: 60 * 60 * 1000,
            path: "/",
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

export const logout = (
    _req: Request,
    res: Response
): void => {
    res.clearCookie("accessToken", {
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