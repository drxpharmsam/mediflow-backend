const mongoose = require('mongoose');

const AddressSchema = new mongoose.Schema({
    userId: String, line1: String, line2: String, tag: String
});

module.exports = mongoose.model('Address', AddressSchema);
