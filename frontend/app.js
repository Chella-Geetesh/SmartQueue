const API_URL = '/api';
const socket = io();

let myToken = null;

// DOM Elements
const form = document.getElementById('join-queue-form');
const queueList = document.getElementById('queue-list');
const myStatusBox = document.getElementById('my-status');
const myTokenDisplay = document.getElementById('my-token');
const myPositionDisplay = document.getElementById('my-position');
const myEmergencyStatus = document.getElementById('my-emergency-status');
const myWaitTimeDisplay = document.getElementById('my-wait-time');

// Fetch and render queue
async function loadQueue() {
    try {
        const res = await fetch(`${API_URL}/queue`);
        const queue = await res.json();
        renderQueue(queue);
    } catch (error) {
        console.error('Error fetching queue:', error);
    }
}

function renderQueue(queue) {
    // Update Now Serving for all 4 categories
    const depts = ['Consultation', 'Pharmacy', 'Billing', 'Emergency'];
    depts.forEach(dept => {
        const nextInDept = queue.find(p => p.department === dept && p.queuePosition === 1);
        const display = document.getElementById(`ns-${dept}`);
        if (display) {
            display.textContent = nextInDept ? nextInDept.tokenNumber : '--';
        }
    });

    // Rest of the queue list view
    queueList.innerHTML = '';
    const nextPatients = queue.filter(p => p.queuePosition > 1).slice(0, 15); // Show up to 15 next in line across all depts
    nextPatients.forEach(p => {
        const li = document.createElement('li');
        if (p.department === 'Emergency') li.classList.add('emergency-item');
        li.innerHTML = `
            <span><strong>[${p.department}]</strong> Token: <strong>${p.tokenNumber}</strong></span>
            <span>Pos: ${p.queuePosition}</span>
            <span style="color: var(--primary-cyan); font-size: 0.85em;">Est: ${(p.queuePosition - 1) * 10}m</span>
        `;
        queueList.appendChild(li);
    });

    // Update my position if I am in the queue
    if (myToken) {
        const me = queue.find(p => p.tokenNumber === myToken);
        if (me) {
            myPositionDisplay.textContent = me.queuePosition;
            myWaitTimeDisplay.textContent = `${(me.queuePosition - 1) * 10} mins`;
            if (me.isEmergency) {
                myEmergencyStatus.classList.remove('hidden');
                myEmergencyStatus.querySelector('span').textContent = me.emergencyStatus.toUpperCase();
            }
        } else {
            myPositionDisplay.textContent = 'Served/Removed';
            myWaitTimeDisplay.textContent = '0 mins';
        }
    }
}

// Form Submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = {
        name: document.getElementById('name').value,
        department: document.getElementById('department').value,
        age: document.getElementById('age').value,
        problem: document.getElementById('problem').value,
        isEmergency: document.getElementById('emergency').checked
    };

    try {
        const res = await fetch(`${API_URL}/patients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const newPatient = await res.json();

        // Show my status
        myToken = newPatient.tokenNumber;
        myTokenDisplay.textContent = myToken;
        myPositionDisplay.textContent = newPatient.queuePosition;
        myWaitTimeDisplay.textContent = `${(newPatient.queuePosition - 1) * 10} mins`;
        myStatusBox.classList.remove('hidden');
        form.reset();

    } catch (error) {
        console.error('Error joining queue:', error);
        alert('Failed to join queue');
    }
});

// Socket Listeners
socket.on('queueUpdate', () => {
    loadQueue();
});

socket.on('patientServed', (patient) => {
    if (patient.tokenNumber === myToken) {
        alert('It is your turn! Please proceed to the doctor.');
    }
});

// Initial load
loadQueue();
