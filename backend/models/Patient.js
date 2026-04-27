const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
    name: { type: String, required: true },
    age: { type: Number, required: true },
    problem: { type: String, required: true },
    tokenNumber: { type: Number, required: true },
    department: { 
        type: String, 
        enum: ['Consultation', 'Pharmacy', 'Billing', 'Emergency'], 
        default: 'Consultation' 
    },
    isEmergency: { type: Boolean, default: false },
    emergencyStatus: { 
        type: String, 
        enum: ['none', 'pending', 'approved', 'rejected'], 
        default: 'none' 
    },
    queuePosition: { type: Number },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Patient', patientSchema);
