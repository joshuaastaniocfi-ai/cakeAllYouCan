require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const connectDB = require('./config/db');
const PaymentCode = require('./models/PaymentCode');
const IssuedCoupon = require('./models/IssuedCoupon');
const PaymentVerification = require('./models/PaymentVerification');
const { generateCouponImage } = require('./services/couponGenerator');
const { sendCouponEmail } = require('./services/mailer');
const seedDatabase = require('./seed');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing JSON & URL-encoded request bodies (supports base64 image receipts)
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ limit: '30mb', extended: true }));

// Connect to MongoDB & ensure seed codes exist
connectDB().then(() => {
  seedDatabase();
});

// Serve static files from root (Assets folder, uploads, images, etc.)
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Ping & Health Heartbeat (Ultra-lightweight, instant response for cold-start detection & keep-alive) ──
app.get('/api/ping', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({
    status: 'warm',
    service: 'Goldilocks Cake All You Can Backend',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Standalone Wake-up / Server Warming screen route
app.get('/wake-up', (req, res) => {
  res.sendFile(path.join(__dirname, 'wake-up.html'));
});

// ── API: Verify Cash Payment Authorization Code & Issue E-Coupon Immediately ──
app.post('/api/verify-payment', async (req, res) => {
  try {
    const { code, fullname, email, mobile, address, paymentMethod } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Payment authorization code is required.'
      });
    }

    const cleanCode = code.trim();

    // Look up the number combination in MongoDB
    const record = await PaymentCode.findOne({ code: cleanCode });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Invalid authorization code. Please verify the 4-digit code given by the cashier.'
      });
    }

    if (record.isUsed || record.status === 'used') {
      const usedDateStr = record.usedAt
        ? new Date(record.usedAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'an earlier transaction';
      return res.status(400).json({
        success: false,
        message: `This authorization code was already redeemed on ${usedDateStr}. Each code is single-use only.`
      });
    }

    if (record.status === 'revoked') {
      return res.status(400).json({
        success: false,
        message: 'This authorization code has been cancelled or revoked.'
      });
    }

    // Generate sequential Control Number from total coupons issued
    const totalIssued = await IssuedCoupon.countDocuments();
    const controlNo = 'CAYC' + String(totalIssued + 1).padStart(4, '0');

    // Mark the code as used in MongoDB
    record.isUsed = true;
    record.status = 'used';
    record.usedBy = {
      fullname: fullname || 'Guest',
      mobile: mobile || '',
      address: address || ''
    };
    record.usedAt = new Date();
    record.couponControlNo = controlNo;
    await record.save();

    // 1. Generate high-resolution official E-Coupon PNG
    let couponImagePath = null;
    try {
      couponImagePath = await generateCouponImage(fullname || 'Guest', controlNo);
      console.log(`🖼️ [Cash Payment] Generated coupon image at: ${couponImagePath}`);
    } catch (genErr) {
      console.error('Failed to generate coupon image for cash payment:', genErr);
    }

    // 2. Auto-send E-Coupon with Google Calendar invite to customer's Gmail
    let emailResult = { success: false };
    const targetEmail = (email || '').trim();
    if (targetEmail) {
      try {
        emailResult = await sendCouponEmail({
          guestName: fullname || 'Guest',
          email: targetEmail,
          controlNo,
          couponImagePath,
          paymentMethod: 'Cash at Store (Paid at Cashier)'
        });
        console.log(`✉️ [Cash Payment] E-Coupon with Calendar invite sent to ${targetEmail} | Success: ${emailResult.success}`);
      } catch (mailErr) {
        console.error('Failed to send cash coupon email:', mailErr);
      }
    }

    // 3. Store the newly issued coupon in MongoDB
    const coupon = await IssuedCoupon.create({
      controlNo,
      guestName: fullname || 'Guest',
      email: targetEmail,
      mobile: mobile || '',
      address: address || '',
      paymentMethod: paymentMethod || 'cash',
      paymentCodeUsed: cleanCode,
      amountPaid: 499.00,
      branch: record.branch || 'Goldilocks Robinsons Tacloban',
      emailSent: !!emailResult.success,
      emailSentAt: emailResult.success ? new Date() : null,
      issuedAt: new Date()
    });

    console.log(`🎟️ [Cash Coupon Issued] Control No: ${controlNo} | Guest: ${fullname} | Code: ${cleanCode} | Email Sent: ${coupon.emailSent}`);

    return res.json({
      success: true,
      controlNo: controlNo,
      emailSent: coupon.emailSent,
      message: targetEmail && coupon.emailSent
        ? `Payment authorization verified! E-Coupon ${controlNo} issued and sent to ${targetEmail} with Google Calendar invite.`
        : 'Payment authorization code verified! E-Coupon issued successfully.',
      coupon: {
        controlNo: coupon.controlNo,
        guestName: coupon.guestName,
        email: coupon.email,
        emailSent: coupon.emailSent,
        branch: coupon.branch,
        issuedAt: coupon.issuedAt
      }
    });
  } catch (error) {
    console.error('Error verifying payment code:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while verifying payment code. Please try again.'
    });
  }
});

