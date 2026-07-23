const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'database.json');

// ถ้ายังไม่มีไฟล์ database.json ให้สร้างไฟล์เปล่าขึ้นมา
if (!fs.existsSync(filePath)) {
  fs.writeFileSync(filePath, JSON.stringify({ users: [] }, null, 2));
}

// ฟังก์ชันอ่านข้อมูล
function readDB() {
  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
}

// ฟังก์ชันเขียนข้อมูล
function writeDB(data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

module.exports = { readDB, writeDB };