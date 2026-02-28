require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http'); 
const { Server } = require('socket.io'); 
const multer = require('multer');
const webpush = require('web-push');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, param, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app); 

// ==========================================
// 1. WEBSOCKETS & MIDDLEWARE
// ==========================================

// Security headers
app.use(helmet());

// CORS – restrict to known origin(s)
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
    : [];
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (same-origin / mobile apps) or allowed origins
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

app.use(express.json({ limit: '1mb' })); 
app.use(express.urlencoded({ limit: '1mb', extended: true }));

const io = new Server(server, {
    cors: {
        origin: allowedOrigins.length ? allowedOrigins : false,
        credentials: true
    }
});

// Health Check Route (Keeps Render Server Alive)
app.get('/', (req, res) => {
    res.status(200).send("✅ MediFlow Stable Production Backend is LIVE.");
});

// ==========================================
// 2. CLOUD DATABASE CONNECTION
// ==========================================
const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
    console.error('❌ MONGODB_URI environment variable is not set');
    process.exit(1);
}

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ Connected to LIVE MongoDB Atlas Database');
        seedMedicines(); 
    })
    .catch(err => console.error('❌ MongoDB Connection Error:', err));


// ==========================================
// 3. DATABASE SCHEMAS 
// ==========================================
const UserSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    name: String, 
    age: Number, 
    gender: String,
    role: { type: String, default: 'user' },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const AddressSchema = new mongoose.Schema({
    userId: String, line1: String, line2: String, tag: String
});
const Address = mongoose.model('Address', AddressSchema);

const OrderSchema = new mongoose.Schema({
    orderId: { type: String, unique: true }, 
    userId: String, 
    items: Array, 
    totalAmount: Number,
    addressId: String, 
    status: { type: String, default: "Confirmed" },
    hasPrescription: Boolean, 
    rxImageUrl: String, 
    date: { type: Date, default: Date.now } 
});
const Order = mongoose.model('Order', OrderSchema);

const MedicineSchema = new mongoose.Schema({
    name: String, price: Number, category: String, type: String, icon: String, isRx: Boolean
});
const Medicine = mongoose.model('Medicine', MedicineSchema);

const OtpSchema = new mongoose.Schema({
    phone: String, otpHash: String, createdAt: { type: Date, expires: '5m', default: Date.now } 
});
const OTP = mongoose.model('OTP', OtpSchema);

// --- SEED MEDICINES ---
async function seedMedicines() {
    try {
        const count = await Medicine.countDocuments();
        if (count === 0) {
            console.log("Seeding initial medicines...");
            const initialMeds = [
                { name: "Paracetamol (500mg)", price: 15, category: "Fever & Flu", type: "Tab", icon: "fa-temperature-half", isRx: false },
                { name: "Dolo 650", price: 30, category: "Fever & Flu", type: "Tab", icon: "fa-temperature-arrow-up", isRx: false },
                { name: "Vicks Action 500", price: 45, category: "Fever & Flu", type: "Tab", icon: "fa-head-side-virus", isRx: false },
                { name: "Benadryl Syrup", price: 125, category: "Cough & Cold", type: "Syr", icon: "fa-wine-bottle", isRx: false },
                { name: "Ascoril LS", price: 115, category: "Cough & Cold", type: "Syr", icon: "fa-lungs", isRx: true },
                { name: "Combiflam", price: 40, category: "Pain Relief", type: "Tab", icon: "fa-pills", isRx: false },
                { name: "Pantop 40", price: 110, category: "Stomach Gas", type: "Tab", icon: "fa-fire", isRx: true },
                { name: "Metformin (500mg)", price: 65, category: "Diabetes", type: "Tab", icon: "fa-cube", isRx: true },
                { name: "Dettol Liquid", price: 65, category: "First Aid", type: "Liq", icon: "fa-pump-medical", isRx: false },
                { name: "Cetrizine", price: 18, category: "Allergy", type: "Tab", icon: "fa-head-side-cough", isRx: false }
            ];
            await Medicine.insertMany(initialMeds);
        }
    } catch (error) { console.error("Error seeding medicines:", error); }
}

// ==========================================
// 3b. AUTH HELPERS & MIDDLEWARE
// ==========================================
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('❌ JWT_SECRET environment variable is not set');
    process.exit(1);
}

function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    try {
        req.user = jwt.verify(authHeader.slice(7), JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
}

function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        next();
    });
}

function handleValidation(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }
    next();
}

// ==========================================
// 3c. RATE LIMITERS
// ==========================================
const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many OTP requests, please try again later.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' }
});

const orderLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many order requests, please try again later.' }
});

const generalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' }
});

// Apply general rate limiting to all API routes
app.use('/api/', generalLimiter);

// ==========================================
// 4. CORE API ROUTES (USER END)
// ==========================================

