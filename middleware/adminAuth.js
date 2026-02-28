/**
 * Admin authentication middleware.
 *
 * Reads the ADMIN_PHONES environment variable (comma-separated 10-digit numbers)
 * and checks that the incoming request carries an `x-admin-phone` header whose
 * value is in the allowlist.
 *
 * Returns:
 *   401 – header missing
 *   403 – header present but phone not in allowlist
 */

// Parse ADMIN_PHONES once at startup to avoid repeated string operations per request.
// A Set is used for O(1) lookups.
function buildAllowlist() {
    return new Set(
        (process.env.ADMIN_PHONES || '')
            .split(',')
            .map(p => p.trim())
            .filter(Boolean)
    );
}

// Exposed for testing; re-evaluated lazily on first call so tests can set env vars first.
let _allowlist = null;
function getAllowlist() {
    if (!_allowlist) {
        _allowlist = buildAllowlist();
    }
    return _allowlist;
}

function adminAuth(req, res, next) {
    const phone = (req.headers['x-admin-phone'] || '').trim();

    if (!phone) {
        return res.status(401).json({ success: false, message: 'Admin authentication required. Provide x-admin-phone header.' });
    }

    if (!getAllowlist().has(phone)) {
        return res.status(403).json({ success: false, message: 'Forbidden. Phone number not in admin allowlist.' });
    }

    next();
}

module.exports = adminAuth;
