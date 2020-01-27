const { assert } = require('chai');
const { SessionManager, PERSISTNAME } = require('../main');
const { session } = require('electron');

describe('SessionManager - main process', function() {
  const url = 'https://domain.com/cookies';

  async function cleanCookies() {
    const sis = session.fromPartition(PERSISTNAME);
    const Cookies = sis.cookies;
    const cookies = await Cookies.get({});
    if (!cookies || !cookies.length) {
      return;
    }
    for (let i = 0; i < cookies.length; i++) {
      let cookieUrl;
      if (cookies[i].name === 't1') {
        cookieUrl = 'https://domain.com/path';
      } else if (cookies[i].name === 't2') {
        cookieUrl = 'https://other.com/';
      }
      await Cookies.remove((cookieUrl || url), cookies[i].name);
    }
  }

  async function createTestCookies() {
    const sis = session.fromPartition(PERSISTNAME);
    const Cookies = sis.cookies;
    await Cookies.set({
      url: 'https://domain.com/path',
      name: 't1',
      value: 'v1',
    });
    await Cookies.set({
      url: 'https://other.com/',
      name: 't2',
      value: 'v2',
    });
  }

  async function removeCookies(cookies) {
    const sis = session.fromPartition(PERSISTNAME);
    const Cookies = sis.cookies;
    for (let i = 0, len = cookies.length; i < len; i++) {
      const [url, name] = cookies[i];
      await Cookies.remove(url, name);
    }
    await Cookies.flushStore();
  }

  describe('getSessionCookies()', () => {
    let instance;
    beforeEach(() => {
      instance = new SessionManager();
      instance.listen();
    });

    afterEach(() => {
      instance.unlisten();
    });

    it('Returns Cookies class for session', () => {
      const result = instance.getSessionCookies();
      assert.equal(result.constructor.name, 'Cookies');
    });
  });

  describe('setCookie()', () => {
    let instance;
    const name = 'test-cookie';
    const value = 'test-value';

    before(() => cleanCookies());

    beforeEach(() => {
      instance = new SessionManager();
      instance.listen();
    });

    afterEach(async () => {
      instance.unlisten();
      await removeCookies([
        [url, name],
        ['https://domain.com/', name],
        ['http://qax.anypoint.mulesoft.com/', '_csrf']
      ]);
    });

    it('creates a cookie', async () => {
      await instance.setCookie({
        url,
        name,
        value
      });
      const cookies = await instance._session.get({});
      assert.lengthOf(cookies, 1);
      assert.equal(cookies[0].name, name);
      assert.equal(cookies[0].value, value);
    });

    it('creates url for a cookie', async () => {
      const created = await instance.setCookie({
        name,
        value,
        domain: 'domain.com',
        secure: true
      });
      assert.equal(created.url, 'https://domain.com/');
    });

    it('creates a cookie from renderer object', async () => {
      const cookie = {
        created: Date.now(),
        domain: 'qax.anypoint.mulesoft.com',
        expirationDate: 8640000000000,
        hostOnly: true,
        httponly: null,
        lastAccess: 1580162723841,
        name: '_csrf',
        path: '/',
        persistent: false,
        value: 'GwjXpexHYiv22J9Bd7NUF-4c',
      };
      await instance.setCookie(cookie);

      const cookies = await instance._session.get({});
      assert.lengthOf(cookies, 1, 'has single cookie');
      assert.deepEqual(cookies[0], {
        name: '_csrf',
        value: 'GwjXpexHYiv22J9Bd7NUF-4c',
        domain: '.qax.anypoint.mulesoft.com',
        hostOnly: false,
        path: '/',
        secure: false,
        httpOnly: false,
        session: false,
        expirationDate: 8640000000000,
      }, 'stores the cookie in the store');
    });
  });

  describe('removeCookie()', () => {
    let instance;
    const url = 'https://domain.com/cookies';
    const name = 'test-cookie';
    const value = 'test-value';

    before(() => {
      return cleanCookies();
    });

    beforeEach(() => {
      instance = new SessionManager();
      instance.listen();
    });

    afterEach(async () => {
      instance.unlisten();
    });

    it('removes existing cookie', async () => {
      const created = await instance.setCookie({
        url,
        name,
        value,
      });
      await instance.removeCookie(created);
      const cookies = await instance._session.get({});
      assert.lengthOf(cookies, 0);
    });

    it('removes renderer based cookie', async () => {
      const cookie = {
        created: Date.now(),
        domain: 'qax.anypoint.mulesoft.com',
        expirationDate: 8640000000000,
        hostOnly: true,
        httponly: null,
        lastAccess: 1580162723841,
        name: '_csrf',
        path: '/',
        persistent: false,
        value: 'GwjXpexHYiv22J9Bd7NUF-4c',
      };
      await instance.setCookie(cookie);
      await instance.removeCookie({
        url: 'http://qax.anypoint.mulesoft.com/',
        name: '_csrf'
      });
      const cookies = await instance._session.get({});
      assert.lengthOf(cookies, 0);
    });
  });

  describe('Getting cookies', () => {
    let instance;
    before(async () => {
      await cleanCookies();
      await createTestCookies();
    });

    beforeEach(() => {
      instance = new SessionManager();
      instance.listen();
    });

    afterEach(() => {
      instance.unlisten();
    });

    it('Reads all cookies with getAllCookies()', async () => {
      const cookies = await instance.getAllCookies();
      assert.lengthOf(cookies, 2);
    });

    it('Reads domain cookies with getDomainCookies()', async () => {
      const cookies = await instance.getDomainCookies('other.com');
      assert.lengthOf(cookies, 1);
    });

    it('Reads url cookies with getUrlCookies()', async () => {
      const cookies = await instance.getUrlCookies('https://other.com');
      assert.lengthOf(cookies, 1);
    });
  });
});
