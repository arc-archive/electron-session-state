import { ipcRenderer as ipc } from 'electron';
import { ArcHeaders } from '@advanced-rest-client/arc-electron-helpers';
import { Cookies } from '@advanced-rest-client/cookie-parser';
/**
 * Class responsible for cookie exchange between web app and the main process.
 *
 * When instance property `ignoreSessionCookies` is `true` then cookies are
 * not added to the request.
 */
export class CookieBridge {
  constructor(appCnf={}) {
    this._onRequestAllCookies = this._onRequestAllCookies.bind(this);
    this._onRequestDomainCookies = this._onRequestDomainCookies.bind(this);
    this._onUpdateCookie = this._onUpdateCookie.bind(this);
    this._onCookieChanged = this._onCookieChanged.bind(this);
    this._onRemoveCookies = this._onRemoveCookies.bind(this);
    this._beforeRequestHandler = this._beforeRequestHandler.bind(this);
    this._afterRequestHandler = this._afterRequestHandler.bind(this);

    if (typeof appCnf.ignoreSessionCookies === 'boolean') {
      this.ignoreSessionCookies = appCnf.ignoreSessionCookies;
    }
  }

  listen() {
    window.addEventListener('session-cookie-list-all', this._onRequestAllCookies);
    window.addEventListener('session-cookie-list-domain', this._onRequestDomainCookies);
    window.addEventListener('session-cookie-remove', this._onRemoveCookies);
    window.addEventListener('session-cookie-update', this._onUpdateCookie);
    window.addEventListener('before-request', this._beforeRequestHandler);
    window.addEventListener('response-ready', this._afterRequestHandler);
    ipc.on('cookie-changed', this._onCookieChanged);
  }

  unlisten() {
    window.removeEventListener('session-cookie-list-all', this._onRequestAllCookies);
    window.removeEventListener('session-cookie-list-domain', this._onRequestDomainCookies);
    window.removeEventListener('session-cookie-remove', this._onRemoveCookies);
    window.removeEventListener('session-cookie-update', this._onUpdateCookie);
    window.removeEventListener('before-request', this._beforeRequestHandler);
    window.removeEventListener('response-ready', this._afterRequestHandler);
    ipc.removeListener('cookie-changed', this._onCookieChanged);
  }

  /**
   * @return {Promise<Array<Object>>} List of all cookies in the cookie session
   * partition.
   */
  async getAllCookies() {
    return await ipc.invoke('cookies-session-get-all');
  }

  /**
   * @param {String} domain Cookies domain name
   * @return {Promise<Array<Object>>} List of domain cookies in the cookie session
   * partition.
   */
  async getDomainCookies(domain) {
    return await ipc.invoke('cookies-session-get-domain', domain);
  }

  /**
   * Removes cookie or cookies from the store.
   * @param {Object|Array<Object>} cookies A cookie or a list of cookies to delete.
   * @return {Promise}
   */
  async removeCookies(cookies) {
    if (Array.isArray(cookies)) {
      return await ipc.invoke('cookies-session-remove-cookies', cookies);
    } else {
      return await ipc.invoke('cookies-session-remove-cookie', cookies);
    }
  }

  /**
   * Creates or updates cookies in the cookies partition.
   * @param {Object} cookie ARC's cookie definition.
   * @return {Promise}
   */
  async updateCookie(cookie) {
    const electronCookie = this._translateCookieForElectron(cookie);
    return await ipc.invoke('cookies-session-set-cookie', electronCookie);
  }

  /**
   * Stores list of cookies in the store.
   *
   * @param {Array<Object>} cookies List of cookies to store
   * @return {Promise} Resolved promise when all cookies are stored.
   */
  async updateCookies(cookies) {
    if (!cookies || !cookies.length) {
      return;
    }
    cookies = cookies.map((item) => {
      if (item.toJSON) {
        // compatibility with cookie-parser of ARC
        item = item.toJSON();
      }
      item = this._translateCookieForElectron(item);
      return item;
    });
    return await ipc.invoke('cookies-session-set-cookies', cookies);
  }

