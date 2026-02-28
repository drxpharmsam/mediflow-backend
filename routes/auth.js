const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

const { generateOtp, sendOtp, isThrottled, saveOtp, findValidOtp, hasRecentlyVerified } = require('../utils/otp');

// Lazy-load User model to avoid circular dependency issues
function getUser() {
    return mongoose.model('User');
}

// Rate limiter for verify and register endpoints (abuse prevention)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,                   // max 20 requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please try again later.' }
});

// POST /api/auth/send-otp
// Validates phone, checks throttle, generates a secure OTP, saves to DB, and outputs to console.
router.post('/send-otp', authLimiter, async (req, res) => {
    const { phone } = req.body;

    if (!phone || !/^\d{10}$/.test(phone)) {
        return res.status(400).json({ success: false, message: 'Valid 10-digit phone number required.' });
    }

    try {
        // Throttle: prevent abuse (max 5 OTP requests per phone per hour)
        if (await isThrottled(phone)) {
            return res.status(429).json({
                success: false,
                message: 'Too many OTP requests. Please try again later.'
            });
        }

        const otp = generateOtp();
        await saveOtp(phone, otp);

        // Simulate SMS delivery (replace sendOtp body with real SMS provider)
        await sendOtp(phone, otp);

        res.json({ success: true, message: 'OTP sent successfully.' });
    } catch (err) {
        console.error('send-otp error:', err);
        res.status(500).json({ success: false, message: 'Failed to generate OTP.' });
    }
});

// POST /api/auth/verify
// Verifies OTP: checks it is correct, unexpired, and unused. Marks it used on success.
// Returns existing user data or signals new user registration is required.
router.post('/verify', authLimiter, async (req, res) => {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
        return res.status(400).json({ success: false, message: 'Phone and OTP are required.' });
    }

    // Reject anything that is not a 6-digit numeric string before hitting the database.
    if (!/^\d{6}$/.test(otp)) {
        return res.status(400).json({ success: false, message: 'OTP must be a 6-digit number.' });
    }

    try {
        const record = await findValidOtp(phone, otp);
        if (!record) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });
        }

        // Mark OTP as used so it cannot be replayed
        record.used = true;
        await record.save();

        const User = getUser();
        const existingUser = await User.findOne({ phone });

        if (existingUser) {
            return res.json({
                success: true,
                isNewUser: false,
                user: { ...existingUser._doc, id: existingUser._id }
            });
        } else {
            return res.json({ success: true, isNewUser: true });
        }
    } catch (err) {
        console.error('verify error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/auth/register
// Registers a new user after OTP verification. Mobile number is the primary identifier;
// email is optional and not required at this stage.
router.post('/register', authLimiter, async (req, res) => {
    const { phone, name, age, gender } = req.body;

    if (!phone) {
        return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }

    try {
        const User = getUser();

        // Ensure the phone was recently OTP-verified before allowing registration
        if (!(await hasRecentlyVerified(phone))) {
            return res.status(403).json({
                success: false,
                message: 'Phone number not verified. Please complete OTP verification first.'
            });
        }

        // Prevent duplicate registration
        const existing = await User.findOne({ phone });
        if (existing) {
            return res.status(409).json({ success: false, message: 'User with this phone number already exists.' });
        }

        const newUser = new User({ phone, name, age, gender });
        await newUser.save();
        res.json({ success: true, user: { ...newUser._doc, id: newUser._id } });
    } catch (err) {
        console.error('register error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
