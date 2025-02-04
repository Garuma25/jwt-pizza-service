const request = require('supertest');
const app = require('../service'); 
const { Role } = require('../database/database.js'); 
const utils = require('../routes/utils.js');

let franchiseeUser;
let franchiseeUserAuthToken;
let franchiseId;
let storeId;
let newFranchise;
let adminUserAuthToken = null;

beforeAll(async () => {
  // Define franchisee user and new franchise details
  franchiseeUser = {
    name: 'Franchisee User',
    email: 'franchisee@test.com',
    password: 'franchisee',
    roles: [{ role: Role.Franchisee }],
  };

  newFranchise = {
    name: `Pizza Palace #${utils.randomText(5)}`,
    admins: [{ email: franchiseeUser.email }],
  };

  // Retrieve admin authentication token
  adminUserAuthToken = await utils.getAdminAuthToken();
  utils.expectValidJwt(adminUserAuthToken);

  // Register the franchisee user
  const registerRes = await request(app).post('/api/auth').send(franchiseeUser);
  expect(registerRes.status).toBe(200);
  expect(registerRes.body.user.email).toBe(franchiseeUser.email);

  // Login as franchisee and retrieve authentication token
  const franchiseeLoginRes = await request(app)
    .put('/api/auth')
    .send({ email: franchiseeUser.email, password: franchiseeUser.password });

  franchiseeUserAuthToken = franchiseeLoginRes.body.token;
});

describe('Franchises', () => {
  test('Get all franchises', async () => {
    const res = await request(app).get('/api/franchise');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('Get franchises for a specific user', async () => {
    const res = await request(app)
      .get(`/api/franchise/${franchiseeUser.id}`)
      .set('Authorization', `Bearer ${franchiseeUserAuthToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  async function createFranchise(franchise) {
    return await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${adminUserAuthToken}`)
      .send(franchise);
  }

  test('Admin creates a new franchise', async () => {
    const res = await createFranchise(newFranchise);

    console.log(res.body);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(newFranchise.name);

    franchiseId = res.body.id;
  });

  test('Non-admin cannot create a franchise', async () => {
    const unauthorizedFranchise = {
      name: 'Pizza Palace',
      admins: [{ email: franchiseeUser.email }],
    };

    const res = await request(app)
      .post('/api/franchise')
      .set('Authorization', `Bearer ${franchiseeUserAuthToken}`)
      .send(unauthorizedFranchise);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('unable to create a franchise');
  });

  test('Admin deletes a franchise', async () => {
    const res = await request(app)
      .delete(`/api/franchise/${franchiseId}`)
      .set('Authorization', `Bearer ${adminUserAuthToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('franchise deleted');
  });

  test('Non-admin cannot delete a franchise', async () => {
    const res = await request(app)
      .delete(`/api/franchise/${franchiseId}`)
      .set('Authorization', `Bearer ${franchiseeUserAuthToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('unable to delete a franchise');
  });
});

describe('Stores', () => {
  test('Unauthorized user cannot create a store', async () => {
    const newStore = { name: 'Downtown Store' };

    const res = await request(app)
      .post(`/api/franchise/${franchiseId}/store`)
      .set('Authorization', `Bearer ${franchiseeUserAuthToken}`)
      .send(newStore);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('unable to create a store');
  });

  test('Admin deletes a store', async () => {
    const res = await request(app)
      .delete(`/api/franchise/${franchiseId}/store/${storeId}`)
      .set('Authorization', `Bearer ${adminUserAuthToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('store deleted');
  });

  test('Unauthorized user cannot delete a store', async () => {
    const res = await request(app)
      .delete(`/api/franchise/${franchiseId}/store/${storeId}`)
      .set('Authorization', `Bearer ${franchiseeUserAuthToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('unable to delete a store');
  });
});
