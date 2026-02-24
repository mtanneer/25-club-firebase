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

const TIMEZONES = {
    pacific:  'America/Los_Angeles',  // PST / PDT
    central:  'America/Chicago',      // CST / CDT
    eastern:  'America/New_York',     // EST / EDT
    european: 'Europe/Paris',         // CET / CEST (pick whichever European city you need)
    indian:   'Asia/Kolkata'          // IST (Indian Standard Time)
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const clubDataRef = doc(db, 'club-data', 'main');

// EmailJS Configuration
const EMAILJS_CONFIG = {
    // publicKey: 'iGNyyx4P-neaGTs8m',
    publicKey: 'BWBDaA8H5iAZ1zeGb',
    serviceId: 'service_lytnn6f',
    templates: {
        birthday: 'birthday_reminder',
        newReflection: 'new_reflection'
    }
};

const WEBPAGE_URL = 'https://25-birthdays.netlify.app/';

// Initialize EmailJS and make it global
window.emailjs = emailjs;
emailjs.init(EMAILJS_CONFIG.publicKey);

const SETUP_PASSWORD = 'setup25';

/**
 * STATE MANAGEMENT STRUCTURE
 * 
 * Persistent Data (stored in Firebase):
 *   - friends: array of friend objects with name, birthday, email, password, randomSuffix
 *   - reflections: object mapping friend name to their reflection text
 *   - editCounts: object tracking how many times each friend has edited their reflection
 *   - hasPostedFirst: object tracking whether each friend has posted their first draft
 *   - emailsSent: object mapping friend name to timestamp of when birthday email was sent (prevents duplicates)
 * 
 * Session Data (stored in sessionStorage, NOT persistent):
 *   - currentUser: the logged-in friend object (null if not logged in)
 *   - isSetupMode: boolean indicating admin/setup mode
 */

let state = {
    // PERSISTENT DATA (synced with Firebase)
    friends: [],
    reflections: {},
    editCounts: {},
    hasPostedFirst: {},
    emailsSent: {},

    // SESSION DATA (in-memory only, survives page refresh via sessionStorage)
    currentUser: null,
    isSetupMode: false
};

/**
 * SESSION MANAGEMENT
 * Store and retrieve session data (currentUser, isSetupMode) from sessionStorage
 * These are not persisted to Firebase since they're per-session
 */

function loadSessionData() {
    try {
        const sessionData = sessionStorage.getItem('clubSessionData');
        if (sessionData) {
            const parsed = JSON.parse(sessionData);
            state.currentUser = parsed.currentUser || null;
            state.isSetupMode = parsed.isSetupMode || false;
            console.log('Session data restored');
        }
    } catch (error) {
        console.error('Error loading session data:', error);
        state.currentUser = null;
        state.isSetupMode = false;
    }
}

function saveSessionData() {
    try {
        sessionStorage.setItem('clubSessionData', JSON.stringify({
            currentUser: state.currentUser,
            isSetupMode: state.isSetupMode
        }));
    } catch (error) {
        console.error('Error saving session data:', error);
    }
}

function clearSessionData() {
    sessionStorage.removeItem('clubSessionData');
    state.currentUser = null;
    state.isSetupMode = false;
}

/**
 * FIREBASE PERSISTENT DATA MANAGEMENT
 * All persistent state is synchronized with Firestore
 */

async function loadPersistentData() {
    try {
        const docSnap = await getDoc(clubDataRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            state.friends = data.friends || [];
            state.reflections = data.reflections || {};
            state.editCounts = data.editCounts || {};
            state.hasPostedFirst = data.hasPostedFirst || {};
            state.emailsSent = data.emailsSent || {};
            console.log('Persistent data loaded from Firebase');
        } else {
            console.log('No persistent data found, starting fresh');
        }
    } catch (error) {
        console.error('Error loading persistent data:', error);
    }
}

async function savePersistentData() {
    try {
        await setDoc(clubDataRef, {
            friends: state.friends,
            reflections: state.reflections,
            editCounts: state.editCounts,
            hasPostedFirst: state.hasPostedFirst,
            emailsSent: state.emailsSent,
            lastUpdated: new Date().toISOString()
        });
        console.log('Persistent data saved to Firebase');
    } catch (error) {
        console.error('Error saving persistent data:', error);
        alert('Failed to save. Check your internet connection.');
    }
}

// Keep the old function name for backwards compatibility
const saveData = savePersistentData;

/**
 * REAL-TIME FIRESTORE LISTENER
 * Automatically updates state when data changes in Firebase
 */
onSnapshot(clubDataRef, (doc) => {
    if (doc.exists()) {
        const data = doc.data();
        state.friends = data.friends || [];
        state.reflections = data.reflections || {};
        state.editCounts = data.editCounts || {};
        state.hasPostedFirst = data.hasPostedFirst || {};
        state.emailsSent = data.emailsSent || {};

        // Re-render if user is logged in
        if (state.currentUser) {
            renderTimeline();
        }
        console.log('Real-time data updated from Firebase');
    }
});

// Get today's date in DD/MM format
// function getToday() {
//     const d = new Date();
//     const day = String(d.getDate()).padStart(2, '0');
//     const month = String(d.getMonth() + 1).padStart(2, '0');
//     return `${day}/${month}`;
// }

function getToday() {
    const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: TIMEZONES.european,
        day: '2-digit',
        month: '2-digit'
    });
    const parts = formatter.formatToParts(new Date());
    const day   = parts.find(p => p.type === 'day').value;
    const month = parts.find(p => p.type === 'month').value;
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
        saveSessionData();
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
            saveSessionData();
            showApp();
            renderTimeline();
            return;
        } else {
            alert(`Hey ${friend.name}! Come back on your birthday (${friend.birthday}). \n\nIt's ${today} right now. See ya soon 🎂`);
            return;
        }
    }

    alert('nope. Use your code on your birthday.');
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
        // Show both timeline and setup tabs for admin
        navTabs.innerHTML = '<button class="nav-tab" data-tab="timeline">the receipts</button><button class="nav-tab active" data-tab="setup">setup</button>';
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
    clearSessionData();
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

