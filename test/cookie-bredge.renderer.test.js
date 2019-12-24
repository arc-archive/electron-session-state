const { assert } = require('chai');
const { CookieBridge } = require('../renderer');

describe('Cookie bridge - renderer process', function() {
  describe('Events based tests', () => {
    function fire(type, detail) {
      const e = new CustomEvent(type, {
        detail,
        bubbles: true,
        cancelable: true
      });
      document.body.dispatchEvent(e);
      return e;
    }

    async function createTestCookies() {
      const e1 = fire('session-cookie-update', {
        cookie: {
          name: 'test-name',
          value: 'test-value',
          url: 'http://api.domain.com'
        }
      });
      const e2 = fire('session-cookie-update', {
        cookie: {
          name: 'test2',
          value: 'test2',
          url: 'http://other.com'
        }
      });
      await e1.detail.result;
      await e2.detail.result;
    }

    async function removeTestCookies() {
      const e = fire('session-cookie-remove', {
        cookies: [{
          name: 'test-name',
          url: 'http://api.domain.com'
        }, {
          name: 'test2',
          url: 'http://other.com'
        }]
      });
      return await e.detail.result;
    }

    async function removeAllCookies() {
      const e1 = fire('session-cookie-list-all', {});
      const cookies = await e1.detail.result;
      const e2 = fire('session-cookie-remove', {
        cookies
      });
      await e2.detail.result;
    }

    let instance;
    before(() => {
      instance = new CookieBridge();
      instance.listen();
    });

    after(() => {
      instance.unlisten();
    });

    describe('session-cookie-list-all', function() {
      before(() => createTestCookies());
      after(() => removeTestCookies());

      it('session-cookie-list-all returns cookies', async () => {
        const e = fire('session-cookie-list-all', {});
        const result = await e.detail.result;
        assert.typeOf(result, 'array', 'returns an array');
        assert.lengthOf(result, 2, 'has all created cookies');
      });
    });

    describe('session-cookie-list-domain', function() {
      before(() => createTestCookies());
      after(() => removeTestCookies());

      it('session-cookie-list-domain returns domain dookies', async function() {
        const e = fire('session-cookie-list-domain', {
          domain: 'other.com'
        });
        const result = await e.detail.result;
        assert.typeOf(result, 'array', 'returns an array');
        assert.lengthOf(result, 1, 'has single cookie');
        assert.equal(result[0].domain, 'other.com', 'has a domain cookie');
      });
    });

    describe('session-cookie-update', function() {
      afterEach(() => removeAllCookies());

      it('returns created cookie', async function() {
        const e = fire('session-cookie-update', {
          cookie: {
            name: 'test',
            value: 'test',
            url: 'http://domain.com'
          }
        });
        const created = await e.detail.result;
        assert.typeOf(created, 'object');
      });

      it('persists a cookie in the store', async () => {
        const e = fire('session-cookie-update', {
          cookie: {
            name: 'test',
            value: 'test',
            url: 'http://domain.com'
          }
        });
        await e.detail.result;
        const cookies = await instance.getAllCookies();
        assert.deepEqual(cookies[0], {
          domain: 'domain.com',
          hostOnly: true,
          httpOnly: false,
          name: 'test',
          path: '/',
          secure: false,
          session: true,
          value: 'test',
        });
      });
    });

    describe('session-cookie-remove', function() {
      before(() => createTestCookies());
      after(() => removeTestCookies());

      it('removes a cookie', async () => {
        const e = fire('session-cookie-remove', {
          cookies: [{
            name: 'test-name',
            value: 'test-value',
            url: 'http://api.domain.com'
          }]
        });
        await e.detail.result;
        const result = await instance.getDomainCookies('api.domain.com');
        assert.lengthOf(result, 0);
      });
    });

    describe('before-request event', function() {
      before(() => createTestCookies());
      after(() => removeTestCookies());

      it('adds a cookie header to the request', async () => {
        const e = fire('before-request', {
          url: 'http://other.com/',
          method: 'GET',
          promises: []
        });
        const result = await e.detail.promises[0];
        assert.equal(result.headers, 'cookie: test2=test2');
      });

      it('appends a cookie to existing header', async () => {
        const e = fire('before-request', {
          url: 'http://other.com/',
          method: 'GET',
          headers: 'cookie: test1=test1',
          promises: []
        });
        const request = await e.detail.promises[0];
        assert.equal(request.headers, 'cookie: test1=test1,test2=test2');
      });
    });
  });

  describe('class APIs', () => {
    async function removeAllCookies(instance) {
      const cookies = await instance.getAllCookies();
      await instance.removeCookies(cookies);
    }

    describe('updateCookie()', () => {
      let instance;
      let cookie;
      beforeEach(() => {
        instance = new CookieBridge();
        cookie = {
          name: `test-cookie`,
          value: 'test',
          url: `http://api.domain.com`,
          expires: Date.now() + 2000,
          httponly: false
        };
      });

      afterEach(async () => {
        await removeAllCookies(instance);
      });

      it('returns created cookie', async () => {
        const expires = Math.round(cookie.expires / 1000);
        const result = await instance.updateCookie(cookie);
        assert.deepEqual(result, {
          expirationDate: expires,
          httponly: false,
          name: cookie.name,
          url: cookie.url,
          value: 'test'
        });
      });

      it('stores a cookie in the data store', async () => {
        const expires = Math.round(cookie.expires / 1000);
        await instance.updateCookie(cookie);
        const cookies = await instance.getAllCookies();
        assert.deepEqual(cookies[0], {
          domain: 'api.domain.com',
          expirationDate: expires,
          hostOnly: true,
          httpOnly: false,
          name: cookie.name,
          path: '/',
          secure: false,
          session: false,
          value: 'test'
        });
      });
    });

    describe('updateCookies()', () => {
      let instance;
      let cookies;
      beforeEach(() => {
        instance = new CookieBridge();
        cookies = [
          {
            name: `test-cookie1`,
            value: 'test',
            url: `http://api.domain.com`,
            expires: Date.now() + 2000,
            httponly: false
          },
          {
            name: `test-cookie2`,
            value: 'test',
            url: `http://other.com`,
            expires: Date.now() + 2000,
            httponly: false
          }
        ];
      });

      afterEach(async () => {
        await removeAllCookies(instance);
      });

      it('stores created cookies in the data store', async () => {
        await instance.updateCookies(cookies);
        const all = await instance.getAllCookies();
        assert.lengthOf(all, 2);
      });
    });

    describe('removeCookies()', () => {
      let instance;
      let cookies;
      beforeEach(async () => {
        instance = new CookieBridge();
        cookies = [
          {
            name: `test-cookie1`,
            value: 'test',
            url: `http://api.domain.com`,
            expires: Date.now() + 2000,
            httponly: false
          },
          {
            name: `test-cookie2`,
            value: 'test',
            url: `http://other.com`,
            expires: Date.now() + 2000,
            httponly: false
          }
        ];
        await instance.updateCookies(cookies);
      });

      afterEach(async () => {
        await removeAllCookies(instance);
      });

      it('removes all passed cookies', async () => {
        await instance.removeCookies(cookies);
        const all = await instance.getAllCookies();
        assert.lengthOf(all, 0);
      });

      it('removes only passed cookies', async () => {
        await instance.removeCookies([cookies[0]]);
        const all = await instance.getAllCookies();
        assert.lengthOf(all, 1);
        assert.equal(all[0].name, 'test-cookie2');
      });

      it('removes single cookie', async () => {
        await instance.removeCookies(cookies[0]);
        const all = await instance.getAllCookies();
        assert.lengthOf(all, 1);
        assert.equal(all[0].name, 'test-cookie2');
      });
    });

    describe('getAllCookies()', () => {
      let instance;
      let cookies;
      beforeEach(async () => {
        instance = new CookieBridge();
        cookies = [
          {
            name: `test-cookie1`,
            value: 'test',
            url: `http://api.domain.com`,
            expires: Date.now() + 2000,
            httponly: false
          },
          {
            name: `test-cookie2`,
            value: 'test',
            url: `http://other.com`,
            expires: Date.now() + 2000,
            httponly: false
          }
        ];
        await instance.updateCookies(cookies);
      });

      afterEach(async () => {
        await removeAllCookies(instance);
      });

      it('reads all cookies', async () => {
        const result = await instance.getAllCookies();
        assert.lengthOf(result, 2);
      });
    });

    describe('getDomainCookies()', () => {
      let instance;
      let cookies;
      beforeEach(async () => {
        instance = new CookieBridge();
        cookies = [
          {
            name: `test-cookie1`,
            value: 'test',
            url: `http://api.domain.com`,
            expires: Date.now() + 2000,
            httponly: false
          },
          {
            name: `test-cookie2`,
            value: 'test',
            url: `http://other.com`,
            expires: Date.now() + 2000,
            httponly: false
          }
        ];
        await instance.updateCookies(cookies);
      });

      afterEach(async () => {
        await removeAllCookies(instance);
      });

      it('reads all cookies', async () => {
        const result = await instance.getDomainCookies('api.domain.com');
        assert.lengthOf(result, 1);
      });
    });
  });
});
