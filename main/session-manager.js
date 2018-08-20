const {session, BrowserWindow, ipcMain, app} = require('electron');
const EventEmitter = require('events');
const PERSISTNAME = 'persist:web-session';
/**
 * A class responsible for managing chrome web session.
 */
class SessionManager extends EventEmitter {
  /**
   * @param {?Object} opts [description]
   */
  constructor(opts) {
    super();
    if (!opts) {
      opts = {};
    }
    this.appUrls = opts.appUrls;
    this._cookieChanged = this._cookieChanged.bind(this);
    this._handleOpenSessionWindow = this._handleOpenSessionWindow.bind(this);
    this._handleCookiesSessionRequest = this._handleCookiesSessionRequest.bind(this);
    this._handleCertIssue = this._handleCertIssue.bind(this);
  }

  listen() {
    this._session = this.getSessionCookies();
    this._session.on('changed', this._cookieChanged);
    ipcMain.on('open-web-url', this._handleOpenSessionWindow);
    ipcMain.on('cookies-session', this._handleCookiesSessionRequest);
    app.on('certificate-error', this._handleCertIssue);
  }

  unlisten() {
    this._session.removeListener('changed', this._cookieChanged);
    ipcMain.removeListener('open-web-url', this._handleOpenSessionWindow);
    ipcMain.removeListener('cookies-session', this._handleCookiesSessionRequest);
  }

  _handleOpenSessionWindow(e, url, purpose) {
    switch (purpose) {
      case 'web-session': this.openWebBrowser(url); break;
    }
  }

  _handleCookiesSessionRequest(e, data) {
    switch (data.action) {
      case 'get':
        if (data.type === 'all') {
          this._handleAllCookies(e.sender, data.id);
        } else if (data.type === 'url') {
          this._handleUrlCookies(e.sender, data.id, data.url);
        } else {
          this._handleDomainCookies(e.sender, data.id, data.domain);
        }
      break;
      case 'set':
        if (data.cookies && data.cookies instanceof Array) {
          this._handleSetCookies(e.sender, data.id, data.cookies);
        } else if (data.cookie) {
          this._handleSetCookie(e.sender, data.id, data.cookie);
        } else {
          this._sendResponseError(e.sender, data.id, new Error(
            'No cookie info to set.'
          ));
        }
      break;
      case 'remove':
        if (data.cookies && data.cookies instanceof Array) {
          this._handleRemoveCookies(e.sender, data.id, data.cookies);
        } else if (data.cookie) {
          this._handleRemoveCookie(e.sender, data.id, data.cookie);
        } else {
          this._sendResponseError(e.sender, data.id, new Error(
            'No cookie info to delete.'
          ));
        }
      break;
    }
  }

  _cookieChanged(event, cookie, cause, removed) {
    const data = {
      cookie: cookie,
      cause: cause,
      removed: removed
    };
    this.emit('cookie-changed', data);
  }
  /**
   * @return {Cookies} Electron's Cookies class instance for session window.
   */
  getSessionCookies() {
    const sis = session.fromPartition(PERSISTNAME);
    return sis.cookies;
  }
  /**
   * Retreives all cookies stored with the session.
   * @return {Promise<Array>} A promise resolved to a list of cookies.
   */
  getAllCookies() {
    return new Promise((resolve, reject) => {
      this._session.get({}, (error, cookies) => {
        if (error) {
          reject(error);
        } else {
          resolve(cookies);
        }
      });
    });
  }
  /**
   * Retreives cookies stored with the session for given domain.
   * @param {String} domain
   * @return {Promise<Array>} A promise resolved to a list of cookies.
   */
  getDomainCookies(domain) {
    return new Promise((resolve, reject) => {
      this._session.get({domain}, (error, cookies) => {
        if (error) {
          reject(error);
        } else {
          resolve(cookies);
        }
      });
    });
  }
  /**
   * Retreives cookies stored with the session for given url.
   * @param {String} url
   * @return {Promise<Array>} A promise resolved to a list of cookies.
   */
  getUrlCookies(url) {
    return new Promise((resolve, reject) => {
      this._session.get({url}, (error, cookies) => {
        if (error) {
          reject(error);
        } else {
          resolve(cookies);
        }
      });
    });
  }

  _computeCookieUrl(cookie, secured) {
    let domain = cookie.domain;
    if (domain[0] === '.') {
      domain = domain.substr(1);
    }
    let protocol = 'http';
    if (secured) {
      protocol += 's';
    }
    protocol += '://';
    return protocol + domain + (cookie.path || '/');
  }

