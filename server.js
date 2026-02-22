const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer'); // <-- NEW: Import Nodemailer

const app = express();
app.use(cors());
app.use(express.json());

// 1. CLOUD DATABASE CONNECTION
const MONGO_URI = 'mongodb+srv://ayushgame:ayushsag@cluster0.ta1rgbl.mongodb.net/mediflow?appName=Cluster0';
mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ Connected to LIVE MongoDB Atlas Database');
        seedMedicines(); 
    })
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- GMAIL SETUP ---
// Create the transporter that logs into your Gmail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'ayushgame2005@gmail.com', // Replace with your Gmail
        pass: 'xchnnpvvzjbhlclz'   // Replace with your 16-letter App Password (no spaces)
    }
});


// 2. DATABASE SCHEMAS (Updated phone to email)
const UserSchema = new mongoose.Schema({
    email: String, // Changed from phone
    name: String, 
    age: Number, 
    gender: String
});
const User = mongoose.model('User', UserSchema);

const AddressSchema = new mongoose.Schema({ userId: String, line1: String, line2: String, tag: String });
const Address = mongoose.model('Address', AddressSchema);

const OrderSchema = new mongoose.Schema({
    orderId: String, userId: String, items: Array, totalAmount: Number,
    addressId: String, status: { type: String, default: "Confirmed" },
    hasPrescription: Boolean, createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', OrderSchema);

const MedicineSchema = new mongoose.Schema({ name: String, price: Number, category: String, type: String, icon: String, isRx: Boolean });
const Medicine = mongoose.model('Medicine', MedicineSchema);

const OtpSchema = new mongoose.Schema({
    email: String, // Changed from phone
    otp: String,
    createdAt: { type: Date, expires: '5m', default: Date.now } 
});
const OTP = mongoose.model('OTP', OtpSchema);

// --- SEED MEDICINES ---
async function seedMedicines() {
    try {
        const count = await Medicine.countDocuments();
        if (count === 0) {
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


// 3. API ROUTES

// --- AUTHENTICATION & EMAIL OTP ---
app.post('/api/auth/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email required" });

    // Generate a random 6-digit number
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    try {
        // Save to DB
        await OTP.findOneAndUpdate(
            { email }, 
            { otp: generatedOtp, createdAt: Date.now() }, 
            { upsert: true, new: true }
        );

        // 🚨 SEND REAL EMAIL VIA GMAIL 🚨
        const mailOptions = {
            from: '"MediFlow Pharmacy" ayushgame2005@gmail.com', // Replace with your Gmail
            to: email, // The user's email
            subject: 'Your MediFlow Login Code',
            html: `
                <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                    <h2 style="color: #055C61;">Welcome to MediFlow</h2>
                    <p>Your one-time login code is:</p>
                    <h1 style="font-size: 36px; letter-spacing: 5px; color: #36B8B7; background: #E0F7F6; padding: 10px; border-radius: 10px; display: inline-block;">
                        ${generatedOtp}
                    </h1>
                    <p style="color: #888;">This code is valid for 5 minutes. Do not share it with anyone.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);

        console.log(`📧 Email sent successfully to ${email}`);
        res.json({ success: true, message: "OTP sent successfully" });
    } catch (err) {
        console.error("Email Error:", err);
        res.status(500).json({ success: false, message: "Failed to send email." });
    }
});

app.post('/api/auth/verify', async (req, res) => {
    const { email, otp } = req.body;

    try {
        const validRecord = await OTP.findOne({ email, otp });
        if (!validRecord) return res.status(400).json({ success: false, message: "Invalid or expired OTP" });

        await OTP.deleteOne({ email });

        const existingUser = await User.findOne({ email: email });
        if (existingUser) {
            return res.json({ success: true, isNewUser: false, user: { ...existingUser._doc, id: existingUser._id } });
        } else {
            return res.json({ success: true, isNewUser: true });
        }
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/auth/register', async (req, res) => {
    const { email, name, age, gender } = req.body;
    try {
        const newUser = new User({ email, name, age, gender });
        await newUser.save(); 
        res.json({ success: true, user: { ...newUser._doc, id: newUser._id } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- FETCH MEDICINES ---
app.get('/api/medicines', async (req, res) => {
    try { const medicines = await Medicine.find(); res.json({ success: true, data: medicines }); } 
    catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- ADDRESS MANAGEMENT ---
app.get('/api/addresses/:userId', async (req, res) => { 
    try { const userAddresses = await Address.find({ userId: req.params.userId }); res.json({ success: true, data: userAddresses.map(a => ({ ...a._doc, id: a._id })) }); } 
    catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/addresses', async (req, res) => { 
    try { const newAddress = new Address({ userId: req.body.userId, line1: req.body.line1, line2: req.body.line2, tag: req.body.tag }); await newAddress.save(); res.json({ success: true, data: { ...newAddress._doc, id: newAddress._id } }); } 
    catch (err) { res.status(500).json({ success: false, message: err.message }); }
});


// --- ORDER PROCESSING ---

// NEW: Fetch past orders for a specific user
app.get('/api/orders/:userId', async (req, res) => { 
    try { 
        // Find orders matching the userId and sort them by newest first
        const userOrders = await Order.find({ userId: req.params.userId }).sort({ createdAt: -1 }); 
        res.json({ success: true, data: userOrders }); 
    } catch (err) { 
        res.status(500).json({ success: false, message: err.message }); 
    }
});

app.post('/api/orders', async (req, res) => { 
    // ... (keep your existing POST route here) ...
app.post('/api/orders', async (req, res) => { 
    try { const newOrder = new Order({ orderId: `ORD-${Date.now()}`, ...req.body }); await newOrder.save(); res.json({ success: true, order: newOrder }); } 
    catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// --- SERVER START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 MediFlow LIVE API Server running on port ${PORT}`);
    
});
