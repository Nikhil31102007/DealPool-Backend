import {
    insertSkill, findSkillById, listSkillsByUser,
    updateSkillFields, deleteSkill, Skill,
} from "../models/skill.model";
import { badRequest, notFound, forbidden } from "../utils/errors";

interface CreateSkillInput {
    name: string; description?: string; category?: string;
}

export const createSkill = async (
    userId: string, input: CreateSkillInput
): Promise<Skill> => {
    if (!input.name) {
        throw badRequest("name is required", "MISSING_FIELDS");
    }
    return insertSkill({
        userId,
        name: input.name,
        description: input.description ?? null,
        category: input.category ?? null,
    });
};

export const getSkillById = async (id: string): Promise<Skill> => {
    const skill = await findSkillById(id);
    if (!skill) throw notFound("Skill not found", "SKILL_NOT_FOUND");
    return skill;
};

export const listMySkills = async (userId: string): Promise<Skill[]> => {
    return listSkillsByUser(userId);
};

const UPDATABLE_SKILL_FIELDS = ["name", "description", "category", "is_available"] as const;

export const updateSkill = async (
    id: string, userId: string, input: Record<string, unknown>
): Promise<Skill> => {
    const skill = await getSkillById(id);
    if (skill.user_id !== userId) {
        throw forbidden("Not your skill", "FORBIDDEN");
    }

    const fields: Record<string, unknown> = {};
    for (const key of UPDATABLE_SKILL_FIELDS) {
        if (input[key] !== undefined) fields[key] = input[key];
    }

    if (Object.keys(fields).length === 0) {
        throw badRequest("No valid fields provided to update", "NO_UPDATE_FIELDS");
    }

    const updated = await updateSkillFields(id, fields);
    if (!updated) throw notFound("Skill not found", "SKILL_NOT_FOUND");
    return updated;
};

export const deleteSkillById = async (id: string, userId: string): Promise<void> => {
    const skill = await getSkillById(id);
    if (skill.user_id !== userId) {
        throw forbidden("Not your skill", "FORBIDDEN");
    }
    await deleteSkill(id);
};