// ── API: Submit Online QRPh Payment Proof for Verification (No E-Coupon Given First) ──
app.post('/api/submit-qr-payment', async (req, res) => {
  try {
    const { fullname, guestName, email, mobile, address, referenceNo, receiptImage } = req.body;
    const name = (fullname || guestName || '').trim();

    if (!name || !email || !mobile) {
      return res.status(400).json({
        success: false,
        message: 'Full name, Gmail address, and mobile number are required.'
      });
    }

    if (!receiptImage) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a photo or screenshot of your online payment receipt.'
      });
    }

    // Generate random 5-digit tracking number: e.g. CAYC-TXN-84920
    const rand = Math.floor(10000 + Math.random() * 90000);
    const txnNumber = `CAYC-TXN-${rand}`;

    const verification = await PaymentVerification.create({
      txnNumber,
      guestName: name,
      email: email.trim().toLowerCase(),
      mobile: mobile.trim(),
      address: (address || '').trim(),
      amountPaid: 499.00,
      paymentMethod: 'qr',
      referenceNo: (referenceNo || '').trim(),
      receiptImage: receiptImage,
      status: 'pending'
    });

    console.log(`📥 [QR Payment Submitted] Txn: ${txnNumber} | Guest: ${fullname} | Gmail: ${email}`);

    return res.status(201).json({
      success: true,
      txnNumber: verification.txnNumber,
      message: 'Payment proof submitted successfully! Awaiting admin verification.',
      data: {
        txnNumber: verification.txnNumber,
        guestName: verification.guestName,
        email: verification.email,
        mobile: verification.mobile,
        amountPaid: verification.amountPaid,
        status: verification.status,
        createdAt: verification.createdAt
      }
    });
  } catch (error) {
    console.error('Error submitting QR payment proof:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while submitting payment proof. Please try again.'
    });
  }
});

