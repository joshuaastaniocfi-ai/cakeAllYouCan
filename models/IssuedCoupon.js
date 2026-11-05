const mongoose = require('mongoose');

/**
 * IssuedCoupon Schema
 * Tracks every successfully authorized and generated e-coupon.
 * Viewable directly in MongoDB Compass.
 */
const issuedCouponSchema = new mongoose.Schema(
  {
    controlNo: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    guestName: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      default: ''
    },
    mobile: {
      type: String,
      required: true,
      trim: true
    },
    address: {
      type: String,
      trim: true,
      default: ''
    },
    txnNumber: {
      type: String,
      default: null
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'qr'],
      default: 'cash'
    },
    // The accepted number combination that authorized this e-coupon
    paymentCodeUsed: {
      type: String,
      default: null
    },
    amountPaid: {
      type: Number,
      default: 499.00
    },
    branch: {
      type: String,
      default: 'Goldilocks Robinsons Tacloban'
    },
    eventVenue: {
      type: String,
      default: 'Level 1, Expansion Activity Area, Robinsons Tacloban'
    },
    eventDate: {
      type: String,
      default: 'November 30, 2026 (3:00 PM – 8:00 PM)'
    },
    emailSent: {
      type: Boolean,
      default: false
    },
    emailSentAt: {
      type: Date,
      default: null
    },
    issuedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('IssuedCoupon', issuedCouponSchema);

