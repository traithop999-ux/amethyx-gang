const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// สร้างหรือเชื่อมต่อกับไฟล์ฐานข้อมูลชื่อว่า database.sqlite ในโฟลเดอร์โปรเจกต์
const dbPath = path.resolve(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Could not connect to SQLite database', err.message);
  } else {
    console.log('Connected to SQLite database successfully.');
  }
});

// Promisify db.run และ db.get เพื่อให้ใช้ async/await ได้
db.run_async = function(sql, params = []) {
  return new Promise((resolve, reject) => {
    this.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

db.get_async = function(sql, params = []) {
  return new Promise((resolve, reject) => {
    this.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

db.all_async = function(sql, params = []) {
  return new Promise((resolve, reject) => {
    this.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

// สร้างตาราง users
db.run(`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  discordId TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  avatar TEXT,
  displayName TEXT,
  firstName TEXT,
  lastName TEXT,
  phone TEXT,
  relationship TEXT,
  customAvatarUrl TEXT,
  role TEXT DEFAULT 'Member',
  gangMoney_status TEXT DEFAULT 'none',
  gangMoney_slipUrl TEXT,
  gangMoney_amount REAL DEFAULT 0,
  gangMoney_updatedAt TEXT,
  leaveInfo_isLeaving INTEGER DEFAULT 0,
  leaveInfo_startDate TEXT,
  leaveInfo_endDate TEXT,
  leaveInfo_reason TEXT,
  leaveInfo_leaveCount INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
  if (err) console.error('Error creating users table', err);
  else console.log('Users table ready');
});

// สร้างตาราง treasury (กระเป๋าเงินแก๊ง)
db.run(`CREATE TABLE IF NOT EXISTS treasury (
  id TEXT PRIMARY KEY,
  balance REAL DEFAULT 0,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
  if (err) console.error('Error creating treasury table', err);
  else console.log('Treasury table ready');
});

// สร้างตาราง logs (บันทึกการทำรายการเงิน)
db.run(`CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  performedBy TEXT NOT NULL,
  amount REAL NOT NULL,
  reason TEXT,
  treasuryId TEXT,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(treasuryId) REFERENCES treasury(id)
)`, (err) => {
  if (err) console.error('Error creating logs table', err);
  else console.log('Logs table ready');
});

// เตรียมตัวแปร treasury หลักถ้ายังไม่มี
const initializeDatabase = () => {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      discordId TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      avatar TEXT,
      displayName TEXT,
      firstName TEXT,
      lastName TEXT,
      phone TEXT,
      relationship TEXT,
      customAvatarUrl TEXT,
      role TEXT DEFAULT 'Member',
      gangMoney_status TEXT DEFAULT 'none',
      gangMoney_slipUrl TEXT,
      gangMoney_amount REAL DEFAULT 0,
      gangMoney_updatedAt TEXT,
      leaveInfo_isLeaving INTEGER DEFAULT 0,
      leaveInfo_startDate TEXT,
      leaveInfo_endDate TEXT,
      leaveInfo_reason TEXT,
      leaveInfo_leaveCount INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS treasury (
      id TEXT PRIMARY KEY,
      balance REAL DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      performedBy TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT,
      treasuryId TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(treasuryId) REFERENCES treasury(id)
    )`);

    db.run(`INSERT OR IGNORE INTO treasury (id, balance) VALUES ('main', 0)`, (err) => {
      if (err) console.error('Error initializing treasury', err);
      else console.log('Treasury initialized');
    });
  });
};

initializeDatabase();

module.exports = db;
