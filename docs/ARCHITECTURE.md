# Architecture — Smart Enterprise Central Admin Portal

## System Overview

Smart Enterprise Central Admin Portal is a **hub-and-spoke** management system that serves as the central authority for multiple branch instances. The portal manages branches, synchronizes data, distributes software updates, and enforces licensing across the entire enterprise.

```mermaid
graph TB
    subgraph "Central Admin Portal"
        A[React Frontend<br/>Vite + React 19]
        B[Express API Server<br/>Port 5005]
        C[Socket.IO Server]
        D[(PostgreSQL<br/>via Prisma)]
        E[SyncQueue Service]
    end

    subgraph "Branch Instance 1"
        F1[Branch App]
        G1[(Branch DB)]
    end

    subgraph "Branch Instance N"
        F2[Branch App]
        G2[(Branch DB)]
    end

    subgraph "External Services"
        H[GitHub API<br/>Releases]
    end

    A <-->|HTTP/REST| B
    B <-->|Prisma ORM| D
    B -->|Mounts| C
    B -->|Manages| E
    
    F1 <-->|Socket.IO + HTTP| C
    F1 <-->|HTTP Sync| B
    F1 <-->|Prisma| G1
    
    F2 <-->|Socket.IO + HTTP| C
    F2 <-->|HTTP Sync| B
    F2 <-->|Prisma| G2
    
    B -->|REST API| H
```

## Component Architecture

```mermaid
graph LR
    subgraph "Frontend Layer"
        UI[React Components]
        Pages[14 Pages]
        Hooks[Custom Hooks]
        API[23 API Clients]
        Ctx[3 Contexts: Auth, Settings, Socket]
    end

    subgraph "Backend Layer"
        Routes[28 Route Handlers]
        Services[Sync Services]
        Middleware[Auth + Validation]
        Sockets[Socket.IO Handlers]
        Utils[Logger + Audit]
    end

    subgraph "Data Layer"
        Prisma[(Prisma ORM)]
        DB[(PostgreSQL)]
        Queue[SyncQueue Table]
    end

    UI --> Pages
    Pages --> Hooks
    Hooks --> API
    API --> Routes
    Ctx --> Sockets
    
    Routes --> Services
    Routes --> Middleware
    Routes --> Sockets
    
    Services --> Prisma
    Sockets --> Prisma
    Prisma --> DB
    Prisma --> Queue
```

## Authentication Architecture

```mermaid
sequenceDiagram
    participant Admin as Admin User
    participant FE as Frontend
    participant API as Express API
    participant DB as PostgreSQL
    participant Socket as Socket.IO

    Admin->>FE: Enter credentials
    FE->>API: POST /api/auth/login
    API->>DB: Find admin by username
    DB-->>API: Admin record
    API->>API: bcrypt.compare(password)
    API->>API: jwt.sign({id, username, role})
    API-->>FE: {token, admin}
    FE->>FE: Store token in localStorage

    Note over Admin,Socket: Subsequent Requests
    
    Admin->>FE: Navigate to protected page
    FE->>API: GET /api/dashboard/stats<br/>Authorization: Bearer <token>
    API->>API: jwt.verify(token)
    API->>DB: Query data
    DB-->>API: Results
    API-->>FE: Response

    Note over API,Socket: Branch Connection
    
    Branch->>Socket: Connect with apiKey
    Socket->>DB: Find branch by apiKey
    DB-->>Socket: Branch record
    Socket-->>Branch: Connected
    Socket->>Socket: Join room: branch_{id}
```

## Data Sync Architecture

```mermaid
sequenceDiagram
    participant Portal as Admin Portal
    participant Queue as SyncQueue
    participant WS as WebSocket
    participant Branch as Branch App

    Note over Portal,Branch: Downward Sync (Portal → Branch)
    
    Portal->>Queue: enqueueUpdate(entity, action, payload)
    Queue->>Queue: Create PENDING record
    Queue->>WS: Branch online? Emit admin_update
    WS->>Branch: {queueId, entityType, action, payload}
    Branch->>WS: ack_update {queueId}
    WS->>Queue: Mark SYNCED

    Note over Portal,Branch: Upward Sync (Branch → Portal)
    
    Branch->>WS: branch_push_all {users, params, parts}
    WS->>Portal: Upsert entities in DB
    
    Branch->>WS: branch_inventory_push {inventory}
    WS->>Portal: Batch upsert BranchSparePart
    
    Branch->>WS: branch_data_push {machines, sales, sims}
    WS->>Portal: Upsert reporting data

    Note over Portal,Branch: HTTP Sync Fallback
    
    Branch->>Portal: POST /api/sync/request-sync
    Portal->>Portal: Query entities
    Portal-->>Branch: {branches, users, params, parts}
    
    Branch->>Portal: POST /api/sync/push
    Portal->>Portal: Upssert all entities
    Portal-->>Branch: {stats, errorCount}
```

