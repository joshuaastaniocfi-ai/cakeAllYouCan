const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

async function restoreDatabase(targetBackupFolder) {
  const backupFolder = targetBackupFolder || path.join(__dirname, '..', 'backups', 'latest');
  console.log(`🔄 Restoring database from: ${backupFolder}`);

  if (!fs.existsSync(backupFolder)) {
    throw new Error(`Backup folder not found: ${backupFolder}`);
  }

  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;

  const files = fs.readdirSync(backupFolder).filter(f => f.endsWith('.json') && f !== 'full_db_dump.json');

  for (const file of files) {
    const colName = path.basename(file, '.json');
    const filePath = path.join(backupFolder, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    if (Array.isArray(data) && data.length > 0) {
      console.log(` 📦 Restoring '${colName}' (${data.length} records)...`);
      await db.collection(colName).deleteMany({});
      // Insert with preserved ObjectIds
      const docsToInsert = data.map(doc => {
        if (doc._id && typeof doc._id === 'string' && doc._id.length === 24) {
          doc._id = new mongoose.Types.ObjectId(doc._id);
        }
        return doc;
      });
      await db.collection(colName).insertMany(docsToInsert);
      console.log(` ✅ Restored '${colName}'.`);
    } else {
      console.log(` ℹ️ '${colName}' has no documents to restore.`);
    }
  }

  // Restore coupon files if present
  const backupCouponsDir = path.join(backupFolder, 'coupons');
  const targetCouponsDir = path.join(__dirname, '..', 'uploads', 'coupons');
  if (fs.existsSync(backupCouponsDir)) {
    fs.mkdirSync(targetCouponsDir, { recursive: true });
    const cFiles = fs.readdirSync(backupCouponsDir);
    for (const cf of cFiles) {
      fs.copyFileSync(path.join(backupCouponsDir, cf), path.join(targetCouponsDir, cf));
      console.log(` 🖼️ Restored coupon image: ${cf}`);
    }
  }

  await mongoose.connection.close();
  console.log('🎉 Database restore completed successfully!');
}

if (require.main === module) {
  const folderArg = process.argv[2];
  restoreDatabase(folderArg).catch(err => {
    console.error('❌ Restore failed:', err);
    process.exit(1);
  });
}

module.exports = restoreDatabase;