// ── API: Public - Track Reservation Status by Tracking Number (e.g. CAYC-TXN-80757 or CAYC0001) ──
app.get('/api/track/:txnNumber', async (req, res) => {
  try {
    const rawTxn = (req.params.txnNumber || '').trim();
    const txn = rawTxn.toUpperCase();
    if (!txn) {
      return res.status(400).json({ success: false, message: 'Please enter a valid tracking number.' });
    }

    // 1. Search in PaymentVerification (exact txnNumber, without prefix, or by coupon control number)
    let verification = await PaymentVerification.findOne({
      $or: [
        { txnNumber: txn },
        { txnNumber: `CAYC-TXN-${txn}` },
        { couponControlNo: txn }
      ]
    });

    // 2. If user typed just digits (e.g. 43713), match trailing digits
    if (!verification && /^\d+$/.test(txn)) {
      verification = await PaymentVerification.findOne({
        txnNumber: new RegExp(txn + '$', 'i')
      });
    }

    // 3. If found in PaymentVerification
    if (verification) {
      let couponDownloadUrl = null;
      let couponImageUrl = null;
      if (verification.status === 'approved' && verification.couponControlNo) {
        couponDownloadUrl = `/api/coupons/${verification.couponControlNo}/download`;
        couponImageUrl = `/api/coupons/${verification.couponControlNo}/image`;
      }

      return res.json({
        success: true,
        data: {
          txnNumber: verification.txnNumber,
          guestName: verification.guestName,
          email: verification.email,
          mobile: verification.mobile,
          address: verification.address,
          amountPaid: verification.amountPaid || 499.00,
          paymentMethod: verification.paymentMethod,
          referenceNo: verification.referenceNo || '—',
          status: verification.status,
          couponControlNo: verification.couponControlNo,
          couponDownloadUrl,
          couponImageUrl,
          adminNotes: verification.adminNotes || '',
          createdAt: verification.createdAt,
          approvedAt: verification.approvedAt
        }
      });
    }

    // 4. If not found in verifications, check IssuedCoupon (e.g. cash payments or direct coupons)
    const coupon = await IssuedCoupon.findOne({
      $or: [
        { controlNo: txn },
        { controlNo: txn.startsWith('CAYC') ? txn : `CAYC${txn.padStart(4, '0')}` },
        { txnNumber: txn }
      ]
    });

    if (coupon) {
      return res.json({
        success: true,
        data: {
          txnNumber: coupon.txnNumber || coupon.controlNo,
          guestName: coupon.guestName,
          email: coupon.email,
          mobile: coupon.mobile,
          address: coupon.address,
          amountPaid: coupon.amountPaid || 499.00,
          paymentMethod: coupon.paymentMethod,
          referenceNo: coupon.paymentCodeUsed || 'Cashier Code Verified',
          status: 'approved',
          couponControlNo: coupon.controlNo,
          couponDownloadUrl: `/api/coupons/${coupon.controlNo}/download`,
          couponImageUrl: `/api/coupons/${coupon.controlNo}/image`,
          adminNotes: 'Directly verified and issued.',
          createdAt: coupon.issuedAt || coupon.createdAt,
          approvedAt: coupon.issuedAt || coupon.createdAt
        }
      });
    }

    return res.status(404).json({
      success: false,
      message: `No reservation record found for tracking number "${rawTxn}". Please check your tracking number or Gmail.`
    });
  } catch (error) {
    console.error('Error tracking transaction:', error);
    return res.status(500).json({ success: false, message: 'Server error while tracking reservation.' });
  }
});

// ── API: Public - Recover / Find Transaction Reference Number by Name & Mobile ──
app.post('/api/track/recover', async (req, res) => {
  try {
    const { fullname, mobile } = req.body || {};
    if (!fullname || !fullname.trim()) {
      return res.status(400).json({ success: false, message: 'Please enter your Full Name as registered.' });
    }
    if (!mobile || !mobile.trim()) {
      return res.status(400).json({ success: false, message: 'Please enter your Contact Mobile Number.' });
    }

    const cleanDigits = mobile.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      return res.status(400).json({ success: false, message: 'Please enter a valid mobile number (e.g. 09123456789).' });
    }

    const last10 = cleanDigits.slice(-10);
    // Escape regex characters safely
    const escapedName = fullname.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Find records matching guestName (case-insensitive) and mobile (ending with last 10 digits)
    let records = await PaymentVerification.find({
      guestName: new RegExp('^\\s*' + escapedName + '\\s*$', 'i'),
      mobile: new RegExp(last10 + '$')
    }).sort({ createdAt: -1 });

    // Fallback: If no exact name match, allow substring match
    if (!records || records.length === 0) {
      records = await PaymentVerification.find({
        guestName: new RegExp(escapedName, 'i'),
        mobile: new RegExp(last10 + '$')
      }).sort({ createdAt: -1 });
    }

    if (!records || records.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No reservation record found matching "' + fullname.trim() + '" with mobile number provided.'
      });
    }

    const primary = records[0];
    const results = records.map(r => ({
      txnNumber: r.txnNumber,
      guestName: r.guestName,
      email: r.email,
      mobile: r.mobile,
      status: r.status,
      couponControlNo: r.couponControlNo,
      amountPaid: r.amountPaid || 499.00,
      referenceNo: r.referenceNo || '',
      adminNotes: r.adminNotes || '',
      couponImageUrl: r.couponControlNo ? `/api/coupon-image/${r.couponControlNo}` : null,
      couponDownloadUrl: r.couponControlNo ? `/api/download-coupon/${r.couponControlNo}` : null,
      createdAt: r.createdAt
    }));

    return res.json({
      success: true,
      data: {
        guestName: primary.guestName,
        mobile: primary.mobile,
        totalFound: records.length,
        allRecords: results,
        // Kept for backward compatibility
        txnNumber: primary.txnNumber,
        status: primary.status,
        couponControlNo: primary.couponControlNo,
        createdAt: primary.createdAt
      }
    });
  } catch (error) {
    console.error('Error recovering transaction tracking number:', error);
    return res.status(500).json({ success: false, message: 'Server error while finding tracking number.' });
  }
});

