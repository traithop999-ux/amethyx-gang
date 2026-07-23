require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db/sqlite');
const User = require('./models/User');
const GangTreasury = require('./models/GangTreasury');

const app = express();

app.set('trust proxy', 1);

// ฟังก์ชันสำหรับดึงหรือสร้างกระเป๋าเงินแก๊ง (ถ้ายังไม่มี)
async function getOrCreateTreasury() {
  let treasury = await GangTreasury.findOne({});
  if (!treasury) {
    treasury = await GangTreasury.create({ balance: 0, logs: [] });
  }
  return treasury;
}

// SQLite Database connection is initialized in ./db/sqlite.js

// View Engine & Middleware
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'amethyx-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// Passport Strategy setup
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_CALLBACK_URL || 'https://amethyx-gang.onrender.com/auth/discord/callback',
  scope: ['identify']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ discordId: profile.id });
    if (!user) {
      user = await User.create({
        discordId: profile.id,
        username: profile.username,
        avatar: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png',
        displayName: profile.username
      });
    }
    return done(null, user);
  } catch (err) {
    return done(err, null);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

app.use(passport.initialize());
app.use(passport.session());

// 1. ตรวจสอบและสร้างโฟลเดอร์ public/uploads อัตโนมัติถ้ายังไม่มี
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 2. ตั้งค่า Multer สำหรับเก็บรูปภาพ
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'slip-' + req.user.id + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ storage: storage });

// เสิร์ฟโฟลเดอร์ static เพื่อให้ดึงรูปมาแสดงบนเว็บได้
app.use('/uploads', express.static(uploadDir));

// เสิร์ฟไฟล์ static ใน `public` ทั้งหมด (เช่น css, js, images)
app.use(express.static(path.join(__dirname, 'public')));
// สำรองแบบ relative path เพื่อความเข้ากันได้กับสภาพแวดล้อมบางแบบ
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/members');
  }
  res.render('index');
});

app.get('/members', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/');
  }

  try {
    let members = await User.find({}) || [];
    const roleOrder = { 'Leader': 1, 'Officer': 2, 'Member': 3 };

    members.sort((a, b) => {
      const orderA = roleOrder[a.role || 'Member'] || 3;
      const orderB = roleOrder[b.role || 'Member'] || 3;
      if (orderA !== orderB) return orderA - orderB;

      const nameA = String(a.displayName || a.firstName || a.username || '').toLowerCase();
      const nameB = String(b.displayName || b.firstName || b.username || '').toLowerCase();
      return nameA.localeCompare(nameB, 'th');
    });

    res.render('members', { user: req.user, members });
  } catch (err) {
    console.error(err);
    res.render('members', { user: req.user, members: [] });
  }
});

app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback', passport.authenticate('discord', {
  failureRedirect: '/'
}), (req, res) => {
  res.redirect('/members');
});

// Profile Page
app.get('/profile', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');
  res.render('profile', { user: req.user });
});

// Update Profile Action
app.post('/profile/update', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');
  
  const { displayName, firstName, lastName, phone, relationship, role, customAvatarUrl } = req.body;
  
  await User.findByIdAndUpdate(req.user.id, {
    displayName,
    firstName,
    lastName,
    phone,
    relationship,
    role: role || 'Member',
    customAvatarUrl
  });

  res.redirect('/members');
});

// หน้าเงินแก๊งและตรวจสลิป
app.get('/gang-money', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');

  try {
    const isOfficerOrLeader = ['Leader', 'Officer'].includes(req.user.role);
    let allSubmissions = [];

    if (isOfficerOrLeader) {
      const docs = await User.find({}).sort({ 'gangMoney.updatedAt': -1 });

      // แปลงวันที่เป็น รูปแบบไทย (วัน/เดือน/ปี พ.ศ. เวลา)
      allSubmissions = docs.map(doc => {
        const m = doc.toObject();
        if (m.gangMoney && m.gangMoney.updatedAt) {
          const dateObj = new Date(m.gangMoney.updatedAt);
          m.gangMoney.formattedDate = dateObj.toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Bangkok'
          });
        } else {
          m.gangMoney = { ...(m.gangMoney || {}), formattedDate: '-' };
        }
        return m;
      });
    }

    res.render('gang-money', {
      user: req.user,
      isOfficerOrLeader,
      allSubmissions
    });
  } catch (err) {
    console.error(err);
    res.redirect('/members');
  }
});

