# Developer Guide — Smart Enterprise Central Admin Portal

## Quick Start

### Prerequisites
- Node.js 18+ (CommonJS modules)
- PostgreSQL 14+
- npm

### Installation

```bash
# Clone and install backend
cd backend
npm install

# Install frontend
cd ../frontend
npm install

# Set up environment
cp backend/.env.example backend/.env  # Configure DATABASE_URL, JWT_SECRET, etc.
```

### Database Setup

```bash
cd backend

# Generate Prisma Client
npx prisma generate

# Push schema to database
npx prisma db push

# (Optional) Seed demo data
node seed.js
```

### Development

```bash
# Terminal 1: Backend (port 5005)
cd backend
npm run dev

# Terminal 2: Frontend (port 5175)
cd frontend
npm run dev
```

### Production Build

```bash
# Build frontend
cd frontend
npm run build

# Start backend (serves frontend static files)
cd ../backend
npm start
```

---

## Project Structure

```
SmartEnterprise_AD/
├── backend/
│   ├── server.js                    # Express + Socket.IO entry
│   ├── db.js                        # Prisma client singleton
│   ├── prisma/schema.prisma         # Database schema (47 models)
│   ├── src/
│   │   ├── routes/                  # 28 route handlers
│   │   ├── services/                # Business logic services
│   │   ├── sockets/                 # Socket.IO handlers
│   │   ├── middleware/              # Auth + validation
│   │   └── utils/                   # Logger, audit, helpers
│   └── tests/                       # Jest tests
│
├── frontend/
│   └── src/
│       ├── App.tsx                  # React Router + auth
│       ├── api/                     # 23 API client modules
│       ├── pages/                   # 14 page components
│       ├── components/              # UI components (Radix + Tailwind)
│       ├── context/                 # Auth, Settings, Socket contexts
│       └── hooks/                   # Custom React hooks
│
└── docs/                            # Documentation
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5.9, Vite 7 |
| UI | Radix UI, Tailwind CSS 4, Framer Motion, Recharts |
| State | TanStack React Query 5, TanStack Table 8 |
| Routing | React Router DOM 7 |
| Backend | Express 4, Node.js CommonJS |
| Database | PostgreSQL, Prisma 5 |
| Real-time | Socket.IO 4 |
| Validation | Zod 4 |
| Auth | JWT (jsonwebtoken 9), bcryptjs |
| Logging | Pino |
| Testing | Jest 30, Supertest 7 |

---

## Key Concepts

### Hub-and-Spoke Architecture

The portal is the central hub. Branch instances connect via:
1. **Socket.IO** — Real-time bidirectional communication
2. **HTTP REST** — Sync endpoints for data exchange

### Dual Authentication
- **Admin users:** JWT Bearer tokens (24h expiry)
- **Branch apps:** API keys (non-expiring, HWID-bound)

### Sync Engine
Changes flow through the `SyncQueue` service:
- Portal changes → Queue → WebSocket → Branch
- Branch changes → WebSocket/HTTP → Portal upsert
- Offline branches: Queue accumulates, delivers on reconnect

### Source of Truth
| Data Type | Source of Truth |
|-----------|----------------|
| Spare parts catalog | Portal |
| Machine parameters | Portal |
| Global parameters | Portal |
| Software versions | Portal |
| Customers | Branch |
| POS machines | Branch |
| Maintenance requests | Branch |
| Payments | Branch |
| Users | Bidirectional |

---

## Common Workflows

### Adding a New API Endpoint

1. Create route file: `backend/src/routes/myFeature.js`
2. Define Zod schema: `backend/src/routes/myFeature.schema.js`
3. Register in `server.js`:
   ```javascript
   const myFeatureRoutes = require('./src/routes/myFeature');
   app.use('/api/my-feature', myFeatureRoutes);
   ```
4. Create API client: `frontend/src/api/myFeatureApi.ts`
5. Add page/component in frontend

### Adding a Database Model

1. Add model to `backend/prisma/schema.prisma`
2. Run `npx prisma generate` (required)
3. Run `npx prisma db push` (to apply to DB)
4. Create/update routes and services

### Adding a Frontend Page

1. Create page: `frontend/src/pages/MyPage.tsx`
2. Add route in `App.tsx`:
   ```tsx
   <Route path="/my-page" element={<MyPage />} />
   ```
3. Add navigation link in `AdminLayout.tsx`

---

## Testing

### Backend Tests

```bash
cd backend

# Run all tests
npm test

# Run specific test
npm test -- --testPathPattern=smoke.test.js

# Run by pattern
npm test -- --testNamePattern="customer"
```

**Test Structure:**
```javascript
describe('FeatureName', () => {
  beforeEach(async () => {
    await prisma.tableName.deleteMany(); // Clean DB
  });

  it('should do something', async () => {
    const result = await service.method(input);
    expect(result.field).toBe(expected);
  });
});
```

### Frontend Tests

```bash
cd frontend
npm run test  # Vite test runner
```

---

## Debugging

### Backend
- Logs: Pino logger → `backend/utils/logger.js`
- Socket logs: `[Socket]`, `[Sync]` prefixes
- Enable verbose: `DEBUG=*` env var

### Frontend
- React DevTools for component inspection
- Network tab for API calls
- Console for React Query cache inspection

### Database
```bash
cd backend
npx prisma studio  # GUI database browser
```

---

## Code Style

### Backend (Node.js/Express)
- **Files:** `camelCase.js`
- **Functions:** `camelCase`
- **Constants:** `UPPER_SNAKE_CASE`
- **Imports:** Node built-ins → Third-party → Local modules
- **Error handling:** Always use `asyncHandler` wrapper
- **Prisma:** Use single unique field in `where` for findUnique/update/delete

### Frontend (React/TypeScript)
- **Components:** `PascalCase.tsx`
- **Hooks:** `use*` prefix
- **Files:** `kebab-case.tsx`
- **Imports:** React → Third-party → Radix UI → Local
- **Styling:** Tailwind CSS utility classes

---

## Environment Variables

### Backend (`.env`)
| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | JWT signing secret |
| `PORTAL_API_KEY` | Yes | Master API key for branch auth |
| `BOOTSTRAP_SECRET` | Yes | Branch registration secret |
| `PORT` | No | Server port (default: 5005) |
| `NODE_ENV` | No | `development` or `production` |
| `GITHUB_PAT` | No | GitHub personal access token |
| `BRANCH_API_URL` | No | Default branch URL for updates |

### Frontend (`.env`)
| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | No | API base URL (default: `/api`) |

---

## Deployment

See `docs/DEPLOYMENT.md` for complete deployment instructions.

Quick deploy to Render.com:
```bash
# render.yaml is configured for:
# - Web service: Node.js (backend + frontend static)
# - PostgreSQL database
```
