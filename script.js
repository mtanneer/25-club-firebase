// Import Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBYmAcFdbj-jtYn1x9sJZiGjtxZPZOpApI",
    authDomain: "club-8da92.firebaseapp.com",
    projectId: "club-8da92",
    storageBucket: "club-8da92.firebasestorage.app",
    messagingSenderId: "1008552295041",
    appId: "1:1008552295041:web:134ee6f6720323517f2b80"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const clubDataRef = doc(db, 'club-data', 'main');

// EmailJS Configuration
const EMAILJS_CONFIG = {
    publicKey: 'iGNyyx4P-neaGTs8m',
    serviceId: 'service_6vriq0w',
    templates: {
        birthday: 'birthday_reminder',
        newReflection: 'new_reflection'
    }
};

// Initialize EmailJS and make it global
window.emailjs = emailjs;
emailjs.init(EMAILJS_CONFIG.publicKey);

const SETUP_PASSWORD = 'setup25';

let state = {
    friends: [],
    reflections: {},
    currentUser: null,
    isSetupMode: false,
    editCounts: {},
    hasPostedFirst: {}
};

// Load data from Firestore
async function loadData() {
    try {
        const docSnap = await getDoc(clubDataRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            state.friends = data.friends || [];
            state.reflections = data.reflections || {};
            state.editCounts = data.editCounts || {};
            state.hasPostedFirst = data.hasPostedFirst || {};
            console.log('Data loaded from Firebase');
        } else {
            console.log('No data found, starting fresh');
        }
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Save data to Firestore
async function saveData() {
    try {
        await setDoc(clubDataRef, {
            friends: state.friends,
            reflections: state.reflections,
            editCounts: state.editCounts,
            hasPostedFirst: state.hasPostedFirst,
            lastUpdated: new Date().toISOString()
        });
        console.log('Data saved to Firebase');
    } catch (error) {
        console.error('Error saving data:', error);
        alert('Failed to save. Check your internet connection.');
    }
}

// Real-time listener for data changes
onSnapshot(clubDataRef, (doc) => {
    if (doc.exists()) {
        const data = doc.data();
        state.friends = data.friends || [];
        state.reflections = data.reflections || {};
        state.editCounts = data.editCounts || {};
        state.hasPostedFirst = data.hasPostedFirst || {};

        // Re-render if user is logged in
        if (state.currentUser) {
            renderTimeline();
        }
        console.log('Data updated from Firebase');
    }
});

// Get today's date in DD/MM format
function getToday() {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
}

// Normalize date
function normalizeDate(date) {
    if (!date || typeof date !== 'string') return '';
    const parts = date.split('/');
    if (parts.length !== 2) return date;
    return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
}

// Generate password with random suffix
function generatePassword(name, birthday, randomSuffix = null) {
    // Create base from name and birthday
    const base = (name.replace(/\s+/g, '') + birthday.replace(/\//g, '')).toLowerCase();

    // If no suffix provided, generate a random one
    if (!randomSuffix) {
        randomSuffix = generateRandomSuffix();
    }

    return `${base}-${randomSuffix}`;
}

// Generate random alphanumeric suffix
function generateRandomSuffix(length = 6) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let suffix = '';
    for (let i = 0; i < length; i++) {
        suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return suffix;
}

// Compare if birthday has passed
function hasBirthdayPassed(birthday, today) {
    const [bDay, bMonth] = birthday.split('/').map(Number);
    const [tDay, tMonth] = today.split('/').map(Number);

    if (bMonth < tMonth) return true;
    if (bMonth > tMonth) return false;

    return bDay <= tDay;
}

// Check login
function checkLogin() {
    const input = document.getElementById('passwordInput').value.toLowerCase().replace(/\s+/g, '');
    const today = getToday();

    if (input === SETUP_PASSWORD) {
        state.isSetupMode = true;
        showApp();
        showTab('setup');
        return;
    }

    // Check against stored password (if available) or fall back to generated
    const friend = state.friends.find(f => {
        const storedPassword = f.password; // Use stored password if available
        if (storedPassword) {
            return input === storedPassword.toLowerCase().replace(/\s+/g, '');
        }
        // Fallback for legacy entries without stored password
        return input === generatePassword(f.name, f.birthday, f.randomSuffix).toLowerCase().replace(/\s+/g, '');
    });

    if (friend) {
        if (hasBirthdayPassed(normalizeDate(friend.birthday), today)) {
            state.currentUser = friend;
            state.isSetupMode = false;
            showApp();
            renderTimeline();
            return;
        } else {
            alert(`hey ${friend.name}! come back on your birthday (${friend.birthday}). \n\nit's ${today} right now. see you soon 🎂`);
            return;
        }
    }

    alert('nope. try "setup25" to set things up, or use your code on your birthday.');
}

// Allow Enter key
document.getElementById('passwordInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        checkLogin();
    }
});

// Show app
function showApp() {
    document.getElementById('landing').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');

    const navTabs = document.getElementById('navTabs');
    if (state.isSetupMode) {
        navTabs.innerHTML = '<button class="nav-tab active" data-tab="setup">setup</button>';
    } else {
        navTabs.innerHTML = '<button class="nav-tab active" data-tab="timeline">the receipts</button>';
    }

    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            showTab(this.dataset.tab);
        });
    });
}

