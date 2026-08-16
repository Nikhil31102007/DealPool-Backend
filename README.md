# DealPool Backend

A marketplace API: users post **Deals** (requests for something), others respond with **Offers**, the deal owner accepts one, which atomically creates a **Transaction**.

Two "what" categories:
- **Resources** — physical items, can chain custody across multiple sequential owners (A→B→C...), each hop has its own private price.
- **Skills** — services, always a single flat transaction, never chain.

## Stack

Node.js + TypeScript (ESM) · Express 5 · Supabase Postgres via raw `pg` (no ORM) · PostGIS for geo columns · Firebase Admin/REST for all identity · httpOnly cookies (`accessToken`/`refreshToken`) · custom lightweight test runner (not Jest) using `supertest` against a live server + live Firebase project · `npx tsx` as runner · backend listens on port **3000**.

## Layering convention (strict — no exceptions)

```
routes/*.route.ts            → wires paths to controllers, applies authMiddleware/requireRole
controllers/*.controller.ts  → thin: pull req data, call one service fn, wrap in ApiResponse
services/*.service.ts        → business logic, validation, throws AppError via helpers
models/*.model.ts             → raw pool.query(), returns row or null, never throws
```

Any new mutating field needs an explicit allow-list in its service layer — never spread `req.body` into an `UPDATE`.

## Response structure

Every endpoint returns exactly one of these:

```typescript
export type ApiResponse<T = unknown> =
    | { success: true; data: T; error?: never }
    | { success: false; data?: never; error: { code: string; message: string } };
```

## Auth model

- Firebase handles identity (email/password + Google). Postgres `profiles` table holds app data. No custom JWT.
- Access/refresh tokens are set as httpOnly cookies (`accessToken`, `refreshToken`) — never returned in the response body.
- `authMiddleware` reads the `accessToken` cookie → verifies it with Firebase → looks up the profile by `firebase_uid` → attaches to `req.user`:

```typescript
req.user = {
    uid: profile.id,        // Postgres profiles.id (UUID) — use for ALL DB ownership/participant checks
    firebaseUid: decoded.uid, // Firebase Auth UID — ONLY for Firebase Admin SDK calls
    email: decoded.email,
    role: profile.role,
};
```

- **Critical convention:** `req.user.uid` is the **Postgres UUID**, never the Firebase UID string. Every controller passes `req.user!.uid` into services as `userId`/`providerId`/`requesterId`, matching `deals.user_id`, `offers.provider_id`, `resources.owner_id`, `skills.user_id`, `transactions.from_user_id`/`to_user_id` directly.
- Role changes take effect on the very next request — role is fetched fresh from the DB every request, never trusted from a token claim.
- No auth header — cookies only, sent automatically by the browser/supertest with `credentials: 'include'` / `.set("Cookie", ...)`.

> **Fixed this project:** `auth.service.ts`'s `getProfile`, `updateProfile`, and `changeUserPassword` originally still looked profiles up by `firebase_uid`, even though the middleware now passes the Postgres `uid`. This broke `GET /api/auth/me`, `PATCH /api/auth/update`, and `PATCH /api/auth/change-password` for every logged-in user. Fixed by adding `findProfileById` (Postgres id lookup) to `user.model.ts`, using it in those three service functions, fixing `updateProfileFields`'s `WHERE` clause to match on `id` instead of `firebase_uid`, and — in `changeUserPassword` specifically — using `profile.firebase_uid` (not the Postgres `uid` param) when calling `firebaseAuth.updateUser()`, since that call needs the *Firebase* uid.

## Global middleware order (`app.ts`, exact order)

```
corsConfig
express.json()
cookieParser()
requestLogger
apiRateLimiter           ← applies to EVERY route below this line, including /api/auth
  └─ /api/auth/*  also additionally gets authRateLimiter stacked on top (double-limited)
route mounts (see below)
GET /api (health check)
errorHandler              ← must stay last
```

