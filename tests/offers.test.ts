import dotenv from "dotenv";
import path from "path";
import request from "supertest";
import pool from "../src/config/db";
import { firebaseAuth } from "../src/config/firebase";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const { default: app } = await import("../src/app");

const emailA = `offers-a-${Date.now()}@example.com`;
const emailB = `offers-b-${Date.now()}@example.com`;
const password = "TestPassword123!";

let cookieA: string;
let cookieB: string;
let uidA: string | undefined;
let uidB: string | undefined;

let acceptDealId: string | undefined;
let acceptOfferId: string | undefined;

let rejectDealId: string | undefined;
let rejectOfferId: string | undefined;

let withdrawDealId: string | undefined;
let withdrawOfferId: string | undefined;

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

try {
  await test("register user A and user B", async () => {
    const r1 = await request(app).post("/api/auth/register").send({ email: emailA, password });
    if (r1.status !== 201) throw new Error(`Expected 201 got ${r1.status} ${JSON.stringify(r1.body)}`);
    cookieA = getCookie(getCookies(r1), "accessToken");
    uidA = (await firebaseAuth.getUserByEmail(emailA)).uid;

    const r2 = await request(app).post("/api/auth/register").send({ email: emailB, password });
    if (r2.status !== 201) throw new Error(`Expected 201 got ${r2.status} ${JSON.stringify(r2.body)}`);
    cookieB = getCookie(getCookies(r2), "accessToken");
    uidB = (await firebaseAuth.getUserByEmail(emailB)).uid;
  });

  await test("A cannot offer on their own deal", async () => {
    const dealRes = await request(app).post("/api/deals").set("Cookie", cookieA).send({ title: "Self Offer Deal", lat: 37.1, lng: -122.0 });
    if (dealRes.status !== 201) throw new Error(`Expected 201 got ${dealRes.status}`);
    const dealId = dealRes.body.data?.id;

    const res = await request(app).post(`/api/deals/${dealId}/offers`).set("Cookie", cookieA).send({ price: 100, terms: "self offer" });
    if (res.status !== 400) throw new Error(`Expected 400 got ${res.status} ${JSON.stringify(res.body)}`);
    if (res.body.error?.code !== "CANNOT_OFFER_OWN_DEAL") throw new Error(`Expected CANNOT_OFFER_OWN_DEAL got ${res.body.error?.code}`);
  });

  await test("setup deal + offer for accept flow", async () => {
    const dealRes = await request(app).post("/api/deals").set("Cookie", cookieA).send({ title: "Accept Flow Deal", lat: 37.2, lng: -122.1 });
    if (dealRes.status !== 201) throw new Error(`Expected 201 got ${dealRes.status}`);
    acceptDealId = dealRes.body.data?.id;

    const offerRes = await request(app).post(`/api/deals/${acceptDealId}/offers`).set("Cookie", cookieB).send({ price: 150, terms: "will accept" });
    if (offerRes.status !== 201) throw new Error(`Expected 201 got ${offerRes.status} ${JSON.stringify(offerRes.body)}`);
    acceptOfferId = offerRes.body.data?.id;
  });

  await test("GET /api/deals/:dealId/offers lists the offer", async () => {
    const res = await request(app).get(`/api/deals/${acceptDealId}/offers`);
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status}`);
    if (!Array.isArray(res.body.data) || !res.body.data.some((o: any) => o.id === acceptOfferId)) {
      throw new Error("Offer not found in deal offers list");
    }
  });

  await test("non-owner cannot accept offer", async () => {
    const res = await request(app).patch(`/api/offers/${acceptOfferId}/accept`).set("Cookie", cookieB);
    if (res.status !== 403) throw new Error(`Expected 403 got ${res.status} ${JSON.stringify(res.body)}`);
  });

  await test("A (deal owner) accepts B's offer", async () => {
    const res = await request(app).patch(`/api/offers/${acceptOfferId}/accept`).set("Cookie", cookieA);
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status} ${JSON.stringify(res.body)}`);
    if (res.body.data?.status !== "accepted") throw new Error(`Expected status accepted got ${res.body.data?.status}`);
  });

  await test("accepted offer cannot be accepted again", async () => {
    const res = await request(app).patch(`/api/offers/${acceptOfferId}/accept`).set("Cookie", cookieA);
    if (res.status !== 409) throw new Error(`Expected 409 got ${res.status} ${JSON.stringify(res.body)}`);
    if (res.body.error?.code !== "OFFER_NOT_PENDING") throw new Error(`Expected OFFER_NOT_PENDING got ${res.body.error?.code}`);
  });

  await test("setup deal + offer for reject flow", async () => {
    const dealRes = await request(app).post("/api/deals").set("Cookie", cookieA).send({ title: "Reject Flow Deal", lat: 37.3, lng: -122.2 });
    if (dealRes.status !== 201) throw new Error(`Expected 201 got ${dealRes.status}`);
    rejectDealId = dealRes.body.data?.id;

    const offerRes = await request(app).post(`/api/deals/${rejectDealId}/offers`).set("Cookie", cookieB).send({ price: 90, terms: "will be rejected" });
    if (offerRes.status !== 201) throw new Error(`Expected 201 got ${offerRes.status}`);
    rejectOfferId = offerRes.body.data?.id;
  });

  await test("A (deal owner) rejects B's offer", async () => {
    const res = await request(app).patch(`/api/offers/${rejectOfferId}/reject`).set("Cookie", cookieA);
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status} ${JSON.stringify(res.body)}`);
    if (res.body.data?.status !== "rejected") throw new Error(`Expected status rejected got ${res.body.data?.status}`);
  });

  await test("setup deal + offer for withdraw flow", async () => {
    const dealRes = await request(app).post("/api/deals").set("Cookie", cookieA).send({ title: "Withdraw Flow Deal", lat: 37.4, lng: -122.3 });
    if (dealRes.status !== 201) throw new Error(`Expected 201 got ${dealRes.status}`);
    withdrawDealId = dealRes.body.data?.id;

    const offerRes = await request(app).post(`/api/deals/${withdrawDealId}/offers`).set("Cookie", cookieB).send({ price: 80, terms: "will withdraw" });
    if (offerRes.status !== 201) throw new Error(`Expected 201 got ${offerRes.status}`);
    withdrawOfferId = offerRes.body.data?.id;
  });

  await test("non-provider cannot withdraw offer", async () => {
    const res = await request(app).patch(`/api/offers/${withdrawOfferId}/withdraw`).set("Cookie", cookieA);
    if (res.status !== 403) throw new Error(`Expected 403 got ${res.status}`);
  });

  await test("B (provider) withdraws own offer", async () => {
    const res = await request(app).patch(`/api/offers/${withdrawOfferId}/withdraw`).set("Cookie", cookieB);
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status} ${JSON.stringify(res.body)}`);
    if (res.body.data?.status !== "withdrawn") throw new Error(`Expected status withdrawn got ${res.body.data?.status}`);
  });
} finally {
  if (uidA) try { await firebaseAuth.deleteUser(uidA); } catch (e) { console.error(e); }
  if (uidB) try { await firebaseAuth.deleteUser(uidB); } catch (e) { console.error(e); }
  await pool.end();
  console.log("\nOffers tests completed.\n");
}