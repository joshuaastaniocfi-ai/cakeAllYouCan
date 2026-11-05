const mongoose = require('mongoose');
const dns = require('dns');

// On some local networks, ISPs, and Windows machines, default DNS servers refuse SRV queries
// for mongodb+srv://. Setting reliable public DNS ensures seamless Atlas connectivity.
if (process.env.MONGODB_URI && process.env.MONGODB_URI.includes('mongodb+srv://')) {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch (_) {}
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/goldilocks_ecoupon';

async function connectDB() {
  try {
    const conn = await mongoose.connect(MONGODB_URI);
    console.log(`🍃 MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    console.error('💡 Ensure MongoDB service is running locally on port 27017.');
    return null;
  }
}

module.exports = connectDB;