`apiRateLimiter` is global — not scoped only to non-auth routes. `/api/auth/*` requests pass through **both** `apiRateLimiter` and `authRateLimiter`. Rapid-fire test loops (e.g. registering many users back to back) can hit `authRateLimiter` before `apiRateLimiter` even becomes relevant.

> **Dev note:** if running `nodemon`, scope its watch path to `src/` only (`nodemon.json`: `"watch": ["src"]`). `requestLogger` writes to `logs/requests.log` on every request — if nodemon (or any live-reload tool) watches the project root, that log file's growth triggers a restart/reload loop on every API call.

---

## `profiles` table

| column         | type          | notes                                  |
|----------------|---------------|-----------------------------------------|
| id             | uuid          | pk — this is `req.user.uid`             |
| firebase_uid   | text          | unique, links to Firebase user          |
| username       | text          | unique, server-generated on register    |
| email          | text          | unique, not null                        |
| profile_photo  | text          | nullable                                |
| role           | text          | `user` \| `admin`, default `user`       |
| avg_rating     | numeric(3,2)  | 0.00–5.00, not user-editable            |
| rating_count   | integer       | not user-editable                       |
| created_at     | timestamptz   |                                          |
| updated_at     | timestamptz   |                                          |

Username is **never** accepted from the client on register — server-generated (`adjective_noun_hexsuffix`, e.g. `swift_otter_4a1b2c`), changeable later via `/api/auth/update`.

`role`, `avg_rating`, `rating_count` cannot be changed through any self-service endpoint. `role` can only be changed by an existing admin via `/api/admin/users/:id/role`.

## `deals` table

`id` PK, `user_id`→profiles, `title`, `description`, `category`, `budget_min`, `budget_max`, `location` geography(Point,4326), `radius_km` default 10, `status` (`open`\|`offer_accepted`\|`completed`\|`cancelled`), `resource_id`→resources nullable, `skill_id`→skills nullable, timestamps.

`GET /api/deals` and `GET /api/deals/nearby` return flat `lat`/`lng` fields per row (via `ST_Y(location::geometry)` / `ST_X(location::geometry)`), **not** GeoJSON — no `location.coordinates` object.

## `offers` table

`id` PK, `deal_id`→deals, `provider_id`→profiles, `price`, `terms`, `status` (`pending`\|`accepted`\|`rejected`\|`withdrawn`), timestamps.

## `resources` table

`id` PK, `owner_id`→profiles (never changes), `title`, `description`, `category`, `condition`, `location`, `is_available` default true, `current_holder_id`→profiles (defaults to owner_id, moves only via offer-accept), timestamps.

`current_holder_id` is **never** editable via `PATCH /:id` — only the offer-accept flow can move it.

## `skills` table

`id` PK, `user_id`→profiles, `name`, `description`, `category`, `is_available` default true, timestamps. **No location column** — skills have no `/nearby` route by design.

## `transactions` table

`id` PK, `deal_id`→deals, `offer_id`→offers, `from_user_id`→profiles, `to_user_id`→profiles, `resource_id`→resources nullable, `skill_id`→skills nullable (mutually exclusive with `resource_id`, CHECK enforced), `parent_transaction_id`→transactions nullable (only ever set when `resource_id` is set, CHECK enforced), `status` (`agreement_created`\|`confirmed`\|`active`\|`completed`\|`disputed`\|`cancelled`), `checked_out_at`/`returned_at`/`completed_at` unused so far, timestamps.

### Direction convention (load-bearing for any custody logic)

- **Resource deal:** `deal.user_id` = current holder offering the item. `offer.provider_id` = person receiving it. On accept → `transaction.from_user_id = deal.user_id`, `transaction.to_user_id = offer.provider_id`.
- **Skill deal:** inverted. `deal.user_id` = requester. `offer.provider_id` = performer. On accept → `transaction.from_user_id = offer.provider_id`, `transaction.to_user_id = deal.user_id`.

## RLS posture

