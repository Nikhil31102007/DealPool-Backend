import { firebaseAuth } from "../config/firebase";
import pool from "../config/db";
import {
    unauthorized,
    conflict,
} from "../utils/errors";

interface FirebaseAuthResponse {
    localId: string;
    email: string;
    idToken: string;
    refreshToken: string;
    expiresIn: string;
}

const firebaseApiKey = process.env.FIREBASE_API_KEY;

if (!firebaseApiKey) {
    throw new Error("FIREBASE_API_KEY is not configured");
}

const firebaseAuthUrl =
    "https://identitytoolkit.googleapis.com/v1/accounts";

const firebaseRequest = async <T>(
    endpoint: string,
    body: Record<string, unknown>
): Promise<T> => {
    const response = await fetch(
        `${firebaseAuthUrl}:${endpoint}?key=${firebaseApiKey}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        }
    );

    const data = await response.json();

    if (!response.ok) {
        const message =
            data?.error?.message ?? "Firebase authentication failed";

        if (
            message === "EMAIL_EXISTS" ||
            message === "EMAIL_NOT_FOUND"
        ) {
            throw conflict(
                "Email already exists",
                "EMAIL_EXISTS"
            );
        }

        if (
            message === "INVALID_PASSWORD" ||
            message === "INVALID_LOGIN_CREDENTIALS"
        ) {
            throw unauthorized(
                "Invalid email or password",
                "INVALID_CREDENTIALS"
            );
        }

        throw unauthorized(
            "Firebase authentication failed",
            "FIREBASE_AUTH_FAILED"
        );
    }

    return data as T;
};

export const registerUser = async (
    email: string,
    password: string,
    name?: string
) => {
    if (!email || !password) {
        throw unauthorized(
            "Email and password are required",
            "INVALID_CREDENTIALS"
        );
    }

    const existing = await pool.query(
        `
        SELECT id
        FROM profiles
        WHERE email = $1
        `,
        [email]
    );

    if (existing.rows.length > 0) {
        throw conflict(
            "Profile already exists",
            "PROFILE_EXISTS"
        );
    }

    const firebaseUser =
        await firebaseRequest<FirebaseAuthResponse>(
            "signUp",
            {
                email,
                password,
                returnSecureToken: true,
            }
        );

    try {
        if (name) {
            await firebaseAuth.updateUser(
                firebaseUser.localId,
                {
                    displayName: name,
                }
            );
        }

        const profile = await createProfile(
            firebaseUser.localId
        );

        return {
            profile,
            token: firebaseUser.idToken,
        };
    } catch (error) {
        try {
            await firebaseAuth.deleteUser(
                firebaseUser.localId
            );
        } catch (cleanupError) {
            console.error(
                "FIREBASE USER CLEANUP ERROR:",
                cleanupError
            );
        }

        throw error;
    }
};

export const loginUser = async (
    email: string,
    password: string
) => {
    if (!email || !password) {
        throw unauthorized(
            "Email and password are required",
            "INVALID_CREDENTIALS"
        );
    }

    const firebaseUser =
        await firebaseRequest<FirebaseAuthResponse>(
            "signInWithPassword",
            {
                email,
                password,
                returnSecureToken: true,
            }
        );

    const profile = await getProfile(
        firebaseUser.localId
    );

    return {
        profile,
        token: firebaseUser.idToken,
    };
};

export const createProfile = async (
    uid: string
) => {
    const firebaseUser =
        await firebaseAuth.getUser(uid);

    const existing = await pool.query(
        `
        SELECT id
        FROM profiles
        WHERE firebase_uid = $1
        `,
        [uid]
    );

    if (existing.rows.length > 0) {
        throw conflict(
            "Profile already exists",
            "PROFILE_EXISTS"
        );
    }

    const result = await pool.query(
        `
        INSERT INTO profiles (
            firebase_uid,
            name,
            email,
            phone,
            profile_photo
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [
            uid,
            firebaseUser.displayName ?? null,
            firebaseUser.email ?? null,
            firebaseUser.phoneNumber ?? null,
            firebaseUser.photoURL ?? null,
        ]
    );

    return result.rows[0];
};

export const getProfile = async (
    uid: string
) => {
    const result = await pool.query(
        `
        SELECT *
        FROM profiles
        WHERE firebase_uid = $1
        `,
        [uid]
    );

    if (result.rows.length === 0) {
        throw unauthorized(
            "User profile not found",
            "PROFILE_NOT_FOUND"
        );
    }

    return result.rows[0];
};

export const verifyFirebaseToken = async (
    token: string
) => {
    try {
        return await firebaseAuth.verifyIdToken(
            token
        );
    } catch (error) {
        console.error(
            "FIREBASE VERIFY ERROR:",
            error
        );

        throw unauthorized(
            "Invalid or expired authentication token",
            "INVALID_TOKEN"
        );
    }
};