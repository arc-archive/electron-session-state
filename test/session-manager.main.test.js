const assert = require('chai').assert;
const {SessionManager} = require('../main');
const {session} = require('electron');

describe('Session manager - main process', function() {
  const url = 'https://domain.com/cookies';
  function removeCookie(store, cookie, cookieUrl) {
    return new Promise((resolve) => {
      store.remove((cookieUrl || url), cookie.name, () => resolve());
    });
  }
  function cleanCookies() {
    return new Promise((resolve, reject) => {
      const sis = session.fromPartition('persist:web-session');
      sis.cookies.get({}, (error, cookies) => {
        if (error) {
          reject(error);
          return;
        }
        if (!cookies || !cookies.length) {
          resolve();
          return;
        }
        const p = [];
        for (let i = 0; i < cookies.length; i++) {
          let cookieUrl;
          if (cookies[i].name === 't1') {
            cookieUrl = 'https://domain.com/path';
          } else if (cookies[i].name === 't2') {
            cookieUrl = 'https://other.com/';
          }
          p.push(removeCookie(sis.cookies, cookies[i], cookieUrl));
        }
        Promise.all(p).then(() => resolve()).catch((cause) => reject(cause));
      });
    });
  }

  function addCookie(store, url, name, value) {
    return new Promise((resolve, reject) => {
      store.set({url, name, value}, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  function createTestCookies() {
    return new Promise((resolve, reject) => {
      const sis = session.fromPartition('persist:web-session');
      const result = [];
      result[0] = addCookie(sis.cookies, 'https://domain.com/path', 't1', 'v1');
      result[1] = addCookie(sis.cookies, 'https://other.com/', 't2', 'v2');
      Promise.all(result).then(() => resolve()).catch((cause) => reject(cause));
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

    it('Creates a cookie', (done) => {
      instance.setCookie({
        url,
        name,
        value
      })
      .then(() => {
        setTimeout(() => {
          instance._session.get({}, (error, cookies) => {
            if (error) {
              done(error);
            } else {
              assert.lengthOf(cookies, 1);
              assert.equal(cookies[0].name, name);
              assert.equal(cookies[0].value, value);
              done();
            }
          }, 1);
        });
      })
      .catch((cause) => done(cause));
    });

    it('Creates url for the cookie', () => {
      return instance.setCookie({
        name,
        value,
        domain: 'domain.com',
        secure: true
      })
      .then((created) => {
        assert.equal(created.url, 'https://domain.com/');
      });
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

    it('Removes existing cookie', (done) => {
      instance.setCookie({
        url,
        name,
        value
      })
      .then((cookie) => instance.removeCookie(cookie))
      .then(() => {
        setTimeout(() => {
          instance._session.get({}, (error, cookies) => {
            if (error) {
              done(error);
            } else {
              assert.lengthOf(cookies, 0);
              done();
            }
          });
        }, 1);
      })
      .catch((cause) => done(cause));
    });
  });

  describe('Getting cookies', () => {
    let instance;
    before(() => {
      return cleanCookies()
      .then(() => createTestCookies());
    });

    beforeEach(() => {
      instance = new SessionManager();
      instance.listen();
    });

    afterEach(() => {
      instance.unlisten();
    });

    it('Reads all cookies with getAllCookies()', () => {
      return instance.getAllCookies()
      .then((cookies) => {
        assert.lengthOf(cookies, 2);
      });
    });

    it('Reads domain cookies with getDomainCookies()', () => {
      return instance.getDomainCookies('other.com')
      .then((cookies) => {
        assert.lengthOf(cookies, 1);
      });
    });

    it('Reads url cookies with getUrlCookies()', () => {
      return instance.getUrlCookies('https://other.com')
      .then((cookies) => {
        assert.lengthOf(cookies, 1);
      });
    });
  });
});
