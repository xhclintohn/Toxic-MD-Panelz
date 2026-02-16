const rootSettings = require('../settings');

const session = rootSettings.SESSION_ID;
const mycode = rootSettings.COUNTRY_CODE;
const botname = rootSettings.BOTNAME;
const herokuAppName = rootSettings.HEROKU_APP_NAME;
const herokuApiKey = rootSettings.HEROKU_API_KEY;

module.exports = {
  session,
  mycode,
  botname,
  herokuAppName,
  herokuApiKey
};
