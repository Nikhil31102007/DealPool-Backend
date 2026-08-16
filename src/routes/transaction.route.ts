import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
    getTransactionHandler,
    generateQrHandler,
    verifyQrHandler,
} from "../controllers/transaction.controller";

const router = Router();

router.get("/:id/qr", authMiddleware, generateQrHandler);
router.post("/:id/verify-qr", authMiddleware, verifyQrHandler);
router.get("/:id", authMiddleware, getTransactionHandler);

export default router;