Every table has RLS enabled with zero policies (deny-all) for `anon`/`authenticated` PostgREST roles. The Express backend connects via a superuser role with `BYPASSRLS`, so this has **zero effect on the backend itself** — it only blocks someone from querying tables directly via the public Supabase REST API using the `anon` key, bypassing Express entirely.

## Location handling

No GPS tracking server-side. `lat`/`lng` are client-supplied on every write (`POST /deals`, `POST /resources`) and every proximity read (`.../nearby`). PostGIS internally expects `(lng, lat)` order — verify this carefully in any new query; it's a classic source of silent bugs.

---

## Auth routes — `/api/auth`

Mounted with global `apiRateLimiter` + local `authRateLimiter` stacked on top.

### `POST /api/auth/register`

Body: `{ "email": "user@example.com", "password": "..." }`
- `201` — profile created, sets `accessToken` + `refreshToken` cookies.
- `401 INVALID_CREDENTIALS` — missing email/password.
- `409 EMAIL_EXISTS` — Firebase already has this email.
- `409 PROFILE_EXISTS` — a profile row already exists for this email.

### `POST /api/auth/login`

Body: `{ "email": "user@example.com", "password": "..." }`
- `200` — sets cookies, returns profile.
- `401 INVALID_CREDENTIALS` — missing fields or wrong email/password.

### `GET /api/auth/me`

Protected. No body. Returns the current user's profile.
- `200` — profile returned.
- `401 UNAUTHORIZED` — no/invalid access token, or profile no longer exists.

### `POST /api/auth/logout`

No body. Clears `accessToken` and `refreshToken` cookies.
- `200` — always succeeds, `data: null`.

### `POST /api/auth/refresh`

No body — reads `refreshToken` cookie. Rotates both cookies.
- `200` — new cookies set.
- `401 INVALID_REFRESH_TOKEN` — missing/invalid/expired refresh token.

### `POST /api/auth/google`

Body: `{ "idToken": "<firebase-id-token-from-client-sdk>" }`

Client handles the Google OAuth popup and Firebase sign-in; this endpoint verifies the resulting ID token, creates a profile on first login, and sets `accessToken`. Refresh flow for this path is handled entirely client-side by the Firebase SDK.
- `200` — profile returned, `accessToken` cookie set.
- `401 INVALID_TOKEN` — missing or invalid ID token.

### `PATCH /api/auth/update`

Protected. All fields optional — send only what changes:
```json
{ "username": "new_username", "email": "new@example.com", "profile_photo": "https://..." }
```
- `200` — updated profile returned.
- `400 NO_UPDATE_FIELDS` — no recognized fields in body.
- `409 USERNAME_TAKEN` / `409 EMAIL_TAKEN` — value already in use.
- `401 UNAUTHORIZED` — not authenticated.

`role`, `avg_rating`, `rating_count` are silently ignored if sent.

### `PATCH /api/auth/change-password`

Protected. Body:
```json
{ "currentPassword": "oldPassword123", "newPassword": "newPassword123" }
```
- `200` — `{ "success": true, "data": null }`.
- `400 INVALID_CREDENTIALS` — missing `currentPassword` or `newPassword`.
- `400 WEAK_PASSWORD` — new password shorter than 6 characters.
- `401 INVALID_CREDENTIALS` — current password is incorrect.
- `401 UNAUTHORIZED` — not authenticated.

---

## Admin routes — `/api/admin`

All routes: `authMiddleware` + `requireRole("admin")`. Non-admins → `403 FORBIDDEN`. Unauthenticated → `401 UNAUTHORIZED`.

### `GET /api/admin/users?limit=50&offset=0`
`200` — array of profiles, newest first.

### `GET /api/admin/users/:id`
Single profile by `id` (Postgres uuid, not `firebase_uid`).
- `200` — profile returned.
- `404 PROFILE_NOT_FOUND`.

