# DealPool Backend

## Response structure

Every endpoint returns one of:

​```typescript
export type ApiResponse<T = unknown> =
    | {
        success: true;
        data: T;
        error?: never;
    }
    | {
        success: false;
        data?: never;
        error: {
            code: string;
            message: string;
        };
    };
​```

## Auth model

- Firebase handles identity (email/password + Google). Postgres `profiles` table holds app data.
- Access/refresh tokens are set as httpOnly cookies (`accessToken`, `refreshToken`) — never returned in the response body.
- `authMiddleware` verifies the Firebase token on every request and re-fetches the profile from the DB, so role changes and profile updates take effect on the very next request, no re-login required.

## `profiles` table

| column         | type          | notes                                  |
|----------------|---------------|-----------------------------------------|
| id             | uuid          | pk                                      |
| firebase_uid   | text          | unique, links to Firebase user          |
| username       | text          | unique, server-generated on register    |
| email          | text          | unique, not null                        |
| profile_photo  | text          | nullable                                |
| role           | text          | `user` \| `admin`, default `user`       |
| avg_rating     | numeric(3,2)  | 0.00–5.00, not user-editable            |
| rating_count   | integer       | not user-editable                       |
| created_at     | timestamptz   |                                          |
| updated_at     | timestamptz   |                                          |

Username is **never** accepted from the client on register — it's generated server-side (`adjective_noun_hexsuffix`, e.g. `swift_otter_4a1b2c`) and can be changed later via `/api/auth/update`.

`role`, `avg_rating`, and `rating_count` cannot be changed through any self-service endpoint. `role` can only be changed by an existing admin via `/api/admin/users/:id/role`.

---

## Auth routes — `/api/auth`

### `POST /api/auth/register`

Body:
​```json
{ "email": "user@example.com", "password": "..." }
​```
- `201` — profile created, sets `accessToken` + `refreshToken` cookies.
- `401 INVALID_CREDENTIALS` — missing email/password.
- `409 EMAIL_EXISTS` — Firebase already has this email.
- `409 PROFILE_EXISTS` — a profile row already exists for this email.

### `POST /api/auth/login`

Body:
​```json
{ "email": "user@example.com", "password": "..." }
​```
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

Body:
​```json
{ "idToken": "<firebase-id-token-from-client-sdk>" }
​```
Client handles the Google OAuth popup and Firebase sign-in; this endpoint just verifies the resulting ID token, creates a profile on first login, and sets `accessToken`. Refresh flow is handled entirely client-side by the Firebase SDK for this path.
- `200` — profile returned, `accessToken` cookie set.
- `401 INVALID_TOKEN` — missing or invalid ID token.

### `PATCH /api/auth/update`

Protected. Body — all fields optional, send only what changes:
​```json
{
    "username": "new_username",
    "email": "new@example.com",
    "profile_photo": "https://..."
}
​```
- `200` — updated profile returned.
- `400 NO_UPDATE_FIELDS` — no recognized fields in body.
- `409 USERNAME_TAKEN` / `409 EMAIL_TAKEN` — value already in use.
- `401 UNAUTHORIZED` — not authenticated.

`role`, `avg_rating`, `rating_count` are silently ignored if sent — they're not in the updatable field set.

### `PATCH /api/auth/change-password`

Protected. Body:
```json
{
    "currentPassword": "oldPassword123",
    "newPassword": "newPassword123"
}
```
- `200` — password updated successfully, returns `{ "success": true, "data": null }`.
- `400 INVALID_CREDENTIALS` — missing `currentPassword` or `newPassword`.
- `400 WEAK_PASSWORD` — new password is shorter than 6 characters.
- `401 INVALID_CREDENTIALS` — current password is incorrect.
- `401 UNAUTHORIZED` — not authenticated.

---

## Admin routes — `/api/admin`

All routes require `authMiddleware` + `requireRole("admin")`. Non-admins get `403 FORBIDDEN`; unauthenticated requests get `401 UNAUTHORIZED`.

### `GET /api/admin/users?limit=50&offset=0`

Lists profiles, newest first.
- `200` — array of profiles.

### `GET /api/admin/users/:id`

Single profile by `id` (uuid, the profiles.id — not firebase_uid).
- `200` — profile returned.
- `404 PROFILE_NOT_FOUND`.

### `PATCH /api/admin/users/:id/role`

Body:
​```json
{ "role": "admin" }
​```
Valid values: `"user"`, `"admin"`.
- `200` — updated profile returned.
- `400 INVALID_ROLE` — missing or invalid role value.
- `404 PROFILE_NOT_FOUND`.

### `DELETE /api/admin/users/:id`

Deletes the profile row.
- `200` — `data: null`.
- `404 PROFILE_NOT_FOUND`.

**Known gap:** this only deletes the Postgres row. It does **not** delete the corresponding Firebase Auth user — that user can still authenticate and get a valid ID token, but `authMiddleware` will reject them with `401 PROFILE_NOT_FOUND` since there's no profile to attach. Decide whether to cascade this to `firebaseAuth.deleteUser()` before relying on this in production.

---

## Health check

`GET /api` — confirms the API is running.

---

## Error codes reference

| Code                  | HTTP | Meaning                                      |
|-----------------------|------|-----------------------------------------------|
| INVALID_CREDENTIALS   | 401 / 400 | Missing/wrong credentials or current password |
| WEAK_PASSWORD         | 400  | New password is shorter than 6 characters     |
| UNAUTHORIZED          | 401  | Missing/invalid token, or no profile          |
| INVALID_TOKEN         | 401  | Bad Firebase ID token                         |
| INVALID_REFRESH_TOKEN | 401  | Missing/invalid/expired refresh token         |
| FORBIDDEN             | 403  | Authenticated but wrong role                  |
| NOT_FOUND / PROFILE_NOT_FOUND | 404 | Resource doesn't exist                 |
| EMAIL_EXISTS          | 409  | Firebase already has this email               |
| PROFILE_EXISTS        | 409  | DB profile already exists                     |
| USERNAME_TAKEN        | 409  | Username unique constraint hit                |
| EMAIL_TAKEN           | 409  | Email unique constraint hit on update         |
| NO_UPDATE_FIELDS      | 400  | PATCH body had no valid fields                |
| INVALID_ROLE          | 400  | Role update with bad/missing value            |

## Running tests

​```bash
npm run test:auth
npm run test:admin
​```

Both scripts hit a live server instance and a live Firebase project — they create and delete real Firebase users, so point `.env` at a dev/test project, not production.