# API Reference — Smart Enterprise Central Admin Portal

Base URL: `/api`
Health Check: `GET /health`

## Authentication

All endpoints require authentication unless noted. Two auth methods are used:

| Method | Header | Used By |
|--------|--------|---------|
| JWT Bearer | `Authorization: Bearer <token>` | Admin portal users |
| Branch API Key | `x-portal-sync-key: <key>` | Branch applications |

### JWT Token
- Obtained via `POST /api/auth/login`
- Expiry: 24 hours
- Payload: `{ id, username, role }`

### Branch API Key
- Generated during branch registration
- Non-expiring, bound to hardware ID (HWID)
- Master fallback key: `PORTAL_API_KEY` env var

---

## Endpoints

### Auth (`/api/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/login` | None | Authenticate admin user |
| POST | `/forgot-password` | None | Validate recovery key, get reset token |
| POST | `/reset-password` | None | Complete password reset |
| GET | `/preferences` | JWT | Get current user preferences |
| PUT | `/preferences` | JWT | Update user preferences |

#### POST /api/auth/login

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "jwt_token_here",
    "admin": {
      "id": "cuid",
      "username": "Admin@",
      "name": "Super Admin",
      "role": "SUPER_ADMIN"
    }
  }
}
```

**Rate Limiting:** 10 attempts per 15 minutes (production), 1000 (development).

#### POST /api/auth/forgot-password

**Request Body:**
```json
{
  "username": "string",
  "recoveryKey": "string"
}
```

#### POST /api/auth/reset-password

**Request Body:**
```json
{
  "token": "reset_token",
  "newPassword": "string"
}
```

#### GET/PUT /api/auth/preferences

**PUT Request Body:**
```json
{
  "theme": "dark" | "light",
  "fontFamily": "system" | "arabic",
  "themeVariant": "default" | "glass"
}
```

---

### Licenses (`/api/licenses`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/create` | None | Create a new license key |
| POST | `/activate` | None | Activate a license (branch app) |
| POST | `/verify` | None | Verify license validity (branch app) |
| POST | `/suspend` | None | Suspend a license |
| POST | `/revoke` | None | Revoke a license permanently |
| GET | `/` | None | List all licenses (query: status, branchCode, type) |
| GET | `/:licenseKey/audit` | None | Get audit log for a license |

#### POST /api/licenses/create

**Request Body:**
```json
{
  "branchCode": "BR001",
  "branchName": "Branch Name",
  "type": "BRANCH",
  "expirationDate": "2026-12-31",
  "maxActivations": 1
}
```

**Response (200):**
```json
{
  "success": true,
  "license": {
    "id": "cuid",
    "licenseKey": "ABCDE-12345-FGHIJ-67890",
    "branchCode": "BR001",
    "type": "BRANCH",
    "status": "ACTIVE",
    "expirationDate": "2026-12-31T00:00:00.000Z",
    "maxActivations": 1
  }
}
```

#### POST /api/licenses/activate

**Request Body:**
```json
{
  "licenseKey": "ABCDE-12345-FGHIJ-67890",
  "hwid": "hardware_id",
  "branchCode": "BR001",
  "branchName": "Branch Name"
}
```

#### POST /api/licenses/verify

**Request Body:**
```json
{
  "licenseKey": "ABCDE-12345-FGHIJ-67890",
  "hwid": "hardware_id",
  "branchCode": "BR001",
  "machineId": "machine_id"
}
```

**Response (200) — Valid:**
```json
{
  "valid": true,
  "status": "ACTIVE",
  "type": "BRANCH",
  "expirationDate": "2026-12-31T00:00:00.000Z",
  "daysRemaining": 274
}
```

---

### Branches (`/api/branches`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | Bootstrap Secret | Auto-register branch (installer flow) |
| POST | `/verify-registration` | Bootstrap Secret | Verify branch code exists |
| POST | `/complete-registration` | Bootstrap Secret | Complete enrollment with HWID |
| POST | `/register-manual` | JWT | Manually create branch (legacy) |
| GET | `/` | JWT | List all branches |
| POST | `/` | JWT | Create branch |
| PUT | `/:id` | JWT | Update branch |
| DELETE | `/:id` | JWT | Delete branch |
| GET | `/:id` | JWT | Get branch details |
| GET | `/export/all` | JWT | Export all branch data to Excel |
| POST | `/:id/trigger-sync` | JWT | Request full sync from branch |
| POST | `/:id/pull-inventory` | JWT | Request inventory pull from branch |

#### POST /api/branches/register (Bootstrap Flow)

**Request Body:**
```json
{
  "bootstrapSecret": "env:BOOTSTRAP_SECRET",
  "name": "Branch Name",
  "hardwareId": "hwid_string",
  "hostIP": "192.168.1.100"
}
```

**Response (201):**
```json
{
  "success": true,
  "branchCode": "BR-A1B2C3",
  "apiKey": "sk_abc123...",
  "credentials": {
    "username": "admin",
    "password": "admin123"
  },
  "message": "Branch registered successfully"
}
```

