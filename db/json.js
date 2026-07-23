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
    return structuredClone(defaultData);
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);

    if (!Array.isArray(data.users)) data.users = [];
    if (!data.treasury || !data.treasury.id) {
      data.treasury = { ...defaultData.treasury, ...(data.treasury || {}) };
    }
    if (!Array.isArray(data.treasury.logs)) data.treasury.logs = [];

    writeDatabase(data);
    return data;
  } catch (err) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    return structuredClone(defaultData);
  }
}

function readDatabase() {
  return ensureDatabaseFile();
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
