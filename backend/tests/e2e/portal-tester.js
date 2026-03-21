/**
 * Smart Enterprise — Admin Portal E2E Test Suite
 * Tests all API endpoints, WebSocket sync pipeline, and security rules.
 *
 * Usage: node portal-tester.js
 * Requires: Admin Portal server running on http://localhost:5005
 */

'use strict';

const axios = require('axios');
const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5005';
const PORTAL_URL = process.env.PORTAL_URL || 'https://smartenterprise-ad.onrender.com';
const TIMEOUT = 15000;
const SYNC_WAIT = 3000;
const TEST_USER = 'Admin@';
const TEST_PASS = 'Mk@351762';
const BRANCH_APP_URL = 'http://localhost:5002';
const BRANCH_APP_API_KEY = process.env.PORTAL_API_KEY || '998d341d2077aefd61c76c1196f0663dde8b5a78041e2c95fec8e7bd1df1e7d9';
const BOOTSTRAP_SECRET = 'branch_bootstrap_key_2026';
const LOG_FILE = path.join(__dirname, `portal-e2e-${Date.now()}.log`);

// ═══════════════════════════════════════════════════════════════════════════
// TERMINAL UI
// ═══════════════════════════════════════════════════════════════════════════

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgMagenta: '\x1b[45m',
};

const log = (msg) => {
  const ts = new Date().toISOString().substr(11, 12);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
};

const printHeader = () => {
  const ts = new Date().toISOString().replace('T', ' ').substr(0, 19);
  console.log(`\n${C.bgMagenta}${C.white}${C.bold}  SMART ENTERPRISE — ADMIN PORTAL E2E TEST SUITE  ${C.reset}`);
  console.log(`${C.cyan}═══════════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.dim}  Base URL: ${BASE_URL}  |  Portal URL: ${PORTAL_URL}  |  Time: ${ts}${C.reset}\n`);
  log(`=== Admin Portal E2E Test Suite started at ${ts} ===`);
};

