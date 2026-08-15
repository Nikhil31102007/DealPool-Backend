import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import {
    listUsers,
    getUser,
    updateRole,
    deleteUser,
} from "../controllers/admin.controller";

const router = Router();

router.use(authMiddleware, requireRole("admin"));

router.get("/users", listUsers);
router.get("/users/:id", getUser);
router.patch("/users/:id/role", updateRole);
router.delete("/users/:id", deleteUser);

export default router;