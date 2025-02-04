const request = require('supertest');
const app = require('../service');
const utils = require('../routes/utils.js');

const testUser = { name: 'Pizza Diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;
let userToUpdate;

beforeAll(async () => {
  testUser.email = `${utils.randomText(10)}@tests.com`;
  
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
  
  utils.expectValidJwt(testUserAuthToken);
  userToUpdate = await utils.createAdminUser();
});

// Test Suite: Login and Logout
describe('Login and Logout', () => {
  test('Login with valid credentials', async () => {
    const loginRes = await request(app).put('/api/auth').send(testUser);
    
    expect(loginRes.status).toBe(200);
    utils.expectValidJwt(loginRes.body.token);

    const expectedUser = { ...testUser, roles: [{ role: 'diner' }] };
    delete expectedUser.password;

    expect(loginRes.body.user).toMatchObject(expectedUser);
  });

  test('Login fails with incorrect credentials', async () => {
    const wrongUser = { email: testUser.email, password: 'wrongpassword' };
    const loginRes = await request(app).put('/api/auth').send(wrongUser);
    
    expect(loginRes.status).toBe(404);
    expect(loginRes.body.message).toBe('unknown user');
  });

  test('Logout user successfully', async () => {
    const logoutRes = await request(app)
      .delete('/api/auth')
      .set('Authorization', `Bearer ${testUserAuthToken}`);
    
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.message).toBe('logout successful');

    // Attempt accessing a protected resource after logout
    const protectedRes = await request(app)
      .put('/api/auth/1')
      .set('Authorization', `Bearer ${testUserAuthToken}`);
    
    expect(protectedRes.status).toBe(401);
  });
});

//  Test: Register a New User
test('Register a new user', async () => {
  const newUser = {
    name: 'Pizza Diner Tester',
    email: `${utils.randomText()}@test.com`,
    password: 'a',
  };

  const registerRes = await request(app).post('/api/auth').send(newUser);

  expect(registerRes.status).toBe(200);
  utils.expectValidJwt(registerRes.body.token);

  const expectedUser = { ...newUser, roles: [{ role: 'diner' }] };
  delete expectedUser.password;

  expect(registerRes.body.user).toMatchObject(expectedUser);
});

//  Test: Admin Can Update Another User
test('Admin can update user details', async () => {
  let newUser = utils.createUser();

  const registerRes = await request(app).post('/api/auth').send(newUser);
  expect(registerRes.status).toBe(200);
  
  newUser = { ...newUser, id: registerRes.body.user.id };

  const adminToken = await utils.getAdminAuthToken();

  const updateUserRes = await request(app)
    .put(`/api/auth/${newUser.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ email: newUser.email, password: 'test' });

  expect(updateUserRes.status).toBe(200);
});

//  Test: Non-Admin Cannot Update Another User
test('Non-admin user cannot update another user', async () => {
  const updatedUser = { email: 'updated@test.com', password: 'newpassword' };

  const updateRes = await request(app)
    .put(`/api/auth/${userToUpdate.id}`)
    .set('Authorization', `Bearer ${testUserAuthToken}`)
    .send(updatedUser);

  expect(updateRes.status).toBe(401);
  expect(updateRes.body.message).toBe('unauthorized');
});
