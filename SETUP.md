# Setup Guide

## 1. Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a project
2. Enable **Authentication** → Sign-in methods → Enable **Email/Password** and **Google**
3. Enable **Cloud Firestore** → Create database (start in test mode, secure later)
4. Go to **Project Settings** → **Service accounts** → Generate new private key → save the JSON
5. Go to **Project Settings** → **General** → copy the Firebase config object (apiKey, authDomain, etc.)

## 2. Twitch Application

1. Go to [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) and register a new app
2. Set the OAuth Redirect URL to `https://your-frontend.vercel.app/twitch/callback`
   (for local dev: `http://localhost:3000/twitch/callback`)
3. Copy the **Client ID** and generate a **Client Secret**

## 3. Backend (Railway)

1. Create an account at [railway.app](https://railway.app)
2. Create a new project → Deploy from GitHub repo
3. Set the **Root Directory** to `backend/`
4. Add the following environment variables:
   - `FIREBASE_SERVICE_ACCOUNT` = the entire minified JSON from step 1.4
   - `FIREBASE_PROJECT_ID` = your Firebase project ID
   - `TWITCH_CLIENT_ID` = from step 2
   - `TWITCH_CLIENT_SECRET` = from step 2
   - `GROQ_API_KEY` = optional shared Groq key for users without their own
5. The backend will start on the assigned port

## 4. Frontend (Vercel)

1. Create an account at [vercel.com](https://vercel.com)
2. Import your GitHub repo → set **Root Directory** to `public/`
3. No build command needed (static HTML)
4. In `public/js/firebase-config.js`, replace the config values with your Firebase project's config
5. In `public/js/twitch-oauth.js`, replace `YOUR_TWITCH_CLIENT_ID` with your Twitch app's Client ID
6. In `public/js/db.js`, replace the `BACKEND_URL` with your Railway backend URL
7. Deploy

## 5. Firestore Security Rules

Go to Firestore → Rules and set:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /configs/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /status/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
      match /logs/{docId} {
        allow read: if request.auth != null && request.auth.uid == userId;
        allow write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

## Architecture

```
User's browser → Vercel (static frontend) → Backend API (Railway) → Twitch IRC
                                              ↓
                                          Firestore (configs, logs, status)
```

- The bot runs on the backend server (24/7), not in the browser
- Users only need the website for setup and monitoring
- Each user's Twitch tokens and Groq key are stored securely in Firestore
