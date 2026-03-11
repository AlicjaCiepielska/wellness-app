import { db } from "./firebase";
import { doc, getDoc, setDoc, collection, query, orderBy, limit, getDocs } from "firebase/firestore";

function todayId() {
  return new Date().toISOString().slice(0, 10);
}

export async function loadTodayLog(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid, "logs", todayId()));
    return snap.exists() ? snap.data() : null;
  } catch(e) { console.error("[db] loadTodayLog:", e.code); return null; }
}

export async function saveTodayLog(uid, data) {
  try {
    const clean = JSON.parse(JSON.stringify(data));
    await setDoc(doc(db, "users", uid, "logs", todayId()), { ...clean, updatedAt: new Date().toISOString() }, { merge: true });
  } catch(e) { console.error("[db] saveTodayLog:", e.code); }
}

export async function loadProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid, "profile", "settings"));
    if (snap.exists()) return snap.data();
    // fallback: old structure
    const snap2 = await getDoc(doc(db, "users", uid));
    return snap2.exists() ? snap2.data() : null;
  } catch(e) { console.error("[db] loadProfile:", e.code); return null; }
}

export async function saveProfile(uid, data) {
  try {
    const clean = JSON.parse(JSON.stringify(data));
    await setDoc(doc(db, "users", uid, "profile", "settings"), { ...clean, updatedAt: new Date().toISOString() }, { merge: false });
  } catch(e) { console.error("[db] saveProfile:", e.code, e.message); }
}

export async function loadHistory(uid) {
  try {
    const q = query(collection(db, "users", uid, "logs"), orderBy("updatedAt", "desc"), limit(30));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.id !== todayId());
  } catch(e) { console.error("[db] loadHistory:", e.code); return []; }
}