// ── API: Public - Download Official QRPh Payment Code Image ──
app.get('/api/download-qr', (req, res) => {
  const filePath = path.join(__dirname, 'Assets', 'goldilocks-qrph.png');
  if (fs.existsSync(filePath)) {
    return res.download(filePath, 'Goldilocks-CakeAllYouCan-QRPh.png');
  }
  return res.status(404).send('QRPh code image not found.');
});

// ── API: Public - Download Official E-Coupon PNG by Control Number ──
app.get('/api/coupons/:controlNo/download', async (req, res) => {
  try {
    const controlNo = (req.params.controlNo || '').trim().toUpperCase();
    const filePath = path.join(__dirname, 'uploads', 'coupons', `coupon-${controlNo}.png`);

    if (fs.existsSync(filePath)) {
      return res.download(filePath, `Goldilocks-CakeAllYouCan-${controlNo}.png`);
    }

    // If file doesn't exist yet, check DB and generate dynamically
    const coupon = await IssuedCoupon.findOne({ controlNo });
    if (!coupon) {
      return res.status(404).send('Coupon pass not found.');
    }

    const genPath = await generateCouponImage(coupon.guestName, controlNo);
    return res.download(genPath, `Goldilocks-CakeAllYouCan-${controlNo}.png`);
  } catch (error) {
    console.error('Error downloading coupon:', error);
    return res.status(500).send('Error downloading coupon image.');
  }
});

// ── API: Public - View Official E-Coupon Image in Browser ──
app.get('/api/coupons/:controlNo/image', async (req, res) => {
  try {
    const controlNo = (req.params.controlNo || '').trim().toUpperCase();
    const filePath = path.join(__dirname, 'uploads', 'coupons', `coupon-${controlNo}.png`);

    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'image/png');
      return res.sendFile(filePath);
    }

    const coupon = await IssuedCoupon.findOne({ controlNo });
    if (!coupon) {
      return res.status(404).send('Coupon pass not found.');
    }

    const genPath = await generateCouponImage(coupon.guestName, controlNo);
    res.setHeader('Content-Type', 'image/png');
    return res.sendFile(genPath);
  } catch (error) {
    return res.status(500).send('Error serving coupon image.');
  }
});

// ============================================================================
// ── ADMIN AUTHENTICATION & SECURITY ──
// ============================================================================
const ADMIN_USER = process.env.ADMIN_USERNAME || 'admin@123';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || '@cakeallyoucan2026';
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.MONGODB_URI || 'goldilocks_secure_admin_jwt_secret_2026';
const activeAdminSessions = new Map(); // token -> { username, createdAt, expiresAt } (in-memory fast cache)

function generateAdminToken(username) {
  const payload = {
    u: username,
    role: 'admin',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (90 * 24 * 3600) // 90-day persistent session
  };
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', ADMIN_JWT_SECRET).update(b64Payload).digest('base64url');
  return `${b64Payload}.${signature}`;
}

function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') return null;

  // 1. Check in-memory cache if present
  if (activeAdminSessions.has(token)) {
    const s = activeAdminSessions.get(token);
    if (s && s.expiresAt > Date.now()) return { username: s.username };
  }

  // 2. Cryptographic signature verification (persists across server restarts & Render sleep)
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [b64Payload, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', ADMIN_JWT_SECRET).update(b64Payload).digest('base64url');
  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
    if (!payload || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { username: payload.u || payload.username || ADMIN_USER };
  } catch (err) {
    return null;
  }
}

// Middleware: Require Admin Authentication for Protected Endpoints
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-admin-token']) {
    token = String(req.headers['x-admin-token']).trim();
  } else if (req.query && req.query.admin_token) {
    token = String(req.query.admin_token).trim();
  }

  const verified = verifyAdminToken(token);
  if (!verified) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Admin authentication required to access this resource.'
    });
  }

  req.adminUser = verified.username;
  next();
}

