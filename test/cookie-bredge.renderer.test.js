const assert = require('chai').assert;
const {CookieBridge} = require('../renderer');

describe('Cookie bridge - renderer process', function() {
  describe('_appendPromise()', function() {
    let instance;
    const id = 'test-id';
    beforeEach(() => {
      instance = new CookieBridge();
    });

    it('Creates promise', function() {
      const result = instance._appendPromise(id);
      assert.typeOf(result.then, 'function');
    });

    it('Adds promise to the list', function() {
      instance._appendPromise(id);
      assert.lengthOf(instance._promises, 1);
    });

    it('Added promise has reject and resolve', function() {
      instance._appendPromise(id);
      assert.typeOf(instance._promises[0].resolve, 'function');
      assert.typeOf(instance._promises[0].reject, 'function');
    });
  });

  describe('_onCookieSessionResponse()', function() {
    let instance;
    let promise;
    const id = 'test-id';
    beforeEach(() => {
      instance = new CookieBridge();
      promise = instance._appendPromise(id);
    });

    it('Resolves the promise', function() {
      instance._onCookieSessionResponse({}, id, 'test-data');
      return promise
      .then((data) => assert.equal(data, 'test-data'));
    });

    it('Rejects the promise', function(done) {
      instance._onCookieSessionResponse({}, id, new Error('test-error'), true);
      promise.catch((error) => {
        assert.equal(error.message, 'test-error');
        done();
      });
    });

    it('Removes the promise from the list', function() {
      instance._onCookieSessionResponse({}, id, '');
      assert.lengthOf(instance._promises, 0);
    });
  });

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

    let instance;
    before(() => {
      instance = new CookieBridge();
      instance.listen();
    });

    after(() => {
      instance.unlisten();
    });

    describe('session-cookie-update', function() {
      it('Creates a cookie', function() {
        const e = fire('session-cookie-update', {
          cookie: {
            name: 'test',
            value: 'test',
            url: 'http://domain.com'
          }
        });
        return e.detail.result;
      });

      it('result is a promise', function() {
        const e = fire('session-cookie-update', {
          cookie: {
            name: 'test',
            value: 'test',
            url: 'http://domain.com'
          }
        });
        assert.typeOf(e.detail.result.then, 'function');
        return e.detail.result;
      });
    });

    describe('session-cookie-remove', function() {
      it('Removes a cookie', function() {
        const e = fire('session-cookie-remove', {
          cookies: [{
            name: 'test',
            value: 'test',
            url: 'http://domain.com'
          }]
        });
        return e.detail.result;
      });
    });

    function createTestCookies() {
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
      return Promise.all([e1.detail.result, e2.detail.result]);
    }

    function removeTestCookies() {
      const e = fire('session-cookie-remove', {
        cookies: [{
          name: 'test-name',
          url: 'http://api.domain.com'
        }, {
          name: 'test2',
          url: 'http://other.com'
        }]
      });
      return e.detail.result;
    }

    describe('session-cookie-list-*', function() {
      before(() => createTestCookies());
      after(() => removeTestCookies());

      it('session-cookie-list-all returns an array', function() {
        const e = fire('session-cookie-list-all', {});
        return e.detail.result
        .then((result) => {
          assert.typeOf(result, 'array');
          assert.lengthOf(result, 2);
        });
      });

      it('session-cookie-list-domain returns an array', function() {
        const e = fire('session-cookie-list-domain', {
          domain: 'other.com'
        });
        return e.detail.result
        .then((result) => {
          assert.typeOf(result, 'array');
          assert.lengthOf(result, 1);
          assert.equal(result[0].domain, 'other.com');
        });
      });
    });

    describe('before-request event', function() {
      before(() => createTestCookies());
      after(() => removeTestCookies());

      it('Adds cookie header to the request', () => {
        const e = fire('before-request', {
          url: 'http://other.com/',
          method: 'GET',
          promises: []
        });
        return e.detail.promises[0]
        .then((request) => {
          assert.equal(request.headers, 'cookie: test2=test2');
        });
      });

      it('Appends cookie to existing header', () => {
        const e = fire('before-request', {
          url: 'http://other.com/',
          method: 'GET',
          headers: 'cookie: test1=test1',
          promises: []
        });
        return e.detail.promises[0]
        .then((request) => {
          assert.equal(request.headers, 'cookie: test1=test1,test2=test2');
        });
      });
    });
  });
});
