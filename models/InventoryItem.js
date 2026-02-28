const mongoose = require('mongoose');

const InventoryItemSchema = new mongoose.Schema({
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true, unique: true },
    name: String,
    sku: String,
    onHand: { type: Number, default: 0 },
    reserved: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('InventoryItem', InventoryItemSchema);
