const {app} = require('electron');
app.on('ready', () => {
  const {SessionManager} = require('../main');
  const instance = new SessionManager();
  instance.listen();
});
