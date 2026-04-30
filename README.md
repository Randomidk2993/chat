# Nexus Chat

A real-time chat app built with vanilla HTML/CSS/JS + Firebase. Hosted free on GitHub Pages.

## Features
- Global Chat (everyone)
- Private Direct Messages
- Image sharing (stored compressed in Firestore — no paid Storage needed)
- Gmail-only login (email/password or Google sign-in)
- Username setup on first login

---

## Setup (5 steps)

### 1. Create a Firebase Project
1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → follow the wizard (disable Google Analytics if you want)

### 2. Enable Authentication
1. In your project → **Build → Authentication → Get started**
2. Enable **Email/Password** provider
3. Enable **Google** provider (set your support email)

### 3. Create a Firestore Database
1. **Build → Firestore Database → Create database**
2. Start in **Production mode** (you'll apply proper rules next)
3. Pick any region

### 4. Apply Security Rules
1. In Firestore → **Rules** tab
2. Paste the contents of `firestore.rules` from this repo
3. Click **Publish**

> **Note:** The DM chats listener uses `participants` (array) + `lastTimestamp` (desc).  
> Firestore will prompt you to create a **composite index** when you first open a DM list.  
> Just click the link in the browser console / Firebase console and wait ~1 minute.

### 5. Add Your Firebase Config
1. In Firebase Console → gear icon → **Project settings**
2. Scroll to **Your apps** → click **</>** (Web)
3. Register app name (e.g. "nexus-chat")
4. Copy the `firebaseConfig` object values
5. Open `firebase-config.js` and fill in each value

---

## Deploy to GitHub Pages
1. Push this folder to a GitHub repo
2. Go to **Settings → Pages → Source: Deploy from branch (main / root)**
3. Your app will be live at `https://YOUR_USERNAME.github.io/YOUR_REPO/`
4. Add that URL to Firebase Auth → **Authorized domains** (Settings → Authentication → Settings tab)

---

## Image Sharing Notes
Images are compressed (max 800px, JPEG 65% quality) and stored as base64 inside Firestore documents.  
Firestore free tier gives **1 GB storage** and **50K reads / 20K writes per day** — plenty for a small group.  
Very large/high-res photos may exceed the 1 MB document limit; the app will warn you if that happens.

---

## Free Tier Summary (Firebase Spark plan)
| Resource | Free limit |
|---|---|
| Firestore storage | 1 GB |
| Firestore reads | 50,000 / day |
| Firestore writes | 20,000 / day |
| Authentication | Unlimited |
| Hosting (optional) | 10 GB / month |
