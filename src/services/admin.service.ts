import {
    listProfiles as listProfilesModel,
    findProfileById,
    updateProfileRole,
    deleteProfile,
} from "../models/user.model";
import { notFound } from "../utils/errors";
import type { UserRole } from "../utils/types";

export const listProfiles = async (limit = 50, offset = 0) => {
    return listProfilesModel(limit, offset);
};

export const getProfileById = async (id: string) => {
    const profile = await findProfileById(id);

    if (!profile) {
        throw notFound("Profile not found", "PROFILE_NOT_FOUND");
    }

    return profile;
};

export const updateUserRole = async (id: string, role: UserRole) => {
    const profile = await updateProfileRole(id, role);

    if (!profile) {
        throw notFound("Profile not found", "PROFILE_NOT_FOUND");
    }

    return profile;
};

export const deleteProfileById = async (id: string) => {
    const profile = await deleteProfile(id);

    if (!profile) {
        throw notFound("Profile not found", "PROFILE_NOT_FOUND");
    }

    return profile;
};