#### GET /api/branches

**Response (200):**
```json
[
  {
    "id": "cuid",
    "code": "BR001",
    "name": "فرع الرياض",
    "status": "ONLINE",
    "type": "BRANCH",
    "lastSeen": "2026-04-01T10:00:00.000Z",
    "_count": { "backups": 3 }
  }
]
```

#### POST /api/branches (Manual Create)

**Request Body:**
```json
{
  "code": "BR002",
  "name": "Branch Name",
  "address": "Address",
  "authorizedHWID": "hwid",
  "type": "BRANCH",
  "phone": "+966500000000",
  "managerEmail": "manager@example.com",
  "parentBranchId": "cuid"
}
```

---

### Sync (`/api/sync`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/request-sync` | Branch Key | Branch requests data from portal |
| POST | `/push` | Branch Key | Branch pushes data to portal |
| POST | `/request-full-sync/:branchId` | JWT | Admin requests full sync |
| GET | `/branch-stock/:branchId/:partId` | JWT | Query branch stock |
| GET | `/logs` | JWT | Get sync operation logs |

#### POST /api/sync/request-sync

**Headers:** `x-portal-sync-key: <branch_api_key>`

**Request Body:**
```json
{
  "entities": ["branches", "users", "machineParameters", "spareParts", "sparePartPriceLogs", "globalParameters"]
}
```

Omit `entities` array to receive all data.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "branches": [...],
    "users": [...],
    "machineParameters": [...],
    "masterSpareParts": [...],
    "sparePartPriceLogs": [...],
    "globalParameters": [...]
  }
}
```

#### POST /api/sync/push

**Headers:** `x-portal-sync-key: <branch_api_key>`

**Request Body:**
```json
{
  "customers": [...],
  "posMachines": [...],
  "users": [...],
  "payments": [...],
  "maintenanceRequests": [...],
  "spareParts": [{"partId": "...", "quantity": 10}],
  "warehouseMachines": [...],
  "simCards": [...]
}
```

**Response (200):**
```json
{
  "message": "Sync process completed",
  "stats": {
    "customers": 5,
    "posMachines": 12,
    "users": 3,
    "payments": 8,
    "maintenanceRequests": 4,
    "spareParts": 20,
    "warehouseMachines": 15,
    "simCards": 6
  },
  "success": true,
  "errorCount": 0
}
```

#### GET /api/sync/logs

**Query Parameters:**
- `limit` (default: 50)
- `offset` (default: 0)
- `type` (filter: PULL, PUSH, CONNECT, DISCONNECT)
- `branchId` (filter by branch)

---

### Sync Queue (`/api/sync-queue`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | JWT | Get pending sync queue items |

---

### Parameters (`/api/parameters`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | JWT | List all machine parameters |
| POST | `/broadcast` | JWT | Broadcast parameter to all branches |
| POST | `/` | JWT | Create parameter |
| PUT | `/:id` | JWT | Update parameter |
| DELETE | `/:id` | JWT | Delete parameter |

---

### POS Parameters (`/api/pos-parameters`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | JWT | List all POS parameters |
| POST | `/broadcast` | JWT | Broadcast to all branches |
| POST | `/` | JWT | Create POS parameter |
| PUT | `/:id` | JWT | Update POS parameter |
| DELETE | `/:id` | JWT | Delete POS parameter |

---

### Spare Parts (`/api/spare-parts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | JWT | List all master spare parts |
| POST | `/broadcast` | JWT | Broadcast to all branches |
| POST | `/` | JWT | Create spare part |
| PUT | `/:id` | JWT | Update spare part |
| GET | `/:id/price-logs` | JWT | Get price change history |
| POST | `/bulk-delete` | JWT | Delete multiple parts |
| POST | `/import` | JWT | Import parts from Excel |
| DELETE | `/:id` | JWT | Delete spare part |

---

### Dashboard (`/api/dashboard`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/stats` | JWT | Get dashboard statistics |

---

### Users (`/api/users`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | JWT | List all users |
| POST | `/` | JWT | Create user |
| PUT | `/:id` | JWT | Update user |
| DELETE | `/:id` | JWT | Delete user |

---

### Customers (`/api/customers`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | JWT | List all customers |
| POST | `/` | JWT | Create customer |

---

### Warehouse (`/api/warehouse`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/machines` | JWT | List warehouse machines |
| GET | `/` | JWT | Get warehouse overview |
| GET | `/fleet` | JWT | Get fleet information |

---

### Reports (`/api/reports`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/financial-summary` | JWT | Get financial summary report |
| GET | `/rankings` | JWT | Get branch/customer rankings |
| GET | `/inventory-valuation` | JWT | Get inventory valuation report |

---

