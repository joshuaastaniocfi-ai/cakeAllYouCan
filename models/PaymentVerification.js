const mongoose = require('mongoose');

/**
 * PaymentVerification Schema
 * Stores online QRPh payment submissions waiting for admin approval.
 * Viewable and manageable in MongoDB Compass and the Admin Portal.
 */
const paymentVerificationSchema = new mongoose.Schema(
  {
    // Unique tracking / reference number shown to customer (e.g. CAYC-TXN-1049)
    txnNumber: {
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
      required: true,
      trim: true,
      lowercase: true,
      index: true
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
    amountPaid: {
      type: Number,
      default: 499.00
    },
    paymentMethod: {
      type: String,
      default: 'qr'
    },
    // Optional reference number from e-wallet (e.g., GCash ref no.)
    referenceNo: {
      type: String,
      default: ''
    },
    // Uploaded receipt image (stored as base64 data URL or relative path)
    receiptImage: {
      type: String,
      required: [true, 'Receipt image proof is required']
    },
    // Status: 'pending' (awaiting admin review), 'approved' (verified & coupon sent), 'rejected', 'declined'
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'declined'],
      default: 'pending',
      index: true
    },
    // Generated when admin approves
    couponControlNo: {
      type: String,
      default: null,
      index: true
    },
    emailSent: {
      type: Boolean,
      default: false
    },
    emailSentAt: {
      type: Date,
      default: null
    },
    approvedAt: {
      type: Date,
      default: null
    },
    adminNotes: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('PaymentVerification', paymentVerificationSchema);