## Deployment Architecture

```mermaid
graph TB
    subgraph "Render.com"
        subgraph "Web Service"
            APP[Express Server + Static React Files]
        end
        subgraph "Database"
            PG[(PostgreSQL)]
        end
    end

    subgraph "Branch Network"
        B1[Branch Server 1]
        B2[Branch Server 2]
        B3[Branch Server N]
    end

    subgraph "GitHub"
        GH[Releases API]
    end

    B1 <-->|WebSocket + HTTPS| APP
    B2 <-->|WebSocket + HTTPS| APP
    B3 <-->|WebSocket + HTTPS| APP
    
    APP <-->|Prisma| PG
    APP -->|REST| GH
```

## Directory Structure

```
SmartEnterprise_AD/
├── backend/
│   ├── server.js                    # Express + Socket.IO entry point
│   ├── db.js                        # Prisma client singleton
│   ├── src/
│   │   ├── routes/                  # 28 route handlers
│   │   │   ├── auth.js              # Authentication (login, password reset)
│   │   │   ├── branches.js          # Branch CRUD + registration
│   │   │   ├── sync.js              # HTTP sync endpoints
│   │   │   ├── licenses.js          # License lifecycle
│   │   │   ├── versions.js          # Version management + GitHub
│   │   │   └── ...                  # 23 more route files
│   │   ├── services/
│   │   │   ├── syncQueue.service.js # Queue-based sync service
│   │   │   └── branchSync.service.js
│   │   ├── sockets/
│   │   │   └── admin.socket.js      # WebSocket event handlers
│   │   ├── middleware/
│   │   │   ├── auth.js              # JWT + role guards
│   │   │   └── validate.js          # Zod validation
│   │   └── utils/
│   │       ├── logger.js            # Pino logger
│   │       └── auditLogger.js       # Audit trail
│   └── prisma/
│       └── schema.prisma            # 34 models
│
├── frontend/
│   └── src/
│       ├── App.tsx                  # React Router + auth wrapper
│       ├── main.tsx                 # Vite bootstrap
│       ├── api/                     # 23 API client modules
│       ├── pages/                   # 14 page components
│       ├── components/              # Layout + UI components
│       ├── context/                 # Auth, Settings, Socket
│       └── hooks/                   # Custom React hooks
│
└── docs/                            # This documentation
```

## Key Design Patterns

### 1. SyncQueue Pattern
Changes made at the portal are queued in the `SyncQueue` table and delivered to branches via WebSocket. If a branch is offline, updates accumulate and are pushed when the branch reconnects.

```mermaid
stateDiagram-v2
    [*] --> PENDING: Change made at portal
    PENDING --> SYNCED: Branch acknowledges (ack_update)
    PENDING --> FAILED: Delivery timeout
    SYNCED --> [*]: Cleanup after 7 days
    FAILED --> PENDING: Retry on reconnect
```

### 2. Dual Authentication
- **Admin Users**: JWT tokens (24h expiry) via `Authorization: Bearer <token>`
- **Branch Apps**: API keys (non-expiring) via `x-portal-sync-key` header
- Socket.IO supports both: branches use `apiKey`, admins use `token`

### 3. Source of Truth Hierarchy
- **Portal is source of truth for**: Spare parts catalog, machine parameters, global parameters, software versions
- **Branches are source of truth for**: Customers, POS machines, maintenance requests, payments, warehouse inventory
- **Bidirectional sync**: Users sync both ways with conflict resolution

### 4. RBAC System
8 hardcoded roles with granular permissions stored in `RolePermission` model:
- `SUPER_ADMIN` — Full access
- `MANAGEMENT` — Management operations
- `BRANCH_ADMIN` — Branch administration
- `ACCOUNTANT` — Financial operations
- `BRANCH_MANAGER` — Branch management
- `CS_SUPERVISOR` — Customer service supervision
- `CS_AGENT` — Customer service operations
- `BRANCH_TECH` — Technical operations

### 5. Bootstrap Registration Flow
New branches self-register through a 3-step process:
1. `POST /api/branches/register` — Creates branch with bootstrap secret
2. `POST /api/branches/verify-registration` — Confirms branch code
3. `POST /api/branches/complete-registration` — Binds HWID, activates branch

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | React | 19.x |
| Build Tool | Vite | 7.x |
| Language | TypeScript | 5.9.x |
| State Management | TanStack React Query | 5.x |
| UI Primitives | Radix UI | 1.x |
| Styling | Tailwind CSS | 4.x |
| Routing | React Router DOM | 7.x |
| Backend Framework | Express | 4.x |
| Runtime | Node.js (CommonJS) | — |
| ORM | Prisma | 5.x |
| Database | PostgreSQL | — |
| Real-time | Socket.IO | 4.x |
| Validation | Zod | 4.x |
| Auth | jsonwebtoken | 9.x |
| Logging | Pino | 10.x |
| Testing | Jest + Supertest | 30.x |
