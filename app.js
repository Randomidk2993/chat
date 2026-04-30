/* ══════════════════════════════════════════
   NEXUS CHAT — APP LOGIC
   ══════════════════════════════════════════ */

'use strict';

// ─── STATE ────────────────────────────────────────────────────────────────────
let db, auth;
let currentUser     = null;
let currentUserData = null;
let currentChatId   = null;
let msgUnsub        = null;   // message listener unsubscribe
let chatsUnsub      = null;   // chats listener unsubscribe
let lastDateStr     = null;   // for date separators

// ─── AVATAR COLORS ───────────────────────────────────────────────────────────
const PALETTE = [
    '#4a6cf7','#7209b7','#f72585','#4cc9f0',
    '#06d6a0','#ff6b35','#e63946','#3a0ca3',
    '#fb8500','#2dc653','#0096c7','#d62828'
];

function pickColor(seed) {
    if (!seed) return PALETTE[0];
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
    return PALETTE[Math.abs(h) % PALETTE.length];
}

function initial(name) { return (name || '?').charAt(0).toUpperCase(); }

function esc(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
}

function setMsg(id, text, ok = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.style.color = ok ? '#22c55e' : '#ef4444';
    if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 5000);
}

// ─── SCREENS ─────────────────────────────────────────────────────────────────
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove('hidden');
        // Re-trigger animation
        el.style.animation = 'none';
        el.offsetHeight; // reflow
        el.style.animation = '';
    }
}

// ─── AUTH TAB SWITCH ─────────────────────────────────────────────────────────
function switchTab(tab) {
    const isLogin = tab === 'login';
    document.getElementById('tab-login').classList.toggle('active', isLogin);
    document.getElementById('tab-register').classList.toggle('active', !isLogin);
    document.getElementById('form-login').classList.toggle('hidden', !isLogin);
    document.getElementById('form-register').classList.toggle('hidden', isLogin);
    setMsg('auth-msg', '');
}

// ─── AUTH ERROR MESSAGES ─────────────────────────────────────────────────────
function authError(code) {
    const map = {
        'auth/user-not-found':      'No account found with that email.',
        'auth/wrong-password':      'Incorrect password.',
        'auth/invalid-credential':  'Invalid email or password.',
        'auth/email-already-in-use':'That email is already registered.',
        'auth/weak-password':       'Password must be at least 6 characters.',
        'auth/invalid-email':       'Invalid email address.',
        'auth/too-many-requests':   'Too many attempts — try again later.',
        'auth/popup-closed-by-user':'Sign-in was cancelled.',
        'auth/network-request-failed': 'Network error. Check your connection.',
    };
    return map[code] || `Error: ${code}`;
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    db   = firebase.firestore();
    auth = firebase.auth();

    // ── Auth state observer ──────────────────────────────
    auth.onAuthStateChanged(async user => {
        if (!user) {
            showScreen('screen-auth');
            return;
        }
        try {
            const snap = await db.collection('users').doc(user.uid).get();
            if (!snap.exists) {
                // Google sign-in new user — pick username
                showScreen('screen-username');
            } else {
                currentUser     = user;
                currentUserData = snap.data();
                bootApp();
            }
        } catch (err) {
            console.error('Auth state error:', err);
            showScreen('screen-auth');
        }
    });

    // ── Login form ───────────────────────────────────────
    document.getElementById('form-login').addEventListener('submit', async e => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const pass  = document.getElementById('login-password').value;
        if (!email.toLowerCase().endsWith('@gmail.com')) {
            setMsg('auth-msg', 'Please use a Gmail address (@gmail.com).');
            return;
        }
        try {
            await auth.signInWithEmailAndPassword(email, pass);
        } catch (err) {
            setMsg('auth-msg', authError(err.code));
        }
    });

    // ── Register form ────────────────────────────────────
    document.getElementById('form-register').addEventListener('submit', async e => {
        e.preventDefault();
        const uname = document.getElementById('reg-username').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const pass  = document.getElementById('reg-password').value;

        if (uname.length < 2)  { setMsg('auth-msg', 'Username must be at least 2 characters.'); return; }
        if (uname.length > 24) { setMsg('auth-msg', 'Username can be at most 24 characters.'); return; }
        if (!/^[a-zA-Z0-9_. -]+$/.test(uname)) {
            setMsg('auth-msg', 'Username can only contain letters, numbers, spaces, underscores, dots, and hyphens.');
            return;
        }
        if (!email.toLowerCase().endsWith('@gmail.com')) {
            setMsg('auth-msg', 'Please use a Gmail address (@gmail.com).');
            return;
        }
        try {
            const cred = await auth.createUserWithEmailAndPassword(email, pass);
            await createUserDoc(cred.user, uname);
        } catch (err) {
            setMsg('auth-msg', authError(err.code));
        }
    });

    // ── Username setup form ──────────────────────────────
    document.getElementById('form-username').addEventListener('submit', async e => {
        e.preventDefault();
        const uname = document.getElementById('setup-username').value.trim();
        if (uname.length < 2)  { setMsg('username-msg', 'At least 2 characters please.'); return; }
        if (uname.length > 24) { setMsg('username-msg', 'Max 24 characters.'); return; }
        try {
            const user = auth.currentUser;
            await createUserDoc(user, uname);
            currentUser     = user;
            const snap      = await db.collection('users').doc(user.uid).get();
            currentUserData = snap.data();
            bootApp();
        } catch (err) {
            setMsg('username-msg', err.message);
        }
    });

    // ── Compose — send on Enter ──────────────────────────
    document.getElementById('compose-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
});