app.post('/gang-money/upload', upload.single('slipImage'), async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');

  try {
    if (!req.file) {
      return res.redirect('/gang-money?error=nofile');
    }

    const amount = req.body.amount ? parseFloat(req.body.amount) : 0;
    const slipPath = `/uploads/${req.file.filename}`;

    await User.findByIdAndUpdate(req.user.id, {
      'gangMoney.status': 'pending',
      'gangMoney.slipUrl': slipPath,
      'gangMoney.amount': amount,
      'gangMoney.updatedAt': new Date()
    });

    res.redirect('/gang-money?success=uploaded');
  } catch (err) {
    console.error('Error uploading gang money slip:', err);
    res.redirect('/gang-money');
  }
});

app.post('/gang-money/verify/:id', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');
  if (!['Leader', 'Officer'].includes(req.user.role)) return res.status(403).send('ไม่มีสิทธิ์');

  try {
    const { status } = req.body;
    const targetUser = await User.findById(req.params.id);

    if (targetUser) {
      const oldStatus = targetUser.gangMoney?.status;
      const amount = targetUser.gangMoney?.amount || 0;

      if (status === 'approved' && oldStatus !== 'approved' && amount > 0) {
        const treasury = await getOrCreateTreasury();
        treasury.balance += amount;
        treasury.logs.push({
          action: 'deposit',
          performedBy: `${targetUser.displayName || targetUser.username} (ผ่านการอนุมัติโดย ${req.user.displayName || req.user.username})`,
          amount: amount,
          reason: 'ส่งเงินแก๊งรายสัปดาห์'
        });
        await treasury.save();
      }

      targetUser.gangMoney.status = status;
      await targetUser.save();
    }

    res.redirect('/gang-money');
  } catch (err) {
    console.error(err);
    res.redirect('/gang-money');
  }
});

app.get('/gang-treasury', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');

  try {
    const isOfficerOrLeader = ['Leader', 'Officer'].includes(req.user.role);
    const treasury = await getOrCreateTreasury();

    const formattedLogs = treasury.logs.map(log => {
      const l = log.toObject();
      l.formattedDate = new Date(l.createdAt).toLocaleDateString('th-TH', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok'
      });
      return l;
    }).reverse();

    res.render('gang-treasury', {
      user: req.user,
      isOfficerOrLeader,
      balance: treasury.balance,
      logs: formattedLogs
    });
  } catch (err) {
    console.error(err);
    res.redirect('/members');
  }
});

app.post('/gang-treasury/withdraw', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');
  if (!['Leader', 'Officer'].includes(req.user.role)) {
    return res.status(403).send('เฉพาะ Leader หรือ Officer เท่านั้นที่สามารถเบิกเงินได้');
  }

  try {
    const { reason, amount } = req.body;
    const withdrawAmount = parseFloat(amount);

    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      return res.redirect('/gang-treasury?error=invalid_amount');
    }

    const treasury = await getOrCreateTreasury();

    if (treasury.balance < withdrawAmount) {
      return res.redirect('/gang-treasury?error=insufficient_balance');
    }

    treasury.balance -= withdrawAmount;
    treasury.logs.push({
      action: 'withdraw',
      performedBy: req.user.displayName || req.user.username,
      amount: withdrawAmount,
      reason: reason || 'เบิกเงินกองกลาง'
    });

    await treasury.save();
    res.redirect('/gang-treasury');
  } catch (err) {
    console.error(err);
    res.redirect('/gang-treasury');
  }
});

app.post('/gang-treasury/adjust', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');
  if (!['Leader', 'Officer'].includes(req.user.role)) return res.status(403).send('ไม่มีสิทธิ์');

  try {
    const { type, amount, reason } = req.body;
    const adjustAmount = parseFloat(amount);

    if (!isNaN(adjustAmount) && adjustAmount > 0) {
      const treasury = await getOrCreateTreasury();

      if (type === 'add') {
        treasury.balance += adjustAmount;
        treasury.logs.push({
          action: 'manual_adjust',
          performedBy: req.user.displayName || req.user.username,
          amount: adjustAmount,
          reason: `[ปรับเพิ่ม] ${reason || 'ปรับสมดุลบัญชี'}`
        });
      } else if (type === 'subtract') {
        treasury.balance = Math.max(0, treasury.balance - adjustAmount);
        treasury.logs.push({
          action: 'manual_adjust',
          performedBy: req.user.displayName || req.user.username,
          amount: -adjustAmount,
          reason: `[ปรับลด] ${reason || 'ปรับสมดุลบัญชี'}`
        });
      }

      await treasury.save();
    }

    res.redirect('/gang-treasury');
  } catch (err) {
    console.error(err);
    res.redirect('/gang-treasury');
  }
});

