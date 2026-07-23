const mongoose = require('mongoose');

// Schema สำหรับเก็บเงินกองกลาง และ Log ประวัติการเบิก/ปรับเงิน
const gangTreasurySchema = new mongoose.Schema({
  balance: { type: Number, default: 0 }, // ยอดเงินกองกลางทั้งหมด
  logs: [{
    action: { type: String, enum: ['withdraw', 'deposit', 'manual_adjust'] }, // ประเภทรายการ
    performedBy: { type: String, required: true }, // ชื่อผู้ดำเนินการ (Leader/Officer/Member)
    amount: { type: Number, required: true },
    reason: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
  }]
});

module.exports = mongoose.model('GangTreasury', gangTreasurySchema);