// --- LIVE AUTHENTICATION & REAL OTP ---
app.post('/api/auth/send-otp',
    otpLimiter,
    [body('phone').trim().matches(/^\d{10}$/).withMessage('Valid 10-digit phone number required')],
    handleValidation,
    async (req, res) => {
        const { phone } = req.body;
        const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

        try {
            const otpHash = await bcrypt.hash(generatedOtp, 10);
            await OTP.findOneAndUpdate(
                { phone }, 
                { otpHash, createdAt: Date.now() }, 
                { upsert: true, returnDocument: 'after' } 
            );
            
            // 👉 REAL SMS GATEWAY API GOES HERE
            // e.g., await sendSMS(phone, `Your MediFlow OTP is: ${generatedOtp}`);
            
            console.log(`\n💬 --- REAL OTP REQUEST ---`);
            console.log(`📱 Phone: ${phone} | 🔑 OTP: ${generatedOtp}`);
            
            res.json({ success: true, message: "OTP sent successfully." });
        } catch { 
            res.status(500).json({ success: false, message: "Failed to generate OTP." }); 
        }
    }
);

app.post('/api/auth/verify',
    authLimiter,
    [
        body('phone').trim().matches(/^\d{10}$/).withMessage('Valid phone number required'),
        body('otp').trim().matches(/^\d{6}$/).withMessage('Valid 6-digit OTP required')
    ],
    handleValidation,
    async (req, res) => {
        const { phone, otp } = req.body;
        try {
            const record = await OTP.findOne({ phone });
            const valid = record && await bcrypt.compare(otp, record.otpHash);
            if (!valid) return res.status(400).json({ success: false, message: "Invalid or expired OTP" });

            await OTP.deleteOne({ phone }); 
            const existingUser = await User.findOne({ phone });
            
            if (existingUser) {
                const token = signToken({ id: existingUser._id, role: existingUser.role || 'user' });
                return res.json({ success: true, isNewUser: false, token, user: { ...existingUser._doc, id: existingUser._id } });
            } else {
                return res.json({ success: true, isNewUser: true, phone });
            }
        } catch { res.status(500).json({ success: false, message: "Authentication failed." }); }
    }
);

app.post('/api/auth/register',
    authLimiter,
    [
        body('phone').trim().matches(/^\d{10}$/).withMessage('Valid phone number required'),
        body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
        body('age').isInt({ min: 1, max: 120 }).withMessage('Valid age required'),
        body('gender').trim().isIn(['Male', 'Female', 'Other']).withMessage('Valid gender required')
    ],
    handleValidation,
    async (req, res) => {
        const { phone, name, age, gender } = req.body;
        try {
            const existing = await User.findOne({ phone });
            if (existing) {
                return res.status(409).json({ success: false, message: "Registration failed." });
            }
            const newUser = new User({ phone, name, age, gender });
            await newUser.save();
            const token = signToken({ id: newUser._id, role: newUser.role || 'user' });
            res.json({ success: true, token, user: { ...newUser._doc, id: newUser._id } });
        } catch { res.status(500).json({ success: false, message: "Registration failed." }); }
    }
);


// --- DATA FETCHING ---
app.get('/api/medicines', async (req, res) => {
    try { const medicines = await Medicine.find(); res.json({ success: true, data: medicines }); } 
    catch { res.status(500).json({ success: false, message: "Failed to fetch medicines." }); }
});

