# Yatrai (यात्राआई) — One Goal. Every Route.

> **Production-grade journey discovery and recovery platform.**  
> Yatrai helps travelers reach their destination even when preferred direct routes are unavailable, sold out, delayed, expensive, or disrupted.

---

## 1. What is Yatrai?

Traditional travel search platforms follow a rigid paradigm: `Origin → Destination → Available Direct Tickets`. When a train or flight is sold out or disrupted, traditional platforms simply show **"No results found."**

**Yatrai changes the equation:**

> **The destination is fixed. The route is dynamically discoverable.**

If a traveler requests a journey from Delhi to Varanasi and direct trains are sold out, Yatrai dynamically evaluates practical connecting hubs (e.g., Delhi → Prayagraj → Varanasi, Delhi → Lucknow → Varanasi) and multimodal combinations (Train + Bus, Flight + Train, Road + Rail) without ever relying on hardcoded route dictionaries or fabricating availability.

---

## 2. Project Architecture

Yatrai is architected as a clean full-stack application structured for progressive expansion from a modular monolith into scalable domain microservices:

```text
yatrai/
├── client/                 # Frontend React Application
│   ├── src/
│   │   ├── components/     # Reusable UI & Status components
│   │   ├── constants/      # App constants & phase metadata
│   │   ├── hooks/          # Custom hooks (e.g. useApiHealth)
│   │   ├── layouts/        # Application shell layouts
│   │   ├── pages/          # Application views (e.g. HomePage)
│   │   ├── services/       # Centralized API service layer
│   │   ├── types/          # Type declarations & JSDoc contracts
│   │   ├── utils/          # Formatting & helper utilities
│   │   ├── App.jsx         # Root component
│   │   ├── index.css       # Tailwind & design token styles
│   │   └── main.jsx        # Client entry point
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
│
├── server/                 # Backend Node.js / Express Service
│   ├── src/
│   │   ├── config/         # Centralized configuration (dev defaults vs production required)
│   │   ├── controllers/    # API endpoint request controllers
│   │   ├── middleware/     # 404 handler, global error handler
│   │   ├── routes/         # Modular route definitions
│   │   ├── services/       # Core business & health services
│   │   ├── types/          # Domain contracts & JSDoc types
│   │   ├── utils/          # Logger (DEBUG, INFO, WARN, ERROR), API response helpers
│   │   ├── app.js          # Express app factory
│   │   └── server.js       # Server listener & graceful shutdown handlers
│   └── package.json
│
├── docs/                   # Architectural & System Specifications
│   ├── Agents.MD           # Engineering & agent behavioral discipline
│   ├── architecture.MD     # Comprehensive system architecture specification
│   ├── DesignSystem.MD     # Dark-first design system & UI tokens
│   └── PRD.MD              # Product requirements document
│
├── .env.example            # Root environment variable template
├── .gitignore              # Git ignore rules
├── .prettierrc             # Root Prettier code formatting rules
├── package.json            # Root workspace configuration & execution scripts
└── README.md               # Primary project documentation
```

---

## 3. Technologies Used

### Frontend

- **Framework:** React 18
- **Build Tool:** Vite 6 (ESM)
- **Styling:** Tailwind CSS with centralized design tokens from `DesignSystem.MD`
- **Icons:** Lucide React
- **Code Quality:** ESLint 9 (Flat Config), Prettier

### Backend

- **Runtime:** Node.js (v20+)
- **Server Framework:** Express 4 (ES Modules)
- **Security & Networking:** CORS, Dotenv
- **Architecture:** Centralized configuration, structured logging, safe error middleware
- **Code Quality:** ESLint 9 (Flat Config), Prettier

---

## 4. Prerequisites

- **Node.js:** v20.0.0 or higher (Tested on Node v24)
- **npm:** v9.0.0 or higher (npm workspaces enabled)
- **Git:** v2.30+

---

## 5. Installation

Clone the repository and install all dependencies across root, client, and server in one command:

```bash
# Clone the repository
git clone <repository-url>
cd Yatrai

# Install dependencies across all npm workspaces
npm install
```

---

## 6. Environment Setup

1. Copy the root environment template:
   ```bash
   cp .env.example .env
   ```
2. Or configure the server environment directly:
   ```bash
   cp server/.env.example server/.env
   ```

### Default Environment Variables (`server/.env`)

```env
NODE_ENV=development
PORT=5000
HOST=localhost
LOG_LEVEL=debug
CLIENT_URL=http://localhost:5173
```

---

## 7. Running the Application

### Option A: Run Full Application (Frontend + Backend concurrently)

```bash
npm run dev
```

Starts:

- **Backend API:** `http://localhost:5000`
- **Frontend Client:** `http://localhost:5173`

### Option B: Run Backend Only

```bash
npm run server
```

### Option C: Run Frontend Only

```bash
npm run client
```

---

## 8. API Health Endpoint

The server exposes a deterministic diagnostic endpoint to verify system connectivity:

```http
GET http://localhost:5000/api/health
```

### Response (200 OK)

```json
{
  "success": true,
  "service": "yatrai-api",
  "status": "healthy",
  "environment": "development",
  "uptimeSeconds": 42,
  "timestamp": "2026-09-24T16:30:00.000Z"
}
```

---

## 9. Database Operations & Testing (Phase 1)

### Test Live Database Connection

```bash
npm run db:test
```

Pings MongoDB with the configured `MONGODB_URI` and outputs connection diagnostics.

### Seed Development Data

```bash
npm run seed
```

Seeds representative Indian locations (Delhi, Sonipat, Patna, Varanasi, Mumbai, Bengaluru), transport providers (IRCTC, IndiGo, UPSRTC, Ola), multimodal journeys, search requests, and notifications.

