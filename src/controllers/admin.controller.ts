import { Request, Response, NextFunction } from "express";
import {
    listProfiles,
    getProfileById,
    updateUserRole,
    deleteProfileById,
} from "../services/admin.services";
import { badRequest } from "../utils/errors";
import type { ApiResponse } from "../utils/responseApi";
import type { UserRole } from "../utils/types";

const VALID_ROLES: UserRole[] = ["user", "admin"];

export const listUsers = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const limit = Number(req.query.limit) || 50;
        const offset = Number(req.query.offset) || 0;

        const profiles = await listProfiles(limit, offset);

        const response: ApiResponse<typeof profiles> = {
            success: true,
            data: profiles,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const getUser = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const profile = await getProfileById(req.params.id);

        const response: ApiResponse<typeof profile> = {
            success: true,
            data: profile,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const updateRole = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { role } = req.body;

        if (!role || !VALID_ROLES.includes(role)) {
            next(badRequest("A valid role is required", "INVALID_ROLE"));
            return;
        }

        const profile = await updateUserRole(req.params.id, role);

        const response: ApiResponse<typeof profile> = {
            success: true,
            data: profile,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const deleteUser = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        await deleteProfileById(req.params.id);

        const response: ApiResponse<null> = {
            success: true,
            data: null,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};