### `PATCH /api/admin/users/:id/role`
Body: `{ "role": "admin" }` — valid values `"user"` | `"admin"`.
- `200` — updated profile returned.
- `400 INVALID_ROLE` — missing or invalid value.
- `404 PROFILE_NOT_FOUND`.

### `DELETE /api/admin/users/:id`
Deletes the profile row.
- `200` — `data: null`.
- `404 PROFILE_NOT_FOUND`.

**Known gap:** DB-row-only — does **not** call `firebaseAuth.deleteUser()`. The Firebase user can still authenticate and get a valid ID token, but `authMiddleware` will reject them with `401 PROFILE_NOT_FOUND` since there's no profile to attach. Decide whether to cascade this before relying on it in production.

---

## Deals routes — `/api/deals`

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/deals` | required | creates a deal |
| GET | `/api/deals` | none | `?category=&status=&limit=&offset=` |
| GET | `/api/deals/nearby` | none | `?lat=&lng=&radiusKm=&limit=&offset=` — registered before `/:id`, won't get swallowed |
| GET | `/api/deals/:id` | none | |
| PATCH | `/api/deals/:id` | required, owner only | |
| DELETE | `/api/deals/:id` | required, owner only | |
| POST | `/api/deals/:dealId/offers` | required | submit an offer |
| GET | `/api/deals/:dealId/offers` | none | list offers on a deal |

Create body:
```json
{
  "title": "string, required",
  "description": "string, optional",
  "category": "string, optional",
  "budgetMin": "number, optional",
  "budgetMax": "number, optional",
  "lat": "number, required",
  "lng": "number, required",
  "radiusKm": "number, optional, default 10",
  "resourceId": "uuid, optional",
  "skillId": "uuid, optional"
}
```

`PATCH /:id` updatable fields (confirmed from `deal.service.ts`): `title`, `description`, `category`, `budget_min`, `budget_max`, `radius_km`, `status` — **snake_case**, even though the create endpoint uses camelCase (`budgetMin`). This asymmetry is intentional per the current implementation — don't "fix" it without checking both directions.

`POST /:dealId/offers` body: `{ "price": number (optional), "terms": string (optional) }`

---

## Offers routes — `/api/offers`

| Method | Path | Auth | Notes |
|---|---|---|---|
| PATCH | `/api/offers/:id/accept` | required, deal owner only | atomic |
| PATCH | `/api/offers/:id/reject` | required, deal owner only | |
| PATCH | `/api/offers/:id/withdraw` | required, offer's own provider only | |

No body on any of the three — offer id and requester come from `:id` param and `req.user!.uid`.

`accept` is atomic (`BEGIN`/`COMMIT`/`ROLLBACK`): rejects competing pending offers on the same deal, flips deal status to `offer_accepted`, creates a `transactions` row, and — if resource-based — updates `resources.current_holder_id` and links `parent_transaction_id` to the previous transaction on that resource if one exists.

> **Fixed this project:** the accept-flow's validation order originally checked `deal.status !== "open"` before `offer.status !== "pending"`. Since the first successful accept flips the deal to `offer_accepted`, a second accept attempt on the same offer returned `409 DEAL_NOT_OPEN` instead of the more specific `409 OFFER_NOT_PENDING`. Fixed by swapping the order in `offer.service.ts`'s `acceptOffer` — offer-status check now runs first.

---

## Resources routes — `/api/resources`

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/resources` | required | |
| GET | `/api/resources/mine` | required | |
| GET | `/api/resources/nearby` | none | only `is_available=true` rows |
| GET | `/api/resources/:resourceId/chain` | required | imported from `transaction.controller`, not `resource.controller` |
| GET | `/api/resources/:id` | none | |
| PATCH | `/api/resources/:id` | required, owner only | |
| DELETE | `/api/resources/:id` | required, owner only | |

Route order confirmed correct — `/mine`, `/nearby`, `/:resourceId/chain` registered before generic `/:id`.

Create body:
```json
{
  "title": "string, required",
  "description": "string, optional",
  "category": "string, optional",
  "condition": "string, optional",
  "lat": "number, required",
  "lng": "number, required"
}
```

