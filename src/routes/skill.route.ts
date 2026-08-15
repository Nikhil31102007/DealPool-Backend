import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
    createSkillHandler, listMySkillsHandler,
    getSkillHandler, updateSkillHandler, deleteSkillHandler,
} from "../controllers/skill.controller";

const router = Router();

router.post("/", authMiddleware, createSkillHandler);
router.get("/mine", authMiddleware, listMySkillsHandler);
router.get("/:id", getSkillHandler);
router.patch("/:id", authMiddleware, updateSkillHandler);
router.delete("/:id", authMiddleware, deleteSkillHandler);

export default router;