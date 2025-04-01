const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
    text: { type: String, required: true },
    link: { type: String, required: true },
    icon: String,
    newTab: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MenuItem', menuItemSchema);