function renderTimeline() {
    const container = document.getElementById('timelineContainer');
    const today = getToday();

    if (!container) return;

    if (!state.friends || state.friends.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <p>nothing here yet.</p>
                <p style="margin-top: 10px;">set things up first and come back.</p>
            </div>
        `;
        return;
    }

    // Helper to safely escape user-provided strings
    const escapeHtml = (str = '') => String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const cards = state.friends.map(friend => {
        const reflection = state.reflections[friend.name];
        const hasReflection = !!reflection;
        const birthdayPassed = hasBirthdayPassed(normalizeDate(friend.birthday), today);
        const isCurrentUser = state.currentUser && state.currentUser.name === friend.name;
        const showDelete = !!state.isSetupMode;
        const dotClass = hasReflection ? 'completed' : (birthdayPassed ? '' : 'upcoming');

        const cardClasses = ['reflection-card'];
        if (!birthdayPassed) cardClasses.push('upcoming');
        if (isCurrentUser) cardClasses.push('current-user');

        const action = isCurrentUser ? 'write' : (hasReflection && birthdayPassed ? 'read' : '');
        const dataName = encodeURIComponent(friend.name);

        let innerContent = '';

        if (hasReflection) {
            innerContent = `
                <div class="reflection-preview">${escapeHtml(reflection)}</div>
                ${!isCurrentUser ? '<div class="read-more">read more →</div>' : ''}
            `;
        } else if (birthdayPassed) {
            innerContent = `
                <div class="reflection-content" style="font-style: italic; color: var(--text-dim);">
                    ${isCurrentUser ? 'click to write something' : `waiting on ${escapeHtml(friend.name)}...`}
                </div>
            `;
        } else {
            innerContent = `
                <div class="reflection-content" style="font-style: italic; color: var(--text-dim);">
                    unlocks ${escapeHtml(friend.birthday)}
                </div>
            `;
        }

        return `
            <div class="timeline-item">
                <div class="timeline-dot ${dotClass}"></div>
                <div class="${cardClasses.join(' ')}" data-name="${dataName}" data-action="${action}">
                    <div class="reflection-header">
                        <div class="reflection-name">
                            ${escapeHtml(friend.name)}${isCurrentUser ? ' (you)' : ''}
                            ${isCurrentUser && !hasReflection ? '<span class="edit-indicator">your turn</span>' : ''}
                            ${isCurrentUser && hasReflection ? '<span class="edit-indicator">edit</span>' : ''}
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div class="reflection-date">${escapeHtml(friend.birthday)}</div>
                            ${showDelete ? `<button class="btn-trash" title="Delete reflection" aria-label="Delete reflection" data-name="${dataName}">🗑</button>` : ''}
                        </div>
                    </div>
                    ${innerContent}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = cards;

    // Attach event handlers
    container.querySelectorAll('.reflection-card').forEach(card => {
        card.addEventListener('click', function() {
            const name = decodeURIComponent(this.dataset.name || '');
            const action = this.dataset.action;
            if (action === 'write') {
                openWriteModal();
            } else if (action === 'read') {
                openReadModal(name);
            }
        });
    });

    container.querySelectorAll('.btn-trash').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const name = decodeURIComponent(this.dataset.name || '');
            deleteReflection(name);
        });
    });
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

