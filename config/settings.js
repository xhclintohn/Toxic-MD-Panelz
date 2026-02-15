const fs = require('fs');
const path = require('path');

let session = '';
const sessionFilePath = path.join(__dirname, '..', 'session.json');

try {
    if (fs.existsSync(sessionFilePath)) {
        const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));
        session = sessionData.SESSION_ID || '';
    }
} catch (error) {
}

const mycode = process.env.CODE || "254";
const botname = process.env.BOTNAME || 'Toxic-MD';
const herokuAppName = process.env.HEROKU_APP_NAME || '';
const herokuApiKey = process.env.HEROKU_API_KEY || '';

module.exports = {
  session,
  mycode,
  botname,
  herokuAppName,
  herokuApiKey
};