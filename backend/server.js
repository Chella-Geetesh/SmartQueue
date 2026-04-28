const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const Patient = require('./models/Patient');
const Admin = require('./models/Admin');
const authMiddleware = require('./middleware/authMiddleware');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smartqueue')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

// Create Default Admin if none exists
const createDefaultAdmin = async () => {
    const adminExists = await Admin.findOne({ username: 'admin' });
    if (!adminExists) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await Admin.create({ username: 'admin', password: hashedPassword });
        console.log('Default Admin Created - username: admin, password: admin123');
    }
};
createDefaultAdmin();

// --- REST APIs ---

// 1. Patient joins queue
app.post('/api/patients', async (req, res) => {
    console.log('POST /api/patients received:', req.body);
    try {
        const { name, age, problem, isEmergency, emergencyDescription, department } = req.body;
        
        // Default to Consultation if not provided
        const patientDepartment = department || 'Consultation';

        // Generate Token Number based on department
        const lastPatient = await Patient.findOne({ department: patientDepartment }).sort({ tokenNumber: -1 });
        const tokenNumber = lastPatient ? lastPatient.tokenNumber + 1 : 1;

        // Calculate Position for specific department
        const activePatients = await Patient.countDocuments({ 
            queuePosition: { $exists: true },
            department: patientDepartment
        });
        const queuePosition = activePatients + 1;

        const emergencyStatus = isEmergency ? 'pending' : 'none';

        const newPatient = new Patient({
            name, age, problem,
            tokenNumber,
            department: patientDepartment,
            isEmergency,
            emergencyStatus,
            queuePosition
        });

        await newPatient.save();

        // Broadcast update
        io.emit('queueUpdate');
        if (isEmergency) io.emit('emergencyRequested', newPatient);

        res.status(201).json(newPatient);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Get full active queue
app.get('/api/queue', async (req, res) => {
    try {
        // Find all patients in any queue and sort by department then position
        const rawQueue = await Patient.find({ queuePosition: { $exists: true } })
                                     .sort({ department: 1, queuePosition: 1 });
        
        // Ensure every patient has a department field (fallback for old data)
        const queue = rawQueue.map(p => {
            const obj = p.toObject();
            if (!obj.department) obj.department = 'Consultation';
            return obj;
        });

        console.log(`GET /api/queue returned ${queue.length} patients`);
        res.json(queue);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Reset/Clear Queue (Admin Only)
app.delete('/api/queue', authMiddleware, async (req, res) => {
    try {
        // Delete all patients to reset token numbers to 1
        await Patient.deleteMany({});
        io.emit('queueUpdate');
        res.json({ message: 'All queues cleared' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Admin Login
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const admin = await Admin.findOne({ username });
        if (!admin) return res.status(400).json({ message: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET || 'supersecretkey', { expiresIn: '1d' });
        res.json({ token, username: admin.username });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Approve/Reject Emergency (Admin)
app.post('/api/emergency/:id', authMiddleware, async (req, res) => {
    try {
        const { action } = req.body; // 'approve' or 'reject'
        const patient = await Patient.findById(req.params.id);
        if (!patient) return res.status(404).json({ message: 'Patient not found' });

        if (action === 'approve') {
            patient.emergencyStatus = 'approved';
            
            // Remove them from their original department queue so normal patients aren't disturbed
            if (patient.queuePosition) {
                await Patient.updateMany(
                    { queuePosition: { $gt: patient.queuePosition }, department: patient.department },
                    { $inc: { queuePosition: -1 } }
                );
            }

            // Move them to the new 'Emergency' department queue
            const activeEmergencies = await Patient.countDocuments({ 
                queuePosition: { $exists: true },
                department: 'Emergency'
            });
            
            patient.department = 'Emergency';
            patient.queuePosition = activeEmergencies + 1;
            
            // Assign a new token number for the Emergency queue
            const lastEmergency = await Patient.findOne({ department: 'Emergency' }).sort({ tokenNumber: -1 });
            patient.tokenNumber = lastEmergency ? lastEmergency.tokenNumber + 1 : 1;
        } else {
            patient.emergencyStatus = 'rejected';
            // Stays at current position
        }

        await patient.save();
        io.emit('queueUpdate');
        res.json({ message: `Emergency ${action}d successfully`, patient });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Serve next patient (Admin)
app.post('/api/serve', authMiddleware, async (req, res) => {
    try {
        const { department } = req.body;
        if (!department) return res.status(400).json({ message: 'Department required' });

        const nextPatient = await Patient.findOne({ queuePosition: 1, department });
        if (!nextPatient) return res.status(404).json({ message: `No patients in ${department} queue` });

        // Remove from queue (unset position)
        nextPatient.queuePosition = undefined;
        await nextPatient.save();

        // Update positions of remaining patients in that department
        await Patient.updateMany(
            { queuePosition: { $gt: 1 }, department },
            { $inc: { queuePosition: -1 } }
        );

        io.emit('patientServed', nextPatient);
        io.emit('queueUpdate');

        res.json({ message: 'Patient served', servedPatient: nextPatient });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Catch-all: serve index.html for any non-API route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// Start Server
//const PORT = process.env.PORT || 5000;
const PORT =  5000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
