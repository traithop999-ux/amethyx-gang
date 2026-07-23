const db = require('../db/sqlite');

function normalizeTreasuryRow(row, logs = []) {
  if (!row) return null;

  return {
    id: row.id,
    balance: Number(row.balance || 0),
    logs: logs.map(log => ({
      ...log,
      amount: Number(log.amount || 0),
      createdAt: log.createdAt ? new Date(log.createdAt) : new Date()
    })),
    async save() {
      const now = new Date().toISOString();
      await db.run_async('UPDATE treasury SET balance = ?, updatedAt = ? WHERE id = ?', [this.balance, now, this.id]);
      await db.run_async('DELETE FROM logs WHERE treasuryId = ?', [this.id]);

      for (const log of this.logs || []) {
        await db.run_async(
          'INSERT INTO logs (action, performedBy, amount, reason, treasuryId, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
          [log.action, log.performedBy, Number(log.amount || 0), log.reason || '', this.id, (log.createdAt || new Date()).toISOString()]
        );
      }

      return this;
    }
  };
}

async function findOne(query = {}) {
  const row = await db.get_async('SELECT * FROM treasury WHERE id = ?', ['main']);
  if (!row) return null;

  const logs = await db.all_async('SELECT * FROM logs WHERE treasuryId = ? ORDER BY createdAt DESC', ['main']);
  return normalizeTreasuryRow(row, logs);
}

async function create(data = {}) {
  const id = data.id || 'main';
  const balance = Number(data.balance || 0);
  await db.run_async('INSERT OR IGNORE INTO treasury (id, balance, createdAt, updatedAt) VALUES (?, ?, ?, ?)', [id, balance, new Date().toISOString(), new Date().toISOString()]);

  const logs = Array.isArray(data.logs) ? data.logs : [];
  for (const log of logs) {
    await db.run_async(
      'INSERT INTO logs (action, performedBy, amount, reason, treasuryId, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [log.action, log.performedBy, Number(log.amount || 0), log.reason || '', id, (log.createdAt || new Date()).toISOString()]
    );
  }

  const row = await db.get_async('SELECT * FROM treasury WHERE id = ?', [id]);
  const rows = await db.all_async('SELECT * FROM logs WHERE treasuryId = ? ORDER BY createdAt DESC', [id]);
  return normalizeTreasuryRow(row, rows);
}

module.exports = {
  findOne,
  create
};