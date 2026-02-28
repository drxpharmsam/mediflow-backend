const crypto = require('crypto');
const OtpVerification = require('../models/OtpVerification');

// --- CONFIGURATION ---
const OTP_EXPIRY_MINUTES = 5;       // OTP expires after this many minutes
const OTP_THROTTLE_MAX = 5;         // Max OTP requests allowed per phone per window
const OTP_THROTTLE_WINDOW_HOURS = 1; // Throttle window in hours

/**
 * Generates a cryptographically secure 6-digit OTP.
 * Uses crypto.randomInt for uniform, secure random values.
 * @returns {string} 6-digit OTP string (zero-padded)
 */
function generateOtp() {
    // crypto.randomInt(min, max) is exclusive of max; range 100000–999999 gives natural 6-digit OTPs
    const otp = crypto.randomInt(100000, 1000000);
    return otp.toString();
}

/**
 * Simulates sending an OTP to the given phone number by printing to console.
 * Replace the console.log body with a real SMS/email provider call, e.g.:
 *   await twilioClient.messages.create({ to: phone, from: TWILIO_FROM, body: `Your OTP: ${otp}` });
 * Or for email:
 *   await nodemailer.sendMail({ to: email, subject: 'OTP', text: `Your OTP: ${otp}` });
 * @param {string} phone - Recipient phone number
 * @param {string} otp   - The OTP to send
 */
async function sendOtp(phone, otp) {
    // TODO: Replace with real SMS provider (e.g. Twilio, MSG91, Fast2SMS)
    console.log(`\n💬 --- OTP REQUEST ---`);
    console.log(`📱 Phone: ${phone} | 🔑 OTP: ${otp}`);
    console.log(`⏰ Valid for ${OTP_EXPIRY_MINUTES} minutes.\n`);
}

/**
 * Checks whether the given phone number has exceeded the OTP request throttle limit.
 * Counts OTP documents created within the throttle window.
 * @param {string} phone - The phone number to check
 * @returns {Promise<boolean>} true if throttled (too many requests), false if allowed
 */
async function isThrottled(phone) {
    const windowStart = new Date(Date.now() - OTP_THROTTLE_WINDOW_HOURS * 60 * 60 * 1000);
    const count = await OtpVerification.countDocuments({
        phone,
        createdAt: { $gte: windowStart }
    });
    return count >= OTP_THROTTLE_MAX;
}

/**
 * Creates and saves a new OTP record for the given phone number.
 * @param {string} phone - The phone number
 * @param {string} otp   - The generated OTP
 * @returns {Promise<void>}
 */
async function saveOtp(phone, otp) {
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    const record = new OtpVerification({ phone, otp, expiresAt });
    await record.save();
}

/**
 * Finds the most recent valid (unexpired, unused) OTP record for the phone.
 * @param {string} phone - The phone number
 * @param {string} otp   - The OTP to verify
 * @returns {Promise<Document|null>} The matching OTP document or null
 */
async function findValidOtp(phone, otp) {
    return OtpVerification.findOne({
        phone,
        otp,
        used: false,
        expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });
}

/**
 * Checks whether a phone number has a recently-used (verified) OTP,
 * confirming the phone was legitimately verified before registration.
 * @param {string} phone - The phone number to check
 * @returns {Promise<boolean>} true if a recent verified OTP exists
 */
async function hasRecentlyVerified(phone) {
    const windowMs = OTP_EXPIRY_MINUTES * 60 * 1000;
    return !!(await OtpVerification.findOne({
        phone,
        used: true,
        createdAt: { $gte: new Date(Date.now() - windowMs) }
    }));
}

module.exports = { generateOtp, sendOtp, isThrottled, saveOtp, findValidOtp, hasRecentlyVerified };
