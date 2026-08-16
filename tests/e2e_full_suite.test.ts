import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
import request from "supertest";
import pool from "../src/config/db";
import { firebaseAuth } from "../src/config/firebase";
import { getRazorpayKeySecret } from "../src/config/razorpay";

dotenv.config({
    path: path.resolve(process.cwd(), ".env"),
});

const { default: app } = await import("../src/app");

// Test User credentials
const emailA = `e2e-user-a-${Date.now()}@example.com`;
const emailB = `e2e-user-b-${Date.now()}@example.com`;
const emailC = `e2e-user-c-${Date.now()}@example.com`;
const password = "TestPassword123!";
const newPassword = "NewTestPassword123!";

let cookieA: string;
let cookieB: string;
let cookieC: string;

let uidA: string | undefined;
let uidB: string | undefined;
let uidC: string | undefined;

let profileIdA: string;
let profileIdB: string;
let profileIdC: string;

let resourceId1: string;
let skillId1: string;
let dealId1: string;
let dealId2: string;
let offerId1: string;
let offerId2: string;
let txId1: string;
let txId2: string;

const test = async (name: string, fn: () => Promise<void>): Promise<void> => {
    try {
        await fn();
        console.log(`  ✓ ${name}`);
    } catch (error) {
        console.error(`  ✗ ${name}`);
        console.error(error);
        process.exitCode = 1;
        throw error;
    }
};

const getCookies = (res: request.Response): string[] => {
    const cookies = res.headers["set-cookie"];
    if (!cookies) return [];
    return Array.isArray(cookies) ? cookies : [cookies];
};

const getCookie = (cookies: string[], name: string): string => {
    const cookie = cookies.find((c) => c.startsWith(`${name}=`));
    if (!cookie) throw new Error(`${name} cookie was not set`);
    return cookie;
};

console.log("\n========================================================");
console.log("   DEALPOOL BACKEND — FULL E2E INTEGRATION SUITE");
console.log("========================================================\n");

