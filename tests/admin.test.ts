import dotenv from "dotenv";
import path from "path";
import request from "supertest";
import { firebaseAuth } from "../src/config/firebase";
import pool from "../src/config/db";

dotenv.config({
    path: path.resolve(process.cwd(), ".env"),
});

const { default: app } = await import("../src/app");

const adminEmail = `admin-test-${Date.now()}@example.com`;
const targetEmail = `target-test-${Date.now()}@example.com`;
const password = "TestPassword123!";

let adminFirebaseUid: string | undefined;
let targetFirebaseUid: string | undefined;
let targetProfileId: string | undefined;

let adminAccessTokenCookie: string;
let targetAccessTokenCookie: string;

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

const getCookies = (response: request.Response): string[] => {
    const cookies = response.headers["set-cookie"];

    if (!cookies) {
        return [];
    }

    return Array.isArray(cookies) ? cookies : [cookies];
};

const getCookie = (cookies: string[], name: string): string => {
    const cookie = cookies.find((value) => value.startsWith(`${name}=`));

    if (!cookie) {
        throw new Error(`${name} cookie was not set`);
    }

    return cookie;
};

try {
    await test(
        "setup: register admin user",
        async () => {
            const response = await request(app)
                .post("/api/auth/register")
                .send({ email: adminEmail, password });

            if (response.status !== 201) {
                throw new Error(
                    `Expected 201, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            const cookies = getCookies(response);
            adminAccessTokenCookie = getCookie(cookies, "accessToken");

            const user = await firebaseAuth.getUserByEmail(adminEmail);
            adminFirebaseUid = user.uid;

            await pool.query(
                `UPDATE profiles SET role = 'admin' WHERE firebase_uid = $1`,
                [adminFirebaseUid]
            );
        }
    );

    await test(
        "setup: register target (regular) user",
        async () => {
            const response = await request(app)
                .post("/api/auth/register")
                .send({ email: targetEmail, password });

            if (response.status !== 201) {
                throw new Error(
                    `Expected 201, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            targetProfileId = response.body.data.id;

            const cookies = getCookies(response);
            targetAccessTokenCookie = getCookie(cookies, "accessToken");

            const user = await firebaseAuth.getUserByEmail(targetEmail);
            targetFirebaseUid = user.uid;
        }
    );

    await test(
        "GET /api/admin/users rejects unauthenticated request",
        async () => {
            const response = await request(app).get("/api/admin/users");

            if (response.status !== 401) {
                throw new Error(
                    `Expected 401, got ${response.status}`
                );
            }
        }
    );

    await test(
        "GET /api/admin/users rejects non-admin user",
        async () => {
            const response = await request(app)
                .get("/api/admin/users")
                .set("Cookie", targetAccessTokenCookie);

            if (response.status !== 403) {
                throw new Error(
                    `Expected 403, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            if (response.body.success !== false) {
                throw new Error("Expected success to be false");
            }
        }
    );

    await test(
        "GET /api/admin/users returns list for admin",
        async () => {
            const response = await request(app)
                .get("/api/admin/users")
                .set("Cookie", adminAccessTokenCookie);

            if (response.status !== 200) {
                throw new Error(
                    `Expected 200, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            if (!Array.isArray(response.body.data)) {
                throw new Error("Expected data to be an array");
            }

            const found = response.body.data.find(
                (profile: { id: string }) => profile.id === targetProfileId
            );

            if (!found) {
                throw new Error(
                    "Target user was not present in admin user list"
                );
            }
        }
    );

    await test(
        "GET /api/admin/users/:id returns single profile for admin",
        async () => {
            const response = await request(app)
                .get(`/api/admin/users/${targetProfileId}`)
                .set("Cookie", adminAccessTokenCookie);

            if (response.status !== 200) {
                throw new Error(
                    `Expected 200, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            if (response.body.data.id !== targetProfileId) {
                throw new Error("Returned wrong profile");
            }
        }
    );

    await test(
        "GET /api/admin/users/:id returns 404 for nonexistent profile",
        async () => {
            const response = await request(app)
                .get("/api/admin/users/00000000-0000-0000-0000-000000000000")
                .set("Cookie", adminAccessTokenCookie);

            if (response.status !== 404) {
                throw new Error(
                    `Expected 404, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }
        }
    );

    await test(
        "PATCH /api/admin/users/:id/role rejects non-admin user",
        async () => {
            const response = await request(app)
                .patch(`/api/admin/users/${targetProfileId}/role`)
                .set("Cookie", targetAccessTokenCookie)
                .send({ role: "admin" });

            if (response.status !== 403) {
                throw new Error(
                    `Expected 403, got ${response.status}`
                );
            }
        }
    );

    await test(
        "PATCH /api/admin/users/:id/role rejects invalid role",
        async () => {
            const response = await request(app)
                .patch(`/api/admin/users/${targetProfileId}/role`)
                .set("Cookie", adminAccessTokenCookie)
                .send({ role: "superuser" });

            if (response.status !== 400) {
                throw new Error(
                    `Expected 400, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            if (response.body.error?.code !== "INVALID_ROLE") {
                throw new Error(
                    `Expected INVALID_ROLE, got ${response.body.error?.code}`
                );
            }
        }
    );

    await test(
        "PATCH /api/admin/users/:id/role promotes target to admin",
        async () => {
            const response = await request(app)
                .patch(`/api/admin/users/${targetProfileId}/role`)
                .set("Cookie", adminAccessTokenCookie)
                .send({ role: "admin" });

            if (response.status !== 200) {
                throw new Error(
                    `Expected 200, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            if (response.body.data.role !== "admin") {
                throw new Error("Role was not updated to admin");
            }
        }
    );

    await test(
        "Promoted target user can now access admin routes",
        async () => {
            const response = await request(app)
                .get("/api/admin/users")
                .set("Cookie", targetAccessTokenCookie);

            if (response.status !== 200) {
                throw new Error(
                    `Expected 200, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }
        }
    );

    await test(
        "PATCH /api/admin/users/:id/role demotes target back to user",
        async () => {
            const response = await request(app)
                .patch(`/api/admin/users/${targetProfileId}/role`)
                .set("Cookie", adminAccessTokenCookie)
                .send({ role: "user" });

            if (response.status !== 200) {
                throw new Error(
                    `Expected 200, got ${response.status}`
                );
            }

            if (response.body.data.role !== "user") {
                throw new Error("Role was not reverted to user");
            }
        }
    );

    await test(
        "PATCH /api/auth/update cannot change own role back to admin",
        async () => {
            const response = await request(app)
                .patch("/api/auth/update")
                .set("Cookie", targetAccessTokenCookie)
                .send({ role: "admin" });

            if (response.status !== 400) {
                throw new Error(
                    `Expected 400 (no valid fields), got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }
        }
    );

    await test(
        "DELETE /api/admin/users/:id rejects non-admin user",
        async () => {
            const response = await request(app)
                .delete(`/api/admin/users/${targetProfileId}`)
                .set("Cookie", targetAccessTokenCookie);

            if (response.status !== 403) {
                throw new Error(
                    `Expected 403, got ${response.status}`
                );
            }
        }
    );

    await test(
        "DELETE /api/admin/users/:id removes the profile",
        async () => {
            const response = await request(app)
                .delete(`/api/admin/users/${targetProfileId}`)
                .set("Cookie", adminAccessTokenCookie);

            if (response.status !== 200) {
                throw new Error(
                    `Expected 200, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }

            if (response.body.data !== null) {
                throw new Error("Expected delete data to be null");
            }
        }
    );

    await test(
        "GET /api/admin/users/:id returns 404 after deletion",
        async () => {
            const response = await request(app)
                .get(`/api/admin/users/${targetProfileId}`)
                .set("Cookie", adminAccessTokenCookie);

            if (response.status !== 404) {
                throw new Error(
                    `Expected 404, got ${response.status}`
                );
            }
        }
    );

    await test(
        "GET /api/auth/me fails for deleted profile even with old cookie",
        async () => {
            const response = await request(app)
                .get("/api/auth/me")
                .set("Cookie", targetAccessTokenCookie);

            if (response.status !== 401) {
                throw new Error(
                    `Expected 401, got ${response.status}: ${JSON.stringify(
                        response.body
                    )}`
                );
            }
        }
    );
} finally {
    if (adminFirebaseUid) {
        try {
            await firebaseAuth.deleteUser(adminFirebaseUid);
        } catch (error) {
            console.error("Firebase admin user cleanup failed:", error);
        }
    }

    if (targetFirebaseUid) {
        try {
            await firebaseAuth.deleteUser(targetFirebaseUid);
        } catch (error) {
            console.error(
                "Firebase target user cleanup failed:",
                error
            );
        }
    }

    await pool.end();

    console.log("\nAdmin tests completed.\n");
}