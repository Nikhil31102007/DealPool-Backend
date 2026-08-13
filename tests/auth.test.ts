import dotenv from "dotenv";
import path from "path";
import request from "supertest";
import { firebaseAuth } from "../src/config/firebase";

dotenv.config({
    path: path.resolve(process.cwd(), ".env"),
});

const { default: app } = await import("../src/app");

const email = `test-${Date.now()}@example.com`;
const password = "TestPassword123!";
const name = "Test User";

let firebaseUid: string | undefined;

let accessTokenCookie: string;
let refreshTokenCookie: string;

const test = async (
    name: string,
    fn: () => Promise<void>
): Promise<void> => {
    try {
        await fn();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        console.error(error);
        process.exitCode = 1;
    }
};

const getCookies = (
    response: request.Response
): string[] => {
    const cookies = response.headers["set-cookie"];

    if (!cookies) {
        return [];
    }

    return Array.isArray(cookies)
        ? cookies
        : [cookies];
};

const getCookie = (
    cookies: string[],
    name: string
): string => {
    const cookie = cookies.find((value) =>
        value.startsWith(`${name}=`)
    );

    if (!cookie) {
        throw new Error(
            `${name} cookie was not set`
        );
    }

    return cookie;
};

try {
    await test(
        "POST /api/auth/register rejects missing credentials",
        async () => {
            const response = await request(app)
                .post("/api/auth/register")
                .send({});

            if (response.status !== 401) {
                throw new Error(
                    `Expected 401, got ${response.status}`
                );
            }

            if (response.body.success !== false) {
                throw new Error(
                    "Expected success to be false"
                );
            }
        }
    );

    await test(
        "POST /api/auth/register creates Firebase user and profile",
        async () => {
            const response = await request(app)
                .post("/api/auth/register")
                .send({
                    email,
                    password,
                    name,
                });

            if (response.status !== 201) {
                throw new Error(
                    `Expected 201, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            if (response.body.success !== true) {
                throw new Error(
                    "Expected success to be true"
                );
            }

            if (!response.body.data) {
                throw new Error(
                    "Profile was not returned"
                );
            }

            if (
                response.body.data.email !== email
            ) {
                throw new Error(
                    "Incorrect email returned"
                );
            }

            if (
                response.body.data.name !== name
            ) {
                throw new Error(
                    "Incorrect name returned"
                );
            }

            const cookies = getCookies(response);

            accessTokenCookie = getCookie(
                cookies,
                "accessToken"
            );

            refreshTokenCookie = getCookie(
                cookies,
                "refreshToken"
            );

            const user =
                await firebaseAuth.getUserByEmail(
                    email
                );

            firebaseUid = user.uid;

            if (
                response.body.data.firebase_uid !==
                firebaseUid
            ) {
                throw new Error(
                    "Profile Firebase UID does not match Firebase user"
                );
            }
        }
    );

    await test(
        "POST /api/auth/register rejects duplicate registration",
        async () => {
            const response = await request(app)
                .post("/api/auth/register")
                .send({
                    email,
                    password,
                    name,
                });

            if (response.status !== 409) {
                throw new Error(
                    `Expected 409, got ${response.status}`
                );
            }

            if (response.body.success !== false) {
                throw new Error(
                    "Expected success to be false"
                );
            }
        }
    );

    await test(
        "POST /api/auth/login rejects missing credentials",
        async () => {
            const response = await request(app)
                .post("/api/auth/login")
                .send({});

            if (response.status !== 401) {
                throw new Error(
                    `Expected 401, got ${response.status}`
                );
            }

            if (response.body.success !== false) {
                throw new Error(
                    "Expected success to be false"
                );
            }
        }
    );

    await test(
        "POST /api/auth/login rejects invalid credentials",
        async () => {
            const response = await request(app)
                .post("/api/auth/login")
                .send({
                    email,
                    password: "WrongPassword123!",
                });

            if (response.status !== 401) {
                throw new Error(
                    `Expected 401, got ${response.status}`
                );
            }

            if (response.body.success !== false) {
                throw new Error(
                    "Expected success to be false"
                );
            }
        }
    );

    await test(
        "POST /api/auth/login logs in user",
        async () => {
            const response = await request(app)
                .post("/api/auth/login")
                .send({
                    email,
                    password,
                });

            if (response.status !== 200) {
                throw new Error(
                    `Expected 200, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            if (response.body.success !== true) {
                throw new Error(
                    "Expected success to be true"
                );
            }

            if (!response.body.data) {
                throw new Error(
                    "User data was not returned"
                );
            }

            const cookies = getCookies(response);

            accessTokenCookie = getCookie(
                cookies,
                "accessToken"
            );

            refreshTokenCookie = getCookie(
                cookies,
                "refreshToken"
            );
        }
    );

    await test(
        "GET /api/auth/me rejects unauthenticated request",
        async () => {
            const response = await request(app)
                .get("/api/auth/me");

            if (response.status !== 401) {
                throw new Error(
                    `Expected 401, got ${response.status}`
                );
            }

            if (response.body.success !== false) {
                throw new Error(
                    "Expected success to be false"
                );
            }
        }
    );

    await test(
        "GET /api/auth/me rejects invalid access token",
        async () => {
            const response = await request(app)
                .get("/api/auth/me")
                .set(
                    "Cookie",
                    "accessToken=invalid-token"
                );

            if (response.status !== 401) {
                throw new Error(
                    `Expected 401, got ${response.status}`
                );
            }

            if (response.body.success !== false) {
                throw new Error(
                    "Expected success to be false"
                );
            }
        }
    );

    await test(
        "GET /api/auth/me returns authenticated user",
        async () => {
            if (!accessTokenCookie) {
                throw new Error(
                    "No access token cookie available"
                );
            }

            const response = await request(app)
                .get("/api/auth/me")
                .set(
                    "Cookie",
                    accessTokenCookie
                );

            if (response.status !== 200) {
                throw new Error(
                    `Expected 200, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            if (response.body.success !== true) {
                throw new Error(
                    "Expected success to be true"
                );
            }

            if (!response.body.data) {
                throw new Error(
                    "User profile was not returned"
                );
            }

            if (
                response.body.data.firebase_uid !==
                firebaseUid
            ) {
                throw new Error(
                    "Incorrect Firebase UID returned"
                );
            }
        }
    );

    await test(
        "POST /api/auth/refresh rejects request without refresh token",
        async () => {
            const response = await request(app)
                .post("/api/auth/refresh");

            if (response.status !== 401) {
                throw new Error(
                    `Expected 401, got ${response.status}`
                );
            }

            if (response.body.success !== false) {
                throw new Error(
                    "Expected success to be false"
                );
            }
        }
    );

    await test(
        "POST /api/auth/refresh rejects invalid refresh token",
        async () => {
            const response = await request(app)
                .post("/api/auth/refresh")
                .set(
                    "Cookie",
                    "refreshToken=invalid-refresh-token"
                );

            if (response.status !== 401) {
                throw new Error(
                    `Expected 401, got ${response.status}`
                );
            }

            if (response.body.success !== false) {
                throw new Error(
                    "Expected success to be false"
                );
            }
        }
    );

    await test(
        "POST /api/auth/refresh creates new access token",
        async () => {
            if (!refreshTokenCookie) {
                throw new Error(
                    "No refresh token cookie available"
                );
            }

            const response = await request(app)
                .post("/api/auth/refresh")
                .set(
                    "Cookie",
                    refreshTokenCookie
                );

            if (response.status !== 200) {
                throw new Error(
                    `Expected 200, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            if (response.body.success !== true) {
                throw new Error(
                    "Expected success to be true"
                );
            }

            const cookies = getCookies(response);

            accessTokenCookie = getCookie(
                cookies,
                "accessToken"
            );

            refreshTokenCookie = getCookie(
                cookies,
                "refreshToken"
            );
        }
    );

    await test(
        "GET /api/auth/me works with refreshed access token",
        async () => {
            if (!accessTokenCookie) {
                throw new Error(
                    "No refreshed access token cookie available"
                );
            }

            const response = await request(app)
                .get("/api/auth/me")
                .set(
                    "Cookie",
                    accessTokenCookie
                );

            if (response.status !== 200) {
                throw new Error(
                    `Expected 200, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            if (response.body.success !== true) {
                throw new Error(
                    "Expected success to be true"
                );
            }

            if (
                response.body.data.firebase_uid !==
                firebaseUid
            ) {
                throw new Error(
                    "Incorrect Firebase UID after refresh"
                );
            }
        }
    );

    await test(
        "POST /api/auth/refresh rotates refresh token",
        async () => {
            if (!refreshTokenCookie) {
                throw new Error(
                    "No refresh token cookie available"
                );
            }

            const oldRefreshToken =
                refreshTokenCookie;

            const response = await request(app)
                .post("/api/auth/refresh")
                .set(
                    "Cookie",
                    refreshTokenCookie
                );

            if (response.status !== 200) {
                throw new Error(
                    `Expected 200, got ${response.status}`
                );
            }

            const cookies = getCookies(response);

            const newAccessTokenCookie =
                getCookie(
                    cookies,
                    "accessToken"
                );

            const newRefreshTokenCookie =
                getCookie(
                    cookies,
                    "refreshToken"
                );

            if (
                newAccessTokenCookie ===
                accessTokenCookie
            ) {
                throw new Error(
                    "Access token was not refreshed"
                );
            }

            if (
                newRefreshTokenCookie ===
                oldRefreshToken
            ) {
                throw new Error(
                    "Refresh token was not rotated"
                );
            }

            accessTokenCookie =
                newAccessTokenCookie;

            refreshTokenCookie =
                newRefreshTokenCookie;
        }
    );

    await test(
        "GET /api/auth/me works after refresh token rotation",
        async () => {
            const response = await request(app)
                .get("/api/auth/me")
                .set(
                    "Cookie",
                    accessTokenCookie
                );

            if (response.status !== 200) {
                throw new Error(
                    `Expected 200, got ${response.status}`
                );
            }

            if (response.body.success !== true) {
                throw new Error(
                    "Expected success to be true"
                );
            }
        }
    );

    await test(
        "POST /api/auth/logout clears access and refresh cookies",
        async () => {
            const response = await request(app)
                .post("/api/auth/logout")
                .set(
                    "Cookie",
                    [
                        accessTokenCookie,
                        refreshTokenCookie,
                    ]
                );

            if (response.status !== 200) {
                throw new Error(
                    `Expected 200, got ${response.status}`
                );
            }

            if (response.body.success !== true) {
                throw new Error(
                    "Expected success to be true"
                );
            }

            if (response.body.data !== null) {
                throw new Error(
                    "Expected logout data to be null"
                );
            }

            const cookies = getCookies(response);

            const accessCookie =
                cookies.find((cookie) =>
                    cookie.startsWith(
                        "accessToken="
                    )
                );

            const refreshCookie =
                cookies.find((cookie) =>
                    cookie.startsWith(
                        "refreshToken="
                    )
                );

            if (!accessCookie) {
                throw new Error(
                    "Access token clear-cookie header was not sent"
                );
            }

            if (!refreshCookie) {
                throw new Error(
                    "Refresh token clear-cookie header was not sent"
                );
            }

            accessTokenCookie = accessCookie;
            refreshTokenCookie = refreshCookie;
        }
    );

    await test(
        "GET /api/auth/me rejects old access token after logout",
        async () => {
            const response = await request(app)
                .get("/api/auth/me")
                .set(
                    "Cookie",
                    accessTokenCookie
                );

            if (response.status !== 401) {
                throw new Error(
                    `Expected 401 after logout, got ${response.status}`
                );
            }

            if (response.body.success !== false) {
                throw new Error(
                    "Expected success to be false"
                );
            }
        }
    );

    await test(
        "POST /api/auth/refresh rejects cleared refresh token",
        async () => {
            const response = await request(app)
                .post("/api/auth/refresh")
                .set(
                    "Cookie",
                    refreshTokenCookie
                );

            if (response.status !== 401) {
                throw new Error(
                    `Expected 401 after logout, got ${response.status}`
                );
            }

            if (response.body.success !== false) {
                throw new Error(
                    "Expected success to be false"
                );
            }
        }
    );
} finally {
    if (firebaseUid) {
        try {
            await firebaseAuth.deleteUser(
                firebaseUid
            );
        } catch (error) {
            console.error(
                "Firebase test user cleanup failed:",
                error
            );
        }
    }

    console.log(
        "\nAuth tests completed.\n"
    );
}