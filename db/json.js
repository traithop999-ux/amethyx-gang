const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'database.json');
const defaultData = {
  users: [],
  treasury: {
    id: 'main',
    balance: 0,
    logs: []
  }
};

function ensureDatabaseFile() {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }

  const data = readDatabase();
  if (!Array.isArray(data.users)) data.users = [];
  if (!data.treasury || !data.treasury.id) {
    data.treasury = { ...defaultData.treasury, ...data.treasury };
  }
  if (!Array.isArray(data.treasury.logs)) data.treasury.logs = [];
  writeDatabase(data);
}

function readDatabase() {
  ensureDatabaseFile();
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeDatabase(data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

module.exports = {
  ensureDatabaseFile,
  readDatabase,
  writeDatabase,
  filePath
};
