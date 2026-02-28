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
app.use(cors({ origin: "*" })); 
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const io = new Server(server, {
    cors: { origin: "*" } 
});

// Health Check Route (Keeps Render Server Alive)
app.get('/', (req, res) => {
    res.status(200).send("✅ MediFlow Stable Production Backend is LIVE.");
});

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
    phone: { type: String, required: true, unique: true },
    name: String, 
    age: Number, 
    gender: String,
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
// 4. CORE API ROUTES (USER END)
// ==========================================

// --- LIVE AUTHENTICATION & REAL OTP ---
app.post('/api/auth/send-otp', async (req, res) => {
    const { phone } = req.body;
    if (!phone || phone.length !== 10) return res.status(400).json({ success: false, message: "Valid 10-digit phone number required" });

    // GENERATE A REAL, RANDOM 6-DIGIT OTP
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    try {
        await OTP.findOneAndUpdate(
            { phone }, 
            { otp: generatedOtp, createdAt: Date.now() }, 
            { upsert: true, returnDocument: 'after' } 
        );
        
        // 👉 REAL SMS GATEWAY API GOES HERE
        // e.g., await sendSMS(phone, `Your MediFlow OTP is: ${generatedOtp}`);
        
        console.log(`\n💬 --- REAL OTP REQUEST ---`);
        console.log(`📱 Phone: ${phone} | 🔑 OTP: ${generatedOtp}`);
        
        res.json({ success: true, message: "OTP sent successfully." });
    } catch (err) { 
        res.status(500).json({ success: false, message: "Failed to generate OTP." }); 
    }
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


// --- ORDERS & CHECKOUT ---
app.post('/api/orders', async (req, res) => { 
    try { 
        const finalOrderId = req.body.orderId || `ORD-${Date.now()}`;
        const newOrder = new Order({ ...req.body, orderId: finalOrderId }); 
        await newOrder.save(); 
        res.json({ success: true, order: newOrder }); 
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/orders/:userId', async (req, res) => {
    try {
        const userOrders = await Order.find({ userId: req.params.userId }).sort({ date: -1 });
        res.json({ success: true, data: userOrders });
    } catch (err) { 
        res.status(500).json({ success: false, message: "Error fetching order history" }); 
    }
});


// ==========================================
// 5. ADMIN ROUTES (PHARMACIST END)
// ==========================================

app.get('/api/admin/orders', async (req, res) => {
    try {
        const allOrders = await Order.find().sort({ date: -1 });
        res.json({ success: true, data: allOrders });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error fetching admin orders" });
    }
});

app.put('/api/orders/:orderId/status', async (req, res) => {
    try {
        const { status } = req.body;
        const { orderId } = req.params;

        const updatedOrder = await Order.findOneAndUpdate(
            { orderId: orderId }, 
            { status: status }, 
            { returnDocument: 'after' } 
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
// 6. ADVANCED FILE UPLOADS (CRASH-PROOF)
// ==========================================
const storage = multer.memoryStorage();

// Set up multer, but don't inject it directly into the route yet
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit protects the server from overload
}).single('prescription');

app.post('/api/upload-rx', (req, res) => {
    // Wrap the upload function to catch ANY multer errors gracefully
    upload(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            console.error("Multer Error:", err.message);
            return res.status(400).json({ success: false, message: `Image upload failed: ${err.message}` });
        } else if (err) {
            console.error("Unknown Upload Error:", err);
            return res.status(500).json({ success: false, message: "Server error during upload." });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: "No image file detected." });
        }

        try {
            const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
            res.json({ success: true, fileUrl: base64Image });
        } catch (conversionErr) {
            console.error("Base64 Conversion Error:", conversionErr);
            res.status(500).json({ success: false, message: "Failed to process image format." });
        }
    });
});

// ==========================================
// 7. WEB PUSH NOTIFICATIONS
// ==========================================
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
