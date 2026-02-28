'use strict';
/**
 * OTP Security Tests
 *
 * Validates that:
 *  1. generateOtp() always produces a 6-digit numeric string
 *  2. generateOtp() never falls back to a hardcoded value such as '123456'
 *  3. generateOtp() uses crypto.randomInt and produces different values across calls
 *  4. crypto.randomInt availability guard fires as expected when the function is missing
 *  5. sendOtp() does NOT log the full OTP (masks it)
 */

// Mock OtpVerification before requiring otp.js
jest.mock('../models/OtpVerification', () => ({}));

const crypto = require('crypto');

describe('generateOtp()', () => {
    let generateOtp;

    beforeEach(() => {
        jest.resetModules();
        jest.mock('../models/OtpVerification', () => ({}));
        ({ generateOtp } = require('../utils/otp'));
    });

    test('returns a 6-digit numeric string', () => {
        const otp = generateOtp();
        expect(otp).toMatch(/^\d{6}$/);
    });

    test('never returns hardcoded fallback values such as "123456" or "000000"', () => {
        // Run enough iterations to be statistically certain
        for (let i = 0; i < 1000; i++) {
            const otp = generateOtp();
            // No predictable default value should ever be returned
            expect(otp).not.toBe('123456');
            expect(otp).not.toBe('000000');
        }
    });

    test('produces values within the valid 6-digit range (100000–999999)', () => {
        for (let i = 0; i < 100; i++) {
            const otp = generateOtp();
            const num = parseInt(otp, 10);
            expect(num).toBeGreaterThanOrEqual(100000);
            expect(num).toBeLessThanOrEqual(999999);
        }
    });

    test('produces different values across calls (not a constant)', () => {
        const results = new Set();
        for (let i = 0; i < 20; i++) {
            results.add(generateOtp());
        }
        // With 20 samples from 900000 possibilities, all 20 should be unique
        expect(results.size).toBeGreaterThan(1);
    });

    test('throws if crypto.randomInt produces an out-of-range value', () => {
        // Temporarily override randomInt to return an invalid value
        const original = crypto.randomInt;
        crypto.randomInt = () => 99; // not a 6-digit number
        try {
            expect(() => generateOtp()).toThrow('OTP generation produced an unexpected value');
        } finally {
            crypto.randomInt = original;
        }
    });
});

describe('crypto.randomInt availability guard', () => {
    test('throws FATAL error when crypto.randomInt is not a function', () => {
        jest.resetModules();
        jest.mock('../models/OtpVerification', () => ({}));

        // Temporarily remove randomInt
        const original = crypto.randomInt;
        delete crypto.randomInt;
        try {
            expect(() => require('../utils/otp')).toThrow('crypto.randomInt is not available');
        } finally {
            crypto.randomInt = original;
        }
    });
});

describe('sendOtp()', () => {
    let sendOtp;
    let consoleSpy;

    beforeEach(() => {
        jest.resetModules();
        jest.mock('../models/OtpVerification', () => ({}));
        ({ sendOtp } = require('../utils/otp'));
        consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    test('does not log the full OTP to the console', async () => {
        const otp = '847391';
        await sendOtp('9876543210', otp);
        const loggedLines = consoleSpy.mock.calls.map(args => args.join(' ')).join('\n');
        // The full OTP must not appear in any console output
        expect(loggedLines).not.toContain(otp);
    });

    test('logs a masked version of the OTP', async () => {
        const otp = '847391';
        await sendOtp('9876543210', otp);
        const loggedLines = consoleSpy.mock.calls.map(args => args.join(' ')).join('\n');
        // The first two digits are shown; the rest are masked
        expect(loggedLines).toContain('84****');
    });
});
