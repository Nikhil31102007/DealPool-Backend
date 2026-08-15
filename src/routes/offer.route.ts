import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
    acceptOfferHandler,
    rejectOfferHandler,
    withdrawOfferHandler,
} from "../controllers/offer.controller";

const router = Router();

router.patch("/:id/accept", authMiddleware, acceptOfferHandler);
router.patch("/:id/reject", authMiddleware, rejectOfferHandler);
router.patch("/:id/withdraw", authMiddleware, withdrawOfferHandler);

export default router;