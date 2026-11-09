const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const defaultCodes = [
  { code: '123456', branch: 'Goldilocks Robinsons Tacloban', description: 'Store Counter Code 1' },
  { code: '567890', branch: 'Goldilocks Robinsons Tacloban', description: 'Store Counter Code 2' },
  { code: '778899', branch: 'Goldilocks Robinsons Tacloban', description: 'Cashier Express Code' },
  { code: '998877', branch: 'Goldilocks Robinsons Tacloban', description: 'Manager Override Code' },
  { code: '202611', branch: 'Goldilocks Robinsons Tacloban', description: 'Promo Anniversary Code' },
  { code: '432100', branch: 'Goldilocks Robinsons Tacloban', description: 'Store Counter Code 3' },
  { code: '888888', branch: 'Goldilocks Robinsons Tacloban', description: 'VIP Guest Code' },
  { code: '100101', branch: 'Goldilocks Robinsons Tacloban', description: 'Register 1 Code' },
  { code: '246810', branch: 'Goldilocks Robinsons Tacloban', description: 'Register 2 Code' },
  { code: '135791', branch: 'Goldilocks Robinsons Tacloban', description: 'Register 3 Code' }
];

async function cleanForProduction() {
  console.log('🧹 Preparing to clean database for production...');

  // 1. Safety verification: Verify backup exists
  const latestBackupFile = path.join(__dirname, '..', 'backups', 'latest', 'full_db_dump.json');
  if (!fs.existsSync(latestBackupFile) || fs.statSync(latestBackupFile).size < 100) {
    throw new Error('❌ SAFETY ABORT: Valid backup in backups/latest/full_db_dump.json was not found! Please run backup first.');
  }
  console.log(`🛡️ Safety verified: Valid backup found at ${latestBackupFile} (${(fs.statSync(latestBackupFile).size / 1024).toFixed(1)} KB)`);

  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('✅ Connected to MongoDB database:', mongoose.connection.name);

  const db = mongoose.connection.db;

  // 2. Clear paymentverifications (test online/counter transactions)
  const pvResult = await db.collection('paymentverifications').deleteMany({});
  console.log(` 🗑️ Cleared 'paymentverifications': ${pvResult.deletedCount} test records removed.`);

  // 3. Clear issuedcoupons (test coupons)
  const icResult = await db.collection('issuedcoupons').deleteMany({});
  console.log(` 🗑️ Cleared 'issuedcoupons': ${icResult.deletedCount} test coupons removed.`);

  // 4. Drop test_write_check if exists
  try {
    await db.collection('test_write_check').drop();
    console.log(` 🗑️ Dropped 'test_write_check' temporary collection.`);
  } catch (err) {
    // Ignore if didn't exist
  }

  // 5. Reset PaymentCodes to unredeemed active state
  await db.collection('paymentcodes').deleteMany({});
  const freshCodes = defaultCodes.map(item => ({
    code: item.code,
    branch: item.branch,
    amount: 499.00,
    status: 'active',
    isUsed: false,
    usedBy: null,
    usedAt: null,
    couponControlNo: null,
    description: item.description,
    createdAt: new Date(),
    updatedAt: new Date()
  }));
  await db.collection('paymentcodes').insertMany(freshCodes);
  console.log(` 🔑 Reset 'paymentcodes': ${freshCodes.length} active 6-digit cashier codes ready for store use.`);

  // 6. Clean uploads/coupons/ folder
  const couponsDir = path.join(__dirname, '..', 'uploads', 'coupons');
  if (fs.existsSync(couponsDir)) {
    const cFiles = fs.readdirSync(couponsDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
    for (const f of cFiles) {
      fs.unlinkSync(path.join(couponsDir, f));
      console.log(` 🗑️ Removed test coupon file: uploads/coupons/${f}`);
    }
  }

  // Verify final counts
  const finalPvCount = await db.collection('paymentverifications').countDocuments();
  const finalIcCount = await db.collection('issuedcoupons').countDocuments();
  const finalPcCount = await db.collection('paymentcodes').countDocuments();

  console.log('\n📊 Production Database Status:');
  console.log(` - paymentverifications: ${finalPvCount} (Fresh, ready for customer payments)`);
  console.log(` - issuedcoupons:        ${finalIcCount} (Fresh, first coupon will start at CAYC0001)`);
  console.log(` - paymentcodes:         ${finalPcCount} (Active, 10 unredeemed cashier authorization codes)`);

  await mongoose.connection.close();
  console.log('\n🎉 Production database clean completed successfully!');
}

if (require.main === module) {
  cleanForProduction().catch(err => {
    console.error('❌ Clean error:', err);
    process.exit(1);
  });
}

module.exports = cleanForProduction;
