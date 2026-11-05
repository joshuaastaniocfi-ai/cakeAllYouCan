const mongoose = require('mongoose');

/**
 * PaymentCode Schema
 * Represents the accepted number combinations issued by cashiers to authorize e-coupons.
 * Viewable and manageable directly in MongoDB Compass.
 */
const paymentCodeSchema = new mongoose.Schema(
  {
    // The accepted number combination (e.g. '1234', '8821', '9012')
    code: {
      type: String,
      required: [true, 'Payment authorization code is required'],
      unique: true,
      trim: true,
      index: true
    },
    // Status: 'active' (valid for use), 'used' (already redeemed), 'revoked'
    status: {
      type: String,
      enum: ['active', 'used', 'revoked'],
      default: 'active',
      index: true
    },
    isUsed: {
      type: Boolean,
      default: false,
      index: true
    },
    branch: {
      type: String,
      default: 'Goldilocks Robinsons Tacloban'
    },
    amount: {
      type: Number,
      default: 499.00
    },
    description: {
      type: String,
      default: 'Cake All You Can Payment Authorization Code'
    },
    // Populated when the customer enters this code to claim their e-coupon
    usedBy: {
      fullname: { type: String, default: null },
      mobile: { type: String, default: null },
      address: { type: String, default: null }
    },
    usedAt: {
      type: Date,
      default: null
    },
    couponControlNo: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true // Automatically creates createdAt and updatedAt
  }
);

module.exports = mongoose.model('PaymentCode', paymentCodeSchema);

