require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const PaymentCode = require('./models/PaymentCode');

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

async function seedDatabase() {
  await connectDB();
  try {
    // Remove any unused 4-digit codes from previous testing
    await PaymentCode.deleteMany({ isUsed: false, code: { $regex: '^[0-9]{4}$' } });

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
    console.log(`✅ Seeded ${defaultCodes.length} accepted 6-digit number combinations into MongoDB!`);
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