### Permissions (`/api/permissions`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | JWT | List all role permissions |
| POST | `/bulk` | JWT | Bulk update permissions |
| POST | `/reset` | JWT | Reset permissions to defaults |
| GET | `/check` | JWT | Check specific permission |

---

### Admin Store (`/api/admin-store`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/settings/types` | JWT | List item types |
| POST | `/settings/types` | JWT | Create item type |
| PUT | `/settings/types/:id` | JWT | Update item type |
| GET | `/inventory` | JWT | Get inventory overview |
| POST | `/assets/manual` | JWT | Manual asset entry |
| POST | `/assets/import` | JWT | Import assets from Excel |
| GET | `/cartons` | JWT | List cartons |
| POST | `/cartons` | JWT | Create carton |
| POST | `/transfers/asset` | JWT | Transfer asset |
| GET | `/stocks` | JWT | Get stock levels |

---

### Admin (`/api/admin`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/audit-logs` | JWT | Get audit logs |
| DELETE | `/audit-logs/older-than/:days` | JWT | Delete old audit logs |
| GET | `/system/status` | JWT | Get system status |
| GET | `/system/logs/recent` | JWT | Get recent system logs |
| GET | `/settings` | JWT | Get system settings |
| PUT | `/settings` | JWT | Update system settings |
| POST | `/sync/users` | JWT | Sync users |
| GET | `/branches` | JWT | Get all branches |
| GET | `/branches/:id/users` | JWT | Get branch users |
| DELETE | `/branches/:id` | JWT | Delete branch |
| GET | `/users` | JWT | Get all users |
| DELETE | `/users/:id` | JWT | Delete user |
| POST | `/users/:id/reset-password` | JWT | Reset user password |
| POST | `/users/:id/unlock` | JWT | Unlock user account |
| GET | `/user-sync-logs` | JWT | Get user sync logs |

---

### Backup (`/api/backup`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/list` | JWT | List available backups |
| POST | `/create` | JWT | Create new backup |
| DELETE | `/delete/:filename` | JWT | Delete backup file |
| GET | `/logs` | JWT | Get backup operation logs |

---

### Settings (`/api/settings`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/client-types` | None | List client types |
| POST | `/client-types` | JWT | Create client type |
| PUT | `/client-types/:id` | JWT | Update client type |
| DELETE | `/client-types/:id` | JWT | Delete client type |

---

### MFA (`/api/mfa`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/status` | JWT | Get MFA status |
| POST | `/setup` | JWT | Generate MFA setup (QR code) |
| POST | `/verify-setup` | JWT | Verify MFA setup |
| POST | `/disable` | JWT | Disable MFA |
| POST | `/verify` | None | Verify MFA token (login flow) |
| POST | `/recovery-codes` | JWT | Generate recovery codes |
| POST | `/verify-recovery` | None | Verify with recovery code |

---

### Bootstrap (`/api/bootstrap`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register-branch` | None | Register branch (bootstrap flow) |

---

### GitHub Integration (`/api/github`)

**Requires:** Super Admin role

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/releases` | Super Admin | List GitHub releases |
| GET | `/releases/latest` | Super Admin | Get latest release |
| GET | `/download/:version` | Super Admin | Get download URL for version |
| GET | `/settings` | Super Admin | Get GitHub settings |
| POST | `/settings` | Super Admin | Update GitHub settings |
| GET | `/test` | Super Admin | Test GitHub connection |

---

### Versions (`/api/versions`)

**Requires:** Super Admin role (except status endpoint)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Super Admin | List all branch versions |
| GET | `/:branchCode` | Super Admin | Get branch version details |
| POST | `/:branchCode/check` | Super Admin | Check for updates |
| POST | `/:branchCode/push` | Super Admin | Push update to branch |
| POST | `/:branchCode/rollback` | Super Admin | Rollback branch update |
| GET | `/logs` | Super Admin | Get version change logs |
| POST | `/:branchCode/status` | None | Update version status (branch callback) |

---

### Inventory (`/api/inventory`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | JWT | Get inventory (requires `branchId` query param) |

---

### SIM Cards (`/api/simcards`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | JWT | List SIM cards (requires `branchId` query param) |

---

### Miscellaneous (`/api/`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/ai` | JWT | AI assistant endpoint |
| GET | `/info` | JWT | Get portal info |
| GET | `/notifications` | JWT | Get notifications |

---

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "error": "Error message here"
}
```

| Status Code | Meaning |
|-------------|---------|
| 400 | Bad Request — Validation failed |
| 401 | Unauthorized — Invalid or missing credentials |
| 403 | Forbidden — Insufficient permissions |
| 404 | Not Found — Resource doesn't exist |
| 409 | Conflict — Resource already exists |
| 429 | Too Many Requests — Rate limit exceeded |
| 500 | Internal Server Error |

---

## Zod Validation Schemas

Key validation schemas are defined in route-specific `.schema.js` files:
- `auth.schema.js` — login, preferences, password reset
- `sync.schema.js` — request-sync, push payloads
