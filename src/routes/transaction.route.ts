import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { getTransactionHandler } from "../controllers/transaction.controller";

const router = Router();

router.get("/:id", authMiddleware, getTransactionHandler);

export default router;