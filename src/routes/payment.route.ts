import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
    createOrderHandler,
    verifyPaymentHandler,
    getPaymentHandler,
    getTransactionPaymentsHandler,
    webhookHandler,
} from "../controllers/payment.controller";

const router = Router();

router.post("/order", authMiddleware, createOrderHandler);
router.post("/verify", authMiddleware, verifyPaymentHandler);
router.post("/webhook", webhookHandler);
router.get("/transaction/:transactionId", authMiddleware, getTransactionPaymentsHandler);
router.get("/:id", authMiddleware, getPaymentHandler);

export default router;
