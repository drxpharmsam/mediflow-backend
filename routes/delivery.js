const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const DispatchJob = require('../models/DispatchJob');
const Order = require('../models/Order');

const deliveryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please try again later.' }
});

router.use(deliveryLimiter);

// GET /api/delivery/dispatch?assignedToDeliveryId=...
router.get('/dispatch', async (req, res) => {
    try {
        const filter = {};
        if (req.query.assignedToDeliveryId) {
            filter.assignedToDeliveryId = req.query.assignedToDeliveryId;
        }
        const jobs = await DispatchJob.find(filter).sort({ createdAt: -1 });
        res.json({ success: true, data: jobs });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/delivery/dispatch/:id/status
router.put('/dispatch/:id/status', async (req, res) => {
    const { status } = req.body;
    const validStatuses = ['Created', 'Assigned', 'PickedUp', 'InTransit', 'Delivered', 'Cancelled'];

    if (!status) {
        return res.status(400).json({ success: false, message: 'status is required.' });
    }

    if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}.` });
    }

    try {
        const job = await DispatchJob.findById(req.params.id);
        if (!job) {
            return res.status(404).json({ success: false, message: 'Dispatch job not found.' });
        }

        job.status = status;
        job.updatedAt = new Date();
        await job.save();

        // When delivered, update linked order status too
        if (status === 'Delivered') {
            await Order.findOneAndUpdate({ orderId: job.orderId }, { status: 'Delivered' });
        }

        res.json({ success: true, data: job });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
