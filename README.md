# ARC electron session state management

A library to manage session data in ARC electron.

## usage

```
$ npm i @advanced-rest-client/electron-session-state@latest
```

### Main process

```javascript
const {app} = require('electron');
app.on('ready', () => {
  const {SessionManager} = require('@advanced-rest-client/electron-session-state/main');
  const instance = new SessionManager();
  instance.listen();
});
```

The `listen()` function adds listeners to main ipc:

-   cookies-session
-   open-web-url

`cookie-session` event must have `action` property on the first argument. It can be
`get`, `set`, or `remove`. See `main/session-manager.js` for details.


`open-web-url` event creates a browser window with the same storage area as the session
management. The user can log in to a web service using this window and all
cookies will become available to the request object.

### Renderer process

```javascript
const {CookieBridge} = require('@advanced-rest-client/electron-session-state/renderer');
const instance = new CookieBridge();
instance.listen();
```

It handles the following events:

-   session-cookie-list-all
-   session-cookie-list-domain
-   session-cookie-remove
-   session-cookie-update
-   before-request
-   response-ready