// ─── GOOGLE SIGN-IN ───────────────────────────────────────────────────────────
function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => setMsg('auth-msg', authError(err.code)));
}

// ─── CREATE USER DOCUMENT ────────────────────────────────────────────────────
async function createUserDoc(user, username) {
    await db.collection('users').doc(user.uid).set({
        username,
        usernameLower: username.toLowerCase(),
        email:         user.email || '',
        color:         pickColor(user.uid),
        createdAt:     firebase.firestore.FieldValue.serverTimestamp()
    });
}

// ─── BOOT APP ─────────────────────────────────────────────────────────────────
function bootApp() {
    showScreen('screen-app');

    // Avatars
    renderAvatar('sidebar-avatar', currentUserData.username, currentUserData.color);
    renderAvatar('footer-avatar',  currentUserData.username, currentUserData.color);
    document.getElementById('footer-username').textContent = currentUserData.username;

    loadConvList();
}

function renderAvatar(id, name, color) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent    = initial(name);
    el.style.background = color;
}

// ─── CONVERSATIONS ────────────────────────────────────────────────────────────
function loadConvList() {
    if (chatsUnsub) chatsUnsub();

    const list = document.getElementById('conv-list');
    list.innerHTML = '';

    // ── Global Chat (always pinned) ──
    const pinLabel = createLabel('<i class="fas fa-thumbtack"></i> Pinned');
    list.appendChild(pinLabel);
    list.appendChild(buildConvItem({
        chatId:   'global',
        name:     'Global Chat',
        sub:      'Everyone is here',
        color:    '#4a6cf7',
        symbol:   '🌐',
        isGlobal: true
    }));

    // ── DMs label ──
    const dmLabel = createLabel('<i class="fas fa-comment-dots"></i> Direct Messages');
    dmLabel.id = 'dm-section-label';
    list.appendChild(dmLabel);

    // ── Live DM listener ──
    chatsUnsub = db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .orderBy('lastTimestamp', 'desc')
        .onSnapshot(snap => {
            // Remove existing DM items
            list.querySelectorAll('.conv-item.dm-item').forEach(el => el.remove());

            const label = document.getElementById('dm-section-label');

            snap.forEach(doc => {
                const data    = doc.data();
                const otherId = data.participants.find(id => id !== currentUser.uid);
                if (!otherId) return;
                const otherName  = (data.participantNames  || {})[otherId] || 'Unknown';
                const otherColor = (data.participantColors || {})[otherId] || '#888';
                const ts         = data.lastTimestamp ? fmtTime(data.lastTimestamp.toDate()) : '';
                const sub        = data.lastMessage || 'No messages yet';

                const item = buildConvItem({
                    chatId:   doc.id,
                    name:     otherName,
                    sub,
                    color:    otherColor,
                    symbol:   null,
                    timestamp: ts,
                    isDM:     true
                });
                // Insert after the DM label
                list.insertBefore(item, label.nextSibling);
            });
        }, err => console.error('Chats listener error:', err));
}

function createLabel(html) {
    const el = document.createElement('div');
    el.className = 'conv-section-label';
    el.innerHTML = html;
    return el;
}

function buildConvItem({ chatId, name, sub, color, symbol, timestamp, isGlobal, isDM }) {
    const div = document.createElement('div');
    div.className = 'conv-item' + (isDM ? ' dm-item' : '');
    div.dataset.chatId = chatId;

    div.innerHTML = `
        <div class="conv-av" style="background:${color}">${symbol || esc(initial(name))}</div>
        <div class="conv-info">
            <div class="conv-name-row">
                <span class="conv-name">${esc(name)}</span>
                ${timestamp ? `<span class="conv-time">${timestamp}</span>` : ''}
            </div>
            <span class="conv-sub">${esc(sub)}</span>
        </div>
    `;

    div.addEventListener('click', () => openChat(chatId, name, color, symbol || initial(name)));
    return div;
}

