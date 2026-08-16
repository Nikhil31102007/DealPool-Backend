import { Request, Response, NextFunction } from "express";
import {
    createSkill, getSkillById, listMySkills, updateSkill, deleteSkillById,
} from "../services/skill.service";
import type { ApiResponse } from "../utils/responseApi";

export const createSkillHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const skill = await createSkill(req.user!.uid, req.body);
        const response: ApiResponse<typeof skill> = { success: true, data: skill };
        res.status(201).json(response);
    } catch (error) { next(error); }
};

export const listMySkillsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const result = await listMySkills(req.user!.uid, req.query);
        const response: ApiResponse<typeof result> = { success: true, data: result };
        res.status(200).json(response);
    } catch (error) { next(error); }
};

export const getSkillHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const skill = await getSkillById(req.params.id as string);
        const response: ApiResponse<typeof skill> = { success: true, data: skill };
        res.status(200).json(response);
    } catch (error) { next(error); }
};

export const updateSkillHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const skill = await updateSkill(req.params.id as string, req.user!.uid, req.body);
        const response: ApiResponse<typeof skill> = { success: true, data: skill };
        res.status(200).json(response);
    } catch (error) { next(error); }
};

export const deleteSkillHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        await deleteSkillById(req.params.id as string, req.user!.uid);
        const response: ApiResponse<null> = { success: true, data: null };
        res.status(200).json(response);
    } catch (error) { next(error); }
};