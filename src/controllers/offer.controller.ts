import { Request, Response, NextFunction } from "express";
import {
    createOffer,
    listOffers,
    withdrawOffer,
    rejectOffer,
    acceptOffer,
} from "../services/offer.service";
import type { ApiResponse } from "../utils/responseApi";

export const createOfferHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const offer = await createOffer(
            req.params.dealId as string,
            req.user!.uid,
            req.body
        );

        const response: ApiResponse<typeof offer> = {
            success: true,
            data: offer,
        };

        res.status(201).json(response);
    } catch (error) {
        next(error);
    }
};

export const listOffersHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const offers = await listOffers(req.params.dealId as string);

        const response: ApiResponse<typeof offers> = {
            success: true,
            data: offers,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const acceptOfferHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const offer = await acceptOffer(req.params.id as string, req.user!.uid);

        const response: ApiResponse<typeof offer> = {
            success: true,
            data: offer,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const rejectOfferHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const offer = await rejectOffer(req.params.id as string, req.user!.uid);

        const response: ApiResponse<typeof offer> = {
            success: true,
            data: offer,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const withdrawOfferHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const offer = await withdrawOffer(req.params.id as string, req.user!.uid);

        const response: ApiResponse<typeof offer> = {
            success: true,
            data: offer,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};