// 4. Leader / Officer กดรีเซ็ตสถานะสมาชิกทุกคน (Reset All)
app.post('/gang-money/reset-all', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');

  if (!['Leader', 'Officer'].includes(req.user.role)) {
    return res.status(403).send('ไม่มีสิทธิ์ดำเนินการ');
  }

  try {
    await User.updateMany({}, {
      $set: {
        'gangMoney.status': 'not_submitted',
        'gangMoney.slipUrl': '',
        'gangMoney.amount': 0,
        'gangMoney.updatedAt': new Date()
      }
    });

    res.redirect('/gang-money?success=reset');
  } catch (err) {
    console.error('Error resetting gang money status:', err);
    res.redirect('/gang-money');
  }
});

// 5. Leader / Officer กดลบประวัติการส่งเงินทั้งหมด
app.post('/gang-money/delete-history', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');

  if (!['Leader', 'Officer'].includes(req.user.role)) {
    return res.status(403).send('ไม่มีสิทธิ์ดำเนินการ');
  }

  try {
    const users = await User.find({ 'gangMoney.slipUrl': { $ne: '' } });
    users.forEach(u => {
      if (u.gangMoney?.slipUrl) {
        const filePath = path.join(__dirname, 'public', u.gangMoney.slipUrl);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    });

    await User.updateMany({}, {
      $set: {
        'gangMoney.status': 'not_submitted',
        'gangMoney.slipUrl': '',
        'gangMoney.amount': 0,
        'gangMoney.updatedAt': null
      }
    });

    res.redirect('/gang-money?success=cleared');
  } catch (err) {
    console.error('Error deleting gang money history:', err);
    res.redirect('/gang-money');
  }
});

// 1. หน้าลาแก๊ง (GET)
app.get('/leave', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');

  try {
    const isOfficerOrLeader = ['Leader', 'Officer'].includes(req.user.role);
    const members = await User.find({});
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let todayLeavingCount = 0;
    
    members.forEach(m => {
      if (m.leaveInfo && m.leaveInfo.startDate && m.leaveInfo.endDate) {
        const start = new Date(m.leaveInfo.startDate);
        const end = new Date(m.leaveInfo.endDate);
        start.setHours(0,0,0,0);
        end.setHours(23,59,59,999);

        if (today >= start && today <= end) {
          m.leaveInfo.isLeavingToday = true;
          todayLeavingCount++;
        } else {
          m.leaveInfo.isLeavingToday = false;
        }
      }
    });

    res.render('leave', {
      user: req.user,
      members,
      todayLeavingCount,
      isOfficerOrLeader
    });
  } catch (err) {
    console.error(err);
    res.redirect('/members');
  }
});

// 2. ยื่นเรื่องลาแก๊ง (POST)
app.post('/leave/submit', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');

  try {
    const { reason, startDate, endDate } = req.body;

    await User.findByIdAndUpdate(req.user.id, {
      $set: {
        'leaveInfo.reason': reason,
        'leaveInfo.startDate': new Date(startDate),
        'leaveInfo.endDate': new Date(endDate),
        'leaveInfo.isLeaving': true
      },
      $inc: { 'leaveInfo.leaveCount': 1 }
    });

    res.redirect('/leave');
  } catch (err) {
    console.error(err);
    res.redirect('/leave');
  }
});

// 3. ปุ่มรีเซ็ตจำนวนครั้งที่ลา (สำหรับ Leader / Officer)
app.post('/leave/reset-count', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');

  if (!['Leader', 'Officer'].includes(req.user.role)) {
    return res.status(403).send('ไม่มีสิทธิ์ดำเนินการ');
  }

  try {
    await User.updateMany({}, {
      $set: {
        'leaveInfo.leaveCount': 0,
        'leaveInfo.reason': '',
        'leaveInfo.startDate': null,
        'leaveInfo.endDate': null,
        'leaveInfo.isLeaving': false
      }
    });

    res.redirect('/leave');
  } catch (err) {
    console.error(err);
    res.redirect('/leave');
  }
});

app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
});