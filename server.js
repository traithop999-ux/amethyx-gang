require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const multer = require('multer');
const path = require('path');
const db = require('./db');
const FirestoreSessionStore = require('./db/firestoreSessionStore');
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

function toBangkokDateString(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

// View Engine & Middleware
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
const sessionStore = new FirestoreSessionStore({ collection: 'sessions', ttl: 86400 });
app.use(session({
  secret: process.env.SESSION_SECRET || 'amethyx-session-secret',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  rolling: true,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'iso1120111@iso.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Love12811243.';

function ensureAdminAuth(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect('/admin/login');
}

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

passport.serializeUser((user, done) => done(null, String(user.id)));
passport.deserializeUser(async (id, done) => {
  const user = await User.findById(String(id));
  if (!user) return done(null, false);
  return done(null, user);
});

app.use(passport.initialize());
app.use(passport.session());

// ตั้งค่า Multer สำหรับเก็บรูปภาพในหน่วยความจำ เพื่ออัพโหลดไปยัง Firebase Storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// เสิร์ฟไฟล์ static ใน `public` ทั้งหมด (เช่น css, js, images)
app.use(express.static(path.join(__dirname, 'public')));
// สำรองแบบ relative path เพื่อความเข้ากันได้กับสภาพแวดล้อมบางแบบ
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
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

app.get('/auth/discord', passport.authenticate('discord', {
  scope: ['identify']
}));

app.get('/auth/discord/callback', (req, res, next) => {
  passport.authenticate('discord', (err, user, info) => {
    if (err) {
      console.error('Discord callback error:', err);
      return res.status(500).send(`Discord callback error: ${err.message || err}`);
    }
    if (!user) {
      console.error('Discord callback failed, no user:', info);
      return res.redirect('/?error=discord');
    }
    req.logIn(user, loginErr => {
      if (loginErr) {
        console.error('Discord login error:', loginErr);
        return res.status(500).send(`Login failure: ${loginErr.message || loginErr}`);
      }
      return res.redirect('/profile');
    });
  })(req, res, next);
});

// Profile Page
app.get('/profile', (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');
  res.render('profile', { user: req.user });
});

app.get('/admin/login', (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect('/admin');
  res.render('admin-login', { error: req.query.error });
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    req.session.adminUser = username;
    return res.redirect('/admin');
  }

  return res.redirect('/admin/login?error=invalid');
});

app.get('/admin/logout', ensureAdminAuth, (req, res) => {
  req.session.isAdmin = false;
  delete req.session.adminUser;
  res.redirect('/admin/login');
});

app.get('/admin', ensureAdminAuth, async (req, res) => {
  try {
    const members = await User.find({});
    const treasury = await getOrCreateTreasury();
    const pendingCount = members.filter(m => m.gangMoney?.status === 'pending').length;
    const approvedCount = members.filter(m => m.gangMoney?.status === 'approved').length;

    res.render('admin', {
      user: req.user,
      adminUser: req.session.adminUser,
      members,
      treasury,
      pendingCount,
      approvedCount
    });
  } catch (err) {
    console.error('Admin page error:', err);
    res.status(500).send('ไม่สามารถโหลดหน้า Admin ได้');
  }
});

app.post('/admin/user/:id/update-role', ensureAdminAuth, async (req, res) => {
  const { role } = req.body;
  if (!['Member', 'Officer', 'Leader'].includes(role)) {
    return res.redirect('/admin');
  }

  await User.findByIdAndUpdate(req.params.id, { role });
  res.redirect('/admin');
});

app.post('/admin/user/:id/delete', ensureAdminAuth, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (targetUser?.gangMoney?.slipStoragePath) {
      await db.deleteFile(targetUser.gangMoney.slipStoragePath);
    }
    await User.deleteById(req.params.id);
  } catch (err) {
    console.error('Admin delete user error:', err);
  }
  res.redirect('/admin');
});

app.post('/admin/treasury/clear-logs', ensureAdminAuth, async (req, res) => {
  try {
    const treasury = await getOrCreateTreasury();
    treasury.logs = [];
    await treasury.save();
  } catch (err) {
    console.error('Admin clear treasury logs error:', err);
  }
  res.redirect('/admin');
});

app.post('/admin/users/reset-submissions', ensureAdminAuth, async (req, res) => {
  try {
    await User.updateMany({}, {
      $set: {
        'gangMoney.status': 'not_submitted',
        'gangMoney.slipUrl': '',
        'gangMoney.amount': 0,
        'gangMoney.updatedAt': null,
        'gangMoney.slipStoragePath': ''
      }
    });
  } catch (err) {
    console.error('Admin reset submissions error:', err);
  }
  res.redirect('/admin');
});

// Update Profile Action
app.post('/profile/update', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');

  const { displayName, firstName, lastName, phone, relationship, customAvatarUrl } = req.body;

  await User.findByIdAndUpdate(req.user.id, {
    displayName,
    firstName,
    lastName,
    phone,
    relationship,
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
      const docs = await User.find({});
      allSubmissions = docs
        .sort((a, b) => {
          const dateA = a.gangMoney?.updatedAt ? new Date(a.gangMoney.updatedAt).getTime() : 0;
          const dateB = b.gangMoney?.updatedAt ? new Date(b.gangMoney.updatedAt).getTime() : 0;
          return dateB - dateA;
        })
        .map(doc => {
          const m = { ...doc };
          if (m.gangMoney && m.gangMoney.updatedAt) {
            const dateObj = new Date(m.gangMoney.updatedAt);
            m.gangMoney = {
              ...m.gangMoney,
              formattedDate: dateObj.toLocaleDateString('th-TH', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Bangkok'
              })
            };
          } else {
            m.gangMoney = { ...(m.gangMoney || {}), formattedDate: '-' };
          }
          return m;
        });
    } else {
      const m = { ...req.user };
      if (m.gangMoney && m.gangMoney.updatedAt) {
        const dateObj = new Date(m.gangMoney.updatedAt);
        m.gangMoney = {
          ...m.gangMoney,
          formattedDate: dateObj.toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Bangkok'
          })
        };
      } else {
        m.gangMoney = { ...(m.gangMoney || {}), formattedDate: '-' };
      }
      allSubmissions = [m];
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
    if (!amount || amount <= 0) {
      return res.redirect('/gang-money?error=invalid_amount');
    }

    const originalName = path.basename(req.file.originalname || 'slip');
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `gang-slips/${req.user.id}/${Date.now()}-${safeName}`;

    const { publicUrl } = await db.uploadFile(req.file.buffer, storagePath, req.file.mimetype);

    await User.findByIdAndUpdate(req.user.id, {
      'gangMoney.status': 'approved',
      'gangMoney.slipUrl': publicUrl,
      'gangMoney.slipStoragePath': storagePath,
      'gangMoney.amount': amount,
      'gangMoney.updatedAt': new Date()
    });

    const treasury = await getOrCreateTreasury();
    treasury.balance += amount;
    treasury.logs.push({
      action: 'deposit',
      performedBy: `${req.user.displayName || req.user.username}`,
      amount: amount,
      reason: 'ฝากเงินแก๊งโดยตรง',
      createdAt: new Date().toISOString()
    });
    await treasury.save();

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
          reason: 'ส่งเงินแก๊งรายสัปดาห์',
          createdAt: new Date().toISOString()
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
      const l = { ...log };
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
      reason: reason || 'เบิกเงินกองกลาง',
      createdAt: new Date().toISOString()
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
          reason: `[ปรับเพิ่ม] ${reason || 'ปรับสมดุลบัญชี'}`,
          createdAt: new Date().toISOString()
        });
      } else if (type === 'subtract') {
        treasury.balance = Math.max(0, treasury.balance - adjustAmount);
        treasury.logs.push({
          action: 'manual_adjust',
          performedBy: req.user.displayName || req.user.username,
          amount: -adjustAmount,
          reason: `[ปรับลด] ${reason || 'ปรับสมดุลบัญชี'}`,
          createdAt: new Date().toISOString()
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
    for (const u of users) {
      if (u.gangMoney?.slipStoragePath) {
        await db.deleteFile(u.gangMoney.slipStoragePath);
      }
    }

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
    
    const todayInBangkok = toBangkokDateString(new Date());

    let todayLeavingCount = 0;
    
    members.forEach(m => {
      const leaveInfo = m.leaveInfo || {};
      const start = leaveInfo.startDate ? new Date(leaveInfo.startDate) : null;
      const end = leaveInfo.endDate ? new Date(leaveInfo.endDate) : null;
      const startDateInBangkok = start ? toBangkokDateString(start) : null;
      const endDateInBangkok = end ? toBangkokDateString(end) : null;

      const isLeavingToday = Boolean(
        startDateInBangkok &&
        endDateInBangkok &&
        todayInBangkok >= startDateInBangkok &&
        todayInBangkok <= endDateInBangkok
      );

      m.leaveInfo = {
        ...(leaveInfo || {}),
        isLeaving: isLeavingToday,
        isLeavingToday
      };

      if (isLeavingToday) {
        todayLeavingCount++;
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
        'leaveInfo.startDate': new Date(`${startDate}T00:00:00+07:00`),
        'leaveInfo.endDate': new Date(`${endDate}T23:59:59+07:00`),
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

app.use((err, req, res, next) => {
  console.error('Unhandled Express error:', err);
  res.status(500).send('Internal Server Error');
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
});