// ─── TIME FORMATTING ─────────────────────────────────────────────────────────
function fmtTime(date) {
    if (!date) return '';
    const now  = new Date();
    const diff = now - date;
    if (diff < 86400000 && date.toDateString() === now.toDateString())
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (new Date(now - 86400000).toDateString() === date.toDateString())
        return 'Yesterday';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function fmtDateLabel(date) {
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return 'Today';
    if (new Date(now - 86400000).toDateString() === date.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

// ─── OPEN CHAT ────────────────────────────────────────────────────────────────
function openChat(chatId, name, color, avatarContent) {
    currentChatId = chatId;
    lastDateStr   = null;

    // Highlight active conv item
    document.querySelectorAll('.conv-item').forEach(el => {
        el.classList.toggle('active', el.dataset.chatId === chatId);
    });

    // Update chat header
    const hdrAv = document.getElementById('chat-hdr-av');
    hdrAv.textContent     = avatarContent;
    hdrAv.style.background = color;
    document.getElementById('chat-hdr-name').textContent = name;
    document.getElementById('chat-hdr-sub').textContent  =
        chatId === 'global' ? '🌐 Global Chat • Everyone' : '💬 Direct Message';

    document.getElementById('chat-empty').classList.add('hidden');
    document.getElementById('chat-main').classList.remove('hidden');

    listenMessages(chatId);
    document.getElementById('compose-input').focus();
}

// ─── MESSAGES LISTENER ───────────────────────────────────────────────────────
function listenMessages(chatId) {
    if (msgUnsub) msgUnsub();

    const area = document.getElementById('messages-area');
    area.innerHTML = '';
    lastDateStr = null;

    msgUnsub = db.collection('messages')
        .where('chatId', '==', chatId)
        .orderBy('timestamp', 'asc')
        .limitToLast(100)
        .onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') renderMsg(change.doc.data());
            });
            scrollDown();
        }, err => console.error('Messages listener error:', err));
}

// ─── RENDER A MESSAGE ─────────────────────────────────────────────────────────
function renderMsg(msg) {
    const area  = document.getElementById('messages-area');
    if (!area) return;

    const isOwn = msg.senderId === currentUser.uid;
    const ts    = msg.timestamp ? msg.timestamp.toDate() : new Date();
    const dateStr = ts.toDateString();

    // Date separator
    if (dateStr !== lastDateStr) {
        lastDateStr = dateStr;
        const sep = document.createElement('div');
        sep.className   = 'date-sep';
        sep.textContent = fmtDateLabel(ts);
        area.appendChild(sep);
    }

    const group   = document.createElement('div');
    group.className = `msg-group ${isOwn ? 'own' : 'other'}`;

    const avColor   = isOwn ? currentUserData.color : (msg.senderColor || '#888');
    const avInitial = isOwn ? initial(currentUserData.username) : initial(msg.senderName);
    const sender    = isOwn ? 'You' : esc(msg.senderName || 'Unknown');
    const timeStr   = fmtTime(ts);

    // Bubble content
    let bubbleClass = 'msg-bubble';
    let bubbleInner = '';
    if (msg.imageBase64) {
        bubbleClass += ' img-bubble';
        bubbleInner  = `<img src="${msg.imageBase64}" class="msg-img" alt="Image" onclick="viewImage(this)">`;
    } else {
        bubbleInner = esc(msg.text || '');
    }

    group.innerHTML = `
        <div class="msg-av" style="background:${avColor}">${avInitial}</div>
        <div class="msg-body">
            <div class="msg-meta">
                <span class="sender">${sender}</span>
                <span>${timeStr}</span>
            </div>
            <div class="${bubbleClass}">${bubbleInner}</div>
        </div>
    `;

    area.appendChild(group);
}

function scrollDown() {
    const area = document.getElementById('messages-area');
    if (area) area.scrollTop = area.scrollHeight;
}

