import { Request, Response, NextFunction } from "express";
import {
    getTransactionById,
    getTransactionChain,
    generateTransactionQr,
    verifyTransactionQr,
} from "../services/transaction.service";
import type { ApiResponse } from "../utils/responseApi";

export const getTransactionHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const transaction = await getTransactionById(
            req.params.id as string,
            req.user!.uid
        );
        const response: ApiResponse<typeof transaction> = {
            success: true,
            data: transaction,
        };
        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const getResourceChainHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const chain = await getTransactionChain(
            req.params.resourceId as string,
            req.user!.uid
        );
        const response: ApiResponse<typeof chain> = {
            success: true,
            data: chain,
        };
        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const generateQrHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const action = req.query.action as "checkout" | "complete" | undefined;
        const result = await generateTransactionQr(
            req.params.id as string,
            req.user!.uid,
            action
        );
        const response: ApiResponse<typeof result> = {
            success: true,
            data: result,
        };
        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const verifyQrHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const result = await verifyTransactionQr(
            req.params.id as string,
            req.body.token as string,
            req.user!.uid
        );
        const response: ApiResponse<typeof result> = {
            success: true,
            data: result,
        };
        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};