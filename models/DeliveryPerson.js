const mongoose = require('mongoose');

const deliveryPersonSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    isOnline: { type: Boolean, default: false },
    dispatches: { type: Array, default: [] }
});

const DeliveryPerson = mongoose.model('DeliveryPerson', deliveryPersonSchema);

module.exports = DeliveryPerson;