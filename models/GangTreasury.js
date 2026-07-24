const { readDatabase, writeDatabase } = require('../db');

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
    async save() {
      const data = await readDatabase();
      data.treasury = {
        ...data.treasury,
        id: this.id,
        balance: Number(this.balance || 0),
        logs: Array.isArray(this.logs) ? this.logs.map(log => ({
          ...log,
          amount: Number(log.amount || 0),
          createdAt: toIsoString(log.createdAt)
        })) : []
      };
      await writeDatabase(data);
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
    logs: Array.isArray(data.logs) ? data.logs : []
  };
  await writeDatabase(dataSet);
  return normalizeTreasuryRow(dataSet.treasury);
}

module.exports = {
  findOne,
  create
};