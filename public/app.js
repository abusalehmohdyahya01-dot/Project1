// --- 1. FIREBASE CONFIGURATION ---
// IMPORTANT: This object is unique to your project.
const firebaseConfig = {
    apiKey: "AIzasyAqbgE4DN89sphQXbz9Vp2KK0IN23rY", 
    authDomain: "campus-resource-reservationapp.firebaseapp.com",
    databaseURL: "https://campus-resource-reservationapp-default-rtdb.firebaseio.com",
    projectId: "campus-resource-reservationapp",
    storageBucket: "campus-resource-reservationapp.firebasestorage.app",
    messagingSenderId: "42359151457",
    appId: "1:42359151457:web:453dcbaa777b8b2c506720",
    measurementId: "G-EL5RMM54PZ"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// --- 2. BACKEND API URL ---
// !!! IMPORTANT: FOR DEPLOYMENT, REPLACE THIS LOCAL URL WITH YOUR LIVE RENDER/RAILWAY URL !!!
const FLASK_BASE_URL = 'http://127.0.0.1:5001'; 

let currentUserId = null;
let currentUserEmail = null;

// =========================================================================
// === CORE AUTHENTICATION AND REDIRECT LOGIC (Full Code) ===
// =========================================================================

function setupAuthStateListener() {
    auth.onAuthStateChanged(user => {
        if (user) {
            db.ref('users/' + user.uid).once('value', snapshot => {
                const userData = snapshot.val();
                const currentPage = window.location.pathname.split("/").pop();

                if (userData && userData.role === 'admin') {
                    if (currentPage !== 'admin.html') { window.location.href = 'admin.html'; }
                } else {
                    if (currentPage !== 'student.html') { window.location.href = 'student.html'; }
                }
            });
            currentUserId = user.uid;
            currentUserEmail = user.email;

            const emailSpan = document.getElementById('user-email') || document.getElementById('admin-email');
            if (emailSpan) { emailSpan.textContent = user.email; }

            if (window.location.pathname.includes('student.html')) { loadResources(); loadMyBookings(); }
            if (window.location.pathname.includes('admin.html')) { loadPendingBookings(); }

        } else {
            if (!window.location.pathname.includes('index.html')) { window.location.href = 'index.html'; }
        }
    });
}

async function handleAuth(isRegister) {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const is_admin = document.getElementById('is_admin') ? document.getElementById('is_admin').checked : false;
    const role = is_admin ? 'admin' : 'student';

    try {
        if (isRegister) {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            await db.ref('users/' + userCredential.user.uid).set({ email: email, role: role });
            alert('Registration successful! Logging in...');
        } else {
            await auth.signInWithEmailAndPassword(email, password);
        }
    } catch (error) {
        alert('Authentication Error: ' + error.message);
    }
}

function logout() {
    auth.signOut().then(() => {
        window.location.href = 'index.html';
    });
}

// =========================================================================
// === STUDENT DASHBOARD LOGIC (API Calls to Flask) ===
// =========================================================================

async function loadResources() {
    try {
        const response = await fetch(`${FLASK_BASE_URL}/api/resources`);
        const resources = await response.json();
        const list = document.getElementById('resource-list');
        const select = document.getElementById('resource-id');

        list.innerHTML = '';
        select.innerHTML = '<option value="">-- Select Resource --</option>';

        resources.forEach(res => {
            const item = document.createElement('div');
            item.className = 'resource-item';
            item.innerHTML = `<div><strong>${res.name}</strong> (${res.location})<br><small>Status: ${res.status}</small></div>`;
            list.appendChild(item);

            const option = document.createElement('option');
            option.value = res.id;
            option.textContent = `${res.name} (${res.location})`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading resources:', error);
        alert('Could not connect to the backend to load resources. Is Flask running on port 5001?');
    }
}

async function submitBooking() {
    const resourceId = document.getElementById('resource-id').value;
    const date = document.getElementById('booking-date').value;
    const time = document.getElementById('booking-time').value;
    const purpose = document.getElementById('booking-purpose').value;

    if (!resourceId || !date || !time || !purpose) {
        alert('Please fill out all booking fields.');
        return;
    }

    const bookingData = {
        resource_id: resourceId, date: date, time: time, purpose: purpose,
        user_id: currentUserId, user_email: currentUserEmail
    };

    try {
        const response = await fetch(`${FLASK_BASE_URL}/api/bookings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookingData)
        });

        if (response.ok) {
            alert('Booking request submitted! Waiting for admin approval.');
            document.getElementById('booking-form').reset();
            loadMyBookings();
        } else {
            const errorData = await response.json();
            alert(`Submission failed: ${errorData.error || 'Server error'}`);
        }
    } catch (error) {
        console.error('Error submitting booking:', error);
        alert('Error connecting to the booking service. Is the Flask backend running on port 5001?');
    }
}

function loadMyBookings() {
    const list = document.getElementById('my-bookings-list');
    if (!list) return; 
    list.innerHTML = '<p>Loading your bookings...</p>';
    
    db.ref('bookings').orderByChild('user_id').equalTo(currentUserId).once('value', snapshot => {
        list.innerHTML = '';
        if (!snapshot.exists()) { list.innerHTML = '<p>No bookings found.</p>'; return; }

        snapshot.forEach(childSnapshot => {
            const booking = childSnapshot.val();
            const item = document.createElement('div');
            item.className = 'booking-item';
            
            let statusClass = 'status-pending';
            if (booking.status === 'APPROVED') statusClass = 'status-approved';
            if (booking.status === 'REJECTED') statusClass = 'status-rejected';

            item.innerHTML = `
                <div>
                    <strong>Resource: ${booking.resource_name || 'N/A'}</strong> 
                    <br>Date/Time: ${booking.date} at ${booking.time}
                    <br>Purpose: ${booking.purpose}
                </div>
                <div class="${statusClass}">Status: ${booking.status}</div>
            `;
            list.appendChild(item);
        });
    });
}

// =========================================================================
// === ADMIN DASHBOARD LOGIC (API Calls to Flask) ===
// =========================================================================

async function loadPendingBookings() {
    try {
        const response = await fetch(`${FLASK_BASE_URL}/api/bookings/pending`);
        const bookings = await response.json();
        const list = document.getElementById('pending-bookings-list');
        list.innerHTML = '';
        
        if (bookings.length === 0) {
            list.innerHTML = '<p>No pending booking requests. All caught up!</p>';
            return;
        }

        bookings.forEach(booking => {
            const item = document.createElement('div');
            item.className = 'booking-item';
            item.innerHTML = `
                <div>
                    <strong>Resource: ${booking.resource_name}</strong> - **${booking.date} at ${booking.time}**
                    <br>Requested by: ${booking.user_email}
                    <br>Purpose: ${booking.purpose}
                    <div style="margin-top: 10px;">
                        <button onclick="updateBookingStatus('${booking.id}', 'APPROVED')">Approve ✅</button>
                        <button onclick="updateBookingStatus('${booking.id}', 'REJECTED')" style="background-color: #dc3545;">Reject ❌</button>
                    </div>
                </div>
            `;
            list.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading pending bookings:', error);
        alert('Could not connect to the backend to load pending bookings. Is Flask running on port 5001?');
    }
}

async function updateBookingStatus(bookingId, status) {
    if (!confirm(`Are you sure you want to ${status} this booking?`)) return;

    try {
        const response = await fetch(`${FLASK_BASE_URL}/api/bookings/${bookingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: status })
        });

        if (response.ok) {
            alert(`Booking ${bookingId} ${status} successfully.`);
            loadPendingBookings();
        } else {
            const errorData = await response.json();
            alert(`Update failed: ${errorData.error || 'Server error'}`);
        }
    } catch (error) {
        console.error('Error updating booking status:', error);
        alert('Error connecting to the update service. Is the Flask backend running on port 5001?');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupAuthStateListener();
});