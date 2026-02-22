const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 1. CLOUD DATABASE CONNECTION
// ==========================================
// Your specific connection string.
const MONGO_URI = 'mongodb+srv://ayushgame:ayushsag@cluster0.ta1rgbl.mongodb.net/mediflow?appName=Cluster0';

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ Connected to LIVE MongoDB Atlas Database');
        seedMedicines(); 
    })
    .catch(err => console.error('❌ MongoDB Connection Error:', err));


// ==========================================
// 2. DATABASE SCHEMAS 
// ==========================================
// This User schema ensures customer data is saved permanently
const UserSchema = new mongoose.Schema({
    phone: String, 
    name: String, 
    age: Number, 
    gender: String
});
const User = mongoose.model('User', UserSchema);

const AddressSchema = new mongoose.Schema({
    userId: String, 
    line1: String, 
    line2: String, 
    tag: String
});
const Address = mongoose.model('Address', AddressSchema);

const OrderSchema = new mongoose.Schema({
    orderId: String, 
    userId: String, 
    items: Array, 
    totalAmount: Number,
    addressId: String, 
    status: { type: String, default: "Confirmed" },
    hasPrescription: Boolean, 
    createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', OrderSchema);

const MedicineSchema = new mongoose.Schema({
    name: String, 
    price: Number, 
    category: String, 
    type: String, 
    icon: String, 
    isRx: Boolean
});
const Medicine = mongoose.model('Medicine', MedicineSchema);

const OtpSchema = new mongoose.Schema({
    phone: String,
    otp: String,
    createdAt: { type: Date, expires: '5m', default: Date.now } 
});
const OTP = mongoose.model('OTP', OtpSchema);


// --- SEED MEDICINES IF EMPTY ---
async function seedMedicines() {
    try {
        const count = await Medicine.countDocuments();
        if (count === 0) {
            console.log("Empty medicine database detected. Seeding initial data...");
            const initialMeds = [
                { name: "Paracetamol (500mg)", price: 15, category: "Fever & Flu", type: "Tab", icon: "fa-temperature-half", isRx: false },
                { name: "Dolo 650", price: 30, category: "Fever & Flu", type: "Tab", icon: "fa-temperature-arrow-up", isRx: false },
                { name: "Pantop 40", price: 110, category: "Stomach Gas", type: "Tab", icon: "fa-fire", isRx: true },
                { name: "Metformin (500mg)", price: 65, category: "Diabetes", type: "Tab", icon: "fa-cube", isRx: true },
                { name: "Dettol Liquid", price: 65, category: "First Aid", type: "Liq", icon: "fa-pump-medical", isRx: false },
                { name: "Cetrizine", price: 18, category: "Allergy", type: "Tab", icon: "fa-head-side-cough", isRx: false }
            ];
            await Medicine.insertMany(initialMeds);
            console.log("Medicines seeded successfully!");
        }
    } catch (error) {
        console.error("Error seeding medicines:", error);
    }
}


// ==========================================
// 3. API ROUTES
// ==========================================

// --- AUTHENTICATION & OTP (Logs to Console/Render) ---
app.post('/api/auth/send-otp', async (req, res) => {
    const { phone } = req.body;
    
    if (!phone || phone.length !== 10) {
        return res.status(400).json({ success: false, message: "Valid 10-digit phone number required" });
    }

    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    try {
        // Save OTP to database temporarily
        await OTP.findOneAndUpdate(
            { phone }, 
            { otp: generatedOtp, createdAt: Date.now() }, 
            { upsert: true, new: true }
        );

        // Print OTP to Render Logs so you can read it during testing
        console.log(`\n💬 --- NEW OTP REQUEST ---`);
        console.log(`📱 User Phone: ${phone}`);
        console.log(`🔑 OTP CODE:   ${generatedOtp}`);
        console.log(`-------------------------\n`);

        // Send response back to frontend app
        // We are also sending the OTP back in the API response temporarily so you can see it in network tabs if needed
        res.json({ success: true, message: "OTP logged to server console", devOtp: generatedOtp });

    } catch (err) {
        console.error("OTP Generation Error:", err);
        res.status(500).json({ success: false, message: "Failed to generate OTP." });
    }
});

// Verify OTP and Check for Returning Customer
app.post('/api/auth/verify', async (req, res) => {
    const { phone, otp } = req.body;

    try {
        const validRecord = await OTP.findOne({ phone, otp });
        
        if (!validRecord) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

        await OTP.deleteOne({ phone });

        // IMPORTANT: Checking for returning customers
        const existingUser = await User.findOne({ phone: phone });
        
        if (existingUser) {
            console.log(`👋 Returning user logged in: ${existingUser.name}`);
            return res.json({ success: true, isNewUser: false, user: { ...existingUser._doc, id: existingUser._id } });
        } else {
            console.log(`🆕 New user registration started for: ${phone}`);
            return res.json({ success: true, isNewUser: true });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Register a Brand New Customer
app.post('/api/auth/register', async (req, res) => {
    const { phone, name, age, gender } = req.body;
    try {
        const newUser = new User({ phone, name, age, gender });
        await newUser.save(); 
        res.json({ success: true, user: { ...newUser._doc, id: newUser._id } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// --- FETCH MEDICINES ---
app.get('/api/medicines', async (req, res) => {
    try {
        const medicines = await Medicine.find(); 
        res.json({ success: true, data: medicines }); 
    } catch (err) { 
        res.status(500).json({ success: false, message: err.message }); 
    }
});


// --- ADDRESS MANAGEMENT ---
app.get('/api/addresses/:userId', async (req, res) => { 
    try { 
        const userAddresses = await Address.find({ userId: req.params.userId }); 
        res.json({ success: true, data: userAddresses.map(a => ({ ...a._doc, id: a._id })) }); 
    } catch (err) { 
        res.status(500).json({ success: false, message: err.message }); 
    }
});

app.post('/api/addresses', async (req, res) => { 
    try { 
        const newAddress = new Address({ 
            userId: req.body.userId, 
            line1: req.body.line1, 
            line2: req.body.line2, 
            tag: req.body.tag 
        }); 
        await newAddress.save(); 
        res.json({ success: true, data: { ...newAddress._doc, id: newAddress._id } }); 
    } catch (err) { 
        res.status(500).json({ success: false, message: err.message }); 
    }
});


// --- ORDER PROCESSING ---
app.get('/api/orders/:userId', async (req, res) => { 
    try { 
        const userOrders = await Order.find({ userId: req.params.userId }).sort({ createdAt: -1 }); 
        res.json({ success: true, data: userOrders }); 
    } catch (err) { 
        res.status(500).json({ success: false, message: err.message }); 
    }
});

app.post('/api/orders', async (req, res) => { 
    try { 
        const newOrder = new Order({ 
            orderId: `ORD-${Date.now()}`, 
            ...req.body 
        }); 
        await newOrder.save(); 
        res.json({ success: true, order: newOrder }); 
    } catch (err) { 
        res.status(500).json({ success: false, message: err.message }); 
    }
});


// --- SERVER START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 MediFlow LIVE API Server running on port ${PORT}`);
});
