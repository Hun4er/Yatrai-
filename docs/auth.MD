# Yatrai — Authentication Layer Specification (Phase 2)

**Product:** Yatrai  
**Version:** V1.0  
**Phase:** Phase 2 — Authentication Only  
**Status:** Completed & Verified  
**Document Type:** Authentication Architecture Specification  
**Tagline:** One Goal. Every Route.

---

## 1. Authentication Architecture Overview

Yatrai employs a secure hybrid authentication model combining:
- **Short-Lived Stateless Access JWTs:** Used for authorizing API requests to protected backend routes without querying the database on every transaction.
- **Server-Side Revocable Refresh Sessions:** Persisted in MongoDB as cryptographically hashed tokens, allowing precise session revocation upon logout or security events.
- **HTTP-Only Cookie Transport:** Protects refresh credentials from cross-site scripting (XSS) attacks by isolating them from client-side JavaScript.

```text
Frontend Application (React + Vite)
             │
             │ Authorization: Bearer <access-token>  (In-Memory)
             │ Cookie: yatrai_refresh_token=<raw>     (HTTP-Only, SameSite)
             ▼
     Authentication Middleware (`auth.middleware.js`)
             │ (Verifies JWT signature, expiration, and extracts user ID)
             ▼
      Auth Controller (`auth.controller.js`)
             │ (Validates HTTP input, sets/clears cookies, formats response)
             ▼
       Auth Service (`auth.service.js`)
             │ (Hashes passwords, manages sessions, issues tokens)
             ▼
   Mongoose Models (`User.js` & `RefreshSession.js`)
             │
             ▼
         MongoDB
```

---

## 2. Core Models

### 2.1 User Model Extension (`User.js`)
- **Field Added:** `passwordHash` (String, default: `null`, `select: false`).
- **Data Protection:** Automatically stripped in `toJSON` transform to ensure hashes never leak into API responses.
- **Status Guard:** Respects `status: 'active' | 'inactive' | 'suspended'`. Accounts in `inactive` or `suspended` states cannot authenticate or refresh tokens.

### 2.2 RefreshSession Model (`RefreshSession.js`)
- **Fields:**
  - `user`: Reference to `User` (`ObjectId`, required, indexed).
  - `tokenHash`: SHA-256 hash of the cryptographically random raw refresh token (String, required, indexed). Plaintext tokens are **never** stored.
  - `expiresAt`: Expiration timestamp (Date, required, indexed with `{ expires: 0 }` TTL).
  - `revokedAt`: Timestamp of revocation (Date, default: `null`, indexed).
- **Session Invalidation:** Even if MongoDB TTL background worker has not purged the document, any session where `revokedAt != null` or `new Date() > expiresAt` is strictly rejected.

---

## 3. Token Lifecycle & Flows

### 3.1 Registration (`POST /api/auth/register`)
1. Validates inputs: `name` (1-100 chars), `email` (regex checked), `password` (8-128 chars).
2. Normalizes email: `trim().toLowerCase()`. Passwords are **not** altered or trimmed.
3. Hashes password using `bcryptjs` with 12 salt rounds.
4. Persists user; handles DB duplicate key errors (code 11000).
5. Generates cryptographically secure refresh token (40 random bytes).
6. Computes SHA-256 hash and persists `RefreshSession`.
7. Issues short-lived access JWT (`{ sub: user._id }`).
8. Sets HTTP-only refresh cookie (`path: /api/auth`, `sameSite: 'lax'`, `secure: true` in production).
9. Returns safe user object + access token (no sensitive data).

### 3.2 Login (`POST /api/auth/login`)
1. Validates `email` and `password`.
2. Normalizes email and fetches user with `.select('+passwordHash')`.
3. If not found or status is inactive/suspended, returns generic error: `"Invalid email or password"`.
4. Compares password with `bcrypt.compare()`. On failure, returns same generic error to prevent user enumeration.
5. Issues new refresh session and access token.
6. Sets HTTP-only cookie and returns safe user object + access token.

### 3.3 Refresh Token Rotation (`POST /api/auth/refresh`)
1. Reads refresh token from HTTP-only cookie `req.cookies.yatrai_refresh_token`.
2. Hashes incoming token with SHA-256 and queries `RefreshSession`.
3. Verifies session is not revoked and not expired.
4. Verifies linked user is active and exists.
5. **Rotates Refresh Token:**
   - Marks current session as revoked (`revokedAt = new Date()`).
   - Issues a brand new refresh token and stores a new `RefreshSession`.
   - Generates a new access JWT.
6. Attaches new rotated refresh cookie.
7. Reused or revoked refresh tokens are instantly rejected (`401 UNAUTHORIZED`).

### 3.4 Logout (`POST /api/auth/logout`)
1. Identifies active session from refresh cookie.
2. Marks `RefreshSession.revokedAt = new Date()`.
3. Clears HTTP-only cookie with matching domain/path settings.
4. **Access Token Note:** Stateless access JWTs issued prior to logout remain valid until their short-lived expiry (`15m` default), as is standard in high-performance stateless JWT architectures.

### 3.5 Current Authenticated User (`GET /api/auth/me`)
1. Protected by `auth.middleware.js`.
2. Extracts Bearer token from `Authorization` header.
3. Verifies JWT signature and expiry using `JWT_ACCESS_SECRET`.
4. Attaches `{ id: sub }` to `req.user`.
5. Service fetches User record, validates status, and returns safe user representation.

---

## 4. Environment & Security Configuration

| Variable | Default / Development | Production Requirement |
|---|---|---|
| `JWT_ACCESS_SECRET` | Dev-only fallback secret | **Required** (Startup halts if missing) |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Configurable |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Configurable |
| `AUTH_COOKIE_NAME` | `yatrai_refresh_token` | Configurable |
| `AUTH_COOKIE_SECURE` | `false` in dev (`NODE_ENV === 'production'`) | Automatically `true` in production |
| `AUTH_COOKIE_SAME_SITE` | `lax` | Configurable |

---

## 5. Verification & Test Suite

The test suite in `server/tests/auth.test.js` exercises:
- Registration CRUD, duplicate conflict handling, email normalization, password whitespace preservation.
- Login credential validation, generic failure messages, inactive/suspended status enforcement.
- Refresh session rotation, old session revocation, replay attack rejection, expiration handling.
- Logout session invalidation and cookie clearing.
- Protected `/api/auth/me` Bearer validation, missing/malformed/expired/tampered token handling.
