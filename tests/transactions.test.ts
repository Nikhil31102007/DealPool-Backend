import dotenv from "dotenv";
import path from "path";
import request from "supertest";
import pool from "../src/config/db";
import { firebaseAuth } from "../src/config/firebase";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const { default: app } = await import("../src/app");

const emailA = `tx-a-${Date.now()}@example.com`;
const emailB = `tx-b-${Date.now()}@example.com`;
const emailC = `tx-c-${Date.now()}@example.com`;
const emailD = `tx-d-${Date.now()}@example.com`;
const password = "TestPassword123!";

let cookieA: string;
let cookieB: string;
let cookieC: string;
let cookieD: string;
let uidA: string | undefined;
let uidB: string | undefined;
let uidC: string | undefined;
let uidD: string | undefined;

let resourceId: string | undefined;
let tx1Id: string | undefined;
let tx2Id: string | undefined;

const test = async (name: string, fn: () => Promise<void>): Promise<void> => {
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
  if (!cookies) return [];
  return Array.isArray(cookies) ? cookies : [cookies];
};

const getCookie = (cookies: string[], name: string): string => {
  const cookie = cookies.find((c) => c.startsWith(`${name}=`));
  if (!cookie) throw new Error(`${name} cookie not set`);
  return cookie;
};

const register = async (email: string): Promise<{ cookie: string; uid: string }> => {
  const res = await request(app).post("/api/auth/register").send({ email, password });
  if (res.status !== 201) throw new Error(`Register failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  const cookie = getCookie(getCookies(res), "accessToken");
  const uid = (await firebaseAuth.getUserByEmail(email)).uid;
  return { cookie, uid };
};

try {
  await test("register users A, B, C, D", async () => {
    const a = await register(emailA);
    cookieA = a.cookie; uidA = a.uid;

    const b = await register(emailB);
    cookieB = b.cookie; uidB = b.uid;

    const c = await register(emailC);
    cookieC = c.cookie; uidC = c.uid;

    const d = await register(emailD);
    cookieD = d.cookie; uidD = d.uid;
  });

  await test("A creates a resource", async () => {
    const res = await request(app).post("/api/resources").set("Cookie", cookieA).send({
      title: "Chain Test Ladder",
      lat: 37.5,
      lng: -122.5,
    });
    if (res.status !== 201) throw new Error(`Expected 201 got ${res.status} ${JSON.stringify(res.body)}`);
    resourceId = res.body.data?.id;
  });

  await test("A lists deal, B offers and A accepts (hop 1: A -> B)", async () => {
    const dealRes = await request(app).post("/api/deals").set("Cookie", cookieA).send({
      title: "Hop 1 Deal",
      lat: 37.5,
      lng: -122.5,
      resourceId,
    });
    if (dealRes.status !== 201) throw new Error(`Expected 201 got ${dealRes.status}`);
    const dealId = dealRes.body.data?.id;

    const offerRes = await request(app).post(`/api/deals/${dealId}/offers`).set("Cookie", cookieB).send({ price: 100 });
    if (offerRes.status !== 201) throw new Error(`Expected 201 got ${offerRes.status}`);
    const offerId = offerRes.body.data?.id;

    const acceptRes = await request(app).patch(`/api/offers/${offerId}/accept`).set("Cookie", cookieA);
    if (acceptRes.status !== 200) throw new Error(`Expected 200 got ${acceptRes.status} ${JSON.stringify(acceptRes.body)}`);
  });

  await test("resource current_holder_id moved to B after hop 1", async () => {
    const res = await request(app).get(`/api/resources/${resourceId}`);
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status}`);
    if (res.body.data?.current_holder_id === res.body.data?.owner_id) {
      throw new Error("current_holder_id should have moved off the original owner after hop 1");
    }
  });

  await test("B lists deal on same resource, C offers and B accepts (hop 2: B -> C)", async () => {
    const dealRes = await request(app).post("/api/deals").set("Cookie", cookieB).send({
      title: "Hop 2 Deal",
      lat: 37.5,
      lng: -122.5,
      resourceId,
    });
    if (dealRes.status !== 201) throw new Error(`Expected 201 got ${dealRes.status}`);
    const dealId = dealRes.body.data?.id;

    const offerRes = await request(app).post(`/api/deals/${dealId}/offers`).set("Cookie", cookieC).send({ price: 200 });
    if (offerRes.status !== 201) throw new Error(`Expected 201 got ${offerRes.status}`);
    const offerId = offerRes.body.data?.id;

    const acceptRes = await request(app).patch(`/api/offers/${offerId}/accept`).set("Cookie", cookieB);
    if (acceptRes.status !== 200) throw new Error(`Expected 200 got ${acceptRes.status} ${JSON.stringify(acceptRes.body)}`);
  });

  await test("C (current participant) sees full chain with hop 2 identities and hop 1 redacted", async () => {
    const res = await request(app).get(`/api/resources/${resourceId}/chain`).set("Cookie", cookieC);
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status} ${JSON.stringify(res.body)}`);
    const chain = res.body.data;
    if (!Array.isArray(chain) || chain.length !== 2) throw new Error(`Expected chain of length 2, got ${chain?.length}`);

    const sorted = [...chain].sort((x: any, y: any) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime());
    tx1Id = sorted[0].id;
    tx2Id = sorted[1].id;

    if (sorted[0].from_user_id !== undefined) throw new Error("Hop 1 should be redacted for C (not a participant in hop 1)");
    if (sorted[1].from_user_id === undefined) throw new Error("Hop 2 should show full identity for C (participant)");
  });

  await test("A sees hop 1 full and hop 2 redacted", async () => {
    const res = await request(app).get(`/api/resources/${resourceId}/chain`).set("Cookie", cookieA);
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status}`);
    const chain = res.body.data;
    const sorted = [...chain].sort((x: any, y: any) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime());

    if (sorted[0].from_user_id === undefined) throw new Error("Hop 1 should show full identity for A (participant)");
    if (sorted[1].from_user_id !== undefined) throw new Error("Hop 2 should be redacted for A (not a participant)");
  });

  await test("B sees both hops full (participant in both)", async () => {
    const res = await request(app).get(`/api/resources/${resourceId}/chain`).set("Cookie", cookieB);
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status}`);
    const chain = res.body.data;
    if (chain.some((tx: any) => tx.from_user_id === undefined)) {
      throw new Error("B is a participant in both hops and should see full identities for both");
    }
  });

  await test("D (non-participant) sees both hops redacted", async () => {
    const res = await request(app).get(`/api/resources/${resourceId}/chain`).set("Cookie", cookieD);
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status}`);
    const chain = res.body.data;
    if (chain.some((tx: any) => tx.from_user_id !== undefined)) {
      throw new Error("D is not a participant in either hop and should see both fully redacted");
    }
  });

  await test("GET /api/transactions/:id allows a participant", async () => {
    const res = await request(app).get(`/api/transactions/${tx1Id}`).set("Cookie", cookieA);
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status} ${JSON.stringify(res.body)}`);
    if (res.body.data?.parent_transaction_id !== null) throw new Error("Hop 1 should have no parent transaction");
  });

  await test("GET /api/transactions/:id rejects a non-participant", async () => {
    const res = await request(app).get(`/api/transactions/${tx1Id}`).set("Cookie", cookieD);
    if (res.status !== 403) throw new Error(`Expected 403 got ${res.status} ${JSON.stringify(res.body)}`);
  });

  await test("GET /api/transactions/:id confirms hop 2 chains to hop 1 via parent_transaction_id", async () => {
    const res = await request(app).get(`/api/transactions/${tx2Id}`).set("Cookie", cookieC);
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status}`);
    if (res.body.data?.parent_transaction_id !== tx1Id) throw new Error("Hop 2 parent_transaction_id should equal hop 1's id");
  });

  let qrTokenHop2: string;

  await test("GET /api/transactions/:id/qr generates QR code data URL and signed token for B (giver in hop 2)", async () => {
    const res = await request(app).get(`/api/transactions/${tx2Id}/qr`).set("Cookie", cookieB);
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status} ${JSON.stringify(res.body)}`);
    if (!res.body.data?.qrDataUrl || !res.body.data?.qrDataUrl.startsWith("data:image/png;base64,")) {
      throw new Error("Invalid or missing qrDataUrl");
    }
    if (!res.body.data?.token) throw new Error("Missing token in QR response");
    qrTokenHop2 = res.body.data.token;
  });

  await test("POST /api/transactions/:id/verify-qr rejects self-scanning by generator B", async () => {
    const res = await request(app).post(`/api/transactions/${tx2Id}/verify-qr`).set("Cookie", cookieB).send({ token: qrTokenHop2 });
    if (res.status !== 400) throw new Error(`Expected 400 for self-scan, got ${res.status}`);
    if (res.body.error?.code !== "SELF_SCAN_NOT_ALLOWED") throw new Error(`Expected SELF_SCAN_NOT_ALLOWED, got ${res.body.error?.code}`);
  });

  await test("POST /api/transactions/:id/verify-qr rejects outsider D", async () => {
    const res = await request(app).post(`/api/transactions/${tx2Id}/verify-qr`).set("Cookie", cookieD).send({ token: qrTokenHop2 });
    if (res.status !== 403) throw new Error(`Expected 403 for outsider, got ${res.status}`);
  });

  await test("POST /api/transactions/:id/verify-qr succeeds when C (recipient) scans and marks transaction active", async () => {
    const res = await request(app).post(`/api/transactions/${tx2Id}/verify-qr`).set("Cookie", cookieC).send({ token: qrTokenHop2 });
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status} ${JSON.stringify(res.body)}`);
    if (res.body.data?.status !== "active") throw new Error(`Expected status active, got ${res.body.data?.status}`);
    if (!res.body.data?.checked_out_at) throw new Error("Expected checked_out_at timestamp to be set");
  });
} finally {
  if (uidA) try { await firebaseAuth.deleteUser(uidA); } catch (e) { console.error(e); }
  if (uidB) try { await firebaseAuth.deleteUser(uidB); } catch (e) { console.error(e); }
  if (uidC) try { await firebaseAuth.deleteUser(uidC); } catch (e) { console.error(e); }
  if (uidD) try { await firebaseAuth.deleteUser(uidD); } catch (e) { console.error(e); }
  await pool.end();
  console.log("\nTransactions tests completed.\n");
}