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

const secondEmail = `test-${Date.now()}-2@example.com`;

let firebaseUid: string | undefined;
let secondFirebaseUid: string | undefined;

let accessTokenCookie: string;
let refreshTokenCookie: string;

let secondAccessTokenCookie: string;
let secondUsername: string;

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
        "POST /api/auth/register creates Firebase user and profile with generated username",
        async () => {
            const response = await request(app)
                .post("/api/auth/register")
                .send({
                    email,
                    password,
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

            if (response.body.data.email !== email) {
                throw new Error(
                    "Incorrect email returned"
                );
            }

            if (!response.body.data.username) {
                throw new Error(
                    "Username was not generated"
                );
            }

            if (response.body.data.role !== "user") {
                throw new Error(
                    "Default role should be 'user'"
                );
            }

            if (Number(response.body.data.avg_rating) !== 0) {
                throw new Error(
                    "Default avg_rating should be 0"
                );
            }

            if (response.body.data.rating_count !== 0) {
                throw new Error(
                    "Default rating_count should be 0"
                );
            }

            const cookies = getCookies(response);

            accessTokenCookie = getCookie(cookies, "accessToken");
            refreshTokenCookie = getCookie(cookies, "refreshToken");

            const user = await firebaseAuth.getUserByEmail(email);

            firebaseUid = user.uid;

            if (response.body.data.firebase_uid !== firebaseUid) {
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

            accessTokenCookie = getCookie(cookies, "accessToken");
            refreshTokenCookie = getCookie(cookies, "refreshToken");
        }
    );

    await test(
        "GET /api/auth/me rejects unauthenticated request",
        async () => {
            const response = await request(app).get("/api/auth/me");

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
                .set("Cookie", "accessToken=invalid-token");

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
                throw new Error("No access token cookie available");
            }

            const response = await request(app)
                .get("/api/auth/me")
                .set("Cookie", accessTokenCookie);

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

            if (response.body.data.firebase_uid !== firebaseUid) {
                throw new Error(
                    "Incorrect Firebase UID returned"
                );
            }
        }
    );

    await test(
        "PATCH /api/auth/update rejects unauthenticated request",
        async () => {
            const response = await request(app)
                .patch("/api/auth/update")
                .send({ username: "whatever" });

            if (response.status !== 401) {
                throw new Error(
                    `Expected 401, got ${response.status}`
                );
            }
        }
    );

    await test(
        "PATCH /api/auth/update rejects empty body",
        async () => {
            const response = await request(app)
                .patch("/api/auth/update")
                .set("Cookie", accessTokenCookie)
                .send({});

            if (response.status !== 400) {
                throw new Error(
                    `Expected 400, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
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
        "PATCH /api/auth/update ignores role field and updates username",
        async () => {
            const newUsername = `updated_user_${Date.now()}`;

            const response = await request(app)
                .patch("/api/auth/update")
                .set("Cookie", accessTokenCookie)
                .send({
                    username: newUsername,
                    role: "admin",
                });

            if (response.status !== 200) {
                throw new Error(
                    `Expected 200, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            if (response.body.data.username !== newUsername) {
                throw new Error(
                    "Username was not updated"
                );
            }

            if (response.body.data.role !== "user") {
                throw new Error(
                    "Role should not be changeable through /api/auth/update"
                );
            }
        }
    );

    await test(
        "POST /api/auth/register creates a second user for collision testing",
        async () => {
            const response = await request(app)
                .post("/api/auth/register")
                .send({
                    email: secondEmail,
                    password,
                });

            if (response.status !== 201) {
                throw new Error(
                    `Expected 201, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            secondUsername = response.body.data.username;

            const cookies = getCookies(response);

            secondAccessTokenCookie = getCookie(cookies, "accessToken");

            const user = await firebaseAuth.getUserByEmail(secondEmail);

            secondFirebaseUid = user.uid;
        }
    );

    await test(
        "PATCH /api/auth/update rejects taken username",
        async () => {
            const response = await request(app)
                .patch("/api/auth/update")
                .set("Cookie", accessTokenCookie)
                .send({ username: secondUsername });

            if (response.status !== 409) {
                throw new Error(
                    `Expected 409, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            if (response.body.error?.code !== "USERNAME_TAKEN") {
                throw new Error(
                    `Expected USERNAME_TAKEN, got ${response.body.error?.code}`
                );
            }
        }
    );

    await test(
        "PATCH /api/auth/update rejects taken email",
        async () => {
            const response = await request(app)
                .patch("/api/auth/update")
                .set("Cookie", accessTokenCookie)
                .send({ email: secondEmail });

            if (response.status !== 409) {
                throw new Error(
                    `Expected 409, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            if (response.body.error?.code !== "EMAIL_TAKEN") {
                throw new Error(
                    `Expected EMAIL_TAKEN, got ${response.body.error?.code}`
                );
            }
        }
    );

    await test(
        "POST /api/auth/refresh rejects request without refresh token",
        async () => {
            const response = await request(app).post("/api/auth/refresh");

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
                .set("Cookie", "refreshToken=invalid-refresh-token");

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
                throw new Error("No refresh token cookie available");
            }

            const response = await request(app)
                .post("/api/auth/refresh")
                .set("Cookie", refreshTokenCookie);

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

            accessTokenCookie = getCookie(cookies, "accessToken");
            refreshTokenCookie = getCookie(cookies, "refreshToken");
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
                .set("Cookie", accessTokenCookie);

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

            if (response.body.data.firebase_uid !== firebaseUid) {
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
                throw new Error("No refresh token cookie available");
            }

            const oldRefreshToken = refreshTokenCookie;

            const response = await request(app)
                .post("/api/auth/refresh")
                .set("Cookie", refreshTokenCookie);

            if (response.status !== 200) {
                throw new Error(
                    `Expected 200, got ${response.status}`
                );
            }

            const cookies = getCookies(response);

            const newAccessTokenCookie = getCookie(cookies, "accessToken");
            const newRefreshTokenCookie = getCookie(cookies, "refreshToken");

            if (newAccessTokenCookie === accessTokenCookie) {
                throw new Error("Access token was not refreshed");
            }

            if (newRefreshTokenCookie === oldRefreshToken) {
                throw new Error("Refresh token was not rotated");
            }

            accessTokenCookie = newAccessTokenCookie;
            refreshTokenCookie = newRefreshTokenCookie;
        }
    );

    await test(
        "GET /api/auth/me works after refresh token rotation",
        async () => {
            const response = await request(app)
                .get("/api/auth/me")
                .set("Cookie", accessTokenCookie);

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
        "PATCH /api/auth/change-password rejects unauthenticated request",
        async () => {
            const response = await request(app)
                .patch("/api/auth/change-password")
                .send({
                    currentPassword: password,
                    newPassword: "NewTestPassword123!",
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
        "PATCH /api/auth/change-password rejects missing current or new password",
        async () => {
            const response = await request(app)
                .patch("/api/auth/change-password")
                .set("Cookie", accessTokenCookie)
                .send({
                    currentPassword: password,
                });

            if (response.status !== 400) {
                throw new Error(
                    `Expected 400, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            if (response.body.error?.code !== "INVALID_CREDENTIALS") {
                throw new Error(
                    `Expected INVALID_CREDENTIALS, got ${response.body.error?.code}`
                );
            }
        }
    );

    await test(
        "PATCH /api/auth/change-password rejects new password shorter than 6 characters",
        async () => {
            const response = await request(app)
                .patch("/api/auth/change-password")
                .set("Cookie", accessTokenCookie)
                .send({
                    currentPassword: password,
                    newPassword: "123",
                });

            if (response.status !== 400) {
                throw new Error(
                    `Expected 400, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            if (response.body.error?.code !== "WEAK_PASSWORD") {
                throw new Error(
                    `Expected WEAK_PASSWORD, got ${response.body.error?.code}`
                );
            }
        }
    );

    await test(
        "PATCH /api/auth/change-password rejects incorrect current password",
        async () => {
            const response = await request(app)
                .patch("/api/auth/change-password")
                .set("Cookie", accessTokenCookie)
                .send({
                    currentPassword: "WrongCurrentPassword123!",
                    newPassword: "NewTestPassword123!",
                });

            if (response.status !== 401) {
                throw new Error(
                    `Expected 401, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            if (response.body.error?.code !== "INVALID_CREDENTIALS") {
                throw new Error(
                    `Expected INVALID_CREDENTIALS, got ${response.body.error?.code}`
                );
            }
        }
    );

    const newPassword = "NewTestPassword123!";

    await test(
        "PATCH /api/auth/change-password changes password successfully",
        async () => {
            const response = await request(app)
                .patch("/api/auth/change-password")
                .set("Cookie", accessTokenCookie)
                .send({
                    currentPassword: password,
                    newPassword,
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

            if (response.body.data !== null) {
                throw new Error(
                    "Expected data to be null"
                );
            }
        }
    );

    await test(
        "POST /api/auth/login fails with old password after change",
        async () => {
            const response = await request(app)
                .post("/api/auth/login")
                .send({
                    email,
                    password,
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
        "POST /api/auth/login succeeds with new password after change",
        async () => {
            const response = await request(app)
                .post("/api/auth/login")
                .send({
                    email,
                    password: newPassword,
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

            const cookies = getCookies(response);

            accessTokenCookie = getCookie(cookies, "accessToken");
            refreshTokenCookie = getCookie(cookies, "refreshToken");
        }
    );

    await test(
        "POST /api/auth/logout clears access and refresh cookies",
        async () => {
            const response = await request(app)
                .post("/api/auth/logout")
                .set("Cookie", [accessTokenCookie, refreshTokenCookie]);

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

            const accessCookie = cookies.find((cookie) =>
                cookie.startsWith("accessToken=")
            );

            const refreshCookie = cookies.find((cookie) =>
                cookie.startsWith("refreshToken=")
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
                .set("Cookie", accessTokenCookie);

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
                .set("Cookie", refreshTokenCookie);

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
            await firebaseAuth.deleteUser(firebaseUid);
        } catch (error) {
            console.error("Firebase test user cleanup failed:", error);
        }
    }

    if (secondFirebaseUid) {
        try {
            await firebaseAuth.deleteUser(secondFirebaseUid);
        } catch (error) {
            console.error(
                "Firebase second test user cleanup failed:",
                error
            );
        }
    }

    console.log("\nAuth tests completed.\n");
}