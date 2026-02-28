const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    orderId: { type: String, unique: true },
    userId: String,
    items: Array,
    totalAmount: Number,
    addressId: String,
    status: { type: String, default: 'Confirmed' },
    hasPrescription: Boolean,
    rxImageUrl: String,
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', OrderSchema);
