import { Request, Response, NextFunction } from "express";
import {
    createDeal,
    getDealById,
    listAllDeals,
    listNearbyDeals,
    updateDeal,
    deleteDealById,
} from "../services/deal.service";
import type { ApiResponse } from "../utils/responseApi";


export const createDealHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const deal = await createDeal(req.user!.uid, req.body);

        const response: ApiResponse<typeof deal> = {
            success: true,
            data: deal,
        };

        res.status(201).json(response);
    } catch (error) {
        next(error);
    }
};

export const listDealsHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { category, status } = req.query;
        const limit = Number(req.query.limit) || 50;
        const offset = Number(req.query.offset) || 0;

        const deals = await listAllDeals(
            {
                category: category as string | undefined,
                status: status as string | undefined,
            },
            limit,
            offset
        );

        const response: ApiResponse<typeof deals> = {
            success: true,
            data: deals,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const listNearbyDealsHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const lat = Number(req.query.lat);
        const lng = Number(req.query.lng);
        const radiusKm = Number(req.query.radiusKm);
        const limit = Number(req.query.limit) || 50;
        const offset = Number(req.query.offset) || 0;

        const deals = await listNearbyDeals(lat, lng, radiusKm, limit, offset);

        const response: ApiResponse<typeof deals> = {
            success: true,
            data: deals,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const getDealHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const deal = await getDealById(req.params.id as string);

        const response: ApiResponse<typeof deal> = {
            success: true,
            data: deal,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const updateDealHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const deal = await updateDeal(req.params.id as string, req.user!.uid, req.body);

        const response: ApiResponse<typeof deal> = {
            success: true,
            data: deal,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const deleteDealHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        await deleteDealById(req.params.id as string, req.user!.uid);

        const response: ApiResponse<null> = {
            success: true,
            data: null,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
}; 