// Delete a reflection (admin only)
function deleteReflection(friendName) {
    if (!confirm(`Delete reflection for ${friendName}? This will remove their reflection and related metadata. Proceed?`)) return;

    if (!state.reflections || !state.reflections[friendName]) {
        alert('No reflection found for ' + friendName);
        return;
    }

    // Remove reflection and related metadata but keep the friend entry
    try { delete state.reflections[friendName]; } catch (e) {}
    try { delete state.editCounts[friendName]; } catch (e) {}
    try { delete state.hasPostedFirst[friendName]; } catch (e) {}

    savePersistentData();
    renderTimeline();

    alert(`Reflection for ${friendName} deleted.`);
}

// Delete all reflections (admin)
function deleteAllReflections() {
    if (!confirm('Delete ALL reflections and metadata for everyone? This cannot be undone. Proceed?')) return;

    state.reflections = {};
    state.editCounts = {};
    state.hasPostedFirst = {};

    savePersistentData();
    renderTimeline();

    alert('All reflections deleted.');
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

    savePersistentData();

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
    console.log(`Existing password for ${friend.name}: ${friend.password}`);
    emailjs.send(
        EMAILJS_CONFIG.serviceId,
        EMAILJS_CONFIG.templates.birthday,
        {
            to_name: friend.name,
            to_email: friend.email,
            access_code: friend.password ? friend.password : generatePassword(friend.name, friend.birthday),
            website_url: WEBPAGE_URL
        }
    ).then(
        () => {
            console.log(`Birthday email sent to ${friend.email}`);
            // Mark email as sent with timestamp
            state.emailsSent[friend.name] = new Date().toISOString();
            savePersistentData();
        },
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
                website_url: WEBPAGE_URL
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
            // Check if email was already sent (avoid duplicate emails)
            if (!state.emailsSent[friend.name]) {
                sendBirthdayEmail(friend);
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

    // Helper to escape HTML
    const escapeHtml = (str = '') => String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    let html = state.friends.map((friend, index) => {
        const emailSentStatus = state.emailsSent[friend.name];
        const emailSentDisplay = emailSentStatus ? `✓ sent on ${new Date(emailSentStatus).toLocaleDateString()}` : 'not sent';
        
        return `
        <div class="friend-row" style="grid-template-columns: 1fr 140px 1fr 40px; margin-bottom: 20px;">
            <input type="text" class="form-input" placeholder="name" value="${escapeHtml(friend.name)}" data-index="${index}" data-field="name">
            <input type="text" class="form-input" placeholder="DD/MM" value="${escapeHtml(friend.birthday)}" data-index="${index}" data-field="birthday">
            <input type="email" class="form-input" placeholder="email" value="${escapeHtml(friend.email || '')}" data-index="${index}" data-field="email">
            <button class="btn btn-remove" data-index="${index}">×</button>
        </div>
        ${state.isSetupMode && friend.name ? `
        <div style="margin-bottom: 20px; padding: 8px 12px; background: var(--surface-hover); border-radius: 4px; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center;">
            <span style="color: var(--text-dim);">email status: ${emailSentDisplay}</span>
            <button class="btn btn-small btn-toggle-email" data-index="${index}" data-name="${encodeURIComponent(friend.name)}">${emailSentStatus ? 'reset' : 'mark sent'}</button>
        </div>
        ` : ''}
    `;}
    ).join('');

    // If admin, show a reflections management panel
    if (state.isSetupMode) {
        const reflectionEntries = state.friends.map(friend => {
            const reflection = state.reflections[friend.name] || '';
            return `
                <div class="reflection-row" style="display:flex; align-items:flex-start; gap:12px; margin-bottom:12px;">
                    <div style="flex: 0 0 160px; font-weight:600;">${escapeHtml(friend.name)}</div>
                    <div style="flex:1; color:var(--text);">${reflection ? `<div class="reflection-admin-preview">${escapeHtml(reflection)}</div>` : '<div style="color:var(--text-dim);">— no reflection</div>'}</div>
                    <div style="flex:0 0 auto;">
                        ${reflection ? `<button class="btn btn-danger btn-delete-reflection" data-name="${encodeURIComponent(friend.name)}">Delete</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        html += `
            <hr style="margin: 20px 0;" />
            <h3 style="margin-bottom:10px;">Reflections (admin)</h3>
            <div id="adminReflections">
                ${reflectionEntries || '<div style="color:var(--text-dim);">no reflections yet</div>'}
                <div style="margin-top: 12px;">
                    <button id="deleteAllReflectionsBtn" class="btn btn-danger">Delete all reflections</button>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;

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

        // Attach delete reflection handlers for admin
        container.querySelectorAll('.btn-delete-reflection').forEach(btn => {
            btn.addEventListener('click', function() {
                const name = decodeURIComponent(this.dataset.name || '');
                if (!name) return;
                if (!confirm(`Delete reflection for ${name}? This will remove their reflection and related metadata. Proceed?`)) return;
                deleteReflection(name);
                renderSetup();
            });
        });

        // Attach email toggle handlers for admin
        container.querySelectorAll('.btn-toggle-email').forEach(btn => {
            btn.addEventListener('click', function() {
                const name = decodeURIComponent(this.dataset.name || '');
                if (!name) return;
                
                if (state.emailsSent[name]) {
                    // Reset: remove the email sent record
                    delete state.emailsSent[name];
                    savePersistentData();
                    renderSetup();
                } else {
                    // Mark as sent: set current timestamp
                    state.emailsSent[name] = new Date().toISOString();
                    savePersistentData();
                    renderSetup();
                }
            });
        });

        const deleteAllBtn = document.getElementById('deleteAllReflectionsBtn');
        if (deleteAllBtn) {
            deleteAllBtn.addEventListener('click', function() {
                if (!confirm('Delete ALL reflections and metadata for everyone? This cannot be undone. Proceed?')) return;
                deleteAllReflections();
                renderSetup();
            });
        }

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

    savePersistentData();
    saveSessionData();

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

/**
 * DEPLOYMENT INFO FOOTER
 * Display repository and branch information for developers
 */
function initializeDeploymentFooter() {
    const deploymentInfo = document.getElementById('deploymentInfo');
    if (!deploymentInfo) return;

    // Get deployment info from window variables (set by Netlify build environment)
    const repo = window.REPO_NAME || '25-club-firebase';
    const branch = window.BRANCH_NAME || 'local';
    const commit = window.COMMIT_SHA || '';

    if (repo && branch) {
        const commitDisplay = commit ? ` • ${commit.substring(0, 7)}` : '';
        deploymentInfo.textContent = `${repo} / ${branch}${commitDisplay}`;
    }
}

// Initialize deployment footer on load
initializeDeploymentFooter();

// Initialize and set up birthday checks
loadPersistentData().then(() => {
    // Restore session data after loading persistent data
    loadSessionData();

    // If user has a session, restore the UI
    if (state.currentUser || state.isSetupMode) {
        showApp();
        if (state.isSetupMode) {
            showTab('setup');
        } else if (state.currentUser) {
            showTab('timeline');
        }
    }

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
window.deleteReflection = deleteReflection;
window.deleteAllReflections = deleteAllReflections;