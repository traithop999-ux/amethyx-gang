const db = require('../db/sqlite');

function normalizeUserRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    discordId: row.discordId,
    username: row.username,
    avatar: row.avatar,
    displayName: row.displayName,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    relationship: row.relationship || 'โสด',
    role: row.role || 'Member',
    customAvatarUrl: row.customAvatarUrl,
    gangMoney: {
      status: row.gangMoney_status || 'not_submitted',
      slipUrl: row.gangMoney_slipUrl || '',
      amount: Number(row.gangMoney_amount || 0),
      updatedAt: row.gangMoney_updatedAt ? new Date(row.gangMoney_updatedAt) : null
    },
    leaveInfo: {
      reason: row.leaveInfo_reason || '',
      startDate: row.leaveInfo_startDate ? new Date(row.leaveInfo_startDate) : null,
      endDate: row.leaveInfo_endDate ? new Date(row.leaveInfo_endDate) : null,
      leaveCount: Number(row.leaveInfo_leaveCount || 0),
      isLeaving: Boolean(row.leaveInfo_isLeaving)
    }
  };
}

function normalizeKey(key) {
  const map = {
    'gangMoney.status': 'gangMoney_status',
    'gangMoney.slipUrl': 'gangMoney_slipUrl',
    'gangMoney.amount': 'gangMoney_amount',
    'gangMoney.updatedAt': 'gangMoney_updatedAt',
    'leaveInfo.reason': 'leaveInfo_reason',
    'leaveInfo.startDate': 'leaveInfo_startDate',
    'leaveInfo.endDate': 'leaveInfo_endDate',
    'leaveInfo.leaveCount': 'leaveInfo_leaveCount',
    'leaveInfo.isLeaving': 'leaveInfo_isLeaving'
  };

  return map[key] || key;
}

function buildUserInsert(data) {
  const now = new Date().toISOString();
  const id = data.id || data.discordId || data._id || `user-${Date.now()}`;
  const row = {
    id,
    discordId: data.discordId || id,
    username: data.username || '',
    avatar: data.avatar || '',
    displayName: data.displayName || data.username || '',
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    phone: data.phone || '',
    relationship: data.relationship || 'โสด',
    role: data.role || 'Member',
    customAvatarUrl: data.customAvatarUrl || '',
    gangMoney_status: (data.gangMoney && data.gangMoney.status) || 'not_submitted',
    gangMoney_slipUrl: (data.gangMoney && data.gangMoney.slipUrl) || '',
    gangMoney_amount: Number((data.gangMoney && data.gangMoney.amount) || 0),
    gangMoney_updatedAt: (data.gangMoney && data.gangMoney.updatedAt) ? new Date(data.gangMoney.updatedAt).toISOString() : now,
    leaveInfo_reason: (data.leaveInfo && data.leaveInfo.reason) || '',
    leaveInfo_startDate: (data.leaveInfo && data.leaveInfo.startDate) ? new Date(data.leaveInfo.startDate).toISOString() : null,
    leaveInfo_endDate: (data.leaveInfo && data.leaveInfo.endDate) ? new Date(data.leaveInfo.endDate).toISOString() : null,
    leaveInfo_leaveCount: Number((data.leaveInfo && data.leaveInfo.leaveCount) || 0),
    leaveInfo_isLeaving: Boolean(data.leaveInfo && data.leaveInfo.isLeaving),
    createdAt: now,
    updatedAt: now
  };

  return row;
}

async function findOne(query = {}) {
  const [[key, value]] = Object.entries(query);
  if (!key) return null;

  const normalizedKey = normalizeKey(key);
  const row = await db.get_async(`SELECT * FROM users WHERE ${normalizedKey} = ?`, [value]);
  return normalizeUserRow(row);
}

async function find(filter = {}) {
  const rows = await db.all_async('SELECT * FROM users ORDER BY displayName COLLATE NOCASE');
  return rows.map(normalizeUserRow);
}

async function findById(id) {
  const row = await db.get_async('SELECT * FROM users WHERE id = ?', [id]);
  return normalizeUserRow(row);
}

async function findByIdAndUpdate(id, update) {
  const current = await findById(id);
  if (!current) return null;

  const setColumns = [];
  const values = [];

  const assign = update.$set || update;
  for (const [key, value] of Object.entries(assign)) {
    if (key === '$inc') continue;
    const normalized = normalizeKey(key);
    if (normalized === 'id') continue;

    setColumns.push(`${normalized} = ?`);
    values.push(value instanceof Date ? value.toISOString() : value);
  }

  if (update.$inc) {
    for (const [key, value] of Object.entries(update.$inc)) {
      const normalized = normalizeKey(key);
      setColumns.push(`${normalized} = COALESCE(${normalized}, 0) + ?`);
      values.push(Number(value) || 0);
    }
  }

  if (setColumns.length > 0) {
    values.push(new Date().toISOString());
    values.push(id);
    await db.run_async(`UPDATE users SET ${setColumns.join(', ')}, updatedAt = ? WHERE id = ?`, values);
  }

  return findById(id);
}

async function create(data) {
  const row = buildUserInsert(data);
  await db.run_async(`INSERT INTO users (
    id, discordId, username, avatar, displayName, firstName, lastName, phone, relationship,
    role, customAvatarUrl, gangMoney_status, gangMoney_slipUrl, gangMoney_amount,
    gangMoney_updatedAt, leaveInfo_reason, leaveInfo_startDate, leaveInfo_endDate,
    leaveInfo_leaveCount, leaveInfo_isLeaving, createdAt, updatedAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    row.id, row.discordId, row.username, row.avatar, row.displayName, row.firstName, row.lastName, row.phone, row.relationship,
    row.role, row.customAvatarUrl, row.gangMoney_status, row.gangMoney_slipUrl, row.gangMoney_amount,
    row.gangMoney_updatedAt, row.leaveInfo_reason, row.leaveInfo_startDate, row.leaveInfo_endDate,
    row.leaveInfo_leaveCount, row.leaveInfo_isLeaving ? 1 : 0, row.createdAt, row.updatedAt
  ]);

  return findById(row.id);
}

async function updateMany(filter = {}, update = {}) {
  const assign = update.$set || update;
  const setColumns = [];
  const values = [];

  for (const [key, value] of Object.entries(assign)) {
    const normalized = normalizeKey(key);
    setColumns.push(`${normalized} = ?`);
    values.push(value instanceof Date ? value.toISOString() : value);
  }

  if (setColumns.length > 0) {
    values.push(new Date().toISOString());
    await db.run_async(`UPDATE users SET ${setColumns.join(', ')}, updatedAt = ?`, values);
  }
}

module.exports = {
  findOne,
  find,
  findById,
  findByIdAndUpdate,
  create,
  updateMany
};