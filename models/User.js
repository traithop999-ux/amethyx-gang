const { readDatabase, writeDatabase, writeUserDoc, deleteUserDoc } = require('../db');

function normalizeUserRow(row) {
  if (!row) return null;

  const normalized = {
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
      status: row.gangMoney?.status || 'not_submitted',
      slipUrl: row.gangMoney?.slipUrl || '',
      slipStoragePath: row.gangMoney?.slipStoragePath || '',
      amount: Number(row.gangMoney?.amount || 0),
      updatedAt: row.gangMoney?.updatedAt ? new Date(row.gangMoney.updatedAt) : null
    },
    transferSlip: {
      imageData: row.transferSlip?.imageData || '',
      uploadedBy: row.transferSlip?.uploadedBy || '',
      uploadedAt: row.transferSlip?.uploadedAt ? new Date(row.transferSlip.uploadedAt) : null
    },
    leaveInfo: {
      reason: row.leaveInfo?.reason || '',
      startDate: row.leaveInfo?.startDate ? new Date(row.leaveInfo.startDate) : null,
      endDate: row.leaveInfo?.endDate ? new Date(row.leaveInfo.endDate) : null,
      leaveCount: Number(row.leaveInfo?.leaveCount || 0),
      isLeaving: Boolean(row.leaveInfo?.isLeaving)
    }
  };

  normalized.save = async function () {
      const data = await readDatabase();
      const userIndex = data.users.findIndex(user => user.id === String(this.id));
      if (userIndex === -1) return this;

      const recordToWrite = {
        ...data.users[userIndex],
        id: this.id,
        discordId: this.discordId,
        username: this.username,
        avatar: this.avatar,
        displayName: this.displayName,
        firstName: this.firstName,
        lastName: this.lastName,
        phone: this.phone,
        relationship: this.relationship || 'โสด',
        role: this.role || 'Member',
        customAvatarUrl: this.customAvatarUrl,
        gangMoney: {
          status: this.gangMoney?.status || 'not_submitted',
          slipUrl: this.gangMoney?.slipUrl || '',
          slipStoragePath: this.gangMoney?.slipStoragePath || '',
          amount: Number(this.gangMoney?.amount || 0),
          updatedAt: this.gangMoney?.updatedAt instanceof Date ? this.gangMoney.updatedAt.toISOString() : (this.gangMoney?.updatedAt || null)
        },
        transferSlip: {
          imageData: this.transferSlip?.imageData || '',
          uploadedBy: this.transferSlip?.uploadedBy || '',
          uploadedAt: this.transferSlip?.uploadedAt instanceof Date ? this.transferSlip.uploadedAt.toISOString() : (this.transferSlip?.uploadedAt || null)
        },
        leaveInfo: {
          reason: this.leaveInfo?.reason || '',
          startDate: this.leaveInfo?.startDate instanceof Date ? this.leaveInfo.startDate.toISOString() : (this.leaveInfo?.startDate || null),
          endDate: this.leaveInfo?.endDate instanceof Date ? this.leaveInfo.endDate.toISOString() : (this.leaveInfo?.endDate || null),
          leaveCount: Number(this.leaveInfo?.leaveCount || 0),
          isLeaving: Boolean(this.leaveInfo?.isLeaving)
        },
        createdAt: data.users[userIndex].createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      data.users[userIndex] = recordToWrite;
      await writeDatabase(data);
      return normalizeUserRow(recordToWrite);
    };
  return normalized;
}

function normalizeUpdatePayload(update) {
  const assign = update?.$set || update;
  const normalized = {};

  for (const [key, value] of Object.entries(assign || {})) {
    if (key === '$inc') continue;
    if (key === 'gangMoney.status') normalized.gangMoney = { ...(normalized.gangMoney || {}), status: value };
    else if (key === 'gangMoney.slipUrl') normalized.gangMoney = { ...(normalized.gangMoney || {}), slipUrl: value };
    else if (key === 'gangMoney.slipStoragePath') normalized.gangMoney = { ...(normalized.gangMoney || {}), slipStoragePath: value };
    else if (key === 'gangMoney.amount') normalized.gangMoney = { ...(normalized.gangMoney || {}), amount: value };
    else if (key === 'gangMoney.updatedAt') normalized.gangMoney = { ...(normalized.gangMoney || {}), updatedAt: value instanceof Date ? value.toISOString() : value };
    else if (key === 'transferSlip.imageData') normalized.transferSlip = { ...(normalized.transferSlip || {}), imageData: value };
    else if (key === 'transferSlip.uploadedBy') normalized.transferSlip = { ...(normalized.transferSlip || {}), uploadedBy: value };
    else if (key === 'transferSlip.uploadedAt') normalized.transferSlip = { ...(normalized.transferSlip || {}), uploadedAt: value instanceof Date ? value.toISOString() : value };
    else if (key === 'leaveInfo.reason') normalized.leaveInfo = { ...(normalized.leaveInfo || {}), reason: value };
    else if (key === 'leaveInfo.startDate') normalized.leaveInfo = { ...(normalized.leaveInfo || {}), startDate: value instanceof Date ? value.toISOString() : value };
    else if (key === 'leaveInfo.endDate') normalized.leaveInfo = { ...(normalized.leaveInfo || {}), endDate: value instanceof Date ? value.toISOString() : value };
    else if (key === 'leaveInfo.leaveCount') normalized.leaveInfo = { ...(normalized.leaveInfo || {}), leaveCount: value };
    else if (key === 'leaveInfo.isLeaving') normalized.leaveInfo = { ...(normalized.leaveInfo || {}), isLeaving: Boolean(value) };
    else normalized[key] = value;
  }

  return normalized;
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current && current[key], obj);
}

