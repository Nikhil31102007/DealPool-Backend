import { Request, Response, NextFunction } from "express";
import {
    createPaymentOrder,
    verifyPayment,
    getPaymentById,
    getPaymentsForTransaction,
    handleRazorpayWebhook,
} from "../services/payment.service";
import type { ApiResponse } from "../utils/responseApi";

export const createOrderHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const order = await createPaymentOrder(
            req.body.transactionId as string,
            req.user!.uid
        );

        const response: ApiResponse<typeof order> = {
            success: true,
            data: order,
        };

        res.status(201).json(response);
    } catch (error) {
        next(error);
    }
};

export const verifyPaymentHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const result = await verifyPayment(
            {
                razorpayOrderId: req.body.razorpayOrderId as string,
                razorpayPaymentId: req.body.razorpayPaymentId as string,
                razorpaySignature: req.body.razorpaySignature as string,
            },
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

export const getPaymentHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const payment = await getPaymentById(
            req.params.id as string,
            req.user!.uid
        );

        const response: ApiResponse<typeof payment> = {
            success: true,
            data: payment,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const getTransactionPaymentsHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const payments = await getPaymentsForTransaction(
            req.params.transactionId as string,
            req.user!.uid
        );

        const response: ApiResponse<typeof payments> = {
            success: true,
            data: payments,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

export const webhookHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const signature = (req.headers["x-razorpay-signature"] as string) || "";
        const rawBody = (req as any).rawBody || JSON.stringify(req.body);

        const result = await handleRazorpayWebhook(rawBody, signature);

        const response: ApiResponse<typeof result> = {
            success: true,
            data: result,
        };

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};
