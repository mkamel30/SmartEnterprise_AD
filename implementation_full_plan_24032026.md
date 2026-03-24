# Smart Enterprise Suite - Complete Implementation Plan

## Phase 4: Packaging & Deployment + Version Management

**Date:** March 24, 2026  
**Project:** Smart Enterprise Branch App + Admin Portal Version Management

---

## Table of Contents

1. [GitHub Security](#1-github-security)
2. [Branch App Build System](#2-branch-app-build-system)
3. [Enhanced Update System](#3-enhanced-update-system)
4. [Admin Portal Version Management](#4-admin-portal-version-management)
5. [Notifications System](#5-notifications-system)
6. [Complete Flow Diagram](#6-complete-flow-diagram)

---

## 1. GitHub Security

### 1.1 Make Repository Private
- [ ] Make `SmartEnterprise_BR` repo **private** (GitHub Settings → General → Change visibility)
- [ ] Review collaborator list - remove unnecessary access

---

## 2. Branch App Build System

### 2.1 Build Scripts (Backend)
| Task | File | Description |
|------|------|-------------|
| [ ] 2.1.1 | `backend/package.json` | Add: `build`, `build:exe`, `build:all` scripts |
| [ ] 2.1.2 | `backend/scripts/build.js` | **NEW** - Orchestrates: prisma generate → obfuscate → pkg → copy frontend |
| [ ] 2.1.3 | `backend/scripts/obfuscate.js` | **NEW** - Maximum obfuscation with javascript-obfuscator |

### 2.2 Obfuscation Settings (Maximum)
```javascript
{
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 1,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 1,
    stringArrayEncoding: true,      // Encrypt strings
    stringArray: true,
    stringArrayThreshold: 1,        // All strings encrypted
    debugProtection: true,           // Break dev tools
    disableConsoleOutput: true,      // Remove console.log
    selfDefending: true,            // Anti-debugging
    renameGlobals: true,
    transformObjectKeys: true,
    transformStrings: true
}
```

### 2.3 Templates & Scripts
| Task | File | Description |
|------|------|-------------|
| [ ] 2.3.1 | `backend/.env.template` | **NEW** - No secrets, placeholders only |
| [ ] 2.3.2 | `backend/dist/run.bat` | **NEW** - Startup script |
| [ ] 2.3.3 | `backend/dist/README.txt` | **NEW** - Quick start guide |

### 2.4 Inno Setup
| Task | File | Description |
|------|------|-------------|
| [ ] 2.4.1 | `setup.iss` | Update paths, add first-run prompts for BRANCH_CODE, PORTAL_API_KEY |

---

## 3. Enhanced Update System (Branch App)

### 3.1 Backup Verification
| Task | Description |
|------|-------------|
| [ ] 3.1.1 | Before any update: Create backup.zip |
| [ ] 3.1.2 | Test-restore to temp folder (extract + prisma db push --accept-data-loss) |
| [ ] 3.1.3 | If restore FAILS → Abort update, show error |
| [ ] 3.1.4 | If restore SUCCEEDS → Proceed with update |

### 3.2 Hidden Temp Folder Update Flow
```
1. Backup created + verified ✅
2. Download new version to: %TEMP%\SmartEnterprise_Update (hidden)
3. Extract/decrypt files in temp folder
4. Stop current server
5. Replace files with new version
6. Run: npx prisma generate
7. Run: npx prisma db push --accept-data-loss
8. Start server with new version
9. Clean up temp folder
10. Notify users of successful update
```

| Task | Description |
|------|-------------|
| [ ] 3.2.1 | Download new version to hidden temp folder |
| [ ] 3.2.2 | Extract/decrypt files in temp folder |
| [ ] 3.2.3 | Replace old files with new version |
| [ ] 3.2.4 | Run prisma generate + db push |
| [ ] 3.2.5 | Clean up temp folder after success |
| [ ] 3.2.6 | Handle rollback on failure |

### 3.3 Update Status Tracking
| Status | Description |
|--------|-------------|
| `checking` | Checking for updates |
| `downloading` | Downloading new version |
| `installing` | Installing update |
| `completed` | Update successful |
| `failed` | Update failed |
| `rolling_back` | Rolling back to previous version |

---

## 4. Admin Portal Version Management

### 4.1 Database Models
```prisma
model BranchVersion {
  id              String   @id @default(cuid())
  branchCode      String   @unique
  appVersion     String
  lastChecked    DateTime @default(now())
  lastUpdated    DateTime?
  updateStatus   String   @default("up_to_date") // up_to_date, update_available, updating, failed
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model VersionLog {
  id              String   @id @default(cuid())
  branchCode      String
  action          String   // check, download, apply, force_push, rollback, verify_backup
  fromVersion     String?
  toVersion       String?
  status          String   // success, failed, in_progress, downloading, installing, verifying_backup
  errorMessage    String?
  initiatedBy     String?  // admin username or "system"
  downloadProgress Int?   // 0-100
  installProgress  Int?   // 0-100
  createdAt       DateTime @default(now())
}
```

| Task | Description |
|------|-------------|
| [ ] 4.1.1 | Add BranchVersion model to schema.prisma |
| [ ] 4.1.2 | Add VersionLog model to schema.prisma |
| [ ] 4.1.3 | Run npx prisma generate |
| [ ] 4.1.4 | Run npx prisma db push |

### 4.2 New Backend Routes (Admin Portal)
| Task | Route | Method | Description |
|------|-------|--------|-------------|
| [ ] 4.2.1 | `/api/github/releases` | GET | Check GitHub releases (uses PAT) |
| [ ] 4.2.2 | `/api/github/download/:version` | GET | Proxy download from GitHub |
| [ ] 4.2.3 | `/api/versions` | GET | Get all branches version info |
| [ ] 4.2.4 | `/api/versions/:branchCode` | GET | Get specific branch version |
| [ ] 4.2.5 | `/api/versions/:branchCode/push` | POST | Push update to specific branch |
| [ ] 4.2.6 | `/api/versions/:branchCode/rollback` | POST | Rollback branch to previous version |
| [ ] 4.2.7 | `/api/versions/:branchCode/check` | POST | Trigger manual check |
| [ ] 4.2.8 | `/api/versions/logs` | GET | Get all version logs with filters |
| [ ] 4.2.9 | `/api/versions/settings` | GET/POST | GitHub PAT settings |

### 4.3 GitHub Proxy Service
| Task | Description |
|------|-------------|
| [ ] 4.3.1 | Create GitHub service to handle API calls with PAT |
| [ ] 4.3.2 | Implement releases listing |
| [ ] 4.3.3 | Implement download proxying |
| [ ] 4.3.4 | Store GitHub PAT in settings or env |

### 4.4 Admin Portal Frontend - Branches Page
| Task | Description |
|------|-------------|
| [ ] 4.4.1 | Add "Version" column with badge to Branches table |
| [ ] 4.4.2 | Color-coded status: 🟢 up_to_date, 🟡 update_available, 🔴 outdated/failed |
| [ ] 4.4.3 | Add "Push Update" button per branch |
| [ ] 4.4.4 | Add "Check Now" button per branch |
| [ ] 4.4.5 | Add version detail modal |

### 4.5 Admin Portal Frontend - New Version Logs Page
| Task | Description |
|------|-------------|
| [ ] 4.5.1 | Create new Versions page |
| [ ] 4.5.2 | Add filters: Branch, Action, Status, Date Range |
| [ ] 4.5.3 | Add search functionality |
| [ ] 4.5.4 | Display all version logs with columns |
| [ ] 4.5.5 | Add refresh button |

### 4.6 Update Status Broadcast (Branch → Admin Portal)
| Task | Description |
|------|-------------|
| [ ] 4.6.1 | Branch calls Admin Portal when update starts downloading |
| [ ] 4.6.2 | Branch calls Admin Portal with download progress (0-100%) |
| [ ] 4.6.3 | Branch calls Admin Portal when install starts |
| [ ] 4.6.4 | Branch calls Admin Portal with install progress (0-100%) |
| [ ] 4.6.5 | Branch calls Admin Portal on completion/failure |

---

## 5. Notifications System

### 5.1 Notification Types
| Type | Recipient | Trigger |
|------|-----------|---------|
| `UPDATE_AVAILABLE` | All branch users | New version available |
| `UPDATE_STARTING` | All branch users | Update about to begin |
| `UPDATE_COMPLETED` | All branch users | Update successful |
| `UPDATE_FAILED` | All branch users | Update failed |
| `UPDATE_PUSHED` | Branch admin | Admin pushed update |

### 5.2 Branch App Notification Endpoint
```
POST /api/notifications/update-status
Body: { status: "downloading|installing|completed|failed", version: "1.1.0", progress: 50 }
```

| Task | Description |
|------|-------------|
| [ ] 5.2.1 | Add update-status endpoint in Branch App |
| [ ] 5.2.2 | Broadcast status to all users in branch |
| [ ] 5.2.3 | Show in-app notification for all users |

---

## 6. Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ADMIN PORTAL                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────────────────────┐  │
│  │ GitHub      │    │ Branch       │    │ Version Logs               │  │
│  │ (Private)   │◄───│ Version      │    │ • check/download/apply    │  │
│  │             │    │ Tracking     │    │ • rollback                │  │
│  └──────┬──────┘    │ • Status     │    │ • filters & search        │  │
│         │ PAT        │ • Push btn   │    └────────────────────────────┘  │
│         ▼            └──────────────┘                                      │
│  ┌─────────────────────────────────────┐                                   │
│  │         VERSION LOG DB               │                                   │
│  │  branchCode, action, status          │                                   │
│  │  fromVersion, toVersion              │                                   │
│  │  initiatedBy, timestamps             │                                   │
│  │  downloadProgress, installProgress   │                                   │
│  └─────────────────────────────────────┘                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
          ▲                    ▲                    ▲
          │                    │                    │
    Hourly Check        Push Command         Download Update
          │                    │                    │
┌─────────┴───────┐    ┌──────┴────────┐    ┌──────┴──────────────┐
│    BR001        │    │    BR002       │    │    BR003            │
│  1. Check       │    │  Admin pushes  │    │  Downloads          │
│  2. Backup ✅   │    │  Update       │    │  version 1.1.0      │
│  3. Verify ✅   │    │                │    │                     │
│  4. Download   │    │                │    │                     │
│  5. Install    │    │                │    │                     │
│  6. prisma    │    │                │    │                     │
│  7. Restart   │    │                │    │                     │
│  8. Notify ✅ │    │                │    │                     │
└─────────────────┘    └────────────────┘    └──────────────────────┘
```

---

## Security Summary

| Protection | What it does |
|------------|--------------|
| **Private Repo** | Only invited users can view code |
| **Maximum Obfuscation** | Code unreadable, strings encrypted |
| **Binary Compilation** | No .js files in final .exe |
| **No Secrets Bundled** | .env.template has placeholders only |
| **Anti-DevTools** | Browser dev tools blocked |
| **GitHub PAT in Portal** | Token never leaves Admin Portal |

---

## Distribution Summary

| Item | Decision |
|------|----------|
| Download Type | Full download (~150MB) |
| Update Frequency | Auto-check every hour + Manual push from Admin |
| Rollback | Yes - ability to rollback |
| Notifications | Yes - all users in branch get notified |
| Version Tracking | Admin Portal shows version per branch |
| Push Update | Admin can force push update to any branch |
| Full Logs | All update activities logged with filters |
| Backup Verification | Test-restore before update |

---

## Questions Answered

1. **Full or Incremental Download?** → **Full** (~150MB) - simpler, reliable
2. **Rollback?** → **Yes** - ability to rollback
3. **Notifications?** → **Yes** - all users notified
4. **Update Frequency?** → **Hourly auto-check + Manual push from Admin**

---

*Document created: March 24, 2026*
*Version: 1.0*