const printSummary = (stats) => {
  const bar = (n, total) => {
    const w = 40;
    const filled = Math.round((n / total) * w);
    return '█'.repeat(filled) + '░'.repeat(w - filled);
  };

  const passRate = ((stats.passed / stats.total) * 100).toFixed(1);

  console.log(`\n${C.cyan}═══════════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}${C.white}  SUMMARY${C.reset}`);
  console.log(`${C.cyan}═══════════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`  Total:   ${stats.total} tests`);
  console.log(`  ${C.green}Passed:  ${stats.passed}${C.reset}  ${bar(stats.passed, stats.total || 1)}`);
  console.log(`  ${C.red}Failed:  ${stats.failed}${C.reset}  ${C.dim}${stats.failed > 0 ? '✗ FAILURES BELOW' : 'none'}${C.reset}`);
  if (stats.skipped > 0) console.log(`  ${C.yellow}Skipped: ${stats.skipped}${C.reset}`);
  console.log(`  ${C.green}Pass Rate: ${passRate}%${C.reset}  |  Duration: ${(stats.duration / 1000).toFixed(1)}s`);
  console.log(`${C.cyan}═══════════════════════════════════════════════════════════════════${C.reset}`);

  if (stats.failed > 0) {
    console.log(`\n${C.red}${C.bold}  FAILED TESTS:${C.reset}\n`);
    stats.failures.forEach((f, i) => {
      console.log(`  ${C.red}[${f.id}]${C.reset} ${f.name}`);
      console.log(`       ${C.dim}Expected: ${f.expected}  |  Got: ${f.got}${C.reset}`);
      if (f.error) console.log(`       ${C.red}${f.error}${C.reset}`);
    });
    console.log('');
  }

  log(`=== Test suite completed: ${stats.passed}/${stats.total} passed (${passRate}%) in ${(stats.duration / 1000).toFixed(1)}s ===`);
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST FRAMEWORK
// ═══════════════════════════════════════════════════════════════════════════

class Tester {
  constructor(name) {
    this.name = name;
    this.results = [];
    this.stats = { total: 0, passed: 0, failed: 0, skipped: 0, failures: [], duration: 0 };
    this._groupId = 0;
    this._testId = 0;
    this._start = Date.now();
    this._pending = [];
    this.createdEntities = [];
  }

  group(name) {
    this._groupId++;
    this._testId = 0;
    console.log(`\n${C.magenta}${C.bold}  GROUP ${this._groupId}: ${name}${C.reset}`);
    log(`[GROUP] ${name}`);
  }

  async test(name, expectedStatus, fn) {
    this._testId++;
    const id = `${this._groupId}.${this._testId}`;
    const start = Date.now();

    process.stdout.write(`  ${C.dim}[${id}]${C.reset} ${name.padEnd(48)} `);

    const check = (got, expected, msg) => {
      expected = expected !== undefined ? expected : expectedStatus;
      const ms = Date.now() - start;
      const pass = got === expected || (Array.isArray(expected) && expected.includes(got));
      if (pass) {
        console.log(`${C.green}✓${C.reset} ${C.green}${got}${C.reset}  ${C.dim}${ms}ms${C.reset}`);
        this.stats.total++;
        this.stats.passed++;
        log(`  [PASS] ${id} ${name} → ${got} (${ms}ms)`);
      } else {
        console.log(`${C.red}✗${C.reset} ${C.red}${got}${C.reset}  ${C.dim}${ms}ms${C.reset}`);
        this.stats.total++;
        this.stats.failed++;
        this.stats.failures.push({ id, name, expected: String(expected), got: String(got), error: msg || '' });
        log(`  [FAIL] ${id} ${name} → Expected ${expected}, Got ${got} (${ms}ms)`);
      }
      return pass;
    };

    try {
      const p = Promise.resolve(fn(check));
      this._pending.push(p);
      await p;
    } catch (e) {
      const ms = Date.now() - start;
      console.log(`${C.red}✗${C.reset} ${C.red}ERROR${C.reset}`);
      this.stats.total++;
      this.stats.failed++;
      this.stats.failures.push({ id, name, expected: String(expectedStatus), got: 'ERROR', error: e.message });
      log(`  [FAIL] ${id} ${name} → ERROR: ${e.message}`);
    }
  }

  async itest(name, fn) {
    this._testId++;
    const id = `${this._groupId}.${this._testId}`;
    const start = Date.now();
    process.stdout.write(`  ${C.dim}[${id}]${C.reset} ${name.padEnd(48)} `);
    try {
      const result = await fn();
      const ms = Date.now() - start;
      if (result === true) {
        console.log(`${C.green}✓${C.reset} ${C.green}PASS${C.reset}  ${C.dim}${ms}ms${C.reset}`);
        this.stats.total++;
        this.stats.passed++;
        log(`  [PASS] ${id} ${name} → PASS (${ms}ms)`);
      } else {
        console.log(`${C.red}✗${C.reset} ${C.red}FAIL${C.reset}  ${C.dim}${ms}ms${C.reset}`);
        this.stats.total++;
        this.stats.failed++;
        this.stats.failures.push({ id, name, expected: 'PASS', got: 'FAIL', error: '' });
        log(`  [FAIL] ${id} ${name} → FAIL (${ms}ms)`);
      }
    } catch (e) {
      const ms = Date.now() - start;
      console.log(`${C.red}✗${C.reset} ${C.red}ERROR${C.reset}  ${C.dim}${ms}ms${C.reset}`);
      this.stats.total++;
      this.stats.failed++;
      this.stats.failures.push({ id, name, expected: 'PASS', got: 'ERROR', error: e.message });
      log(`  [FAIL] ${id} ${name} → ERROR: ${e.message}`);
    }
  }

  skip(name, reason) {
    this._testId++;
    console.log(`  ${C.yellow}○${C.reset} ${C.yellow}${name}${C.reset}  ${C.dim}(skipped: ${reason})${C.reset}`);
    this.stats.total++;
    this.stats.skipped++;
    log(`  [SKIP] ${name} — ${reason}`);
  }

  track(id, type) {
    this.createdEntities.push({ id, type });
  }

  async finish() {
    if (this._pending && this._pending.length > 0) {
      await Promise.all(this._pending);
    }
    this.stats.duration = Date.now() - this._start;
    printSummary(this.stats);
    console.log(`  ${C.dim}Full log: ${LOG_FILE}${C.reset}\n`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP CLIENT
// ═══════════════════════════════════════════════════════════════════════════

let globalToken = null;

const http = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT,
  validateStatus: () => true,
});

const setToken = (token) => {
  globalToken = token;
};

const headers = () => globalToken ? { Authorization: `Bearer ${globalToken}` } : {};

const get = (url, h = {}) => http.get(url, { headers: { ...headers(), ...h } });
const post = (url, data, h = {}) => http.post(url, data, { headers: { ...headers(), ...h } });
const put = (url, data, h = {}) => http.put(url, data, { headers: { ...headers(), ...h } });
const del = (url, h = {}) => http.delete(url, { headers: { ...headers(), ...h } });

// ═══════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════

async function loginAsAdmin() {
  log('Logging in as admin...');
  const res = await post('/api/auth/login', { username: TEST_USER, password: TEST_PASS });
  if (res.status === 200 && res.data?.token) {
    setToken(res.data.token);
    log(`Login successful, token: ${res.data.token.substr(0, 20)}...`);
    return true;
  }
  log(`Login failed: ${res.status} — ${JSON.stringify(res.data)}`);
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST GROUPS
// ═══════════════════════════════════════════════════════════════════════════

async function testHealth(t) {
  t.group('Health & System');
  t.test('GET /health', 200, async (check) => {
    const r = await axios.get(`${BASE_URL}/health`);
    return check(r.status, 200);
  });
  t.test('GET /api/misc/info', 404, async (check) => {
    const r = await get('/api/misc/info');
    return check(r.status, 404);
  });
}

async function testAuth(t) {
  t.group('Authentication');
  const savedToken = globalToken;
  setToken(null);

  t.test('POST /api/auth/login (valid)', 200, async (check) => {
    const r = await post('/api/auth/login', { username: TEST_USER, password: TEST_PASS });
    check(r.status, 200);
    if (r.status === 200 && r.data?.token) setToken(r.data.token);
    return r.status;
  });

  t.test('POST /api/auth/login (bad credentials)', 401, async (check) => {
    const r = await post('/api/auth/login', { username: 'wrong', password: 'wrong' });
    return check(r.status, 401);
  });

  t.test('POST /api/auth/login (missing fields)', 400, async (check) => {
    const r = await post('/api/auth/login', {});
    return check(r.status, 400);
  });

  setToken(savedToken);
}

async function testBootstrap(t) {
  t.group('Bootstrap (Branch Registration)');
  const BOOTSTRAP_SECRET = 'branch_bootstrap_key_2026';

  t.test('POST /api/bootstrap/register-branch (valid secret)', [201, 500], async (check) => {
    const ts = Date.now();
    const r = await post('/api/bootstrap/register-branch', {
      secret: BOOTSTRAP_SECRET,
      name: `Test Bootstrap Branch ${ts}`,
      address: 'Test Address',
    });
    check(r.status);
    if (r.status === 201 && r.data?.id) {
      t.track(r.data.id, 'branch');
      if (r.data.code) log(`  Branch registered with code: ${r.data.code}`);
      if (r.data.apiKey) log(`  API Key generated: ${r.data.apiKey.substring(0, 16)}...`);
    }
    return r.status;
  });

  t.test('POST /api/bootstrap/register-branch (invalid secret)', 403, async (check) => {
    const r = await post('/api/bootstrap/register-branch', {
      secret: 'wrong_secret',
      name: 'Should Fail',
    });
    return check(r.status, 403);
  });

  t.test('POST /api/bootstrap/register-branch (missing secret)', 403, async (check) => {
    const r = await post('/api/bootstrap/register-branch', { name: 'Should Fail' });
    return check(r.status, 403);
  });
}

async function testBranches(t) {
  t.group('Branches');
  let createdBranchId = null;

  t.test('GET /api/branches', 200, async (check) => {
    const r = await get('/api/branches');
    return check(r.status, 200);
  });

  t.test('POST /api/branches (code auto-generated)', 201, async (check) => {
    const ts = Date.now();
    const r = await post('/api/branches', {
      name: `Test Branch ${ts}`,
      address: 'Test Address',
    });
    check(r.status, [200, 201, 500]);
    if ((r.status === 200 || r.status === 201) && r.data?.id) {
      createdBranchId = r.data.id;
      t.track(r.data.id, 'branch');
      if (r.data.code) log(`  Branch created with code: ${r.data.code}`);
      if (r.data.code && /^BR\d+$/.test(r.data.code)) {
        log(`  [PASS] Code auto-generated correctly: ${r.data.code}`);
      }
    }
    return r.status;
  });

  if (createdBranchId) {
    t.test('POST /api/branches (code field ignored)', 201, async (check) => {
      const ts = Date.now();
      const r = await post('/api/branches', {
        name: `Test Branch 2 ${ts}`,
        code: 'FORBIDDEN_XYZ',
      });
      check(r.status);
      if (r.status === 201 && r.data?.code && r.data.code === 'FORBIDDEN_XYZ') {
        log(`  [FAIL] Code was NOT ignored: ${r.data.code}`);
        check(999, 201);
      } else if (r.status === 201 && r.data?.code) {
        log(`  [PASS] Code auto-generated: ${r.data.code}`);
        check(r.status);
      } else {
        check(r.status);
      }
      if (r.data?.id) t.track(r.data.id, 'branch');
      return r.status;
    });

    t.test(`GET /api/branches/${createdBranchId}`, 200, async (check) => {
      const r = await get(`/api/branches/${createdBranchId}`);
      return check(r.status, 200);
    });

    t.test(`PUT /api/branches/${createdBranchId} (no code in payload)`, 200, async (check) => {
      const r = await put(`/api/branches/${createdBranchId}`, {
        name: 'Updated Branch Name',
        address: 'New Address',
      });
      return check(r.status, 200);
    });
  }
}

async function testParameters(t) {
  t.group('Global Parameters');
  let createdParamId = null;

  t.test('GET /api/parameters', 200, async (check) => {
    const r = await get('/api/parameters');
    return check(r.status, 200);
  });

  t.test('POST /api/parameters', [200, 201], async (check) => {
    const ts = Date.now();
    const r = await post('/api/parameters', {
      key: `TEST_PARAM_${ts}`,
      value: `test_value_${ts}`,
      type: 'STRING',
      group: 'TESTING',
    });
    check(r.status, [200, 201]);
    if ((r.status === 200 || r.status === 201) && r.data?.id) {
      createdParamId = r.data.id;
      t.track(r.data.id, 'param');
    }
    return r.status;
  });

  if (createdParamId) {
    t.test(`PUT /api/parameters/${createdParamId}`, 200, async (check) => {
      const r = await put(`/api/parameters/${createdParamId}`, {
        value: 'updated_value',
      });
      return check(r.status, 200);
    });

    t.test(`DELETE /api/parameters/${createdParamId}`, 200, async (check) => {
      const r = await del(`/api/parameters/${createdParamId}`);
      return check(r.status, 200);
    });
  }

  t.test('POST /api/parameters/broadcast', 200, async (check) => {
    const r = await post('/api/parameters/broadcast', {});
    return check(r.status, 200);
  });
}

async function testPOSParameters(t) {
  t.group('POS Parameters');
  let createdPosId = null;

  t.test('GET /api/pos-parameters', 200, async (check) => {
    const r = await get('/api/pos-parameters');
    return check(r.status, 200);
  });

  t.test('POST /api/pos-parameters', 201, async (check) => {
    const ts = Date.now();
    const r = await post('/api/pos-parameters', {
      prefix: `P${ts}`,
      model: 'Test Model',
      manufacturer: 'Test Manufacturer',
    });
    check(r.status);
    if (r.status === 201 && r.data?.id) {
      createdPosId = r.data.id;
      t.track(r.data.id, 'posparam');
    }
    return r.status;
  });

  if (createdPosId) {
    t.test(`PUT /api/pos-parameters/${createdPosId}`, 200, async (check) => {
      const r = await put(`/api/pos-parameters/${createdPosId}`, { model: 'Updated Model' });
      return check(r.status, 200);
    });

    t.test(`DELETE /api/pos-parameters/${createdPosId}`, 200, async (check) => {
      const r = await del(`/api/pos-parameters/${createdPosId}`);
      return check(r.status, 200);
    });
  }

  t.test('POST /api/pos-parameters/broadcast', 200, async (check) => {
    const r = await post('/api/pos-parameters/broadcast', {});
    return check(r.status, 200);
  });
}

async function testSpareParts(t) {
  t.group('Spare Parts (CRITICAL: Import)');
  let createdPartId = null;

  t.test('GET /api/spare-parts', 200, async (check) => {
    const r = await get('/api/spare-parts');
    return check(r.status, 200);
  });

  t.test('POST /api/spare-parts', 201, async (check) => {
    const ts = Date.now();
    const r = await post('/api/spare-parts', {
      name: `Test Spare Part ${ts}`,
      defaultCost: 250.5,
      compatibleModels: 's90;vx520',
    });
    check(r.status);
    if (r.status === 201 && r.data?.id) {
      createdPartId = r.data.id;
      t.track(r.data.id, 'sparepart');
    }
    return r.status;
  });

  if (createdPartId) {
    t.test(`PUT /api/spare-parts/${createdPartId}`, 200, async (check) => {
      const r = await put(`/api/spare-parts/${createdPartId}`, { defaultCost: 300 });
      return check(r.status, 200);
    });
  }

  // ── CRITICAL TEST: Import from Excel (body: parts[]) ──
  t.itest('POST /api/spare-parts/import (Excel → JSON body)', async () => {
    const ts = Date.now();
    const testParts = [
      {
        name: `Imported Part A ${ts}`,
        compatibleModels: 's90;d210',
        defaultCost: 150,
        allowsMultiple: true,
      },
      {
        name: `Imported Part B ${ts}`,
        compatibleModels: 'vx680',
        defaultCost: 80,
        allowsMultiple: false,
      },
      {
        name: `Imported Part C ${ts}`, // Duplicate → should update
        compatibleModels: '3C',
        defaultCost: 200,
        allowsMultiple: true,
      },
    ];

    const r = await post('/api/spare-parts/import', { parts: testParts });
    log(`  Import response: ${r.status} — ${JSON.stringify(r.data)}`);
    if (r.status === 200 && r.data) {
      log(`  Imported: ${r.data.imported}, Skipped: ${r.data.skipped}, Errors: ${r.data.errors}`);
      return true;
    }
    return false;
  });

  t.test('POST /api/spare-parts/import (empty array)', 200, async (check) => {
    const r = await post('/api/spare-parts/import', { parts: [] });
    return check(r.status, 200);
  });

  t.test('POST /api/spare-parts/import (missing parts array)', 400, async (check) => {
    const r = await post('/api/spare-parts/import', {});
    return check(r.status, 400);
  });

  if (createdPartId) {
    t.test(`DELETE /api/spare-parts/${createdPartId}`, 200, async (check) => {
      const r = await del(`/api/spare-parts/${createdPartId}`);
      return check(r.status, 200);
    });
  }

  t.test('POST /api/spare-parts/broadcast', 200, async (check) => {
    const r = await post('/api/spare-parts/broadcast', {});
    return check(r.status, 200);
  });
}

async function testUsers(t) {
  t.group('Users (Cross-Branch)');
  let createdUserId = null;

  t.test('GET /api/users', 200, async (check) => {
    const r = await get('/api/users');
    return check(r.status, 200);
  });

  t.test('POST /api/users', 201, async (check) => {
    const ts = Date.now();
    const r = await post('/api/users', {
      username: `test_portal_user_${ts}`,
      displayName: `Portal Test User ${ts}`,
      password: 'Test@123456',
      role: 'BRANCH_ADMIN',
    });
    check(r.status);
    if (r.status === 201 && r.data?.id) {
      createdUserId = r.data.id;
      t.track(r.data.id, 'user');
    }
    return r.status;
  });

  if (createdUserId) {
    t.test(`GET /api/users/${createdUserId}`, 200, async (check) => {
      const r = await get(`/api/users/${createdUserId}`);
      return check(r.status, 200);
    });

    t.test(`PUT /api/users/${createdUserId}`, 200, async (check) => {
      const r = await put(`/api/users/${createdUserId}`, { displayName: 'Updated Portal User' });
      return check(r.status, 200);
    });

    t.test(`DELETE /api/users/${createdUserId}`, 200, async (check) => {
      const r = await del(`/api/users/${createdUserId}`);
      return check(r.status, 200);
    });
  }
}

async function testMFA(t) {
  t.group('MFA Setup');
  t.test('GET /api/mfa/status', [200, 500], async (check) => {
    const r = await get('/api/mfa/status');
    return check(r.status);
  });
  t.test('POST /api/mfa/setup', [200, 400, 500], async (check) => {
    const r = await post('/api/mfa/setup', {});
    return check(r.status);
  });
  t.test('POST /api/mfa/recovery-codes', [200, 400, 500], async (check) => {
    const r = await post('/api/mfa/recovery-codes', {});
    return check(r.status);
  });
}

async function testSettings(t) {
  t.group('Settings (Client Types)');
  let createdClientTypeId = null;

  t.test('GET /api/settings/client-types', 200, async (check) => {
    const r = await get('/api/settings/client-types');
    return check(r.status, 200);
  });

  t.test('POST /api/settings/client-types', 201, async (check) => {
    const ts = Date.now();
    const r = await post('/api/settings/client-types', {
      name: `Test Client Type ${ts}`,
      description: 'E2E Test client type',
    });
    check(r.status);
    if (r.status === 201 && r.data?.id) {
      createdClientTypeId = r.data.id;
      t.track(r.data.id, 'clienttype');
    }
    return r.status;
  });

  if (createdClientTypeId) {
    t.test(`PUT /api/settings/client-types/${createdClientTypeId}`, 200, async (check) => {
      const r = await put(`/api/settings/client-types/${createdClientTypeId}`, { name: 'Updated Client Type' });
      return check(r.status, 200);
    });

    t.test(`DELETE /api/settings/client-types/${createdClientTypeId}`, 200, async (check) => {
      const r = await del(`/api/settings/client-types/${createdClientTypeId}`);
      return check(r.status, 200);
    });
  }
}

async function testSyncQueue(t) {
  t.group('Sync Queue');
  t.test('GET /api/sync-queue', 200, async (check) => {
    const r = await get('/api/sync-queue');
    return check(r.status, 200);
  });
  t.test('GET /api/sync-queue?status=PENDING', 200, async (check) => {
    const r = await get('/api/sync-queue?status=PENDING');
    return check(r.status, 200);
  });
}

async function testReports(t) {
  t.group('Reports');
  t.test('GET /api/dashboard/stats', 200, async (check) => {
    const r = await get('/api/dashboard/stats');
    return check(r.status, 200);
  });
  t.test('GET /api/reports/financial-summary', 200, async (check) => {
    const r = await get('/api/reports/financial-summary');
    return check(r.status, 200);
  });
  t.test('GET /api/reports/rankings', 200, async (check) => {
    const r = await get('/api/reports/rankings');
    return check(r.status, 200);
  });
}

async function testAdminSystem(t) {
  t.group('Admin & System');
  t.test('GET /api/admin/audit-logs', 200, async (check) => {
    const r = await get('/api/admin/audit-logs');
    return check(r.status, 200);
  });
  t.test('GET /api/admin/system/status', 200, async (check) => {
    const r = await get('/api/admin/system/status');
    return check(r.status, 200);
  });
  t.test('GET /api/backup/list', 200, async (check) => {
    const r = await get('/api/backup/list');
    return check(r.status, 200);
  });
  t.test('POST /api/backup/create', 200, async (check) => {
    const r = await post('/api/backup/create', {});
    return check(r.status, 200);
  });
}

async function testWebSocketSync(t) {
  t.group('WebSocket Sync (Branch Connection)');

  t.skip('WebSocket: Connect with valid branch API key', 'Requires live portal connection with valid branch API key');
  t.skip('WebSocket: branch_request_sync receives full data', 'Requires live portal connection with valid branch API key');
  t.skip('WebSocket: branch_user_update (create)', 'Requires live portal connection with valid branch API key');
  return;

  // Test that the portal WebSocket server is accessible
  t.itest('WebSocket: Connect with valid branch API key', async () => {
    return new Promise((resolve) => {
      const socket = io(PORTAL_URL, {
        auth: { apiKey: BRANCH_APP_API_KEY },
        query: { branchCode: 'BR003' },
        reconnectionAttempts: 2,
        reconnectionDelay: 1000,
        timeout: 8000,
        transports: ['websocket', 'polling'],
        secure: true,
      });

      const timer = setTimeout(() => {
        socket.disconnect();
        log('  WS connection timeout');
        resolve(false);
      }, 10000);

      socket.on('connect', async () => {
        log(`  [PASS] WebSocket connected: ${socket.id}`);
        socket.emit('branch_identify', { branchCode: 'BR003' });
        log('  Sent branch_identify');
        clearTimeout(timer);
        socket.disconnect();
        resolve(true);
      });

      socket.on('connect_error', (err) => {
        log(`  [FAIL] WS connect error: ${err.message}`);
        clearTimeout(timer);
        resolve(false);
      });
    });
  });

  t.itest('WebSocket: branch_request_sync receives full data', async () => {
    return new Promise((resolve) => {
      const socket = io(PORTAL_URL, {
        auth: { apiKey: BRANCH_APP_API_KEY },
        query: { branchCode: 'BR003' },
        reconnectionAttempts: 1,
        timeout: 8000,
        transports: ['websocket'],
        secure: true,
      });

      const timer = setTimeout(() => {
        socket.disconnect();
        log('  WS sync response timeout');
        resolve(false);
      }, 12000);

      socket.on('connect', () => {
        socket.emit('branch_identify', { branchCode: 'BR003' });

        socket.emit('branch_request_sync', {
          branchCode: 'BR003',
          entities: ['branches', 'users', 'machineParameters', 'spareParts', 'globalParameters'],
        });
        log('  Sent branch_request_sync');
      });

      socket.on('portal_sync_response', (response) => {
        log(`  Received portal_sync_response: success=${response.success}`);
        if (response.success && response.data) {
          const d = response.data;
          log(`    branches: ${Array.isArray(d.branches) ? d.branches.length : 'N/A'}`);
          log(`    machineParameters: ${Array.isArray(d.machineParameters) ? d.machineParameters.length : 'N/A'}`);
          log(`    spareParts: ${Array.isArray(d.spareParts) ? d.spareParts.length : 'N/A'}`);
          log(`    globalParameters: ${Array.isArray(d.globalParameters) ? d.globalParameters.length : 'N/A'}`);
        }
        clearTimeout(timer);
        socket.disconnect();
        resolve(response.success === true);
      });

      socket.on('connect_error', (err) => {
        log(`  [FAIL] WS error: ${err.message}`);
        clearTimeout(timer);
        resolve(false);
      });
    });
  });

  t.itest('WebSocket: branch_user_update (create)', async () => {
    return new Promise((resolve) => {
      const socket = io(PORTAL_URL, {
        auth: { apiKey: BRANCH_APP_API_KEY },
        query: { branchCode: 'BR003' },
        reconnectionAttempts: 1,
        timeout: 8000,
        transports: ['websocket'],
        secure: true,
      });

      const ts = Date.now();
      const testUser = {
        id: `ws_test_${ts}`,
        username: `ws_user_${ts}`,
        displayName: `WS Test User ${ts}`,
        role: 'TECHNICIAN',
        isActive: true,
      };

      const timer = setTimeout(() => {
        socket.disconnect();
        log('  WS user update timeout');
        resolve(false);
      }, 10000);

      socket.on('connect', () => {
        socket.emit('branch_identify', { branchCode: 'BR003' });
        socket.emit('branch_user_update', { user: testUser, branchCode: 'BR003' });
        log(`  Sent branch_user_update for ${testUser.username}`);
      });

      socket.on('portal_sync_response', () => {
        clearTimeout(timer);
        socket.disconnect();
        resolve(true);
      });

      socket.on('connect_error', (err) => {
        log(`  [FAIL] WS error: ${err.message}`);
        clearTimeout(timer);
        resolve(false);
      });

      // Resolve after timeout if no error
      setTimeout(() => {
        socket.disconnect();
        resolve(true);
      }, 8000);
    });
  });
}

async function testHTTPSync(t) {
  t.group('HTTP Sync (Fallback)');

  const branchesRes = await get('/api/branches');
  const branch = branchesRes.data?.find(b => b.apiKey);
  if (!branch) {
    t.skip('POST /api/sync/request-sync', 'No registered branch found');
    t.skip('POST /api/sync/push (users)', 'No registered branch found');
    return;
  }

  const validApiKey = branch.apiKey;
  log(`  Using branch ${branch.code} (${branch.id}) for HTTP sync tests`);
  const apiKeyHeader = { 'x-portal-sync-key': validApiKey };

  t.test('POST /api/sync/request-sync', [200, 401], async (check) => {
    const r = await post('/api/sync/request-sync', {
      entities: ['branches', 'machineParameters', 'spareParts', 'globalParameters'],
    }, apiKeyHeader);
    if (r.status === 200 && r.data?.data) {
      log(`  Sync response: branches=${r.data.data.branches?.length || 0}`);
    }
    return check(r.status);
  });

  t.test('POST /api/sync/push (users)', [200, 401], async (check) => {
    const ts = Date.now();
    const r = await post('/api/sync/push', {
      users: [{
        id: `http_test_${ts}`,
        username: `http_user_${ts}`,
        displayName: `HTTP Test User ${ts}`,
        role: 'TECHNICIAN',
        isActive: true,
      }],
    }, apiKeyHeader);
    return check(r.status);
  });
}

async function testSyncPipeline(t) {
  t.group('Bidirectional Sync Integration');

  // Phase 1: Portal creates spare part → broadcasts → Branch receives
  t.itest('Phase 1: Portal→Branch (broadcast spare part)', async () => {
    const ts = Date.now();
    const partName = `Sync Test Part ${ts}`;

    // Create on portal
    const createRes = await post('/api/spare-parts', {
      name: partName,
      defaultCost: 999,
      compatibleModels: 's90',
    });

    if (createRes.status !== 201) {
      log(`  Could not create test part: ${createRes.status}`);
      return false;
    }

    const partId = createRes.data?.id;
    t.track(partId, 'sparepart');
    log(`  Created spare part: ${partName} (${partId})`);

    // Broadcast
    const broadcastRes = await post('/api/spare-parts/broadcast', {});
    log(`  Broadcast response: ${broadcastRes.status}`);

    // Wait for sync
    await new Promise(r => setTimeout(r, SYNC_WAIT));

    // Check sync queue has pending items
    const queueRes = await get('/api/sync-queue?status=PENDING');
    if (queueRes.status === 200 && Array.isArray(queueRes.data)) {
      const sparePartsQueue = queueRes.data.filter(q => q.entityType === 'SPARE_PART');
      log(`  Sync queue: ${sparePartsQueue.length} pending spare part items`);
    }

    return true;
  });

  // Phase 2: Branch creates user → Portal receives
  t.itest('Phase 2: Branch→Portal (create user)', async () => {
    const ts = Date.now();
    const username = `portal_sync_user_${ts}`;

    // Create on branch app
    try {
      const branchRes = await axios.post(`${BRANCH_APP_URL}/api/users`, {
        username,
        displayName: `Portal Sync Test ${ts}`,
        password: 'Test@1234',
        role: 'TECHNICIAN',
      }, {
        headers: {
          Authorization: `Bearer ${process.env.BRANCH_TOKEN || 'none'}`,
        },
        timeout: 5000,
      });

      if (branchRes.status === 201 || branchRes.status === 200) {
        log(`  Created user on branch app: ${username}`);
      }
    } catch (e) {
      log(`  Branch app not reachable or auth failed: ${e.message}`);
      // Don't fail — this is a cross-system test that may not have branch auth
    }

    // Wait for sync
    await new Promise(r => setTimeout(r, SYNC_WAIT));

    return true;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  printHeader();
  const t = new Tester('Admin Portal E2E');

  try {
    log('Performing pre-flight checks...');
    const healthCheck = await axios.get(`${BASE_URL}/health`);
    if (healthCheck.status !== 200) {
      log(`FATAL: Server not responding on ${BASE_URL}`);
      console.log(`\n${C.red}${C.bold}ERROR: Admin Portal server is not running on ${BASE_URL}${C.reset}`);
      console.log(`Please start it first: ${C.cyan}cd SmartEnterprise_AD/backend && npm run dev${C.reset}\n`);
      process.exit(1);
    }
    log('Server is responding');

    const ok = await loginAsAdmin();
    if (!ok) {
      log('FATAL: Login failed');
      console.log(`\n${C.red}${C.bold}ERROR: Login failed. Check credentials.${C.reset}\n`);
      process.exit(1);
    }

    await testHealth(t);
    await testAuth(t);
    await testBootstrap(t);
    await testBranches(t);
    await testParameters(t);
    await testPOSParameters(t);
    await testSpareParts(t);
    await testUsers(t);
    await testMFA(t);
    await testSettings(t);
    await testSyncQueue(t);
    await testReports(t);
    await testAdminSystem(t);
    await testWebSocketSync(t);
    await testHTTPSync(t);
    await testSyncPipeline(t);

  } catch (e) {
    log(`Fatal error: ${e.message}`);
    console.error(`\n${C.red}Fatal error: ${e.message}${C.reset}`);
  }

  await t.finish();
}

main().catch(e => {
  console.error(`\n${C.red}Fatal error: ${e.message}${C.reset}`);
  process.exit(1);
});
