require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const PaymentCode = require('./models/PaymentCode');

const defaultCodes = [
  { code: '1234', branch: 'Goldilocks Robinsons Tacloban', description: 'Store Counter Code 1' },
  { code: '5678', branch: 'Goldilocks Robinsons Tacloban', description: 'Store Counter Code 2' },
  { code: '7788', branch: 'Goldilocks Robinsons Tacloban', description: 'Cashier Express Code' },
  { code: '9999', branch: 'Goldilocks Robinsons Tacloban', description: 'Manager Override Code' },
  { code: '2026', branch: 'Goldilocks Robinsons Tacloban', description: 'Promo Anniversary Code' },
  { code: '4321', branch: 'Goldilocks Robinsons Tacloban', description: 'Store Counter Code 3' },
  { code: '8888', branch: 'Goldilocks Robinsons Tacloban', description: 'VIP Guest Code' },
  { code: '1001', branch: 'Goldilocks Robinsons Tacloban', description: 'Register 1 Code' },
  { code: '2468', branch: 'Goldilocks Robinsons Tacloban', description: 'Register 2 Code' },
  { code: '1357', branch: 'Goldilocks Robinsons Tacloban', description: 'Register 3 Code' }
];

async function seedDatabase() {
  await connectDB();
  try {
    for (const item of defaultCodes) {
      await PaymentCode.findOneAndUpdate(
        { code: item.code },
        {
          $setOnInsert: {
            code: item.code,
            branch: item.branch,
            amount: 499.00,
            status: 'active',
            isUsed: false,
            description: item.description
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
    }
    console.log(`✅ Seeded ${defaultCodes.length} accepted number combinations into MongoDB!`);
    const count = await PaymentCode.countDocuments();
    console.log(`📊 Total payment codes in database: ${count}`);
  } catch (err) {
    console.error('❌ Seeding error:', err.message);
  }
}

if (require.main === module) {
  seedDatabase().then(() => mongoose.connection.close());
}

module.exports = seedDatabase;
