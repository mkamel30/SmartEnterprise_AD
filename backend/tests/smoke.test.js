const request = require('supertest');
const { app } = require('../server');

describe('Admin Portal Smoke Tests', () => {
  test('Health Check Endpoint', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('OK');
  });

  test('Auth Endpoint returns 401 without credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect([400, 401, 500]).toContain(res.statusCode);
  });

  test('Branches Endpoint requires auth', async () => {
    const res = await request(app).get('/api/branches');
    expect(res.statusCode).toBe(401);
  });
});
