const {ipcRenderer: ipc} = require('electron');
const {ArcHeaders} = require('@advanced-rest-client/arc-electron-helpers/renderer');
const {Cookies} = require('@advanced-rest-client/cookie-parser');
const log = require('electron-log');
/**
 * Class responsible for cookie exchange between web app and the main process.
 */
class CookieBridge {
  constructor() {
    this._requestId = 0;
    this._promises = [];
    this._onRequestAllCookies = this._onRequestAllCookies.bind(this);
    this._onRequestDomainCookies = this._onRequestDomainCookies.bind(this);
    this._onUpdateCookie = this._onUpdateCookie.bind(this);
    this._onCookieSessionResponse = this._onCookieSessionResponse.bind(this);
    this._onCookieChanged = this._onCookieChanged.bind(this);
    this._onRemoveCookies = this._onRemoveCookies.bind(this);
    this._beforeRequestHandler = this._beforeRequestHandler.bind(this);
    this._afterRequestHandler = this._afterRequestHandler.bind(this);
  }

  listen() {
    window.addEventListener('session-cookie-list-all', this._onRequestAllCookies);
    window.addEventListener('session-cookie-list-domain', this._onRequestDomainCookies);
    window.addEventListener('session-cookie-remove', this._onRemoveCookies);
    window.addEventListener('session-cookie-update', this._onUpdateCookie);
    window.addEventListener('before-request', this._beforeRequestHandler);
    window.addEventListener('response-ready', this._afterRequestHandler);
    ipc.on('cookie-session-response', this._onCookieSessionResponse);
    ipc.on('cookie-changed', this._onCookieChanged);
  }

  unlisten() {
    window.removeEventListener('session-cookie-list-all', this._onRequestAllCookies);
    window.removeEventListener('session-cookie-list-domain', this._onRequestDomainCookies);
    window.removeEventListener('session-cookie-remove', this._onRemoveCookies);
    window.removeEventListener('session-cookie-update', this._onUpdateCookie);
    window.removeEventListener('before-request', this._beforeRequestHandler);
    window.removeEventListener('response-ready', this._afterRequestHandler);
    ipc.removeListener('cookie-session-response', this._onCookieSessionResponse);
    ipc.removeListener('cookie-changed', this._onCookieChanged);
  }

  _appendPromise(id) {
    const p = new Promise((resolve, reject) => {
      this._promises.push({
        id,
        resolve,
        reject
      });
    });
    return p;
  }

  _onCookieSessionResponse(e, id, data, isError) {
    const index = this._promises.findIndex((p) => p.id === id);
    if (index === -1) {
      log.warn('Promise not found');
      return;
    }
    const promise = this._promises[index];
    this._promises.splice(index, 1);
    if (isError) {
      promise.reject(new Error(data.message));
    } else {
      promise.resolve(data);
    }
  }
  /**
   * Web cookies model have `expires` property which is a timestamp
   * in miliseconds intead of seconds as `expirationDate`. This has to be
   * computed before returning cookies to the client.
   *
   * @param {Array} cookies List of cookies to translate
   * @return {Array} Updated list of cookies.
   */
  _translateCookiesForWeb(cookies) {
    if (!cookies) {
      return;
    }
    cookies.forEach((cookie) => this._translateCookieForWeb(cookie));
    return cookies;
  }

  _translateCookieForWeb(cookie) {
    if (cookie.expirationDate) {
      cookie.expires = cookie.expirationDate * 1000;
      delete cookie.expirationDate;
    }
    return cookie;
  }

  _translateCookieForElectron(cookie) {
    if (cookie.expires) {
      cookie.expirationDate = Math.round(cookie.expires / 1000);
      delete cookie.expires;
    }
    if (cookie.httponly) {
      cookie.httpOnly = cookie.httponly;
      delete cookie.httponly;
    }
    return cookie;
  }

  _onRequestAllCookies(e) {
    if (e.defaultPrevented) {
      return;
    }
    e.preventDefault();
    const id = ++this._requestId;
    ipc.send('cookies-session', {
      action: 'get',
      type: 'all',
      id: id
    });
    const p = this._appendPromise(id);
    p.then((cookies) => this._translateCookiesForWeb(cookies));
    e.detail.result = p;
  }

  _onRequestDomainCookies(e) {
    if (e.defaultPrevented) {
      return;
    }
    e.preventDefault();
    const id = ++this._requestId;
    const domain = e.detail.domain;
    ipc.send('cookies-session', {
      action: 'get',
      type: 'domain',
      domain,
      id: id
    });
    const p = this._appendPromise(id);
    p.then((cookies) => this._translateCookiesForWeb(cookies));
    e.detail.result = p;
  }

  _onRemoveCookies(e) {
    if (e.defaultPrevented) {
      return;
    }
    e.preventDefault();
    const id = ++this._requestId;
    const cookies = e.detail.cookies;
    ipc.send('cookies-session', {
      action: 'remove',
      cookies: cookies,
      id: id
    });
    e.detail.result = this._appendPromise(id);
  }

  _onUpdateCookie(e) {
    if (e.defaultPrevented) {
      return;
    }
    e.preventDefault();
    const id = ++this._requestId;
    const cookie = this._translateCookieForElectron(e.detail.cookie);
    ipc.send('cookies-session', {
      action: 'set',
      cookie: cookie,
      id: id
    });
    e.detail.result = this._appendPromise(id);
  }

  _onCookieChanged(e, data) {
    const cookie = this._translateCookieForWeb(data.cookie);
    if (data.removed) {
      this.fire('session-cookie-removed', cookie);
    } else {
      this.fire('session-cookie-changed', cookie);
    }
  }

