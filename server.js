const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http'); 
const { Server } = require('socket.io'); 
const multer = require('multer');

const app = express();
const server = http.createServer(app); 

// ==========================================
// 1. WEBSOCKETS & MIDDLEWARE
// ==========================================
// Allow your frontend to talk to this backend
app.use(cors({ origin: "*" })); 
// Limit increased to 10mb to handle prescription image uploads safely
app.use(express.json({ limit: '10mb' })); 

const io = new Server(server, {
    cors: { origin: "*" } 
});

// Health Check (Crucial for Render deployments to not crash)
app.get('/', (req, res) => {
    res.status(200).send("✅ MediFlow Backend is LIVE and listening!");
});

// ==========================================
// 2. CLOUD DATABASE CONNECTION
// ==========================================
// Your live MongoDB URI
const MONGO_URI = 'mongodb+srv://ayushgame:ayushsag@cluster0.ta1rgbl.mongodb.net/mediflow?appName=Cluster0';

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ Connected to LIVE MongoDB Atlas Database');
        seedMedicines(); // Loads medicines into DB if it's empty
    })
    .catch(err => console.error('❌ MongoDB Connection Error:', err));


// ==========================================
// 3. DATABASE SCHEMAS & MODELS
// ==========================================
const User = mongoose.model('User', new mongoose.Schema({
    phone: String, name: String, age: Number, gender: String,
    createdAt: { type: Date, default: Date.now }
}));

const Address = mongoose.model('Address', new mongoose.Schema({
    userId: String, line1: String, line2: String, tag: String
}));

// THE ORDER SCHEMA: 'items: Array' saves your exact Zepto-style cart (+/- quantities)
const Order = mongoose.model('Order', new mongoose.Schema({
    orderId: String, 
    userId: String, 
    items: Array, 
    totalAmount: Number,
    addressId: String, 
    status: { type: String, default: "Confirmed" },
    hasPrescription: Boolean, 
    rxImageUrl: String,
    date: { type: Date, default: Date.now }
}));

const Medicine = mongoose.model('Medicine', new mongoose.Schema({
    name: String, price: Number, category: String, type: String, icon: String, isRx: Boolean
}));

const OTP = mongoose.model('OTP', new mongoose.Schema({
    phone: String, otp: String, createdAt: { type: Date, expires: '5m', default: Date.now } 
}));

// --- SEED MEDICINES ---
async function seedMedicines() {
    try {
        const count = await Medicine.countDocuments();
        if (count === 0) {
            console.log("Seeding initial medicines into MongoDB...");
            await Medicine.insertMany([
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
            ]);
        }
    } catch (error) { console.error("Error seeding medicines:", error); }
}


// ==========================================
// 4. CORE API ROUTES (FOR USER APP)
// ==========================================

// --- AUTHENTICATION & OTP ---
app.post('/api/auth/send-otp', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: "Phone required" });

    // Generate a random 6 digit OTP (or use 123456 for testing)
    const generatedOtp = "123456"; 

    try {
        // FIXED MONGOOSE DEPRECATION WARNING HERE
        await OTP.findOneAndUpdate(
            { phone }, 
            { otp: generatedOtp, createdAt: Date.now() }, 
            { upsert: true, returnDocument: 'after' } 
        );
        console.log(`💬 OTP requested for ${phone}: ${generatedOtp}`);
        res.json({ success: true, message: "OTP sent" });
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
            // User exists -> send profile data back
            res.json({ success: true, isNewUser: false, user: { ...existingUser._doc, id: existingUser._id } });
        } else {
            // New user -> prompt frontend to show profile creation screen
            res.json({ success: true, isNewUser: true });
        }
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const newUser = new User(req.body);
        await newUser.save(); 
        res.json({ success: true, user: { ...newUser._doc, id: newUser._id } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- CATALOG & ADDRESSES ---
app.get('/api/medicines', async (req, res) => {
    try { 
        const medicines = await Medicine.find(); 
        res.json({ success: true, data: medicines }); 
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/addresses/:userId', async (req, res) => { 
    try { 
        const userAddresses = await Address.find({ userId: req.params.userId }); 
        res.json({ success: true, data: userAddresses.map(a => ({ ...a._doc, id: a._id })) }); 
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/addresses', async (req, res) => { 
    try { 
        const newAddress = new Address(req.body); 
        await newAddress.save(); 
        res.json({ success: true, data: { ...newAddress._doc, id: newAddress._id } }); 
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- ORDERS & CHECKOUT ---
app.post('/api/orders', async (req, res) => { 
    try { 
        // Use ID sent from frontend (so COD & Online match) or generate a fallback
        const finalOrderId = req.body.orderId || `ORD-${Date.now()}`;
        const newOrder = new Order({ ...req.body, orderId: finalOrderId }); 
        await newOrder.save(); 
        res.json({ success: true, order: newOrder }); 
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/orders/:userId', async (req, res) => {
    try {
        // Fetch order history for the specific user, newest first
        const userOrders = await Order.find({ userId: req.params.userId }).sort({ date: -1 });
        res.json({ success: true, data: userOrders });
    } catch (err) { res.status(500).json({ success: false, message: "Error fetching order history" }); }
});


// ==========================================
// 5. API ENDPOINTS (FOR PHARMACIST DASHBOARD)
// ==========================================

// Fetch ALL orders globally for the Admin Panel
app.get('/api/admin/orders', async (req, res) => {
    try {
        const allOrders = await Order.find().sort({ date: -1 });
        res.json({ success: true, data: allOrders });
    } catch (err) { res.status(500).json({ success: false, message: "Error fetching admin orders" }); }
});

// Update Order Status (Used by Admin Panel)
app.put('/api/orders/:orderId/status', async (req, res) => {
    try {
        // FIXED MONGOOSE DEPRECATION WARNING HERE
        const updatedOrder = await Order.findOneAndUpdate(
            { orderId: req.params.orderId }, 
            { status: req.body.status }, 
            { returnDocument: 'after' } 
        );
        if(!updatedOrder) return res.status(404).json({ success: false, message: "Order not found" });
        
        res.json({ success: true, order: updatedOrder });
    } catch (err) { res.status(500).json({ success: false, message: "Error updating order status" }); }
});


// ==========================================
// 6. ADVANCED FILE UPLOADS (RENDER-SAFE)
// ==========================================
// Instead of saving directly to the server hard drive (which Render deletes),
// we save it to memory and convert it to Base64 to store/send safely.
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB Limit
});

app.post('/api/upload-rx', upload.single('prescription'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "No image provided" });
    }

    try {
        // Convert to Base64 String URL
        const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        res.json({ success: true, fileUrl: base64Image });
    } catch (err) {
        console.error("Upload Error:", err);
        res.status(500).json({ success: false, message: "Failed to process image" });
    }
});


// ==========================================
// 7. LIVE TRACKING WEBSOCKET EVENTS
// ==========================================
io.on('connection', (socket) => {
    console.log(`🔗 Device connected: ${socket.id}`);

    socket.on('joinDeliveryRoom', (data) => {
        socket.join(data.orderId);
        console.log(`🛵 Joined tracking room for order: ${data.orderId}`);
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
    console.log(`🚀 MediFlow API Server running on port ${PORT}`);
});
