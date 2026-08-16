import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
import request from "supertest";
import pool from "../src/config/db";
import { firebaseAuth } from "../src/config/firebase";
import { getRazorpayKeySecret } from "../src/config/razorpay";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const { default: app } = await import("../src/app");

const emailA = `pay-a-${Date.now()}@example.com`;
const emailB = `pay-b-${Date.now()}@example.com`;
const emailC = `pay-c-${Date.now()}@example.com`;
const password = "TestPassword123!";

let cookieA: string;
let cookieB: string;
let cookieC: string;
let uidA: string | undefined;
let uidB: string | undefined;
let uidC: string | undefined;

let resourceId: string | undefined;
let dealId: string | undefined;
let offerId: string | undefined;
let transactionId: string | undefined;
let razorpayOrderId: string | undefined;
let paymentRecordId: string | undefined;

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
  await test("register users A (seller/holder), B (buyer/payer), C (outsider)", async () => {
    const a = await register(emailA);
    cookieA = a.cookie; uidA = a.uid;

    const b = await register(emailB);
    cookieB = b.cookie; uidB = b.uid;

    const c = await register(emailC);
    cookieC = c.cookie; uidC = c.uid;
  });

  await test("A creates resource and posts deal", async () => {
    const resRes = await request(app).post("/api/resources").set("Cookie", cookieA).send({
      title: "Razorpay Test Camera",
      lat: 37.77,
      lng: -122.41,
    });
    if (resRes.status !== 201) throw new Error(`Expected 201 got ${resRes.status}`);
    resourceId = resRes.body.data?.id;

    const dealRes = await request(app).post("/api/deals").set("Cookie", cookieA).send({
      title: "Rent Camera",
      lat: 37.77,
      lng: -122.41,
      resourceId,
    });
    if (dealRes.status !== 201) throw new Error(`Expected 201 got ${dealRes.status}`);
    dealId = dealRes.body.data?.id;
  });

  await test("B makes offer with price and A accepts", async () => {
    const offerRes = await request(app).post(`/api/deals/${dealId}/offers`).set("Cookie", cookieB).send({
      price: 499,
      terms: "1 day rental",
    });
    if (offerRes.status !== 201) throw new Error(`Expected 201 got ${offerRes.status}`);
    offerId = offerRes.body.data?.id;

    const acceptRes = await request(app).patch(`/api/offers/${offerId}/accept`).set("Cookie", cookieA);
    if (acceptRes.status !== 200) throw new Error(`Expected 200 got ${acceptRes.status}`);

    const txRes = await pool.query(
      `SELECT id FROM transactions WHERE offer_id = $1`,
      [offerId]
    );
    transactionId = txRes.rows[0]?.id;
    if (!transactionId) throw new Error("Transaction not found for accepted offer");
  });

  await test("A (seller/payee) cannot initiate payment order (only payer can pay)", async () => {
    const res = await request(app).post("/api/payments/order").set("Cookie", cookieA).send({
      transactionId,
    });
    if (res.status !== 403) throw new Error(`Expected 403 got ${res.status} ${JSON.stringify(res.body)}`);
  });

  await test("C (outsider) cannot initiate payment order", async () => {
    const res = await request(app).post("/api/payments/order").set("Cookie", cookieC).send({
      transactionId,
    });
    if (res.status !== 403) throw new Error(`Expected 403 got ${res.status}`);
  });

  await test("B (payer) creates Razorpay payment order", async () => {
    const res = await request(app).post("/api/payments/order").set("Cookie", cookieB).send({
      transactionId,
    });
    if (res.status !== 201) throw new Error(`Expected 201 got ${res.status} ${JSON.stringify(res.body)}`);
    if (!res.body.data?.orderId) throw new Error("Expected orderId in response");
    if (res.body.data?.amount !== 49900) throw new Error(`Expected amount 49900 paise, got ${res.body.data?.amount}`);
    if (res.body.data?.amountInRupees !== 499) throw new Error(`Expected amountInRupees 499, got ${res.body.data?.amountInRupees}`);

    razorpayOrderId = res.body.data.orderId;
    paymentRecordId = res.body.data.paymentId;
  });

  await test("verify rejects invalid signature", async () => {
    const res = await request(app).post("/api/payments/verify").set("Cookie", cookieB).send({
      razorpayOrderId,
      razorpayPaymentId: "pay_test_fake123",
      razorpaySignature: "invalid_signature_hex",
    });
    if (res.status !== 400) throw new Error(`Expected 400 got ${res.status} ${JSON.stringify(res.body)}`);
    if (res.body.error?.code !== "INVALID_SIGNATURE") throw new Error(`Expected INVALID_SIGNATURE code, got ${res.body.error?.code}`);
  });

  await test("verify succeeds with valid HMAC SHA256 signature and confirms transaction", async () => {
    const fakePaymentId = `pay_${Date.now()}`;
    const keySecret = getRazorpayKeySecret();
    const validSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpayOrderId}|${fakePaymentId}`)
      .digest("hex");

    const res = await request(app).post("/api/payments/verify").set("Cookie", cookieB).send({
      razorpayOrderId,
      razorpayPaymentId: fakePaymentId,
      razorpaySignature: validSignature,
    });
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status} ${JSON.stringify(res.body)}`);
    if (res.body.data?.payment?.status !== "captured") throw new Error("Payment status should be captured");
    if (res.body.data?.transaction?.status !== "confirmed") throw new Error("Transaction status should be confirmed");
  });

  await test("B cannot create another payment order on already paid transaction", async () => {
    const res = await request(app).post("/api/payments/order").set("Cookie", cookieB).send({
      transactionId,
    });
    if (res.status !== 409) throw new Error(`Expected 409 got ${res.status} ${JSON.stringify(res.body)}`);
    if (res.body.error?.code !== "ALREADY_PAID") throw new Error(`Expected ALREADY_PAID, got ${res.body.error?.code}`);
  });

  await test("both payer B and payee A can view payment records, but C cannot", async () => {
    const resB = await request(app).get(`/api/payments/${paymentRecordId}`).set("Cookie", cookieB);
    if (resB.status !== 200) throw new Error(`Expected 200 for payer B, got ${resB.status}`);

    const resA = await request(app).get(`/api/payments/${paymentRecordId}`).set("Cookie", cookieA);
    if (resA.status !== 200) throw new Error(`Expected 200 for payee A, got ${resA.status}`);

    const resC = await request(app).get(`/api/payments/${paymentRecordId}`).set("Cookie", cookieC);
    if (resC.status !== 403) throw new Error(`Expected 403 for outsider C, got ${resC.status}`);

    const resList = await request(app).get(`/api/payments/transaction/${transactionId}`).set("Cookie", cookieB);
    if (resList.status !== 200) throw new Error(`Expected 200 for transaction payments, got ${resList.status}`);
    if (resList.body.data?.length === 0) throw new Error("Expected at least one payment record");
  });
} finally {
  if (uidA) try { await firebaseAuth.deleteUser(uidA); } catch (e) { console.error(e); }
  if (uidB) try { await firebaseAuth.deleteUser(uidB); } catch (e) { console.error(e); }
  if (uidC) try { await firebaseAuth.deleteUser(uidC); } catch (e) { console.error(e); }
  await pool.end();
  console.log("\nPayments tests completed.\n");
}
