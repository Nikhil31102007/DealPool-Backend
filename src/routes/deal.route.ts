import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
    createDealHandler,
    listDealsHandler,
    listNearbyDealsHandler,
    getDealHandler,
    updateDealHandler,
    deleteDealHandler,
} from "../controllers/deal.controller";
import {
    createOfferHandler,
    listOffersHandler,
} from "../controllers/offer.controller";

const router = Router();

router.post("/", authMiddleware, createDealHandler);
router.get("/", listDealsHandler);
router.get("/nearby", listNearbyDealsHandler);
router.get("/:id", getDealHandler);
router.patch("/:id", authMiddleware, updateDealHandler);
router.delete("/:id", authMiddleware, deleteDealHandler);
router.post("/:dealId/offers", authMiddleware, createOfferHandler);
router.get("/:dealId/offers", listOffersHandler);

export default router;  