function matchesFilter(user, filter = {}) {
  if (!filter || Object.keys(filter).length === 0) return true;

  return Object.entries(filter).every(([key, value]) => {
    const fieldValue = getNestedValue(user, key);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('$ne' in value) return fieldValue !== value.$ne;
      if ('$eq' in value) return fieldValue === value.$eq;
      return false;
    }
    return fieldValue === value;
  });
}

function buildUserInsert(data) {
  const now = new Date().toISOString();
  const id = data.id || data.discordId || data._id || `user-${Date.now()}`;
  return {
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
    gangMoney: {
      status: (data.gangMoney && data.gangMoney.status) || 'not_submitted',
      slipUrl: (data.gangMoney && data.gangMoney.slipUrl) || '',
      slipStoragePath: (data.gangMoney && data.gangMoney.slipStoragePath) || '',
      amount: Number((data.gangMoney && data.gangMoney.amount) || 0),
      updatedAt: (data.gangMoney && data.gangMoney.updatedAt) ? new Date(data.gangMoney.updatedAt).toISOString() : now
    },
    transferSlip: {
      imageData: (data.transferSlip && data.transferSlip.imageData) || '',
      uploadedBy: (data.transferSlip && data.transferSlip.uploadedBy) || '',
      uploadedAt: (data.transferSlip && data.transferSlip.uploadedAt) ? new Date(data.transferSlip.uploadedAt).toISOString() : null
    },
    leaveInfo: {
      reason: (data.leaveInfo && data.leaveInfo.reason) || '',
      startDate: (data.leaveInfo && data.leaveInfo.startDate) ? new Date(data.leaveInfo.startDate).toISOString() : null,
      endDate: (data.leaveInfo && data.leaveInfo.endDate) ? new Date(data.leaveInfo.endDate).toISOString() : null,
      leaveCount: Number((data.leaveInfo && data.leaveInfo.leaveCount) || 0),
      isLeaving: Boolean(data.leaveInfo && data.leaveInfo.isLeaving)
    },
    createdAt: now,
    updatedAt: now
  };
}

async function findOne(query = {}) {
  const data = await readDatabase();
  const [[key, value]] = Object.entries(query);
  if (!key) return null;
  const row = data.users.find(user => user[key] === value);
  return normalizeUserRow(row);
}

async function find(filter = {}) {
  const data = await readDatabase();
  return data.users
    .filter(user => matchesFilter(user, filter))
    .sort((a, b) => String(a.displayName || a.username).localeCompare(String(b.displayName || b.username), 'th'))
    .map(normalizeUserRow);
}

async function findById(id) {
  const data = await readDatabase();
  const row = data.users.find(user => user.id === String(id));
  return normalizeUserRow(row);
}

async function findByIdAndUpdate(id, update) {
  const data = await readDatabase();
  const userIndex = data.users.findIndex(user => user.id === String(id));
  if (userIndex === -1) return null;

  const payload = normalizeUpdatePayload(update);
  if (Object.keys(payload).length > 0) {
    const currentUser = data.users[userIndex];
    data.users[userIndex] = {
      ...currentUser,
      ...payload,
      gangMoney: payload.gangMoney ? { ...(currentUser.gangMoney || {}), ...payload.gangMoney } : currentUser.gangMoney,
      leaveInfo: payload.leaveInfo ? { ...(currentUser.leaveInfo || {}), ...payload.leaveInfo } : currentUser.leaveInfo,
      updatedAt: new Date().toISOString()
    };
  }

  if (update?.$inc) {
    for (const [key, value] of Object.entries(update.$inc)) {
      if (key === 'leaveInfo.leaveCount') {
        const current = Number(data.users[userIndex].leaveInfo?.leaveCount || 0);
        data.users[userIndex].leaveInfo = {
          ...(data.users[userIndex].leaveInfo || {}),
          leaveCount: current + Number(value || 0)
        };
      }
    }
  }

    await writeUserDoc(data.users[userIndex]);
    return findById(id);
}

async function deleteById(id) {
  const user = await findById(id);
  if (!user) return null;
  await deleteUserDoc(id);
  return true;
}

async function create(data) {
  const dataSet = await readDatabase();
  const row = buildUserInsert(data);

  if (dataSet.users.some(user => user.discordId === row.discordId)) {
    return findById(row.id);
  }

  dataSet.users.push(row);
  await writeUserDoc(row);
  return findById(row.id);
}

async function updateMany(filter = {}, update = {}) {
  const data = await readDatabase();
  const payload = normalizeUpdatePayload(update);
  const incPayload = update?.$inc || {};

  for (let i = 0; i < data.users.length; i++) {
    const user = data.users[i];
    if (!matchesFilter(user, filter)) continue;

    if (Object.keys(payload).length > 0) {
      data.users[i] = {
        ...user,
        ...payload,
        gangMoney: payload.gangMoney ? { ...(user.gangMoney || {}), ...payload.gangMoney } : user.gangMoney,
        leaveInfo: payload.leaveInfo ? { ...(user.leaveInfo || {}), ...payload.leaveInfo } : user.leaveInfo,
        updatedAt: new Date().toISOString()
      };
    }

    if (incPayload['leaveInfo.leaveCount']) {
      data.users[i].leaveInfo = {
        ...(data.users[i].leaveInfo || {}),
        leaveCount: Number(data.users[i].leaveInfo?.leaveCount || 0) + Number(incPayload['leaveInfo.leaveCount'] || 0)
      };
    }
  }

  await writeDatabase(data);
}

module.exports = {
  findOne,
  find,
  findById,
  findByIdAndUpdate,
  deleteById,
  create,
  updateMany
};
