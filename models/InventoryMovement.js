const mongoose = require('mongoose');

const InventoryMovementSchema = new mongoose.Schema({
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },
    qtyChange: { type: Number, required: true },
    reason: { type: String, required: true },
    orderId: String,
    byUserId: String,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('InventoryMovement', InventoryMovementSchema);
