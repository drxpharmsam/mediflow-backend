const mongoose = require('mongoose');

const DispatchJobSchema = new mongoose.Schema({
    orderId: { type: String, required: true },
    status: {
        type: String,
        enum: ['Created', 'Assigned', 'PickedUp', 'InTransit', 'Delivered', 'Cancelled'],
        default: 'Created'
    },
    assignedToDeliveryId: String,
    notes: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DispatchJob', DispatchJobSchema);
