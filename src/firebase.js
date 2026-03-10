// src/firebase.js
// ─────────────────────────────────────────────────────────────
// STEP 1: Go to https://console.firebase.google.com
// STEP 2: Create a new project → name it "clean-girl-era"
// STEP 3: Add a Web App (</> icon) → copy the firebaseConfig below
// STEP 4: Replace ALL the placeholder values below with your real ones
// ─────────────────────────────────────────────────────────────

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, OAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            "AIzaSyAGqYuQDVhjpTykHtPWjufNMods2uY8HRg",
  authDomain:        "wellness-a.firebaseapp.com",
  projectId:         "wellness-a",
  storageBucket:     "wellness-a.firebasestorage.app",
  messagingSenderId:  "9692199906",
  appId:             "1:9692199906:web:ac2ed672decae2565317bb"
};

const app        = initializeApp(firebaseConfig);
export const auth         = getAuth(app);
export const db           = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export const appleProvider  = new OAuthProvider("apple.com");
