const fs = require('node:fs');
const path = require('node:path');

const apiUrl = process.env.API_URL || 'http://localhost:3000';
const production = process.env.NODE_ENV === 'production';
const targetPath = path.join(__dirname, '..', 'src', 'environments', 'environment.ts');

const content = `export const environment = {
  production: ${production},
  apiUrl: ${JSON.stringify(apiUrl)},
  API_URL: ${JSON.stringify(apiUrl)},
};
`;

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, content);
