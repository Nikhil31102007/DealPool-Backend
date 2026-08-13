import dotenv from "dotenv";
import request from "supertest";
import { firebaseAuth } from "../src/config/firebase";

import path from "path";

dotenv.config({
    path: path.resolve(process.cwd(), "../.env"),
});

const { default: app } = await import("../src/app");

const email = `test-${Date.now()}@example.com`;
const password = "TestPassword123!";
const name = "Test User";

let authCookie: string;
let firebaseUid: string;

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

            const cookies =
                response.headers["set-cookie"] as
                    | string[]
                    | undefined;

            if (
                !cookies ||
                cookies.length === 0
            ) {
                throw new Error(
                    "Authentication cookie was not set"
                );
            }

            const accessTokenCookie =
                cookies.find((cookie) =>
                    cookie.startsWith(
                        "accessToken="
                    )
                );

            if (!accessTokenCookie) {
                throw new Error(
                    "accessToken cookie was not set"
                );
            }

            authCookie = accessTokenCookie;

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

            const cookies =
                response.headers["set-cookie"] as
                    | string[]
                    | undefined;

            if (
                !cookies ||
                cookies.length === 0
            ) {
                throw new Error(
                    "Authentication cookie was not set"
                );
            }

            const accessTokenCookie =
                cookies.find((cookie) =>
                    cookie.startsWith(
                        "accessToken="
                    )
                );

            if (!accessTokenCookie) {
                throw new Error(
                    "accessToken cookie was not set"
                );
            }

            authCookie = accessTokenCookie;
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
        "GET /api/auth/me rejects invalid cookie",
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
            if (!authCookie) {
                throw new Error(
                    "No authentication cookie available"
                );
            }

            const response = await request(app)
                .get("/api/auth/me")
                .set("Cookie", authCookie);

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
        "POST /api/auth/logout clears authentication cookie",
        async () => {
            if (!authCookie) {
                throw new Error(
                    "No authentication cookie available"
                );
            }

            const response = await request(app)
                .post("/api/auth/logout")
                .set("Cookie", authCookie);

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

            const cookies =
                response.headers["set-cookie"] as
                    | string[]
                    | undefined;

            if (
                !cookies ||
                cookies.length === 0
            ) {
                throw new Error(
                    "Clear-cookie header was not sent"
                );
            }

            const accessTokenCookie =
                cookies.find((cookie) =>
                    cookie.startsWith(
                        "accessToken="
                    )
                );

            if (!accessTokenCookie) {
                throw new Error(
                    "accessToken clear-cookie header was not sent"
                );
            }

            authCookie = accessTokenCookie;
        }
    );

    await test(
        "GET /api/auth/me rejects old cookie after logout",
        async () => {
            const response = await request(app)
                .get("/api/auth/me")
                .set("Cookie", authCookie);

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