  /**
   * Dispatches a DOM event.
   * @param {String} type Event type
   * @param {any} detail Event detail object
   */
  fire(type, detail) {
    const e = new CustomEvent(type, {
      detail,
      bubbles: true
    });
    document.body.dispatchEvent(e);
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

  /**
   * Handler for the `session-cookie-list-all` DOM event.
   * Sets a result of calling `getAllCookies()` to `detail.result` property.
   * @param {CustomEvent} e
   */
  _onRequestAllCookies(e) {
    if (e.defaultPrevented) {
      return;
    }
    e.preventDefault();
    e.detail.result = this.getAllCookies();
  }

  /**
   * Handler for the `session-cookie-list-domain` DOM event.
   * Sets a result of calling `getDomainCookies()` to `detail.result` property.
   *
   * It expects the `domain` property to be set on the `detail` object.
   *
   * @param {CustomEvent} e
   */
  _onRequestDomainCookies(e) {
    if (e.defaultPrevented) {
      return;
    }
    e.preventDefault();
    const { domain } = e.detail;
    e.detail.result = this.getDomainCookies(domain);
  }

  /**
   * Handler for the `session-cookie-remove` DOM event.
   * Sets a result of calling `removeCookies(detail.remove)` to `detail.result` property.
   *
   * It expects the `cookies` property to be set on the `detail` object.
   *
   * @param {CustomEvent} e
   */
  _onRemoveCookies(e) {
    if (e.defaultPrevented) {
      return;
    }
    e.preventDefault();
    const { cookies } = e.detail;
    e.detail.result = this.removeCookies(cookies);
  }

  /**
   * Handler for the `session-cookie-update` DOM event.
   * Sets a result of calling `updateCookie(detail.cookie)` to `detail.result` property.
   *
   * It expects the `cookie` property to be set on the `detail` object.
   *
   * @param {CustomEvent} e
   */
  _onUpdateCookie(e) {
    if (e.defaultPrevented) {
      return;
    }
    e.preventDefault();
    e.detail.result = this.updateCookie(e.detail.cookie);
  }

  /**
   * A handler from main thread's `cookie-changed` event.
   * It dispatches `session-cookie-removed` or `session-cookie-changed` DOM event,
   * depanding on the change defiitino.
   *
   * @param {Event} e IPC event
   * @param {Object} data Cookie data
   * @param {Object} data.cookie The electron cookie object
   * @param {Boolean=} data.removed Set when a cookie was removed. Otherwise it is changed.
   */
  _onCookieChanged(e, data) {
    const cookie = this._translateCookieForWeb(data.cookie);
    if (data.removed) {
      this.fire('session-cookie-removed', cookie);
    } else {
      this.fire('session-cookie-changed', cookie);
    }
  }

  /**
   * Handler for the ARC's event `before-request`.
   * The event is handled asynchronously.
   * @param {CustomEvent} e
   */
  _beforeRequestHandler(e) {
    if (this.ignoreSessionCookies) {
      return
    }
    const { config } = e.detail;
    if (config && config.ignoreSessionCookies === true) {
      return;
    }
    if (!e.detail.promises) {
      e.detail.promises = [];
    }
    e.detail.promises.push(this._processBeforeRequest(e.detail));
  }

  /**
   * Processes request before it's send to the transport library.
   * It sets cookie header string for current URL.
   *
   * @param {Object} request
   * @param {Function} resolve
   * @param {Function} reject
   */
  async _processBeforeRequest(request) {
    const cookie = await this.getCookiesHeaderValue(request.url);
    this._applyCookieHeader(cookie, request);
    return request;
  }

  /**
   * Get cookies header value for given URL.
   *
   * @param {String} url An URL for cookies.
   * @return {Promise<String>} Promise that resolves to header value string.
   */
  async getCookiesHeaderValue(url) {
    const cookies = await this.getCookies(url);
    if (!cookies || !cookies.length) {
      return '';
    }
    return cookies.map((c) => c.name + '=' + c.value).join('; ');
  }
  /**
   * Gets a list of cookies for given URL (matching domain and path as defined
   * in Cookie spec) from  the datastore.
   *
   * @param {String} url An URL to match cookies.
   * @return {Promise<Array>} List of database objects that matches cookies.
   */
  async getCookies(url) {
    return await ipc.invoke('cookies-session-get-url', url);
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
    return this.updateCookies(result.cookies);
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
      expired
    };
  }
}
