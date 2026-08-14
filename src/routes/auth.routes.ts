import { Router } from "express";
import {
    register,
    login,
    me,
    logout,
    refresh,
    googleLogin,
    updateMe,
} from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", authMiddleware, me);
router.post("/logout", logout);
router.post("/refresh", refresh);
router.post("/google", googleLogin);
router.patch("/update", authMiddleware, updateMe);

export default router;