// ─── SEND TEXT MESSAGE ────────────────────────────────────────────────────────
async function sendMessage() {
    const input = document.getElementById('compose-input');
    const text  = input.value.trim();
    if (!text || !currentChatId) return;
    input.value = '';

    const msg = {
        chatId:      currentChatId,
        senderId:    currentUser.uid,
        senderName:  currentUserData.username,
        senderColor: currentUserData.color,
        text,
        timestamp:   firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('messages').add(msg);
        if (currentChatId !== 'global') {
            await db.collection('chats').doc(currentChatId).update({
                lastMessage:   text,
                lastTimestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (err) {
        console.error('Send message error:', err);
        alert('Failed to send message. Make sure your Firestore rules are set correctly.');
    }
}

// ─── SEND IMAGE ───────────────────────────────────────────────────────────────
function handleImage(input) {
    const file = input.files[0];
    if (!file || !currentChatId) return;

    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.onload = () => {
            const canvas  = document.createElement('canvas');
            const MAX     = 800;
            let [w, h]    = [img.width, img.height];

            // Resize keeping aspect ratio
            if (w > MAX || h > MAX) {
                if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
                else        { w = Math.round(w * MAX / h); h = MAX; }
            }

            canvas.width  = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);

            const base64 = canvas.toDataURL('image/jpeg', 0.65);

            // Firestore document limit is ~1MB; base64 adds ~37% overhead
            if (base64.length > 900_000) {
                alert('Image is too large after compression. Please use a smaller or lower-resolution image.');
                return;
            }

            postImage(base64);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    input.value = ''; // reset so same file can be re-selected
}

async function postImage(base64) {
    const msg = {
        chatId:      currentChatId,
        senderId:    currentUser.uid,
        senderName:  currentUserData.username,
        senderColor: currentUserData.color,
        text:        '',
        imageBase64: base64,
        timestamp:   firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('messages').add(msg);
        if (currentChatId !== 'global') {
            await db.collection('chats').doc(currentChatId).update({
                lastMessage:   '📷 Image',
                lastTimestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (err) {
        console.error('Send image error:', err);
        alert('Failed to send image. Check Firestore rules and document size limits.');
    }
}

// ─── IMAGE LIGHTBOX ───────────────────────────────────────────────────────────
function viewImage(imgEl) {
    const lb  = document.createElement('div');
    lb.className = 'lightbox';
    const img = document.createElement('img');
    img.src   = imgEl.src;
    lb.appendChild(img);
    lb.addEventListener('click', () => lb.remove());
    document.body.appendChild(lb);
}

// ─── USER SEARCH / DM ─────────────────────────────────────────────────────────
function toggleSearch() {
    const box = document.getElementById('search-box');
    const open = box.classList.contains('hidden');
    box.classList.toggle('hidden', !open);
    if (open) {
        document.getElementById('search-input').focus();
        document.getElementById('search-results').innerHTML = '';
    }
}

function closeSearch() {
    document.getElementById('search-box').classList.add('hidden');
}

async function searchUsers(query) {
    const results = document.getElementById('search-results');
    if (!query || query.length < 1) { results.innerHTML = ''; return; }

    const q = query.toLowerCase();
    try {
        const snap = await db.collection('users')
            .orderBy('usernameLower')
            .startAt(q)
            .endAt(q + '\uf8ff')
            .limit(10)
            .get();

        results.innerHTML = '';
        let any = false;

        snap.forEach(doc => {
            if (doc.id === currentUser.uid) return;
            any = true;
            const u   = doc.data();
            const row = document.createElement('div');
            row.className = 'search-result-item';
            row.innerHTML = `
                <div class="s-av" style="background:${u.color}">${esc(initial(u.username))}</div>
                <span>${esc(u.username)}</span>
            `;
            row.addEventListener('click', () => openOrCreateDM(doc.id, u));
            results.appendChild(row);
        });

        if (!any) {
            results.innerHTML = '<div class="search-result-item empty">No users found</div>';
        }
    } catch (err) {
        console.error('Search error:', err);
    }
}

async function openOrCreateDM(otherId, otherUser) {
    const chatId  = [currentUser.uid, otherId].sort().join('_');
    const chatRef = db.collection('chats').doc(chatId);

    try {
        const snap = await chatRef.get();
        if (!snap.exists) {
            await chatRef.set({
                participants: [currentUser.uid, otherId],
                participantNames: {
                    [currentUser.uid]: currentUserData.username,
                    [otherId]:         otherUser.username
                },
                participantColors: {
                    [currentUser.uid]: currentUserData.color,
                    [otherId]:         otherUser.color
                },
                lastMessage:   '',
                lastTimestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        closeSearch();
        openChat(chatId, otherUser.username, otherUser.color, initial(otherUser.username));
    } catch (err) {
        console.error('DM create error:', err);
        alert('Could not open DM. Check Firestore rules.');
    }
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
function logout() {
    if (msgUnsub)    msgUnsub();
    if (chatsUnsub)  chatsUnsub();
    currentUser     = null;
    currentUserData = null;
    currentChatId   = null;
    lastDateStr     = null;
    auth.signOut();
}
