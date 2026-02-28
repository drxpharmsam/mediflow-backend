const mongoose = require('mongoose');

// OtpVerification stores each OTP request with expiry and usage tracking.
// A TTL index on expiresAt automatically removes expired documents from MongoDB.
const OtpVerificationSchema = new mongoose.Schema({
    phone: { type: String, required: true, index: true },
    otp: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL index: doc deleted when expiresAt is reached
    used: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('OtpVerification', OtpVerificationSchema);