`GET /:resourceId/chain` returns full transaction detail (`from_user_id`, `to_user_id`, etc.) only for links the requester participated in; every other link is redacted to `{ id, resource_id, status, completed_at, created_at }` with no `from_user_id`/`to_user_id` keys at all — assert the key is `undefined`, not `null`.

---

## Skills routes — `/api/skills`

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/skills` | required | |
| GET | `/api/skills/mine` | required | |
| GET | `/api/skills/:id` | none | |
| PATCH | `/api/skills/:id` | required, owner only | |
| DELETE | `/api/skills/:id` | required, owner only | |

Create body:
```json
{ "name": "string, required", "description": "string, optional", "category": "string, optional" }
```

No `/nearby` route — skills have no location column by design.

---

## Transactions routes — `/api/transactions`

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/transactions/:id` | required, participant only (`from_user_id` or `to_user_id`) | |

The *chain* endpoint lives under `/api/resources/:resourceId/chain` (see Resources above) — there is no `GET /api/transactions/chain/:resourceId` or similar. Don't invent one.

---

## Health check

`GET /api` — `{ "success": true, "data": null }`, confirms the server is up.

---

## Error codes reference

| Code                   | HTTP | Meaning                                        |
|-------------------------|------|-------------------------------------------------|
| INVALID_CREDENTIALS      | 401 / 400 | Missing/wrong email-password, or wrong current password |
| UNAUTHORIZED             | 401  | Missing/invalid token, or no profile for token  |
| INVALID_TOKEN            | 401  | Bad Firebase ID token                           |
| INVALID_REFRESH_TOKEN    | 401  | Missing/invalid/expired refresh token           |
| FORBIDDEN                | 403  | Authenticated but wrong role / not owner / not a participant |
| NOT_FOUND                | 404  | Generic not-found                               |
| PROFILE_NOT_FOUND        | 404  | Profile doesn't exist                           |
| DEAL_NOT_FOUND           | 404  |                                                  |
| OFFER_NOT_FOUND          | 404  |                                                  |
| RESOURCE_NOT_FOUND       | 404  |                                                  |
| SKILL_NOT_FOUND          | 404  |                                                  |
| TRANSACTION_NOT_FOUND    | 404  |                                                  |
| EMAIL_EXISTS             | 409  | Firebase already has this email                 |
| PROFILE_EXISTS           | 409  | DB profile already exists for that email        |
| USERNAME_TAKEN           | 409  | Username unique constraint on update            |
| EMAIL_TAKEN              | 409  | Email unique constraint on update               |
| DEAL_NOT_OPEN            | 409  | Action attempted on a non-open deal             |
| OFFER_NOT_PENDING        | 409  | Accept/reject/withdraw on a non-pending offer   |
| NO_UPDATE_FIELDS         | 400  | PATCH body had no recognized fields             |
| INVALID_ROLE             | 400  | Admin role-update with bad/missing value        |
| MISSING_FIELDS           | 400  | Required field missing on create                |
| MISSING_COORDINATES      | 400  | lat/lng missing/NaN on a nearby-search call     |
| CANNOT_OFFER_OWN_DEAL    | 400  | User tried to offer on their own deal           |
| WEAK_PASSWORD            | 400  | New password fails Firebase's strength policy   |

---

## Frontend test tools (`tests/`)

- **`test-dashboard.html`** — full interactive dashboard covering every route: auth, admin, deals, resources, skills, offers, transactions, plus an automated end-to-end suite button. Has an editable "API Base" input (defaults to `http://localhost:3000`), and per-form "📍 Live GPS" toggle buttons on the deal/resource lat-lng fields (uses `navigator.geolocation.watchPosition`, continuously fills the fields while active — click again to stop).
- **`map.test.html`** — Leaflet map showing all open deals as markers, reading flat `lat`/`lng` from `GET /api/deals`. Includes an optional live GPS tracking dot (start/stop button, shows accuracy radius).
- **`index.html`** — standalone Firebase Google Auth test page (popup sign-in → `POST /api/auth/google` → `GET /api/auth/me` → logout). No location features — pure auth flow testing.

