const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http'); 
const { Server } = require('socket.io'); 
const multer = require('multer');
const webpush = require('web-push');

const app = express();
const server = http.createServer(app); 

// ==========================================
// 1. WEBSOCKETS & MIDDLEWARE
// ==========================================
const io = new Server(server, {
    cors: { origin: "*" } 
});

app.use(cors());
app.use(express.json());

// ==========================================
// 2. CLOUD DATABASE CONNECTION
// ==========================================
const MONGO_URI = 'mongodb+srv://ayushgame:ayushsag@cluster0.ta1rgbl.mongodb.net/mediflow?appName=Cluster0';

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
    phone: String, name: String, age: Number, gender: String
});
const User = mongoose.model('User', UserSchema);

const AddressSchema = new mongoose.Schema({
    userId: String, line1: String, line2: String, tag: String
});
const Address = mongoose.model('Address', AddressSchema);

const OrderSchema = new mongoose.Schema({
    orderId: String, 
    userId: String, 
    items: Array, // This array will automatically store the { name, price, qty } from the frontend!
    totalAmount: Number,
    addressId: String, 
    status: { type: String, default: "Confirmed" },
    hasPrescription: Boolean, 
    rxImageUrl: String, 
    createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', OrderSchema);

const MedicineSchema = new mongoose.Schema({
    name: String, price: Number, category: String, type: String, icon: String, isRx: Boolean
});
const Medicine = mongoose.model('Medicine', MedicineSchema);

const OtpSchema = new mongoose.Schema({
    phone: String, otp: String, createdAt: { type: Date, expires: '5m', default: Date.now } 
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
// 4. CORE API ROUTES
// ==========================================

// --- AUTHENTICATION & OTP ---
app.post('/api/auth/send-otp', async (req, res) => {
    const { phone } = req.body;
    if (!phone || phone.length !== 10) return res.status(400).json({ success: false, message: "Valid 10-digit phone number required" });

    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    try {
        await OTP.findOneAndUpdate({ phone }, { otp: generatedOtp, createdAt: Date.now() }, { upsert: true, new: true });
        console.log(`\n💬 --- NEW OTP REQUEST ---`);
        console.log(`📱 Phone: ${phone} | 🔑 OTP: ${generatedOtp}`);
        res.json({ success: true, message: "OTP logged to server console", devOtp: generatedOtp });
    } catch (err) { res.status(500).json({ success: false, message: "Failed to generate OTP." }); }
});

app.post('/api/auth/verify', async (req, res) => {
    const { phone, otp } = req.body;
    try {
        const validRecord = await OTP.findOne({ phone, otp });
        if (!validRecord) return res.status(400).json({ success: false, message: "Invalid or expired OTP" });

        await OTP.deleteOne({ phone });
        const existingUser = await User.findOne({ phone: phone });
        
        if (existingUser) {
            return res.json({ success: true, isNewUser: false, user: { ...existingUser._doc, id: existingUser._id } });
        } else {
            return res.json({ success: true, isNewUser: true });
        }
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/auth/register', async (req, res) => {
    const { phone, name, age, gender } = req.body;
    try {
        const newUser = new User({ phone, name, age, gender });
        await newUser.save(); 
        res.json({ success: true, user: { ...newUser._doc, id: newUser._id } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- DATA FETCHING ---
app.get('/api/medicines', async (req, res) => {
    try { const medicines = await Medicine.find(); res.json({ success: true, data: medicines }); } 
    catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/addresses/:userId', async (req, res) => { 
    try { const userAddresses = await Address.find({ userId: req.params.userId }); res.json({ success: true, data: userAddresses.map(a => ({ ...a._doc, id: a._id })) }); } 
    catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/addresses', async (req, res) => { 
    try { const newAddress = new Address({ userId: req.body.userId, line1: req.body.line1, line2: req.body.line2, tag: req.body.tag }); await newAddress.save(); res.json({ success: true, data: { ...newAddress._doc, id: newAddress._id } }); } 
    catch (err) { res.status(500).json({ success: false, message: err.message }); }
});


// --- ORDERS & CART (FIXED) ---

// 1. Save an Order (Checks if frontend sent an ID, otherwise generates one)
app.post('/api/orders', async (req, res) => { 
    try { 
        const finalOrderId = req.body.orderId || `ORD-${Date.now()}`;
        const newOrder = new Order({ ...req.body, orderId: finalOrderId }); 
        await newOrder.save(); 
        res.json({ success: true, order: newOrder }); 
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// 2. Fetch User's Order History (NEW FIX: Required for the "My Orders" tab)
app.get('/api/orders/:userId', async (req, res) => {
    try {
        const userOrders = await Order.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json({ success: true, data: userOrders });
    } catch (err) { 
        res.status(500).json({ success: false, message: "Error fetching order history" }); 
    }
});


// ==========================================
// ADMIN ROUTES 
// ==========================================

// Fetch ALL orders across the entire platform (Sorted by newest)
app.get('/api/admin/orders', async (req, res) => {
    try {
        const allOrders = await Order.find().sort({ createdAt: -1 });
        res.json({ success: true, data: allOrders });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error fetching admin orders" });
    }
});

// Update the status of an order (Accept/Reject)
app.put('/api/orders/:orderId/status', async (req, res) => {
    try {
        const { status } = req.body;
        const { orderId } = req.params;

        const updatedOrder = await Order.findOneAndUpdate(
            { orderId: orderId }, 
            { status: status }, 
            { new: true }
        );

        if (!updatedOrder) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        res.json({ success: true, order: updatedOrder });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error updating order status" });
    }
});

// ==========================================
// 5. ADVANCED FILE UPLOADS (Render-Safe Memory Storage)
// ==========================================

const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // Limit to 5MB to keep database fast
});

app.post('/api/upload-rx', upload.single('prescription'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "No image provided" });
    }

    try {
        const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        res.json({ success: true, fileUrl: base64Image });
    } catch (err) {
        console.error("Upload Conversion Error:", err);
        res.status(500).json({ success: false, message: "Failed to process image" });
    }
});

// Web Push Notifications
const vapidKeys = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:admin@mediflow.com', vapidKeys.publicKey, vapidKeys.privateVapidKey);

let pushSubscriptions = []; 

app.post('/api/subscribe', (req, res) => {
    const subscription = req.body;
    pushSubscriptions.push(subscription);
    res.status(201).json({ success: true, publicKey: vapidKeys.publicKey });
});

app.post('/api/send-marketing', (req, res) => {
    const payload = JSON.stringify({
        title: "MediFlow Special Offer! 💊",
        body: "Get 20% off your next prescription refill. Tap to claim.",
        icon: "https://cdn-icons-png.flaticon.com/512/2869/2869713.png"
    });

    pushSubscriptions.forEach(sub => {
        webpush.sendNotification(sub, payload).catch(err => console.error(err));
    });
    res.json({ success: true, message: "Push notifications sent!" });
});


// ==========================================
// 6. LIVE TRACKING WEBSOCKET EVENTS
// ==========================================
io.on('connection', (socket) => {
    console.log(`🔗 Device connected for WebSockets: ${socket.id}`);

    socket.on('joinDeliveryRoom', (data) => {
        socket.join(data.orderId);
        console.log(`🛵 Client joined tracking room for order: ${data.orderId}`);
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
    console.log(`🚀 MediFlow LIVE API Server running on port ${PORT}`);
});
