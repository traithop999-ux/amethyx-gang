const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'database.json');
const backupFilePath = path.join(__dirname, '..', 'database.backup.json');
const defaultData = {
  users: [],
  treasury: {
    id: 'main',
    balance: 0,
    logs: []
  }
};

function writeJsonFile(targetPath, data) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(data, null, 2) + '\n');
}

function createDefaultData() {
  return structuredClone(defaultData);
}

function ensureDatabaseFile() {
  if (!fs.existsSync(filePath)) {
    if (fs.existsSync(backupFilePath)) {
      const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
      writeJsonFile(filePath, backupData);
      return backupData;
    }

    const seed = createDefaultData();
    writeJsonFile(filePath, seed);
    writeJsonFile(backupFilePath, seed);
    return structuredClone(seed);
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);

    if (!Array.isArray(data.users)) data.users = [];
    if (!data.treasury || !data.treasury.id) {
      data.treasury = { ...defaultData.treasury, ...(data.treasury || {}) };
    }
    if (!Array.isArray(data.treasury.logs)) data.treasury.logs = [];

    writeJsonFile(filePath, data);
    writeJsonFile(backupFilePath, data);
    return data;
  } catch (err) {
    if (fs.existsSync(backupFilePath)) {
      const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
      writeJsonFile(filePath, backupData);
      return backupData;
    }

    const seed = createDefaultData();
    writeJsonFile(filePath, seed);
    writeJsonFile(backupFilePath, seed);
    return structuredClone(seed);
  }
}

function readDatabase() {
  return ensureDatabaseFile();
}

function writeDatabase(data) {
  writeJsonFile(filePath, data);
  writeJsonFile(backupFilePath, data);
}

module.exports = {
  ensureDatabaseFile,
  readDatabase,
  writeDatabase,
  filePath,
  backupFilePath
};