  setCookie(cookie) {
    return new Promise((resolve, reject) => {
      if (!cookie.url) {
        cookie.url = this._computeCookieUrl(cookie, cookie.secure);
      }
      if (cookie.expires) {
        cookie.expirationDate = cookie.expires;
      }
      this._session.set(cookie, (error) => {
        if (error) {
          reject(error);
        } else {
          this._session.flushStore(() => {});
          resolve(cookie);
        }
      });
    });
  }

  removeCookie(cookie) {
    const name = cookie.name;
    if (cookie.url) {
      return this._removeCookie(cookie.url, name);
    }
    const httpUrl = this._computeCookieUrl(cookie);
    const httpsUrl = this._computeCookieUrl(cookie, true);
    const ps = [];
    ps[0] = this._removeCookie(httpUrl, name);
    ps[1] = this._removeCookie(httpsUrl, name);
    return Promise.all(ps)
    .then(() => {
      this._session.flushStore(() => {});
    });
  }

  _removeCookie(url, name) {
    return new Promise((resolve) => {
      this._session.remove(url, name, () => resolve());
    });
  }

  /**
   * Opens a new browser window for given URL so the user can
   * authenticate himself in the external service and the app will store
   * cookies from this session.
   * @param {String} url An URL to open
   * @return {BrowserWindow} an instancce of created window.
   */
  openWebBrowser(url) {
    const bw = new BrowserWindow({
      webPreferences: {
        partition: PERSISTNAME,
        nodeIntegration: false
      }
    });
    bw.loadURL(url);
    return bw;
  }

  _sendResponse(win, id, response) {
    win.send('cookie-session-response', id, response);
  }

  _sendResponseError(win, id, cause) {
    const response = {
      message: cause.message
    };
    win.send('cookie-session-response', id, response, true);
  }

  _handleAllCookies(win, id) {
    this.getAllCookies()
    .then((cookies) => this._sendResponse(win, id, cookies))
    .catch((cause) => this._sendResponseError(win, id, cause));
  }

  _handleDomainCookies(win, id, domain) {
    this.getDomainCookies(domain)
    .then((cookies) => this._sendResponse(win, id, cookies))
    .catch((cause) => this._sendResponseError(win, id, cause));
  }

  _handleUrlCookies(win, id, url) {
    this.getUrlCookies(url)
    .then((cookies) => this._sendResponse(win, id, cookies))
    .catch((cause) => this._sendResponseError(win, id, cause));
  }

  _handleSetCookie(win, id, cookie) {
    this.setCookie(cookie)
    .then(() => this._sendResponse(win, id))
    .catch((cause) => this._sendResponseError(win, id, cause));
  }

  _handleSetCookies(win, id, cookies) {
    const p = cookies.map((cookie) => this.setCookie(cookie));
    Promise.all(p)
    .then(() => this._sendResponse(win, id))
    .catch((cause) => this._sendResponseError(win, id, cause));
  }

  _handleRemoveCookie(win, id, cookie) {
    this.removeCookie(cookie)
    .then(() => this._sendResponse(win, id))
    .catch((cause) => this._sendResponseError(win, id, cause));
  }

  _handleRemoveCookies(win, id, cookies) {
    const promises = cookies.map((cookie) => this.removeCookie(cookie));
    Promise.all(promises)
    .then(() => this._sendResponse(win, id))
    .catch((cause) => this._sendResponseError(win, id, cause));
  }
  /**
   * Allows to ignore certificate errors when opening session window.
   *
   * @param {Event} e
   * @param {Object} webContents
   * @param {String} url
   * @param {Object} error
   * @param {Object} certificate
   * @param {Function} callback
   */
  _handleCertIssue(e, webContents, url, error, certificate, callback) {
    if (this._isAppUsedUrl(url)) {
      callback(false);
    } else {
      e.preventDefault();
      callback(true);
    }
  }
  /**
   * Checks if given URL is used by the application to request an external resource.
   * It is used by the `_handleCertIssue()` function to determine if allow
   * bypass certificate error.
   * Each application registered URL should be evaluated by Chromium default
   * certificate test engine. Otherwise it's a user entered URL in
   * web session and certificate test should be bypassed.
   *
   * @param {String} url An url
   * @return {Boolean} True if certificate validation should be applied.
   */
  _isAppUsedUrl(url) {
    if (!url || !this.appUrls || !this.appUrls.length) {
      return false;
    }
    for (let i = 0, len = this.appUrls.length; i < len; i++) {
      if (url.indexOf(this.appUrls[i]) !== -1) {
        return true;
      }
    }
    return false;
  }
}

module.exports.SessionManager = SessionManager;
