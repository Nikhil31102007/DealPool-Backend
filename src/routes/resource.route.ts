import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
    createResourceHandler, listMyResourcesHandler, listNearbyResourcesHandler,
    getResourceHandler, updateResourceHandler, deleteResourceHandler,
} from "../controllers/resource.controller";
import { getResourceChainHandler } from "../controllers/transaction.controller";

const router = Router();

router.post("/", authMiddleware, createResourceHandler);
router.get("/mine", authMiddleware, listMyResourcesHandler);
router.get("/nearby", listNearbyResourcesHandler);
router.get("/:resourceId/chain", authMiddleware, getResourceChainHandler);
router.get("/:id", getResourceHandler);
router.patch("/:id", authMiddleware, updateResourceHandler);
router.delete("/:id", authMiddleware, deleteResourceHandler);

export default router;