// ── API: Admin Login ──
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide both admin username and password.'
    });
  }

  const validUsername = (String(username).trim().toLowerCase() === ADMIN_USER.toLowerCase());
  const validPassword = (String(password) === ADMIN_PASS);

  if (!validUsername || !validPassword) {
    return res.status(401).json({
      success: false,
      message: 'Invalid admin username or password.'
    });
  }

  const token = generateAdminToken(ADMIN_USER);
  activeAdminSessions.set(token, {
    username: ADMIN_USER,
    createdAt: Date.now(),
    expiresAt: Date.now() + 90 * 24 * 3600 * 1000
  });

  res.json({
    success: true,
    message: 'Admin authentication successful.',
    token,
    user: { username: ADMIN_USER }
  });
});

// ── API: Admin Logout ──
app.post('/api/admin/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-admin-token']) {
    token = String(req.headers['x-admin-token']).trim();
  }
  if (token) {
    activeAdminSessions.delete(token);
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

// ── API: Check Admin Authentication Status ──
app.get('/api/admin/check-auth', (req, res) => {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-admin-token']) {
    token = String(req.headers['x-admin-token']).trim();
  }

  const verified = verifyAdminToken(token);
  if (verified) {
    return res.json({
      success: true,
      authenticated: true,
      user: { username: verified.username }
    });
  }
  return res.json({ success: false, authenticated: false });
});

// ── API: Admin - List All Online Payment Verifications (with status filter) ──
app.get('/api/admin/verifications', requireAdminAuth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status && req.query.status !== 'all') {
      if (req.query.status === 'declined' || req.query.status === 'rejected') {
        filter.status = { $in: ['declined', 'rejected'] };
      } else {
        filter.status = req.query.status;
      }
    }
    const list = await PaymentVerification.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, count: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── API: Admin - Approve Payment & Auto-Send E-Coupon to Gmail ──