**Serving these files:** open via a plain static file server, not `file://` — `credentials: 'include'` cookie-based auth won't work from a `null` origin. Recommended:
```bash
cd tests
python3 -m http.server 5501
```
Then open `http://localhost:5501/test-dashboard.html`. Confirm your backend's CORS config allows this exact origin (`http://localhost:5501`) with `credentials: true`.

**Do not use a live-reload dev server (e.g. VS Code "Live Server") pointed at the project root or even at `tests/` if it's also watching `logs/`** — `requestLogger` writes on every request, and a watcher that sees that file change will reload the page mid-test, creating a false "infinite reload" loop that looks like a bug in the HTML but is actually the watcher reacting to its own traffic.

## Running tests

```bash
npm test
```

Runs `scripts/run-tests.sh`, which sequentially invokes each `tests/*.test.ts` as its own `npx tsx` process (required because `admin.test.ts` calls `pool.end()`, which would break a shared-process run). Individually:

```bash
npx tsx tests/auth.test.ts
npx tsx tests/admin.test.ts
npx tsx tests/deals.test.ts
npx tsx tests/offers.test.ts
npx tsx tests/resources.test.ts
npx tsx tests/skills.test.ts
npx tsx tests/transactions.test.ts
```

All scripts hit a live server instance and a live Firebase project — they create and delete real Firebase users, so point `.env` at a dev/test project, not production. Each test file cleans up its Firebase users in a `finally` block and calls `pool.end()` once at the end.

## Dev server setup

`nodemon.json` (scope watching to `src/` only, to avoid the log-file restart loop described above):
```json
{
  "watch": ["src"],
  "ext": "ts,json",
  "ignore": ["logs/*", "tests/*", "*.html", "node_modules/*"],
  "exec": "tsx src/server.ts"
}
```

`package.json` script:
```json
{ "scripts": { "dev": "nodemon" } }
```

---

## Still open / unresolved

1. Should admin `DELETE /api/admin/users/:id` also call `firebaseAuth.deleteUser()`? Currently DB-row-only.
2. Chain redaction hides both price and identity for non-participants — whether an identity-visible/price-hidden mode should exist separately is undecided. Not built.
3. Nothing blocks a skill from being attached to a repeated/chain-style deal, but since skill transactions never set `parent_transaction_id`, this is likely harmless — not explicitly resolved.
4. Matching/recommendation engine, reputation engine, polling notifications, Razorpay payments, QR handover, location-privacy response gating, admin stats/disputes — all still unbuilt, per original roadmap.

## Conventions for whoever picks this up next

1. Don't assume any field name not explicitly confirmed above — if writing against an endpoint whose exact allow-list isn't documented here, check the real service file first rather than guessing.
2. Every mutating endpoint requires the `accessToken` cookie, obtained via `POST /api/auth/register` or `/login` — capture `set-cookie` from that response and pass it via `.set("Cookie", ...)` on subsequent calls.
3. Always clean up: delete any Firebase users created during a test run in a `finally` block, and call `pool.end()` once at the very end of each test file.
4. Follow the layering convention (`routes → controllers → services → models`) for any new code — no exceptions.
5. Any new mutating field needs an explicit allow-list in its service layer — never spread `req.body` into an `UPDATE`.
6. Never introduce Socket.IO/WebSockets (polling only, by design decision) or Mongoose/MongoDB (raw `pg` against Postgres only).
7. Remember the `req.user.uid` convention: it's the **Postgres** id everywhere in application code. Only `req.user.firebaseUid` should ever touch the Firebase Admin SDK. The bug fixed this session (auth.service.ts / user.model.ts mixing these up) is exactly the failure mode to watch for when adding new profile-related code.