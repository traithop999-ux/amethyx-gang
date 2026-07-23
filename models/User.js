const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  username: String,
  avatar: String,
  // ข้อมูลที่ให้กรอกเพิ่ม
  displayName: String,
  firstName: String,
  lastName: String,
  phone: String,
  relationship: { type: String, enum: ['โสด', 'มีแฟนแล้ว'], default: 'โสด' },
  // เพิ่มฟิลด์ตำแหน่งตรงนี้
  role: { type: String, enum: ['Member', 'Leader', 'Officer'], default: 'Member' },
  gangMoney: {
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'not_submitted'],
      default: 'not_submitted'
    },
    slipUrl: { type: String, default: '' },
    amount: { type: Number, default: 0 },
    updatedAt: { type: Date }
  },
  // เพิ่ม Field ลาแก๊งใน User Schema
  leaveInfo: {
    reason: { type: String, default: '' },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    leaveCount: { type: Number, default: 0 },
    isLeaving: { type: Boolean, default: false }
  },
  customAvatarUrl: String
});

module.exports = mongoose.model('User', userSchema);