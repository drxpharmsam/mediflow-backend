const mongoose = require('mongoose');

const MedicineSchema = new mongoose.Schema({
    name: String, price: Number, category: String, type: String, icon: String, isRx: Boolean
});

module.exports = mongoose.model('Medicine', MedicineSchema);
