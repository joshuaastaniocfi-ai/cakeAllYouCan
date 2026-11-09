const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

async function main() {
  console.log('🚀 Connecting to MongoDB...');
  const uri = process.env.MONGODB_URI;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('✅ Connected to MongoDB database:', mongoose.connection.name);

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const backupDir = path.join(__dirname, '..', 'backups', `backup_${timestamp}`);
  const latestDir = path.join(__dirname, '..', 'backups', 'latest');

  fs.mkdirSync(backupDir, { recursive: true });
  fs.mkdirSync(latestDir, { recursive: true });

  const summary = {
    backupDate: now.toISOString(),
    philippineTime: now.toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
    databaseName: mongoose.connection.name,
    host: mongoose.connection.host,
    collections: {}
  };

  const fullDump = {};

  for (const c of collections) {
    const colName = c.name;
    const docs = await db.collection(colName).find({}).toArray();
    summary.collections[colName] = docs.length;
    fullDump[colName] = docs;

    const fileContent = JSON.stringify(docs, null, 2);
    fs.writeFileSync(path.join(backupDir, `${colName}.json`), fileContent, 'utf-8');
    fs.writeFileSync(path.join(latestDir, `${colName}.json`), fileContent, 'utf-8');
    console.log(` 📦 [Exported] ${colName}: ${docs.length} documents`);
  }

  // Full Unified Dump
  const fullDumpStr = JSON.stringify(fullDump, null, 2);
  fs.writeFileSync(path.join(backupDir, 'full_db_dump.json'), fullDumpStr, 'utf-8');
  fs.writeFileSync(path.join(latestDir, 'full_db_dump.json'), fullDumpStr, 'utf-8');

  // Backup coupon PNG files if present
  const couponsDir = path.join(__dirname, '..', 'uploads', 'coupons');
  if (fs.existsSync(couponsDir)) {
    const cFiles = fs.readdirSync(couponsDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
    if (cFiles.length > 0) {
      const bCoupons = path.join(backupDir, 'coupons');
      const lCoupons = path.join(latestDir, 'coupons');
      fs.mkdirSync(bCoupons, { recursive: true });
      fs.mkdirSync(lCoupons, { recursive: true });
      for (const f of cFiles) {
        fs.copyFileSync(path.join(couponsDir, f), path.join(bCoupons, f));
        fs.copyFileSync(path.join(couponsDir, f), path.join(lCoupons, f));
        console.log(` 🖼️ [Asset Backup] uploads/coupons/${f}`);
      }
    }
  }

  // Write Summary Markdown
  let md = `# Goldilocks Cake All You Can — Database Backup\n\n`;
  md += `- **Date (PHT):** ${summary.philippineTime}\n`;
  md += `- **ISO Timestamp:** \`${summary.backupDate}\`\n`;
  md += `- **Database:** \`${summary.databaseName}\`\n`;
  md += `- **Host:** \`${summary.host}\`\n\n`;
  md += `## Backed Up Collections\n\n`;
  md += `| Collection | Count | Export File |\n`;
  md += `| :--- | :--- | :--- |\n`;
  for (const [col, count] of Object.entries(summary.collections)) {
    md += `| \`${col}\` | **${count}** | [\`${col}.json\`](./${col}.json) |\n`;
  }
  md += `| *Complete Dump* | **${Object.values(summary.collections).reduce((a,b)=>a+b,0)} total** | [\`full_db_dump.json\`](./full_db_dump.json) |\n\n`;
  md += `## Restore Command\n\n`;
  md += `To restore this database backup at any time, run:\n`;
  md += `\`\`\`bash\nnode scripts/restore_database.js backups/backup_${timestamp}\n\`\`\`\n`;

  fs.writeFileSync(path.join(backupDir, 'BACKUP_SUMMARY.md'), md, 'utf-8');
  fs.writeFileSync(path.join(latestDir, 'BACKUP_SUMMARY.md'), md, 'utf-8');

  await mongoose.connection.close();
  console.log(`\n🎉 Backup successfully created at:`);
  console.log(`   ${backupDir}`);
  console.log(`   ${latestDir}`);
}

main().catch(err => {
  console.error('❌ Backup error:', err);
  process.exit(1);
});