  fire(type, detail) {
    const e = new CustomEvent(type, {
      detail,
      bubbles: true
    });
    document.body.dispatchEvent(e);
  }
  /**
   * Handler for the ARC's event `before-request`.
   * The event is handled asynchronously.
   * @param {CustomEvent} e
   */
  _beforeRequestHandler(e) {
    const promise = new Promise(function(request, resolve, reject) {
      this._processBeforeRequest(request, resolve, reject);
    }.bind(this, e.detail));
    if (!e.detail.promises) {
      e.detail.promises = [];
    }
    e.detail.promises.push(promise);
  }

  /**
   * Processes request before it's send to the transport library.
   * It sets cookie header string for current URL.
   *
   * @param {Object} request
   * @param {Function} resolve
   * @param {Function} reject
   */
  _processBeforeRequest(request, resolve, reject) {
    this.getCookiesHeaderValue(request.url)
    .then((cookie) => {
      this._applyCookieHeader(cookie, request);
      resolve(request);
    })
    .catch(reject);
  }

  /**
   * Get cookies header value for given URL.
   *
   * @param {String} url An URL for cookies.
   * @return {Promise<String>} Promise that resolves to header value string.
   */
  getCookiesHeaderValue(url) {
    return this.getCookies(url)
    .then(function(cookies) {
      if (!cookies) {
        cookies = [];
      }
      return cookies.map((c) => c.name + '=' + c.value).join('; ');
    });
  }
  /**
   * Gets a list of cookies for given URL (matching domain and path as defined
   * in Cookie spec) from  the datastore.
   *
   * @param {String} url An URL to match cookies.
   * @return {Promise<Array>} List of database objects that matches cookies.
   */
  getCookies(url) {
    const id = ++this._requestId;
    ipc.send('cookies-session', {
      action: 'get',
      type: 'url',
      url: url,
      id: id
    });
    return this._appendPromise(id);
  }

  /**
   * Applies cookie header value to current request headers.
   * If header to be applied is computed then it will alter headers string.
   *
   * Note, this element do not sends `request-headers-changed` event.
   *
   * @param {String} header Computed headers string
   * @param {Object} request The request object from the event.
   */
  _applyCookieHeader(header, request) {
    header = header.trim();
    if (!header) {
      return;
    }
    log.info('Cookies to send with the request:', header);
    const headers = new ArcHeaders(request.headers);
    headers.append('cookie', header);
    request.headers = headers.toString();
  }

  /**
   * Handler to the `response-ready` event.
   * Stores cookies in the datastore.
   *
   * @param {CustomEvent} e
   */
  _afterRequestHandler(e) {
    const request = e.detail.request;
    const response = e.detail.response;
    const redirects = e.detail.redirects;
    process.nextTick(() => {
      this._processResponse(request, response, redirects);
    });
  }

  /**
   * Extracts cookies from `this.responseHeaders` and if any cookies are
   * there it stores them in the datastore.
   *
   * @param {Object} request
   * @param {Object} response
   * @param {Array<Object>} redirects
   * @return {Promise}
   */
  _processResponse(request, response, redirects) {
    if (!response || response.isError || !request || !request.url) {
      return;
    }
    const result = this.extract(response, request.url, redirects);
    return this._store(result.cookies);
  }

  /**
   * Extracts cookies from the `response` object and returns an object with
   * `cookies` and `expired` properties containing array of cookies, each.
   *
   * @param {Response} response The response object. This chould be altered
   * request object
   * @param {String} url The request URL.
   * @param {?Array<Object>} redirects List of redirect responses (Response
   * type). Each object is expected to have `headers` and `requestUrl`
   * properties.
   * @return {Object<String, Array>} An object with `cookies` and `expired`
   * arrays of cookies.
   */
  extract(response, url, redirects) {
    let expired = [];
    let parser;
    let exp;
    const parsers = [];
    if (redirects && redirects.length) {
      redirects.forEach(function(r) {
        const headers = new ArcHeaders(r.headers);
        if (headers.has('set-cookie')) {
          parser = new Cookies(headers.get('set-cookie'), r.url);
          parser.filter();
          exp = parser.clearExpired();
          if (exp && exp.length) {
            expired = expired.concat(exp);
          }
          parsers.push(parser);
        }
      });
    }
    const headers = new ArcHeaders(response.headers);
    if (headers.has('set-cookie')) {
      parser = new Cookies(headers.get('set-cookie'), url);
      parser.filter();
      exp = parser.clearExpired();
      if (exp && exp.length) {
        expired = expired.concat(exp);
      }
      parsers.push(parser);
    }
    let mainParser = null;
    parsers.forEach(function(parser) {
      if (!mainParser) {
        mainParser = parser;
        return;
      }
      mainParser.merge(parser);
    });
    return {
      cookies: mainParser ? mainParser.cookies : [],
      expired: expired
    };
  }

  /**
   * Stores received cookies in the datastore.
   *
   * @param {Array} cookies List of cookies to store
   * @return {Promise} Resolved promise when all cookies are stored.
   */
  _store(cookies) {
    if (!cookies || !cookies.length) {
      return;
    }
    cookies = cookies.map((item) => {
      item = item.toJSON();
      item = this._translateCookieForElectron(item);
      return item;
    });
    const id = ++this._requestId;
    ipc.send('cookies-session', {
      action: 'set',
      cookies,
      id
    });
    return this._appendPromise(id)
    .catch((cause) => log.error(cause));
  }
}
exports.CookieBridge = CookieBridge;
