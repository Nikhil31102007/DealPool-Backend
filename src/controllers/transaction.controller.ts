import { Request, Response, NextFunction } from "express";
import { getTransactionById, getTransactionChain } from "../services/transaction.service";
import type { ApiResponse } from "../utils/responseApi";

export const getTransactionHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const transaction = await getTransactionById(req.params.id as string, req.user!.uid);
        const response: ApiResponse<typeof transaction> = { success: true, data: transaction };
        res.status(200).json(response);
    } catch (error) { next(error); }
};

export const getResourceChainHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const chain = await getTransactionChain(req.params.resourceId as string, req.user!.uid);
        const response: ApiResponse<typeof chain> = { success: true, data: chain };
        res.status(200).json(response);
    } catch (error) { next(error); }
};