### Run Automated Model & Database Tests

```bash
npm test
```

Runs 18 unit/integration tests verifying all 9 Mongoose models, CRUD operations, GeoJSON 2dsphere indexing, referential integrity, and cascading deletions.

---

## 10. Authentication & Session Management (Phase 2)

Phase 2 establishes the end-to-end authentication infrastructure for Yatrai:

### Architecture

- **Password Security:** Salted and hashed using `bcryptjs` with 12 salt rounds. Plaintext passwords are never stored or logged.
- **Access Tokens:** Short-lived JWTs containing minimal claims (`{ sub: userId }`) signed with `JWT_ACCESS_SECRET`.
- **Refresh Credentials:** Cryptographically random 40-byte tokens stored exclusively as SHA-256 hashes in MongoDB (`RefreshSession` collection).
- **Transport Security:** Refresh tokens are transported via HTTP-only, SameSite cookies (`path: /api/auth`, `secure: true` in production). JavaScript cannot read or modify the refresh credential.
- **Session Revocation & Rotation:** Every call to `/api/auth/refresh` invalidates the previous refresh session, rotates the refresh token, and issues a fresh session and access token. Replayed or revoked tokens are rejected.
- **Access Token Behavior on Logout:** Calling `/api/auth/logout` revokes the server-side refresh session and clears the refresh cookie. Any already-issued stateless access JWT remains valid only until its short-lived expiration (`15m` default).

### Endpoints

| Method | Endpoint             | Description                                                                            | Protection               |
| ------ | -------------------- | -------------------------------------------------------------------------------------- | ------------------------ |
| `POST` | `/api/auth/register` | Creates user, creates refresh session, returns access token + sets HTTP-only cookie    | Public (Validated)       |
| `POST` | `/api/auth/login`    | Authenticates credentials, creates refresh session, returns access token + sets cookie | Public (Validated)       |
| `POST` | `/api/auth/refresh`  | Validates session, rotates refresh token, returns new access token + sets new cookie   | Public (Cookie-based)    |
| `POST` | `/api/auth/logout`   | Revokes server-side session and clears HTTP-only cookie                                | Public (Cookie-based)    |
| `GET`  | `/api/auth/me`       | Retrieves current authenticated user identity                                          | Protected (`Bearer` JWT) |

### Running Authentication Tests

```bash
npm test
```

Executes all 41 automated unit and integration tests across 17 suites, validating registration, credential verification, duplicate prevention, whitespace preservation, token rotation, session revocation, token expiration, account deactivation, and endpoint protection.

---

## 11. Code Quality & Linting

### Linting

Runs ESLint across both frontend and backend workspaces:

```bash
npm run lint
```

### Formatting

Formats all code according to project conventions:

```bash
npm run format
```

### Build

Generates production build for the frontend:

```bash
npm run build
```

---

## 12. Development Conventions

1. **Separation of Concerns:**
   - Routes only bind URLs to Controllers and Middleware.
   - Controllers handle HTTP serialization, cookies, and delegate to Services.
   - Services implement business logic, cryptographic hashing, and DB operations.
   - UI components do not perform raw HTTP `fetch()`; all requests pass through `client/src/services/api.js`.
2. **Centralized Configuration:**
   - No direct `process.env` scattering. All variables are parsed in `server/src/config/index.js`.
3. **Structured Logging:**
   - Use `logger.info()`, `logger.debug()`, `logger.warn()`, and `logger.error()`.
4. **Provider-Agnostic Design:**
   - External travel providers will be integrated via standard adapters in later phases.
5. **No Hardcoded Travel Data:**
   - No hardcoded routes, stations, availability, or prices are permitted.

---

## 13. Complete Product Roadmap

| Phase       | Phase Name                                            | Status        |
| ----------- | ----------------------------------------------------- | ------------- |
| **PHASE 0** | **Project Foundation**                                | **Completed** |
| **PHASE 1** | **Database + Core Models**                            | **Completed** |
| **PHASE 2** | **Authentication**                                    | **Completed** |
| PHASE 3     | Location & Destination Resolution                     | Upcoming      |
| PHASE 4     | Journey Search Engine                                 | Upcoming      |
| PHASE 5     | Transport Providers Gateway (Rail, Bus, Flight, Road) | Upcoming      |
| PHASE 6     | Journey Normalization Layer                           | Upcoming      |
| PHASE 7     | Ranking & Scoring Engine                              | Upcoming      |
| PHASE 8     | Multi-Modal Journey Orchestration                     | Upcoming      |
| PHASE 9     | Frontend Search Experience                            | Upcoming      |
| PHASE 10    | Results & Route Comparison                            | Upcoming      |
| PHASE 11    | AI / Natural-Language Search                          | Upcoming      |
| PHASE 12    | Maps & Route Visualization                            | Upcoming      |
| PHASE 13    | User Accounts & Saved Journeys                        | Upcoming      |
| PHASE 14    | Alerts & Notifications                                | Upcoming      |
| PHASE 15    | Admin Dashboard & Provider Health                     | Upcoming      |
| PHASE 16    | Error Handling & Edge Cases                           | Upcoming      |
| PHASE 17    | Automated Testing Suite                               | Upcoming      |
| PHASE 18    | Security Hardening & Secret Management                | Upcoming      |
| PHASE 19    | Performance Optimization & Caching                    | Upcoming      |
| PHASE 20    | Deployment & CI/CD Pipeline                           | Upcoming      |
| PHASE 21    | Production Verification & Monitoring                  | Upcoming      |
