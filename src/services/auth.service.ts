import { firebaseAuth } from "../config/firebase";
import { generateUsername } from "../utils/username";
import {
    findProfileByFirebaseUid,
    findProfileByEmail,
    insertProfile,
    updateProfileFields,
    Profile,
} from "../models/user.model";
import { unauthorized, conflict, notFound, badRequest } from "../utils/errors";

interface FirebaseAuthResponse {
    localId: string;
    email: string;
    idToken: string;
    refreshToken: string;
    expiresIn: string;
}

interface FirebaseRefreshResponse {
    id_token: string;
    refresh_token: string;
    expires_in: string;
    user_id: string;
    project_id: string;
    token_type: string;
}

const firebaseApiKey = process.env.FIREBASE_API_KEY;

if (!firebaseApiKey) {
    throw new Error("FIREBASE_API_KEY is not configured");
}

const firebaseAuthUrl = "https://identitytoolkit.googleapis.com/v1/accounts";
const firebaseSecureTokenUrl = "https://securetoken.googleapis.com/v1/token";

const firebaseRequest = async <T>(
    endpoint: string,
    body: Record<string, unknown>
): Promise<T> => {
    const response = await fetch(
        `${firebaseAuthUrl}:${endpoint}?key=${firebaseApiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }
    );

    const data = await response.json();

    if (!response.ok) {
        const message = data?.error?.message ?? "Firebase authentication failed";

        if (message === "EMAIL_EXISTS") {
            throw conflict("Email already exists", "EMAIL_EXISTS");
        }

        if (
            message === "EMAIL_NOT_FOUND" ||
            message === "INVALID_PASSWORD" ||
            message === "INVALID_LOGIN_CREDENTIALS"
        ) {
            throw unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
        }

        throw unauthorized("Firebase authentication failed", "FIREBASE_AUTH_FAILED");
    }

    return data as T;
};

export const registerUser = async (email: string, password: string) => {
    if (!email || !password) {
        throw unauthorized("Email and password are required", "INVALID_CREDENTIALS");
    }

    const existing = await findProfileByEmail(email);

    if (existing) {
        throw conflict("Profile already exists", "PROFILE_EXISTS");
    }

    const firebaseUser = await firebaseRequest<FirebaseAuthResponse>("signUp", {
        email,
        password,
        returnSecureToken: true,
    });

    try {
        const profile = await createProfile(firebaseUser.localId);

        return {
            profile,
            token: firebaseUser.idToken,
            refreshToken: firebaseUser.refreshToken,
        };
    } catch (error) {
        try {
            await firebaseAuth.deleteUser(firebaseUser.localId);
        } catch (cleanupError) {
            console.error("FIREBASE USER CLEANUP ERROR:", cleanupError);
        }

        throw error;
    }
};

export const loginUser = async (email: string, password: string) => {
    if (!email || !password) {
        throw unauthorized("Email and password are required", "INVALID_CREDENTIALS");
    }

    const firebaseUser = await firebaseRequest<FirebaseAuthResponse>(
        "signInWithPassword",
        { email, password, returnSecureToken: true }
    );

    const profile = await getProfile(firebaseUser.localId);

    return {
        profile,
        token: firebaseUser.idToken,
        refreshToken: firebaseUser.refreshToken,
    };
};

export const refreshFirebaseToken = async (refreshToken: string) => {
    if (!refreshToken) {
        throw unauthorized("Refresh token is required", "INVALID_REFRESH_TOKEN");
    }

    const response = await fetch(`${firebaseSecureTokenUrl}?key=${firebaseApiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
        }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw unauthorized("Invalid or expired refresh token", "INVALID_REFRESH_TOKEN");
    }

    const refreshed = data as FirebaseRefreshResponse;

    return {
        token: refreshed.id_token,
        refreshToken: refreshed.refresh_token,
        expiresIn: refreshed.expires_in,
        uid: refreshed.user_id,
    };
};

export const createProfile = async (uid: string): Promise<Profile> => {
    const firebaseUser = await firebaseAuth.getUser(uid);

    const existing = await findProfileByFirebaseUid(uid);

    if (existing) {
        throw conflict("Profile already exists", "PROFILE_EXISTS");
    }

    const maxAttempts = 5;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const username = generateUsername();

        try {
            return await insertProfile({
                firebaseUid: uid,
                username,
                email: firebaseUser.email ?? null,
                profilePhoto: firebaseUser.photoURL ?? null,
            });
        } catch (error) {
            const pgError = error as { code?: string; constraint?: string };

            if (pgError.code === "23505" && pgError.constraint === "profiles_name_key") {
                lastError = error;
                continue;
            }

            throw error;
        }
    }

    throw lastError;
};

export const getProfile = async (uid: string): Promise<Profile> => {
    const profile = await findProfileByFirebaseUid(uid);

    if (!profile) {
        throw unauthorized("User profile not found", "PROFILE_NOT_FOUND");
    }

    return profile;
};

export const findProfile = async (uid: string): Promise<Profile | null> => {
    return findProfileByFirebaseUid(uid);
};

export const verifyFirebaseToken = async (token: string) => {
    try {
        return await firebaseAuth.verifyIdToken(token);
    } catch (error) {
        console.error("FIREBASE VERIFY ERROR:", error);
        throw unauthorized("Invalid or expired authentication token", "INVALID_TOKEN");
    }
};

export const googleLoginUser = async (idToken: string) => {
    if (!idToken) {
        throw unauthorized("Firebase ID token is required", "INVALID_TOKEN");
    }

    const decoded = await verifyFirebaseToken(idToken);

    let profile = await findProfile(decoded.uid);

    if (!profile) {
        profile = await createProfile(decoded.uid);
    }

    return { profile, token: idToken };
};

interface UpdateProfileInput {
    username?: string;
    email?: string;
    profile_photo?: string;
}

const UPDATABLE_FIELDS: (keyof UpdateProfileInput)[] = [
    "username",
    "email",
    "profile_photo",
];

export const updateProfile = async (
    uid: string,
    updates: UpdateProfileInput
): Promise<Profile> => {
    const fields: Record<string, unknown> = {};

    for (const key of UPDATABLE_FIELDS) {
        if (updates[key] !== undefined) {
            fields[key] = updates[key];
        }
    }

    if (Object.keys(fields).length === 0) {
        throw badRequest("No valid fields provided to update", "NO_UPDATE_FIELDS");
    }

    try {
        const profile = await updateProfileFields(uid, fields);

        if (!profile) {
            throw notFound("User profile not found", "PROFILE_NOT_FOUND");
        }

        return profile;
    } catch (error) {
        const pgError = error as { code?: string; constraint?: string };

        if (pgError.code === "23505") {
            if (pgError.constraint === "profiles_name_key") {
                throw conflict("Username already taken", "USERNAME_TAKEN");
            }
            if (pgError.constraint === "profiles_email_key") {
                throw conflict("Email already in use", "EMAIL_TAKEN");
            }
        }

        throw error;
    }
};