app.get('/api/addresses/:userId',
    requireAuth,
    [param('userId').trim().notEmpty()],
    handleValidation,
    async (req, res) => { 
        if (req.user.id !== req.params.userId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        try { 
            const userAddresses = await Address.find({ userId: req.params.userId }); 
            res.json({ success: true, data: userAddresses.map(a => ({ ...a._doc, id: a._id })) }); 
        } catch { res.status(500).json({ success: false, message: "Failed to fetch addresses." }); }
    }
);

app.post('/api/addresses',
    requireAuth,
    [
        body('userId').trim().notEmpty().withMessage('userId required'),
        body('line1').trim().notEmpty().withMessage('Address line 1 required').isLength({ max: 200 }),
        body('line2').trim().optional().isLength({ max: 200 }),
        body('tag').trim().notEmpty().withMessage('Tag required').isLength({ max: 50 })
    ],
    handleValidation,
    async (req, res) => {
        if (req.user.id !== req.body.userId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        try { 
            const newAddress = new Address({ userId: req.body.userId, line1: req.body.line1, line2: req.body.line2, tag: req.body.tag }); 
            await newAddress.save(); 
            res.json({ success: true, data: { ...newAddress._doc, id: newAddress._id } }); 
        } catch { res.status(500).json({ success: false, message: "Failed to save address." }); }
    }
);


// --- ORDERS & CHECKOUT ---
app.post('/api/orders',
    requireAuth,
    orderLimiter,
    [
        body('userId').trim().notEmpty().withMessage('userId required'),
        body('items').isArray({ min: 1 }).withMessage('Items array required'),
        body('totalAmount').isFloat({ min: 0 }).withMessage('Valid total amount required'),
        body('addressId').trim().notEmpty().withMessage('addressId required')
    ],
    handleValidation,
    async (req, res) => { 
        if (req.user.id !== req.body.userId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        try { 
            const finalOrderId = `ORD-${Date.now()}`;
            const { userId, items, totalAmount, addressId, hasPrescription, rxImageUrl } = req.body;
            const newOrder = new Order({ orderId: finalOrderId, userId, items, totalAmount, addressId, hasPrescription, rxImageUrl }); 
            await newOrder.save(); 
            res.json({ success: true, order: newOrder }); 
        } catch { res.status(500).json({ success: false, message: "Failed to place order." }); }
    }
);

app.get('/api/orders/:userId',
    requireAuth,
    [param('userId').trim().notEmpty()],
    handleValidation,
    async (req, res) => {
        if (req.user.id !== req.params.userId && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        try {
            const userOrders = await Order.find({ userId: req.params.userId }).sort({ date: -1 });
            res.json({ success: true, data: userOrders });
        } catch { 
            res.status(500).json({ success: false, message: "Error fetching order history" }); 
        }
    }
);


// ==========================================
// 5. ADMIN ROUTES (PHARMACIST END)
// ==========================================

app.get('/api/admin/orders', requireAdmin, async (req, res) => {
    try {
        const allOrders = await Order.find().sort({ date: -1 });
        console.log(`[AUDIT] Admin ${req.user.id} fetched all orders`);
        res.json({ success: true, data: allOrders });
    } catch {
        res.status(500).json({ success: false, message: "Error fetching admin orders" });
    }
});

app.put('/api/orders/:orderId/status',
    requireAdmin,
    [
        param('orderId').trim().notEmpty(),
        body('status').trim().isIn(['Confirmed', 'Processing', 'Out for Delivery', 'Delivered', 'Cancelled'])
            .withMessage('Invalid status value')
    ],
    handleValidation,
    async (req, res) => {
        try {
            const { status } = req.body;
            const { orderId } = req.params;

            const updatedOrder = await Order.findOneAndUpdate(
                { orderId }, 
                { status }, 
                { returnDocument: 'after' } 
            );

            if (!updatedOrder) {
                return res.status(404).json({ success: false, message: "Order not found" });
            }

            console.log(`[AUDIT] Admin ${req.user.id} updated order ${orderId} status to ${status}`);
            res.json({ success: true, order: updatedOrder });
        } catch {
            res.status(500).json({ success: false, message: "Error updating order status" });
        }
    }
);


// ==========================================
// 6. ADVANCED FILE UPLOADS (CRASH-PROOF)
// ==========================================
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only image files are allowed.'));
        }
    }
}).single('prescription');

app.post('/api/upload-rx', requireAuth, (req, res) => {
    upload(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ success: false, message: "Image upload failed." });
        } else if (err) {
            return res.status(500).json({ success: false, message: "Server error during upload." });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: "No image file detected." });
        }

        // Validate actual content-type matches allowed types
        if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
            return res.status(400).json({ success: false, message: "Only image files are allowed." });
        }

        try {
            const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
            res.json({ success: true, fileUrl: base64Image });
        } catch {
            res.status(500).json({ success: false, message: "Failed to process image format." });
        }
    });
});

// ==========================================
// 7. WEB PUSH NOTIFICATIONS
// ==========================================
let vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (!vapidPublicKey || !vapidPrivateKey) {
    if (process.env.NODE_ENV === 'production') {
        console.error('❌ VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set in production');
        process.exit(1);
    }
    const generated = webpush.generateVAPIDKeys();
    vapidPublicKey = generated.publicKey;
    vapidPrivateKey = generated.privateKey;
    console.warn('⚠️  VAPID keys not set in env. Generated temporary keys (set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in production).');
}

webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'admin@mediflow.com'}`,
    vapidPublicKey,
    vapidPrivateKey
);

let pushSubscriptions = []; 

app.post('/api/subscribe', requireAuth, (req, res) => {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ success: false, message: 'Invalid subscription object.' });
    }
    pushSubscriptions.push(subscription);
    res.status(201).json({ success: true, publicKey: vapidPublicKey });
});

app.post('/api/send-marketing', requireAdmin, (req, res) => {
    const payload = JSON.stringify({
        title: "MediFlow Special Offer! 💊",
        body: "Get 20% off your next prescription refill. Tap to claim.",
        icon: "https://cdn-icons-png.flaticon.com/512/2869/2869713.png"
    });

    pushSubscriptions.forEach(sub => {
        webpush.sendNotification(sub, payload).catch(err => console.error(err));
    });
    console.log(`[AUDIT] Admin ${req.user.id} sent marketing push notification`);
    res.json({ success: true, message: "Push notifications sent!" });
});


// ==========================================
// 8. LIVE TRACKING WEBSOCKET EVENTS
// ==========================================
io.on('connection', (socket) => {
    console.log(`🔗 Device connected for WebSockets: ${socket.id}`);

    socket.on('joinDeliveryRoom', (data) => {
        socket.join(data.orderId);
    });

    socket.on('driverLocationUpdate', (data) => {
        io.to(data.orderId).emit('driverLocationUpdate', {
            latitude: data.latitude,
            longitude: data.longitude
        });
    });

    socket.on('disconnect', () => {
        console.log('❌ Device disconnected');
    });
});

// ==========================================
// --- SERVER START ---
// ==========================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 MediFlow Stable Production Server running on port ${PORT}`);
});
