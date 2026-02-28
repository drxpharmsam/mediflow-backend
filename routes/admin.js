const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const Order = require('../models/Order');
const Medicine = require('../models/Medicine');
const InventoryItem = require('../models/InventoryItem');
const InventoryMovement = require('../models/InventoryMovement');
const DispatchJob = require('../models/DispatchJob');

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please try again later.' }
});

router.use(adminLimiter);

// ==========================================
// ORDERS
// ==========================================

// GET /api/admin/orders
router.get('/orders', async (req, res) => {
    try {
        const allOrders = await Order.find().sort({ date: -1 });
        res.json({ success: true, data: allOrders });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching admin orders' });
    }
});

// ==========================================
// INVENTORY
// ==========================================

// GET /api/admin/inventory
router.get('/inventory', async (req, res) => {
    try {
        const items = await InventoryItem.find().populate('medicineId', 'name price category type');
        res.json({ success: true, data: items });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/admin/inventory/adjust
router.post('/inventory/adjust', async (req, res) => {
    const { medicineId, qtyChange, reason, orderId, byUserId } = req.body;

    if (!medicineId || qtyChange === undefined || !reason) {
        return res.status(400).json({ success: false, message: 'medicineId, qtyChange, and reason are required.' });
    }

    if (typeof qtyChange !== 'number') {
        return res.status(400).json({ success: false, message: 'qtyChange must be a number.' });
    }

    try {
        // Find or create InventoryItem
        let item = await InventoryItem.findOne({ medicineId });
        if (!item) {
            item = new InventoryItem({ medicineId, onHand: 0 });
        }

        const newOnHand = item.onHand + qtyChange;
        if (newOnHand < 0) {
            return res.status(400).json({
                success: false,
                message: `Insufficient stock. Current onHand: ${item.onHand}, requested change: ${qtyChange}.`
            });
        }

        item.onHand = newOnHand;
        item.updatedAt = new Date();
        await item.save();

        // Record movement
        const movement = new InventoryMovement({ medicineId, qtyChange, reason, orderId, byUserId });
        await movement.save();

        res.json({ success: true, data: { item, movement } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/admin/inventory/seed
router.post('/inventory/seed', async (req, res) => {
    try {
        const medicines = await Medicine.find();
        let created = 0;
        let skipped = 0;

        for (const med of medicines) {
            const existing = await InventoryItem.findOne({ medicineId: med._id });
            if (!existing) {
                await new InventoryItem({ medicineId: med._id, name: med.name, onHand: 0 }).save();
                created++;
            } else {
                skipped++;
            }
        }

        res.json({ success: true, data: { created, skipped, total: medicines.length } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// DISPATCH
// ==========================================

// POST /api/admin/dispatch
router.post('/dispatch', async (req, res) => {
    const { orderId, assignedToDeliveryId, notes } = req.body;

    if (!orderId) {
        return res.status(400).json({ success: false, message: 'orderId is required.' });
    }

    try {
        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        // Check for existing non-cancelled dispatch job
        const existing = await DispatchJob.findOne({ orderId, status: { $ne: 'Cancelled' } });
        if (existing) {
            return res.status(409).json({ success: false, message: 'A dispatch job already exists for this order.', data: existing });
        }

        const job = new DispatchJob({ orderId, assignedToDeliveryId, notes });
        await job.save();

        // Update order status to Dispatched
        order.status = 'Dispatched';
        await order.save();

        res.status(201).json({ success: true, data: job });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/admin/dispatch
router.get('/dispatch', async (req, res) => {
    try {
        const filter = {};
        if (req.query.status) {
            filter.status = req.query.status;
        }
        const jobs = await DispatchJob.find(filter).sort({ createdAt: -1 });
        res.json({ success: true, data: jobs });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
