import dotenv from "dotenv";
import path from "path";
import request from "supertest";
import pool from "../src/config/db";
import { firebaseAuth } from "../src/config/firebase";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const { default: app } = await import("../src/app");

const email = `resource-test-${Date.now()}@example.com`;
const password = "TestPassword123!";

let cookie: string;
let uid: string | undefined;
let resourceId: string | undefined;

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
  await test("POST /api/auth/register creates a user", async () => {
    const res = await request(app).post("/api/auth/register").send({ email, password });
    if (res.status !== 201) throw new Error(`Expected 201 got ${res.status} ${JSON.stringify(res.body)}`);
    cookie = getCookie(getCookies(res), "accessToken");
    uid = (await firebaseAuth.getUserByEmail(email)).uid;
  });

  await test("POST /api/resources creates a resource", async () => {
    const res = await request(app).post("/api/resources").set("Cookie", cookie).send({
      title: "Test Cordless Drill",
      description: "18V, comes with two batteries",
      category: "Tools",
      condition: "Good",
      lat: 37.7749,
      lng: -122.4194,
    });
    if (res.status !== 201) throw new Error(`Expected 201 got ${res.status} ${JSON.stringify(res.body)}`);
    resourceId = res.body.data?.id;
    if (!resourceId) throw new Error("No resource id returned");
    if (res.body.data?.current_holder_id !== res.body.data?.owner_id) {
      throw new Error("current_holder_id should default to owner_id at creation");
    }
  });

  await test("GET /api/resources/:id returns resource", async () => {
    const res = await request(app).get(`/api/resources/${resourceId}`);
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status}`);
    if (res.body.data?.id !== resourceId) throw new Error("Returned wrong resource id");
  });

  await test("GET /api/resources/mine lists owned resources", async () => {
    const res = await request(app).get("/api/resources/mine").set("Cookie", cookie);
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status}`);
    const items = res.body.data?.items ?? res.body.data;
    if (!Array.isArray(items) || !items.some((r: any) => r.id === resourceId)) {
      throw new Error("Created resource not found in /mine list");
    }
  });

  await test("GET /api/resources/nearby returns available resources", async () => {
    const res = await request(app).get("/api/resources/nearby?lat=37.7749&lng=-122.4194&radiusKm=10");
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status} ${JSON.stringify(res.body)}`);
    const items = res.body.data?.items ?? res.body.data;
    if (!Array.isArray(items)) throw new Error("Expected array of resources");
  });

  await test("GET /api/resources/:resourceId/chain returns empty chain for untransacted resource", async () => {
    const res = await request(app).get(`/api/resources/${resourceId}/chain`).set("Cookie", cookie);
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status} ${JSON.stringify(res.body)}`);
    if (!Array.isArray(res.body.data) || res.body.data.length !== 0) {
      throw new Error("Expected empty chain for a resource with no transactions");
    }
  });

  await test("PATCH /api/resources/:id updates resource as owner", async () => {
    const res = await request(app).patch(`/api/resources/${resourceId}`).set("Cookie", cookie).send({ title: "Updated Drill Title" });
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status} ${JSON.stringify(res.body)}`);
    if (res.body.data?.title !== "Updated Drill Title") throw new Error("Title was not updated");
  });

  await test("PATCH /api/resources/:id rejects non-owner", async () => {
    const res = await request(app).patch(`/api/resources/${resourceId}`).send({ title: "Hacked" });
    if (res.status !== 401) throw new Error(`Expected 401 got ${res.status}`);
  });

  await test("DELETE /api/resources/:id deletes resource as owner", async () => {
    const res = await request(app).delete(`/api/resources/${resourceId}`).set("Cookie", cookie);
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status} ${JSON.stringify(res.body)}`);
  });
} finally {
  if (uid) try { await firebaseAuth.deleteUser(uid); } catch (e) { console.error(e); }
  await pool.end();
  console.log("\nResources tests completed.\n");
}