// Logout
function logout() {
    state.currentUser = null;
    state.isSetupMode = false;
    document.getElementById('landing').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('passwordInput').value = '';
    showTab('timeline');
}

// Tab switching
function showTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

    const selectedTab = document.querySelector(`[data-tab="${tabName}"]`);
    if (selectedTab) selectedTab.classList.add('active');

    document.getElementById(tabName + 'Tab').classList.add('active');

    if (tabName === 'timeline') renderTimeline();
    if (tabName === 'setup') renderSetup();
}

// Render timeline
function renderTimeline() {
    const container = document.getElementById('timelineContainer');
    const today = getToday();

    if (state.friends.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <p>nothing here yet.</p>
                <p style="margin-top: 10px;">set things up first and come back.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = state.friends.map(friend => {
        const reflection = state.reflections[friend.name];
        const hasReflection = !!reflection;
        const birthdayPassed = hasBirthdayPassed(normalizeDate(friend.birthday), today);
        const isCurrentUser = state.currentUser && state.currentUser.name === friend.name;

        return `
            <div class="timeline-item">
                <div class="timeline-dot ${hasReflection ? 'completed' : birthdayPassed ? '' : 'upcoming'}"></div>
                <div class="reflection-card ${!birthdayPassed ? 'upcoming' : ''} ${isCurrentUser ? 'current-user' : ''}"
                     onclick="${isCurrentUser ? 'openWriteModal()' : (hasReflection ? `openReadModal('${friend.name.replace(/'/g, "\\'")}')` : '')}">
                    <div class="reflection-header">
                        <div class="reflection-name">
                            ${friend.name}${isCurrentUser ? ' (you)' : ''}
                            ${isCurrentUser && !hasReflection ? '<span class="edit-indicator">your turn</span>' : ''}
                            ${isCurrentUser && hasReflection ? '<span class="edit-indicator">edit</span>' : ''}
                        </div>
                        <div class="reflection-date">${friend.birthday}</div>
                    </div>
                    ${hasReflection ? `
                        <div class="reflection-preview">${reflection}</div>
                        ${!isCurrentUser ? '<div class="read-more">read more →</div>' : ''}
                    ` : birthdayPassed ? `
                        <div class="reflection-content" style="font-style: italic; color: var(--text-dim);">
                            ${isCurrentUser ? 'click to write something' : `waiting on ${friend.name}...`}
                        </div>
                    ` : `
                        <div class="reflection-content" style="font-style: italic; color: var(--text-dim);">
                            unlocks ${friend.birthday}
                        </div>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

// Open write modal
function openWriteModal() {
    if (!state.currentUser) return;

    const existing = state.reflections[state.currentUser.name] || '';
    document.getElementById('reflectionText').value = existing;

    // Check edit count and show overthinking message
    const editCount = state.editCounts[state.currentUser.name] || 0;
    const msgDiv = document.getElementById('overthinkingMsg');

    if (editCount >= 3) {
        msgDiv.textContent = `overthinking detected. it's fine, it doesn't need to be perfect ${state.currentUser.name}`;
        msgDiv.style.display = 'block';
    } else {
        msgDiv.style.display = 'none';
    }

    document.getElementById('writeModal').classList.add('active');
}

// Close write modal
function closeWriteModal() {
    document.getElementById('writeModal').classList.remove('active');
}

// Open read modal
function openReadModal(friendName) {
    const reflection = state.reflections[friendName];
    if (!reflection) return;

    document.getElementById('readModalName').textContent = friendName;
    document.getElementById('readModalContent').textContent = reflection;
    document.getElementById('readModal').classList.add('active');
}

// Close read modal
function closeReadModal() {
    document.getElementById('readModal').classList.remove('active');
}

// Save reflection
function saveReflection() {
    const text = document.getElementById('reflectionText').value.trim();

    if (!text) {
        alert('write something first!');
        return;
    }

    if (!state.currentUser) {
        alert('something went wrong. try logging in again.');
        return;
    }

    const isFirstPost = !state.hasPostedFirst[state.currentUser.name];

    state.reflections[state.currentUser.name] = text;

    // Increment edit count
    if (!state.editCounts[state.currentUser.name]) {
        state.editCounts[state.currentUser.name] = 0;
    }
    state.editCounts[state.currentUser.name]++;

    // Mark as having posted first draft
    if (isFirstPost) {
        state.hasPostedFirst[state.currentUser.name] = true;
    }

    saveData();

    // Send email notifications for first post only
    if (isFirstPost) {
        sendNewReflectionEmails();
    }

    closeWriteModal();
    renderTimeline();

    alert('locked in. nice work.');
}

// Send birthday reminder email
function sendBirthdayEmail(friend) {
    emailjs.send(
        EMAILJS_CONFIG.serviceId,
        EMAILJS_CONFIG.templates.birthday,
        {
            to_name: friend.name,
            to_email: friend.email,
            access_code: generatePassword(friend.name, friend.birthday),
            website_url: 'https://eclectic-medovik-b5f218.netlify.app/'
        }
    ).then(
        () => console.log(`Birthday email sent to ${friend.email}`),
        (error) => console.error('Email failed:', error)
    );
}

// Send new reflection notification to everyone who's already had their birthday
function sendNewReflectionEmails() {
    const today = getToday();

    // Get all friends whose birthday has passed (except current user)
    const eligibleFriends = state.friends.filter(friend => {
        const birthdayPassed = hasBirthdayPassed(normalizeDate(friend.birthday), today);
        const isNotCurrentUser = friend.name !== state.currentUser.name;
        return birthdayPassed && isNotCurrentUser && friend.email;
    });

    // Send email to each eligible friend
    eligibleFriends.forEach(friend => {
        emailjs.send(
            EMAILJS_CONFIG.serviceId,
            EMAILJS_CONFIG.templates.newReflection,
            {
                to_name: friend.name,
                to_email: friend.email,
                author_name: state.currentUser.name,
                website_url: 'https://eclectic-medovik-b5f218.netlify.app/'
            }
        ).then(
            () => console.log(`Notification sent to ${friend.name}`),
            (error) => console.error('Email failed:', error)
        );
    });
}

// Check for birthdays daily and send reminders
function checkBirthdays() {
    const today = getToday();

    state.friends.forEach(friend => {
        if (normalizeDate(friend.birthday) === today && friend.email) {
            // Check if we already sent today (store in localStorage)
            const sentKey = `birthday-sent-${friend.name}-${today}`;
            if (!localStorage.getItem(sentKey)) {
                sendBirthdayEmail(friend);
                localStorage.setItem(sentKey, 'true');
            }
        }
    });
}

// Run birthday check on page load and every hour
setInterval(checkBirthdays, 60 * 60 * 1000); // Check every hour
checkBirthdays(); // Check on load

// Render setup
function renderSetup() {
    const container = document.getElementById('friendsList');

    if (state.friends.length === 0) {
        state.friends.push({ name: '', birthday: '', email: '' });
    }

    container.innerHTML = state.friends.map((friend, index) => `
        <div class="friend-row" style="grid-template-columns: 1fr 140px 1fr 40px; margin-bottom: 20px;">
            <input type="text" class="form-input" placeholder="name" value="${friend.name}" data-index="${index}" data-field="name">
            <input type="text" class="form-input" placeholder="DD/MM" value="${friend.birthday}" data-index="${index}" data-field="birthday">
            <input type="email" class="form-input" placeholder="email" value="${friend.email || ''}" data-index="${index}" data-field="email">
            <button class="btn btn-remove" data-index="${index}">×</button>
        </div>
    `).join('');

    setTimeout(() => {
        container.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', function() {
                const index = parseInt(this.dataset.index);
                const field = this.dataset.field;
                state.friends[index][field] = this.value;
            });
        });

        container.querySelectorAll('.btn-remove').forEach(btn => {
            btn.addEventListener('click', function() {
                const index = parseInt(this.dataset.index);
                state.friends.splice(index, 1);
                if (state.friends.length === 0) {
                    state.friends.push({ name: '', birthday: '', email: '' });
                }
                renderSetup();
            });
        });
    }, 0);
}

// Add friend
function addFriend() {
    state.friends.push({ name: '', birthday: '', email: '' });
    renderSetup();
}

// Save setup
function saveSetup() {
    state.friends = state.friends.filter(f => f.name && f.birthday);

    if (state.friends.length === 0) {
        alert('add at least one person!');
        state.friends.push({ name: '', birthday: '', email: '' });
        renderSetup();
        return;
    }

    // Generate passwords for new friends (those without stored passwords)
    state.friends.forEach(friend => {
        if (!friend.password) {
            const randomSuffix = generateRandomSuffix();
            friend.password = generatePassword(friend.name, friend.birthday, randomSuffix);
            friend.randomSuffix = randomSuffix;
        }
    });

    // Sort by birthday properly
    state.friends.sort((a, b) => {
        const [aDay, aMonth] = normalizeDate(a.birthday).split('/').map(Number);
        const [bDay, bMonth] = normalizeDate(b.birthday).split('/').map(Number);

        if (aMonth !== bMonth) return aMonth - bMonth;
        return aDay - bDay;
    });

    saveData();

    const missingEmails = state.friends.filter(f => !f.email).length;
    let message = 'done! here are the codes:\n\n' +
        state.friends.map(f => `${f.name}: ${f.password}`).join('\n');

    if (missingEmails > 0) {
        message += `\n\n⚠️ ${missingEmails} people missing emails - they won't get notifications`;
    }

    alert(message);

    renderSetup();
}

// Make functions globally accessible for onclick handlers and internal calls
window.getToday = getToday;
window.normalizeDate = normalizeDate;
window.generatePassword = generatePassword;
window.generateRandomSuffix = generateRandomSuffix;
window.hasBirthdayPassed = hasBirthdayPassed;
window.showApp = showApp;
window.showTab = showTab;
window.renderTimeline = renderTimeline;
window.renderSetup = renderSetup;
window.logout = logout;
window.openWriteModal = openWriteModal;
window.closeWriteModal = closeWriteModal;
window.openReadModal = openReadModal;
window.closeReadModal = closeReadModal;
window.saveReflection = saveReflection;
window.sendBirthdayEmail = sendBirthdayEmail;
window.sendNewReflectionEmails = sendNewReflectionEmails;
window.checkBirthdays = checkBirthdays;
window.addFriend = addFriend;
window.saveSetup = saveSetup;
window.saveData = saveData;
window.state = state;

// Initialize and set up birthday checks
loadData().then(() => {
    // Set up button event listeners
    document.getElementById('loginBtn').addEventListener('click', checkLogin);
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
    document.getElementById('addFriendBtn')?.addEventListener('click', addFriend);
    document.getElementById('saveSetupBtn')?.addEventListener('click', saveSetup);
    document.getElementById('closeWriteBtn')?.addEventListener('click', closeWriteModal);
    document.getElementById('cancelWriteBtn')?.addEventListener('click', closeWriteModal);
    document.getElementById('saveReflectionBtn')?.addEventListener('click', saveReflection);
    document.getElementById('closeReadBtn')?.addEventListener('click', closeReadModal);
    document.getElementById('closeReadFooterBtn')?.addEventListener('click', closeReadModal);

    // Run birthday check after data loads
    checkBirthdays();
    // Then check every hour
    setInterval(checkBirthdays, 60 * 60 * 1000);
});

// Make functions globally accessible for timeline cards
window.openWriteModal = openWriteModal;
window.openReadModal = openReadModal;
