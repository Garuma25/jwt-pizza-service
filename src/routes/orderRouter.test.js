const request = require('supertest');
const app = require('../service');
const utils = require('../routes/utils.js');

let testUserAuthToken;
let newMenuItem;

beforeAll(async () => {
  // Generate a random menu item and retrieve user auth token
  newMenuItem = {
    title: `Student Pizza #${utils.randomText(10)}`,
    description: 'No topping, no sauce, just carbs',
    image: 'pizza9.png',
    price: 0.0001,
  };

  testUserAuthToken = await utils.newUsersAuthToken();
});

// Basic Placeholder Test
test('Empty test', () => {
  expect(true).toBe(true);
});

// Test: Get Menu Items
test('Get menu', async () => {
  const res = await request(app).get('/api/order/menu');

  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

describe('Adding Menu Items', () => {
  // Test: Admin Can Add a Menu Item
  test('Admin adds a menu item', async () => {
    const res = await request(app)
      .put('/api/order/menu')
      .send(newMenuItem)
      .set('Authorization', `Bearer ${await utils.getAdminAuthToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const receivedArray = res.body;
    const itemWithoutId = (item) => ({
      description: item.description,
      image: item.image,
      price: item.price,
      title: item.title,
    });

    expect(receivedArray.map(itemWithoutId)).toContainEqual(itemWithoutId(newMenuItem));
  });

  //  Test: Non-Admin Cannot Add Menu Item
  test('Non-admin user cannot add menu item', async () => {
    const res = await request(app)
      .put('/api/order/menu')
      .send(newMenuItem)
      .set('Authorization', `Bearer ${testUserAuthToken}`);

    expect(res.status).toBe(403);
  });
});

describe('Orders', () => {
  // Test: Get Orders for User
  test('Get user orders', async () => {
    const res = await request(app)
      .get('/api/order')
      .set('Authorization', `Bearer ${testUserAuthToken}`);

    expect(res.status).toBe(200);
    expect(res.body.dinerId).toBeGreaterThan(0);
    expect(Array.isArray(res.body.orders)).toBe(true);
  });

  //  Test: Cannot Create Order Without Authentication
  test('Cannot create order without authentication', async () => {
    const res = await request(app)
      .post('/api/order')
      .send({ franchiseId: 1, storeId: 1, items: [{ menuId: 1, description: 'Veggie', price: 0.05 }] });

    expect(res.status).toBe(401);
  });

  //  Test: Cannot Create Order Without Items
  test('Cannot create order without items', async () => {
    const res = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${testUserAuthToken}`);

    expect(res.status).toBe(500);
  });
});
