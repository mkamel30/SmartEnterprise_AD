# Smart Enterprise AD - AI Agent Guidelines

Central Admin Portal for Smart Enterprise Suite. This is the main management interface that connects to branch instances.

## 🏗️ Project Structure

- **Backend (`/backend`)**: Node.js + Express REST API. Uses Prisma ORM with PostgreSQL.
  - Main Entry: `backend/server.js`
  - Routes: `backend/src/routes/*.js`
  - Services: `backend/src/services/*.js`
  - Database: `backend/prisma/schema.prisma`
  - Socket handlers: `backend/src/sockets/*.js`
- **Frontend (`/frontend`)**: React 19 + Vite + TypeScript + Tailwind CSS + Radix UI
  - Main App: `frontend/src/App.tsx`
  - Routes/Pages: `frontend/src/pages/*.tsx`
  - API Client: `frontend/src/api/adminClient.ts`

---

## 📦 Build, Lint & Test Commands

### Backend
```bash
cd backend

# Start development server (auto-restart on changes)
npm run dev

# Start production server
npm start

# Run all tests
npm test

# Run a single test file
npm test -- path/to/testfile.test.js

# Run tests matching a pattern
npm test -- --testNamePattern="customer"

# Generate Prisma client (REQUIRED after schema changes)
npx prisma generate

# Apply schema changes to database
npx prisma db push

# Create migration
npx prisma migrate dev --name migration_name

# Open Prisma Studio (GUI database browser)
npx prisma studio
```

### Frontend
```bash
cd frontend

# Start development server
npm run dev

# Build for production
npm run build

# Run linting
npm run lint

# Preview production build
npm run preview
```

---

## 🚨 Critical Rules for AI Agents

1. **Never edit `.log`, `.txt`, or database dump files** - they have been moved to `backend/tests/logs/` and `backend/tests/dumps/`
2. **Environment Variables**: Always assume `.env` exists locally. Never commit secrets
3. **Database Changes**: If you modify `schema.prisma`, you MUST run `npx prisma generate` in the `backend/` directory
4. **Testing**: Backend tests use Jest. Always clean DB state before tests
5. **Never use `console.log`** - use pino logger: `require('../utils/logger')`
6. **Socket Connections**: Branch apps connect via Socket.IO. Handle disconnect/reconnect gracefully

---

## 💻 Code Style Guidelines

### Backend (Node.js/Express)

**Imports & Organization**
```javascript
// 1. Node built-ins
const path = require('path');
const crypto = require('crypto');

// 2. Third-party packages
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

// 3. Local modules (use absolute paths when possible)
const prisma = require('../db');
const logger = require('../utils/logger');
const { asyncHandler } = require('../utils/asyncHandler');
const { ValidationError, NotFoundError } = require('../utils/errors');
```

**Naming Conventions**
- **Files**: `camelCase.js` (e.g., `customerService.js`, `authMiddleware.js`)
- **Functions**: `camelCase` (e.g., `getCustomers`, `createUser`)
- **Classes/PascalCase**: `CustomerService`, `AuthMiddleware`
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRY_COUNT`, `DEFAULT_PAGE_SIZE`)
- **Database fields**: `snake_case` (handled by Prisma)
- **Variables**: `camelCase` - avoid abbreviations except: `id`, `req`, `res`, `err`, `db`

**Error Handling**
- Always use `asyncHandler` wrapper for Express routes
- Use custom error classes: `ValidationError` (400), `NotFoundError` (404), `ForbiddenError` (403), `ConflictError` (409)
- Never expose raw error messages in production - use `process.env.NODE_ENV === 'production' ? 'Internal error' : err.message`

```javascript
// ✅ CORRECT
router.post('/customers', asyncHandler(async (req, res) => {
  const customer = await customerService.create(req.body, req.user);
  res.status(201).json(customer);
}));

// ❌ WRONG - no asyncHandler, no error handling
router.post('/customers', async (req, res) => {
  const customer = await customerService.create(req.body, req.user);
  res.json(customer);
});
```

**Prisma Queries**
- For `findUnique`, `update`, `delete`: use ONLY one unique field in `where` (no AND/OR)
- For `findMany`, `count`: can use complex filters with branchId
- Use transactions for multi-step operations: `db.$transaction(async (tx) => {...})`

### Frontend (React/TypeScript)

**Imports**
```typescript
// React core
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

// Third-party (ordered by importance)
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

// Radix UI (USE THESE - don't build custom primitives!)
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';

// Local
import { apiClient } from '@/api/adminClient';
import { useAuth } from '@/context/AuthContext';
import { CustomerTable } from '@/components/CustomerTable';
```

**Component Patterns**
- Use functional components with hooks
- Extract data fetching into custom hooks
- Prefer composition over inheritance

```typescript
// ✅ CORRECT - Custom hook + lean component
const useCustomers = (branchId: string) => {
  return useQuery({
    queryKey: ['customers', branchId],
    queryFn: () => apiClient.getCustomers(branchId)
  });
};

export const CustomersPage = () => {
  const { data: customers, isLoading } = useCustomers(branchId);
  return <CustomerTable data={customers} loading={isLoading} />;
};
```

**Naming**
- **Components**: `PascalCase` (e.g., `CustomerTable.tsx`, `LoginForm.tsx`)
- **Hooks**: `use*` prefix (e.g., `useCustomers`, `useAuth`)
- **Types/Interfaces**: `PascalCase` (e.g., `Customer`, `UserResponse`)
- **Files**: `kebab-case.tsx` (e.g., `customer-list.tsx`)

**Tailwind CSS**
- Use utility classes with `@apply` sparingly (prefer inline classes)
- Use `cva` (class-variance-authority) for component variants
- Use `clsx` and `tailwind-merge` for conditional classes

---

## 🧪 Testing Guidelines

**Backend Tests (Jest)**
```javascript
// Test file pattern: *.test.js
describe('CustomerService', () => {
  beforeEach(async () => {
    // Clean DB state before each test
    await prisma.customer.deleteMany();
  });

  it('should create a customer', async () => {
    const customer = await customerService.create({ name: 'Test' }, user);
    expect(customer.name).toBe('Test');
  });
});
```

**Run specific test**
```bash
cd backend
npm test -- --testPathPattern=customer.test.js
npm test -- --testNamePattern="should create"
```

---

## 🔌 Socket.IO Guidelines (Portal-Branch Communication)

- Branch apps connect via Socket.IO using API key authentication
- Always prioritize API key over JWT for branch socket connections
- Handle `disconnect` and `connect` events for branch status tracking
- Use `portal_directive` event for sending commands to branches (e.g., `REQUEST_FULL_SYNC`)

---

## 📋 Key Documentation

- `backend/prisma/schema.prisma` - Complete data model
- `backend/src/routes/` - API route handlers
- `backend/src/services/` - Business logic
- `backend/src/sockets/admin.socket.js` - Socket handlers
- `frontend/src/api/adminClient.ts` - API client singleton
- `documentation/ARCHITECTURE.md` - Design patterns

---

## ⚠️ Common Pitfalls

1. Forgot `npx prisma generate` after schema change
2. Business logic in routes instead of services
3. Using `console.log` instead of pino logger
4. Building custom UI primitives instead of using Radix
5. Missing `asyncHandler` wrapper
6. Adding branchId to `where` in unique operations (findUnique, update, delete)
7. JWT expiry causing branch socket disconnect (use API key auth instead)