app.post('/api/admin/verifications/:id/approve', requireAdminAuth, async (req, res) => {
  try {
    const verification = await PaymentVerification.findById(req.params.id);
    if (!verification) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }

    if (verification.status === 'approved') {
      return res.status(400).json({
        success: false,
        message: `This payment was already approved with Control No: ${verification.couponControlNo}.`
      });
    }

    // 1. Generate unique sequential Control Number
    const totalCoupons = await IssuedCoupon.countDocuments();
    const controlNo = 'CAYC' + String(totalCoupons + 1).padStart(4, '0');

    // 2. Generate unique high-resolution E-Coupon PNG
    let couponImagePath = null;
    try {
      couponImagePath = await generateCouponImage(verification.guestName, controlNo);
      console.log(`🖼️ Generated coupon image at: ${couponImagePath}`);
    } catch (genErr) {
      console.error('Failed to generate coupon image file:', genErr);
    }

    // 3. Auto-send E-Coupon with Google Calendar invite to customer's Gmail
    let emailResult = { success: false };
    try {
      emailResult = await sendCouponEmail({
        guestName: verification.guestName,
        email: verification.email,
        controlNo,
        couponImagePath,
        paymentMethod: verification.paymentMethod === 'cash' ? 'Cash at Store (Paid at Cashier)' : 'QRPh Online Transfer'
      });
    } catch (mailErr) {
      console.error('Failed to send email:', mailErr);
    }

    // 4. Update PaymentVerification record in MongoDB
    verification.status = 'approved';
    verification.approvedAt = new Date();
    verification.couponControlNo = controlNo;
    verification.emailSent = !!emailResult.success;
    verification.emailSentAt = emailResult.success ? new Date() : null;
    await verification.save();

    // 5. Create official record in IssuedCoupon collection
    const coupon = await IssuedCoupon.create({
      controlNo,
      guestName: verification.guestName,
      email: verification.email,
      mobile: verification.mobile,
      address: verification.address,
      txnNumber: verification.txnNumber,
      paymentMethod: verification.paymentMethod || 'qr',
      amountPaid: verification.amountPaid || 499.00,
      branch: 'Goldilocks Robinsons Tacloban',
      emailSent: !!emailResult.success,
      emailSentAt: emailResult.success ? new Date() : null,
      issuedAt: new Date()
    });

    console.log(`🎉 [Payment Verified & Approved] Txn: ${verification.txnNumber} ➔ Control No: ${controlNo} ➔ Emailed to: ${verification.email}`);

    return res.json({
      success: true,
      controlNo,
      emailSent: verification.emailSent,
      previewUrl: emailResult.previewUrl || null,
      message: `Payment approved! E-Coupon ${controlNo} generated and auto-sent to ${verification.email}.`,
      data: verification
    });
  } catch (err) {
    console.error('Approval error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── API: Admin - Decline / Reject Payment Verification ──
const handleDeclineVerification = async (req, res) => {
  try {
    const verification = await PaymentVerification.findById(req.params.id);
    if (!verification) {
      return res.status(404).json({ success: false, message: 'Record not found.' });
    }
    verification.status = 'declined';
    verification.adminNotes = (req.body.reason || 'Payment proof was unreadable or amount was incorrect.').trim();
    await verification.save();

    res.json({
      success: true,
      message: 'Payment verification marked as declined.',
      data: verification
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

app.post('/api/admin/verifications/:id/decline', requireAdminAuth, handleDeclineVerification);
app.post('/api/admin/verifications/:id/reject', requireAdminAuth, handleDeclineVerification);

// ── API: Admin - Reset Payment Verification to Pending ──
app.post('/api/admin/verifications/:id/pending', requireAdminAuth, async (req, res) => {
  try {
    const verification = await PaymentVerification.findById(req.params.id);
    if (!verification) {
      return res.status(404).json({ success: false, message: 'Record not found.' });
    }
    verification.status = 'pending';
    verification.adminNotes = '';
    await verification.save();

    res.json({
      success: true,
      message: 'Payment verification status reset to pending.',
      data: verification
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── API: Admin Dashboard Statistics ──
app.get('/api/admin/stats', requireAdminAuth, async (req, res) => {
  try {
    const totalCoupons = await IssuedCoupon.countDocuments();
    const totalCodes = await PaymentCode.countDocuments();
    const activeCodes = await PaymentCode.countDocuments({ status: 'active', isUsed: false });
    const usedCodes = await PaymentCode.countDocuments({ isUsed: true });
    const pendingVerifications = await PaymentVerification.countDocuments({ status: 'pending' });
    const totalRevenue = totalCoupons * 499.00;

    res.json({
      success: true,
      totalCoupons,
      totalRevenue,
      totalCodes,
      activeCodes,
      usedCodes,
      pendingVerifications
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── API: List All Issued E-Coupons ──
app.get('/api/coupons', requireAdminAuth, async (req, res) => {
  try {
    const coupons = await IssuedCoupon.find().sort({ createdAt: -1 });
    res.json({ success: true, count: coupons.length, data: coupons });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── API: Resend E-Coupon & Calendar Invite to Customer's Gmail ──
app.post('/api/admin/coupons/:id/resend-email', requireAdminAuth, async (req, res) => {
  try {
    const coupon = await IssuedCoupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Coupon record not found.' });
    }
    if (!coupon.email || !coupon.email.trim()) {
      return res.status(400).json({ success: false, message: 'This coupon has no registered email address.' });
    }

    let couponImagePath = null;
    try {
      couponImagePath = await generateCouponImage(coupon.guestName, coupon.controlNo);
    } catch (e) {
      console.warn('Coupon image generation issue during resend:', e.message);
    }

    const emailResult = await sendCouponEmail({
      guestName: coupon.guestName,
      email: coupon.email.trim(),
      controlNo: coupon.controlNo,
      couponImagePath,
      paymentMethod: coupon.paymentMethod === 'cash' ? 'Cash at Store (Paid at Cashier)' : 'QRPh Online Transfer'
    });

    coupon.emailSent = !!emailResult.success;
    coupon.emailSentAt = emailResult.success ? new Date() : coupon.emailSentAt;
    await coupon.save();

    res.json({
      success: true,
      emailSent: coupon.emailSent,
      message: `Official E-Coupon pass and Google Calendar invite sent to ${coupon.email}!`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── API: List All Accepted Payment Codes (MongoDB Compass mirror) ──
app.get('/api/payment-codes', requireAdminAuth, async (req, res) => {
  try {
    const codes = await PaymentCode.find().sort({ createdAt: -1 });
    res.json({ success: true, count: codes.length, data: codes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── API: Add New Accepted Number Combination ──
app.post('/api/payment-codes', requireAdminAuth, async (req, res) => {
  try {
    const { code, branch, description } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Code is required.' });
    }
    const newCode = await PaymentCode.create({
      code: String(code).trim(),
      branch: branch || 'Goldilocks Robinsons Tacloban',
      description: description || 'Cashier Authorization Code',
      status: 'active',
      isUsed: false
    });
    res.status(201).json({ success: true, message: 'New authorization code created!', data: newCode });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: 'This code already exists in the database.' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── API: Batch Generate Codes ──
app.post('/api/admin/codes/batch', requireAdminAuth, async (req, res) => {
  try {
    const count = Math.min(Math.max(parseInt(req.body.count, 10) || 5, 1), 50);
    const branch = req.body.branch || 'Goldilocks Robinsons Tacloban';
    const description = req.body.description || 'Batch Generated Code';

    const existingCodes = new Set((await PaymentCode.find({}, 'code')).map(c => c.code));
    const toInsert = [];

    while (toInsert.length < count) {
      const candidate = String(Math.floor(1000 + Math.random() * 9000));
      if (!existingCodes.has(candidate)) {
        existingCodes.add(candidate);
        toInsert.push({
          code: candidate,
          branch,
          description,
          status: 'active',
          isUsed: false,
          amount: 499.00
        });
      }
    }

    const inserted = await PaymentCode.insertMany(toInsert);
    res.status(201).json({
      success: true,
      createdCount: inserted.length,
      data: inserted
    });
  } catch (err) {
    console.error('Batch generate error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── API: Reset Code Back to Active ──
app.patch('/api/admin/codes/:id/reset', requireAdminAuth, async (req, res) => {
  try {
    const code = await PaymentCode.findByIdAndUpdate(
      req.params.id,
      {
        status: 'active',
        isUsed: false,
        usedBy: { fullname: null, mobile: null, address: null },
        usedAt: null,
        couponControlNo: null
      },
      { returnDocument: 'after' }
    );
    if (!code) return res.status(404).json({ success: false, message: 'Code not found.' });
    res.json({ success: true, message: `Code ${code.code} reset to active.`, data: code });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── API: Revoke Code ──
app.patch('/api/admin/codes/:id/revoke', requireAdminAuth, async (req, res) => {
  try {
    const code = await PaymentCode.findByIdAndUpdate(
      req.params.id,
      { status: 'revoked' },
      { returnDocument: 'after' }
    );
    if (!code) return res.status(404).json({ success: false, message: 'Code not found.' });
    res.json({ success: true, message: `Code ${code.code} revoked.`, data: code });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── API: Delete Code from MongoDB ──
app.delete('/api/admin/codes/:id', requireAdminAuth, async (req, res) => {
  try {
    const code = await PaymentCode.findByIdAndDelete(req.params.id);
    if (!code) return res.status(404).json({ success: false, message: 'Code not found.' });
    res.json({ success: true, message: `Code ${code.code} deleted.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Serve the Admin Portal
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Serve the main e-coupon page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'goldilocks-ecoupon.html'));
});

// ── Diagnostic: Test Email Sending & Return Exact Status Live ──
app.get('/api/test-email', async (req, res) => {
  try {
    const toEmail = (req.query.to || process.env.GMAIL_USER || 'cfi.goldilocks.tac@gmail.com').trim();
    const brevoKey = (process.env.BREVO_API_KEY || '').trim();

    const diagnostic = {
      timestamp: new Date().toISOString(),
      to: toEmail,
      mode: brevoKey ? 'brevo_https_api_port_443' : 'nodemailer_smtp',
      brevoApiKeyConfigured: Boolean(brevoKey),
      brevoKeyPrefix: brevoKey ? brevoKey.substring(0, 10) + '...' : null,
      brevoKeyLength: brevoKey ? brevoKey.length : 0,
      brevoSenderEmail: process.env.BREVO_SENDER_EMAIL || process.env.GMAIL_USER || 'cfi.goldilocks.tac@gmail.com'
    };

    console.log(`🧪 [Diagnostic Test Email] Initiating test to ${toEmail}...`);
    const emailResult = await sendCouponEmail({
      guestName: 'Diagnostic Test User',
      email: toEmail,
      controlNo: 'TEST0001',
      paymentMethod: 'Test Diagnostic'
    });

    return res.json({
      success: emailResult.success,
      diagnostic,
      result: emailResult
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(`✅ Goldilocks E-Coupon server running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`⚠️ Port ${PORT} is busy, retrying on port ${Number(PORT) + 1}...`);
    app.listen(Number(PORT) + 1, () => {
      console.log(`✅ Goldilocks E-Coupon server running at http://localhost:${Number(PORT) + 1}`);
    });
  } else {
    console.error('Server error:', err);
  }
});
