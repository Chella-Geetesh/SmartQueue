const API_URL = '/api';
const socket = io();

// Auth Check
const token = localStorage.getItem('adminToken');
if (!token) {
    window.location.href = 'login.html';
}

const getHeaders = () => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
});

function getTokenPrefix(dept) {
    if (dept === 'Consultation') return 'C-';
    if (dept === 'Pharmacy') return 'P-';
    if (dept === 'Billing') return 'B-';
    if (dept === 'Emergency') return 'E-';
    return '';
}

// DOM Elements
const queueList = document.getElementById('admin-queue-list');
const emergencyContainer = document.getElementById('emergency-requests');
const emergencyBadge = document.getElementById('emergency-badge');

// Fetch and render data
async function loadAdminData() {
    try {
        const res = await fetch(`${API_URL}/queue`, { headers: getHeaders() });
        if (res.status === 401) window.location.href = 'login.html';
        
        const queue = await res.json();
        
        renderQueue(queue);
        renderEmergencies(queue.filter(p => p.isEmergency && p.emergencyStatus === 'pending'));
    } catch (error) {
        console.error(error);
    }
}

function renderQueue(queue) {
    queueList.innerHTML = '';
    queue.forEach(p => {
        const tr = document.createElement('tr');
        if (p.isEmergency && p.emergencyStatus === 'approved') tr.classList.add('emergency-row');
        
        tr.innerHTML = `
            <td><strong>${p.queuePosition}</strong></td>
            <td><span class="status-badge" style="background: rgba(0, 240, 255, 0.1); border-color: var(--primary-cyan); color: var(--primary-cyan);">${p.department || 'Consultation'}</span></td>
            <td>${getTokenPrefix(p.department || 'Consultation')}${p.tokenNumber}</td>
            <td>${p.name}</td>
            <td>${p.age}</td>
            <td>${p.isEmergency ? p.emergencyStatus.toUpperCase() : 'Normal'}</td>
        `;
        queueList.appendChild(tr);
    });
}

function renderEmergencies(emergencies) {
    emergencyContainer.innerHTML = '';
    
    if (emergencies.length > 0) {
        emergencyBadge.textContent = emergencies.length;
        emergencyBadge.classList.remove('hidden');
    } else {
        emergencyBadge.classList.add('hidden');
        emergencyContainer.innerHTML = '<p>No pending emergency requests.</p>';
    }

    emergencies.forEach(p => {
        const div = document.createElement('div');
        div.className = 'emergency-card';
        div.innerHTML = `
            <h3>Token: ${getTokenPrefix(p.department || 'Consultation')}${p.tokenNumber} - ${p.name} (Age: ${p.age})</h3>
            <p><strong>Problem:</strong> ${p.problem}</p>
            <div class="emergency-actions">
                <button onclick="handleEmergency('${p._id}', 'approve')" class="btn success-btn">Approve</button>
                <button onclick="handleEmergency('${p._id}', 'reject')" class="btn danger-btn">Reject</button>
            </div>
        `;
        emergencyContainer.appendChild(div);
    });
}

// Handle Emergency actions
async function handleEmergency(id, action) {
    try {
        await fetch(`${API_URL}/emergency/${id}`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ action })
        });
        // Real-time update will trigger reload via socket
    } catch (error) {
        alert('Error processing emergency request');
    }
}

// Serve specific department
async function serveDepartment(department) {
    try {
        const res = await fetch(`${API_URL}/serve`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ department })
        });
        const data = await res.json();
        if (res.ok) {
            console.log('Served:', data.servedPatient.name);
        } else {
            alert(data.message);
        }
    } catch (error) {
        alert('Error serving patient');
    }
}

// Reset all queues
async function resetAllQueues() {
    if (!confirm('Are you sure you want to CLEAR ALL queues? This cannot be undone.')) return;
    try {
        const res = await fetch(`${API_URL}/queue`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        if (res.ok) {
            alert('All queues cleared successfully!');
        }
    } catch (error) {
        alert('Error resetting queues');
    }
}

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('adminToken');
    window.location.href = 'login.html';
});

// Socket Events
socket.on('queueUpdate', () => {
    loadAdminData();
});

socket.on('emergencyRequested', () => {
    // Play a sound or show browser notification in a real app
    loadAdminData();
});

// Init
loadAdminData();
