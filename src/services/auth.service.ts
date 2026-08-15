import { firebaseAuth } from "../config/firebase";
import { generateUsername } from "../utils/username";
import {
    findProfileByFirebaseUid,
    findProfileById,
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

    if (password.length < 6) {
        throw badRequest(
            "New password must be at least 6 characters",
            "WEAK_PASSWORD"
        );
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

    // login flow only ever has the Firebase UID at this point, so this lookup is correct as-is
    const profile = await findProfileByFirebaseUidOrThrow(firebaseUser.localId);

    return {
        profile,
        token: firebaseUser.idToken,
        refreshToken: firebaseUser.refreshToken,
    };
};

const findProfileByFirebaseUidOrThrow = async (firebaseUid: string): Promise<Profile> => {
    const profile = await findProfileByFirebaseUid(firebaseUid);

    if (!profile) {
        throw unauthorized("User profile not found", "PROFILE_NOT_FOUND");
    }

    return profile;
};

export const refreshFirebaseToken = async (refreshToken: string | undefined) => {
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

/**
 * Used by GET /api/auth/me and PATCH /api/auth/change-password.
 * Called with req.user!.uid, which is the POSTGRES profile id (per authMiddleware),
 * NOT the Firebase UID — so this must look up by Postgres id.
 */
export const getProfile = async (postgresUid: string): Promise<Profile> => {
    const profile = await findProfileById(postgresUid);

    if (!profile) {
        throw unauthorized("User profile not found", "PROFILE_NOT_FOUND");
    }

    return profile;
};

/**
 * Used only by authMiddleware, which passes the FIREBASE UID from the decoded token.
 * Keep this looking up by firebase_uid.
 */
export const findProfile = async (firebaseUid: string): Promise<Profile | null> => {
    return findProfileByFirebaseUid(firebaseUid);
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

/**
 * Called with req.user!.uid (POSTGRES id) from PATCH /api/auth/update.
 * updateProfileFields must match on the Postgres profiles.id column.
 */
export const updateProfile = async (
    postgresUid: string,
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
        const profile = await updateProfileFields(postgresUid, fields);

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

/**
 * Called with req.user!.uid (POSTGRES id) from PATCH /api/auth/change-password.
 * Must look up the profile by Postgres id to find the associated firebase_uid,
 * then use THAT firebase_uid for the Firebase Admin SDK call — not the postgresUid param.
 */
export const changeUserPassword = async (
    postgresUid: string,
    currentPassword: string,
    newPassword: string
): Promise<void> => {
    if (!currentPassword || !newPassword) {
        throw badRequest(
            "Current password and new password are required",
            "INVALID_CREDENTIALS"
        );
    }

    if (newPassword.length < 6) {
        throw badRequest(
            "New password must be at least 6 characters",
            "WEAK_PASSWORD"
        );
    }

    const profile = await findProfileById(postgresUid);

    if (!profile) {
        throw unauthorized("User profile not found", "UNAUTHORIZED");
    }

    // Verify current password by signing in via Firebase REST
    const verifyResponse = await fetch(
        `${firebaseAuthUrl}:signInWithPassword?key=${firebaseApiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: profile.email,
                password: currentPassword,
                returnSecureToken: false,
            }),
        }
    );

    if (!verifyResponse.ok) {
        throw unauthorized(
            "Current password is incorrect",
            "INVALID_CREDENTIALS"
        );
    }

    // Update password via Firebase Admin SDK — must use the FIREBASE uid, not postgresUid
    await firebaseAuth.updateUser(profile.firebase_uid, { password: newPassword });
};