try {
    // ----------------------------------------------------------------
    // 1. AUTHENTICATION & IDENTITY LIFECYCLE
    // ----------------------------------------------------------------
    console.log("--- 1. Auth & Profiles ---");

    await test("Register User A (Server-generated username & profile creation)", async () => {
        const res = await request(app)
            .post("/api/auth/register")
            .send({ email: emailA, password });

        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
        if (!res.body.success || !res.body.data?.id || !res.body.data?.username) {
            throw new Error("Invalid registration response shape");
        }

        profileIdA = res.body.data.id;
        const cookies = getCookies(res);
        cookieA = getCookie(cookies, "accessToken");

        const fbUser = await firebaseAuth.getUserByEmail(emailA);
        uidA = fbUser.uid;
    });

    await test("Register User B & User C", async () => {
        const resB = await request(app).post("/api/auth/register").send({ email: emailB, password });
        if (resB.status !== 201) throw new Error(`User B failed 201: ${resB.status}`);
        profileIdB = resB.body.data.id;
        cookieB = getCookie(getCookies(resB), "accessToken");
        uidB = (await firebaseAuth.getUserByEmail(emailB)).uid;

        const resC = await request(app).post("/api/auth/register").send({ email: emailC, password });
        if (resC.status !== 201) throw new Error(`User C failed 201: ${resC.status}`);
        profileIdC = resC.body.data.id;
        cookieC = getCookie(getCookies(resC), "accessToken");
        uidC = (await firebaseAuth.getUserByEmail(emailC)).uid;
    });

    await test("GET /api/auth/me returns caller's profile", async () => {
        const res = await request(app)
            .get("/api/auth/me")
            .set("Cookie", cookieA);

        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        if (res.body.data.id !== profileIdA || res.body.data.email !== emailA) {
            throw new Error("Profile mismatch in /me response");
        }
    });

    await test("PATCH /api/auth/update updates username", async () => {
        const customUsername = `custom_otter_${Date.now()}`;
        const res = await request(app)
            .patch("/api/auth/update")
            .set("Cookie", cookieA)
            .send({ username: customUsername });

        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        if (res.body.data.username !== customUsername) {
            throw new Error("Username was not updated");
        }
    });

    await test("PATCH /api/auth/change-password validates current & sets new password", async () => {
        const res = await request(app)
            .patch("/api/auth/change-password")
            .set("Cookie", cookieA)
            .send({ currentPassword: password, newPassword });

        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);

        // Verify login works with new password
        const loginRes = await request(app)
            .post("/api/auth/login")
            .send({ email: emailA, password: newPassword });

        if (loginRes.status !== 200) throw new Error("Login failed with new password");
        cookieA = getCookie(getCookies(loginRes), "accessToken");
    });

    // ----------------------------------------------------------------
    // 2. ADMIN CONTROL & RBAC
    // ----------------------------------------------------------------
    console.log("\n--- 2. Admin Operations ---");

    await test("Non-admin user rejected from GET /api/admin/users with 403", async () => {
        const res = await request(app)
            .get("/api/admin/users")
            .set("Cookie", cookieB);

        if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    });

    await test("Promote User A to admin directly in DB and verify immediate access", async () => {
        await pool.query(`UPDATE profiles SET role = 'admin' WHERE id = $1`, [profileIdA]);

        const res = await request(app)
            .get("/api/admin/users?limit=10&offset=0")
            .set("Cookie", cookieA);

        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        if (!Array.isArray(res.body.data)) throw new Error("Expected array of profiles");
    });

    await test("Admin promotes User B to admin via PATCH /api/admin/users/:id/role", async () => {
        const res = await request(app)
            .patch(`/api/admin/users/${profileIdB}/role`)
            .set("Cookie", cookieA)
            .send({ role: "admin" });

        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        if (res.body.data.role !== "admin") throw new Error("Role was not updated to admin");

        // Demote back to user
        await request(app)
            .patch(`/api/admin/users/${profileIdB}/role`)
            .set("Cookie", cookieA)
            .send({ role: "user" });
    });

    // ----------------------------------------------------------------
    // 3. SKILLS DOMAIN
    // ----------------------------------------------------------------
    console.log("\n--- 3. Skills Module ---");

    await test("POST /api/skills creates a service skill", async () => {
        const res = await request(app)
            .post("/api/skills")
            .set("Cookie", cookieA)
            .send({
                name: "3D CAD Modeling & Prototyping",
                description: "Design custom enclosures in Fusion 360",
                category: "Design",
            });

        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
        skillId1 = res.body.data.id;
        if (!skillId1) throw new Error("Missing skill ID");
    });

    await test("GET /api/skills/mine lists user's skills", async () => {
        const res = await request(app)
            .get("/api/skills/mine")
            .set("Cookie", cookieA);

        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        const items = res.body.data?.items ?? res.body.data;
        const found = items.find((s: { id: string }) => s.id === skillId1);
        if (!found) throw new Error("Created skill not found in /mine list");
    });

    // ----------------------------------------------------------------
    // 4. RESOURCES DOMAIN & POSTGIS PROXIMITY
    // ----------------------------------------------------------------
    console.log("\n--- 4. Resources Module & Geospatial Proximity ---");

    await test("POST /api/resources creates a physical resource with coordinates", async () => {
        const res = await request(app)
            .post("/api/resources")
            .set("Cookie", cookieA)
            .send({
                title: "Prusa MK4 3D Printer",
                description: "High precision 3D printer with 0.4mm nozzle",
                category: "Hardware",
                condition: "Like New",
                lat: 37.7749,
                lng: -122.4194,
            });

        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
        resourceId1 = res.body.data.id;
        if (res.body.data.current_holder_id !== profileIdA) {
            throw new Error("current_holder_id did not default to owner");
        }
    });

    await test("GET /api/resources/nearby finds resource within radius", async () => {
        const res = await request(app)
            .get("/api/resources/nearby?lat=37.7740&lng=-122.4180&radiusKm=5");

        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        const items = res.body.data?.items ?? res.body.data;
        const match = items.find((r: { id: string }) => r.id === resourceId1);
        if (!match) throw new Error("Resource not found in nearby PostGIS query");
        if (typeof match.distance_km !== "number") throw new Error("Missing distance_km calculation");
    });

    // ----------------------------------------------------------------
    // 5. DEALS MARKETPLACE & POSTGIS
    // ----------------------------------------------------------------
    console.log("\n--- 5. Deals Module ---");

    await test("POST /api/deals creates a deal linked to Resource 1", async () => {
        const res = await request(app)
            .post("/api/deals")
            .set("Cookie", cookieA)
            .send({
                title: "Looking to pass Prusa 3D Printer to next maker",
                description: "Need to lend printer for the month",
                category: "Hardware",
                budgetMin: 200,
                budgetMax: 500,
                lat: 37.7749,
                lng: -122.4194,
                radiusKm: 10,
                resourceId: resourceId1,
            });

        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
        dealId1 = res.body.data.id;
        if (res.body.data.status !== "open") throw new Error("New deal status is not open");
    });

    await test("GET /api/deals/nearby finds open deal in radius", async () => {
        const res = await request(app)
            .get("/api/deals/nearby?lat=37.7745&lng=-122.4190&radiusKm=5");

        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        const found = res.body.data.find((d: { id: string }) => d.id === dealId1);
        if (!found) throw new Error("Deal not found in nearby search");
    });

    // ----------------------------------------------------------------
    // 6. OFFERS & MULTI-HOP CHAIN OF CUSTODY (A -> B -> C)
    // ----------------------------------------------------------------
    console.log("\n--- 6. Multi-Hop Chain of Custody & Privacy Redaction ---");

    await test("User A cannot make an offer on their own deal (400 CANNOT_OFFER_OWN_DEAL)", async () => {
        const res = await request(app)
            .post(`/api/deals/${dealId1}/offers`)
            .set("Cookie", cookieA)
            .send({ price: 300, terms: "Self offer" });

        if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    });

    await test("User B submits Offer 1 on Deal 1", async () => {
        const res = await request(app)
            .post(`/api/deals/${dealId1}/offers`)
            .set("Cookie", cookieB)
            .send({ price: 300, terms: "Will handle pickup and maintain printer" });

        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
        offerId1 = res.body.data.id;
    });

    await test("User A accepts Offer 1: triggers atomic transaction and moves custody to User B", async () => {
        const res = await request(app)
            .patch(`/api/offers/${offerId1}/accept`)
            .set("Cookie", cookieA);

        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        if (res.body.data.status !== "accepted") throw new Error("Offer was not flipped to accepted");

        // Verify resource's current_holder_id moved to User B
        const resCheck = await request(app).get(`/api/resources/${resourceId1}`);
        if (resCheck.body.data.current_holder_id !== profileIdB) {
            throw new Error(`Expected current_holder_id to be User B (${profileIdB}), got ${resCheck.body.data.current_holder_id}`);
        }
    });

    await test("User B creates Deal 2 for the same Resource to pass to User C", async () => {
        const res = await request(app)
            .post("/api/deals")
            .set("Cookie", cookieB)
            .send({
                title: "Passing on the Prusa MK4 Printer",
                description: "Done with project, passing forward",
                category: "Hardware",
                lat: 37.7749,
                lng: -122.4194,
                resourceId: resourceId1,
            });

        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
        dealId2 = res.body.data.id;
    });

    await test("User C submits Offer 2 on Deal 2", async () => {
        const res = await request(app)
            .post(`/api/deals/${dealId2}/offers`)
            .set("Cookie", cookieC)
            .send({ price: 400, terms: "Taking printer for next stage" });

        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
        offerId2 = res.body.data.id;
    });

    await test("User B accepts Offer 2: creates chained Transaction 2 (parent = Tx 1) and moves custody to User C", async () => {
        const res = await request(app)
            .patch(`/api/offers/${offerId2}/accept`)
            .set("Cookie", cookieB);

        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);

        // Verify resource's current_holder_id is now User C
        const resCheck = await request(app).get(`/api/resources/${resourceId1}`);
        if (resCheck.body.data.current_holder_id !== profileIdC) {
            throw new Error(`Expected current_holder_id to be User C (${profileIdC})`);
        }
    });

    await test("GET /api/resources/:id/chain for User C: verifies recursive chain & privacy redaction", async () => {
        const res = await request(app)
            .get(`/api/resources/${resourceId1}/chain`)
            .set("Cookie", cookieC);

        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
        const chain = res.body.data;

        if (!Array.isArray(chain) || chain.length !== 2) {
            throw new Error(`Expected 2 hops in chain, got ${chain?.length}`);
        }

        const [hop1, hop2] = chain;
        txId1 = hop1.id;
        txId2 = hop2.id;

        // Hop 1 (A -> B): User C was NOT a participant. It MUST be redacted (no from_user_id or to_user_id)
        if (hop1.from_user_id || hop1.to_user_id) {
            throw new Error("Privacy violation: Third-party participant IDs leaked in Hop 1!");
        }

        // Hop 2 (B -> C): User C WAS a participant. Full row returned.
        if (hop2.from_user_id !== profileIdB || hop2.to_user_id !== profileIdC) {
            throw new Error("Participant IDs missing or mismatched in Hop 2!");
        }
    });

    await test("GET /api/transactions/:id enforces participant-only access", async () => {
        // User C requesting Transaction 1 (between A and B) -> 403 Forbidden
        const resForbidden = await request(app)
            .get(`/api/transactions/${txId1}`)
            .set("Cookie", cookieC);

        if (resForbidden.status !== 403) {
            throw new Error(`Expected 403 Forbidden for non-participant, got ${resForbidden.status}`);
        }

        // User A requesting Transaction 1 (participant) -> 200 OK
        const resAllowed = await request(app)
            .get(`/api/transactions/${txId1}`)
            .set("Cookie", cookieA);

        if (resAllowed.status !== 200) {
            throw new Error(`Expected 200 OK for participant, got ${resAllowed.status}`);
        }
    });

    // ----------------------------------------------------------------
    // 7. PAYMENTS & RAZORPAY SETTLEMENT
    // ----------------------------------------------------------------
    console.log("\n--- 7. Payments & Razorpay Integration ---");

    let rzpOrderId: string;
    let paymentId: string;

    await test("POST /api/payments/order: User B (payer for Tx 1) creates Razorpay order", async () => {
        const res = await request(app)
            .post("/api/payments/order")
            .set("Cookie", cookieB)
            .send({ transactionId: txId1 });

        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`);
        if (!res.body.data?.orderId || res.body.data?.amountInRupees !== 300) {
            throw new Error("Invalid payment order response");
        }

        rzpOrderId = res.body.data.orderId;
        paymentId = res.body.data.paymentId;
    });

    await test("POST /api/payments/verify: User B verifies valid HMAC signature and confirms transaction", async () => {
        const fakePaymentId = `pay_e2e_${Date.now()}`;
        const keySecret = getRazorpayKeySecret();
        const signature = crypto
            .createHmac("sha256", keySecret)
            .update(`${rzpOrderId}|${fakePaymentId}`)
            .digest("hex");

        const res = await request(app)
            .post("/api/payments/verify")
            .set("Cookie", cookieB)
            .send({
                razorpayOrderId: rzpOrderId,
                razorpayPaymentId: fakePaymentId,
                razorpaySignature: signature,
            });

        if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
        if (res.body.data?.payment?.status !== "captured") throw new Error("Payment status not captured");
        if (res.body.data?.transaction?.status !== "confirmed") throw new Error("Transaction status not confirmed");
    });

    await test("GET /api/payments/:id & GET /api/payments/transaction/:id return payment details", async () => {
        const resPayment = await request(app)
            .get(`/api/payments/${paymentId}`)
            .set("Cookie", cookieB);
        if (resPayment.status !== 200) throw new Error(`Expected 200, got ${resPayment.status}`);

        const resTxPayments = await request(app)
            .get(`/api/payments/transaction/${txId1}`)
            .set("Cookie", cookieA);
        if (resTxPayments.status !== 200) throw new Error(`Expected 200, got ${resTxPayments.status}`);
        if (!resTxPayments.body.data?.length) throw new Error("Expected at least one payment record for Tx 1");
    });

    console.log("\n========================================================");
    console.log("   ✓ ALL E2E INTEGRATION TESTS PASSED SUCCESSFULLY");
    console.log("========================================================\n");

} finally {
    // Cleanup Firebase test users
    if (uidA) try { await firebaseAuth.deleteUser(uidA); } catch {}
    if (uidB) try { await firebaseAuth.deleteUser(uidB); } catch {}
    if (uidC) try { await firebaseAuth.deleteUser(uidC); } catch {}

    await pool.end();
}
