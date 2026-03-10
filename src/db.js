// src/db.js  — all Firestore read/write operations

import { db } from "./firebase";
import {
  doc, getDoc, setDoc, collection,
  query, orderBy, limit, getDocs,
} from "firebase/firestore";

// ── Today's log ──────────────────────────────────────────────
// Path: users/{uid}/logs/{YYYY-MM-DD}

function todayId() {
  return new Date().toISOString().slice(0, 10); // "2025-03-10"
}

function logRef(uid) {
  return doc(db, "users", uid, "logs", todayId());
}

export async function loadTodayLog(uid) {
  const snap = await getDoc(logRef(uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveTodayLog(uid, data) {
  await setDoc(logRef(uid), { ...data, updatedAt: new Date().toISOString() }, { merge: true });
}

// ── History ──────────────────────────────────────────────────
// Returns last 30 days of logs

export async function loadHistory(uid) {
  const logsCol = collection(db, "users", uid, "logs");
  const q = query(logsCol, orderBy("updatedAt", "desc"), limit(30));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => d.id !== todayId()); // exclude today
}

// ── User profile ─────────────────────────────────────────────
// Path: users/{uid}

export async function loadProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : {};
}

export async function saveProfile(uid, data) {
  await setDoc(doc(db, "users", uid), data, { merge: true });
}

// ── Notification settings ────────────────────────────────────
// Stored as a field on the user profile doc

export async function saveNotifSettings(uid, settings) {
  await setDoc(doc(db, "users", uid), { notifSettings: settings }, { merge: true });
}
