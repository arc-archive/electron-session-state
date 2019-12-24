const { assert } = require('chai');
const { SessionManager } = require('../main');
const { session } = require('electron');

describe('Session manager - main process', function() {
  const url = 'https://domain.com/cookies';

  async function cleanCookies() {
    const sis = session.fromPartition('persist:web-session');
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
    const sis = session.fromPartition('persist:web-session');
    const Cookies = sis.cookies;
    await Cookies.set({
      url: 'https://domain.com/path',
      name: 't1',
      value: 'v1'
    });
    await Cookies.set({
      url: 'https://other.com/',
      name: 't2',
      value: 'v2'
    });
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

    afterEach(() => {
      instance.unlisten();
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

    afterEach(() => {
      instance.unlisten();
    });

    it('Removes existing cookie', async () => {
      const created = await instance.setCookie({
        url,
        name,
        value,
      });
      await instance.removeCookie(created);
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
