const request = require('supertest');
const app = require('../service');
const { Role, DB } = require('../database/database.js');

let adminUserAuthToken = null;
let newUserAuthToken = null;

/**
 * Validates if a given string is a valid JWT.
 */
function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}

/**
 * Generates a random text string of a given length.
 */
function randomText(length = 10) {
  return Math.random().toString(36).substring(2, 2 + length);
}

/**
 * Creates a new user object with a random email.
 */
function createUser() {
  return {
    name: 'Pizza Diner',
    email: `${randomText(10)}@test.com`,
    password: 'a',
  };
}

/**
 * Retrieves a new user's authentication token.
 */
async function newUsersAuthToken() {
  const res = await request(app).post('/api/auth').send(createUser());
  newUserAuthToken = res.body.token;
  
  console.log("✅ New User Token Retrieved:", newUserAuthToken);
  return newUserAuthToken;
}

/**
 * Creates an admin user and retrieves its authentication token.
 */
async function getAdminAuthToken() {
  if (adminUserAuthToken) {
    return adminUserAuthToken;
  }

  const newAdminUser = await createAdminUser();
  const res = await request(app).put('/api/auth').send({
    email: newAdminUser.email,
    password: 'toomanysecrets',
  });

  adminUserAuthToken = res.body.token;
  
  console.log("✅ New Admin Token Retrieved:", adminUserAuthToken);
  return adminUserAuthToken;
}

/**
 * Creates a new admin user in the database.
 */
async function createAdminUser() {
  const user = {
    name: `admin${randomText(5)}`,
    email: `admin${randomText(5)}@admin.com`,
    password: 'toomanysecrets',
    roles: [{ role: Role.Admin }],
  };

  const createdUser = await DB.addUser(user);
  return { ...createdUser, password: 'toomanysecrets' };
}

module.exports = {
  expectValidJwt,
  createUser,
  randomText,
  getAdminAuthToken,
  newUsersAuthToken,
  createAdminUser,
};
