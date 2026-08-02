const { readDatabase, writeDatabase, writeTreasuryDoc } = require('../db');

function toIsoString(value) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }
  return new Date(value).toISOString();
}

function normalizeTreasuryRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    balance: Number(row.balance || 0),
    logs: Array.isArray(row.logs) ? row.logs.map(log => ({
      ...log,
      amount: Number(log.amount || 0),
      createdAt: toIsoString(log.createdAt)
    })) : [],
    uploadLogs: Array.isArray(row.uploadLogs) ? row.uploadLogs.map(log => ({
      ...log,
      amount: Number(log.amount || 0),
      createdAt: toIsoString(log.createdAt)
    })) : [],
    async save() {
      const treasuryUpdate = {
        id: this.id,
        balance: Number(this.balance || 0),
        logs: Array.isArray(this.logs) ? this.logs.map(log => ({
          ...log,
          amount: Number(log.amount || 0),
          createdAt: toIsoString(log.createdAt)
        })) : [],
        uploadLogs: Array.isArray(this.uploadLogs) ? this.uploadLogs.map(log => ({
          ...log,
          amount: Number(log.amount || 0),
          createdAt: toIsoString(log.createdAt)
        })) : []
      };
      await writeTreasuryDoc(treasuryUpdate);
      return this;
    }
  };
}

async function findOne(query = {}) {
  const data = await readDatabase();
  const treasury = data.treasury || { id: 'main', balance: 0, logs: [] };
  return normalizeTreasuryRow(treasury);
}

async function create(data = {}) {
  const dataSet = await readDatabase();
  dataSet.treasury = {
    id: data.id || 'main',
    balance: Number(data.balance || 0),
    logs: Array.isArray(data.logs) ? data.logs : [],
    uploadLogs: Array.isArray(data.uploadLogs) ? data.uploadLogs : []
  };
  await writeDatabase(dataSet);
  return normalizeTreasuryRow(dataSet.treasury);
}

module.exports = {
  findOne,
  create
};