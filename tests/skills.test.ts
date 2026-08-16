import dotenv from "dotenv";
import path from "path";
import request from "supertest";
import pool from "../src/config/db";
import { firebaseAuth } from "../src/config/firebase";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const { default: app } = await import("../src/app");

const email = `skill-test-${Date.now()}@example.com`;
const password = "TestPassword123!";

let cookie: string;
let uid: string | undefined;
let skillId: string | undefined;

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

  await test("POST /api/skills creates a skill", async () => {
    const res = await request(app).post("/api/skills").set("Cookie", cookie).send({
      name: "React & Node.js Code Review",
      description: "I review PRs for code quality and architecture",
      category: "Software Engineering",
    });
    if (res.status !== 201) throw new Error(`Expected 201 got ${res.status} ${JSON.stringify(res.body)}`);
    skillId = res.body.data?.id;
    if (!skillId) throw new Error("No skill id returned");
  });

  await test("GET /api/skills/:id returns skill", async () => {
    const res = await request(app).get(`/api/skills/${skillId}`);
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status}`);
    if (res.body.data?.id !== skillId) throw new Error("Returned wrong skill id");
  });

  await test("GET /api/skills/mine lists owned skills", async () => {
    const res = await request(app).get("/api/skills/mine").set("Cookie", cookie);
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status}`);
    const items = res.body.data?.items ?? res.body.data;
    if (!Array.isArray(items) || !items.some((s: any) => s.id === skillId)) {
      throw new Error("Created skill not found in /mine list");
    }
  });

  await test("PATCH /api/skills/:id updates skill as owner", async () => {
    const res = await request(app).patch(`/api/skills/${skillId}`).set("Cookie", cookie).send({ name: "Updated Skill Name" });
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status} ${JSON.stringify(res.body)}`);
    if (res.body.data?.name !== "Updated Skill Name") throw new Error("Name was not updated");
  });

  await test("PATCH /api/skills/:id rejects non-owner", async () => {
    const res = await request(app).patch(`/api/skills/${skillId}`).send({ name: "Hacked" });
    if (res.status !== 401) throw new Error(`Expected 401 got ${res.status}`);
  });

  await test("DELETE /api/skills/:id deletes skill as owner", async () => {
    const res = await request(app).delete(`/api/skills/${skillId}`).set("Cookie", cookie);
    if (res.status !== 200) throw new Error(`Expected 200 got ${res.status} ${JSON.stringify(res.body)}`);
  });
} finally {
  if (uid) try { await firebaseAuth.deleteUser(uid); } catch (e) { console.error(e); }
  await pool.end();
  console.log("\nSkills tests completed.\n");
}