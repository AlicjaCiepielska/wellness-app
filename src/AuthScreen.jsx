// src/AuthScreen.jsx
import { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { auth, googleProvider, appleProvider } from "./firebase";

export default function AuthScreen() {
  const [mode, setMode]       = useState("login"); // "login" | "register" | "reset"
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]       = useState("");
  const [error, setError]     = useState("");
  const [info, setInfo]       = useState("");
  const [loading, setLoading] = useState(false);

  const clearMessages = () => { setError(""); setInfo(""); };

  const friendlyError = (code) => {
    const map = {
      "auth/invalid-email":          "Invalid email address.",
      "auth/user-not-found":         "No account with this email.",
      "auth/wrong-password":         "Incorrect password.",
      "auth/email-already-in-use":   "This email is already registered.",
      "auth/weak-password":          "Password must be at least 6 characters.",
      "auth/popup-closed-by-user":   "Sign-in popup was closed.",
      "auth/cancelled-popup-request":"Sign-in cancelled.",
      "auth/network-request-failed": "Network error — check your connection.",
    };
    return map[code] || "Something went wrong. Please try again.";
  };

  const handleEmail = async () => {
    clearMessages();
    setLoading(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else if (mode === "register") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
      } else if (mode === "reset") {
        await sendPasswordResetEmail(auth, email);
        setInfo("Reset email sent! Check your inbox 💌");
        setMode("login");
      }
    } catch (e) {
      setError(friendlyError(e.code));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    clearMessages();
    setLoading(true);
    try { await signInWithPopup(auth, googleProvider); }
    catch (e) { setError(friendlyError(e.code)); setLoading(false); }
  };

  const handleApple = async () => {
    clearMessages();
    setLoading(true);
    try { await signInWithPopup(auth, appleProvider); }
    catch (e) { setError(friendlyError(e.code)); setLoading(false); }
  };

  const S = {
    wrap: {
      minHeight: "100vh",
      background: "linear-gradient(155deg, #faf8f3 0%, #f0ebe0 50%, #e9f0e9 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "'Cormorant Garamond', Georgia, serif",
      padding: "24px",
    },
    card: {
      width: "100%", maxWidth: "380px",
      background: "rgba(255,255,255,0.7)",
      borderRadius: "24px", padding: "36px 32px",
      boxShadow: "0 4px 32px rgba(139,119,95,0.1)",
      backdropFilter: "blur(12px)",
    },
    title: { fontSize: "28px", fontWeight: "300", color: "#3d3530", textAlign: "center", margin: "0 0 4px" },
    sub:   { fontSize: "13px", color: "#8b7763", fontStyle: "italic", textAlign: "center", marginBottom: "28px" },
    label: { fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: "#8b7763", marginBottom: "5px", display: "block" },
    input: {
      width: "100%", padding: "10px 14px", borderRadius: "12px",
      border: "1.5px solid rgba(139,119,95,0.22)", background: "rgba(255,255,255,0.8)",
      fontFamily: "inherit", fontSize: "14px", color: "#3d3530", outline: "none",
      marginBottom: "14px", boxSizing: "border-box",
    },
    btn: (c) => ({
      width: "100%", padding: "12px", borderRadius: "14px", border: "none",
      background: c || "linear-gradient(135deg, #8ab890, #5a7a5a)",
      color: "#fff", fontSize: "14px", letterSpacing: "0.5px",
      cursor: "pointer", fontFamily: "inherit", marginBottom: "10px",
      opacity: loading ? 0.7 : 1, transition: "opacity 0.2s",
    }),
    outlineBtn: (c) => ({
      width: "100%", padding: "11px", borderRadius: "14px",
      border: "1.5px solid " + (c || "rgba(139,119,95,0.3)"),
      background: "transparent", color: c ? c : "#5c4f42",
      fontSize: "13px", cursor: "pointer", fontFamily: "inherit",
      marginBottom: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
    }),
    divider: { textAlign: "center", fontSize: "11px", color: "#a89880", letterSpacing: "2px", margin: "6px 0 14px", textTransform: "uppercase" },
    error: { fontSize: "12px", color: "#c47a98", textAlign: "center", marginBottom: "12px", fontStyle: "italic" },
    info:  { fontSize: "12px", color: "#5a7a5a", textAlign: "center", marginBottom: "12px", fontStyle: "italic" },
    link:  { background: "none", border: "none", color: "#8b7763", fontSize: "12px", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" },
    blobWrap: { textAlign: "center", marginBottom: "20px" },
  };

  return (
    <div style={S.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet"/>
      <div style={S.card}>
        {/* mini blob */}
        <div style={S.blobWrap}>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <defs>
              <radialGradient id="ag" cx="38%" cy="32%" r="62%">
                <stop offset="0%" stopColor="white" stopOpacity="0.5"/>
                <stop offset="100%" stopColor="#d4e4c8"/>
              </radialGradient>
            </defs>
            <path d="M32 8C46 6,58 16,59 30C60 44,50 56,36 58C22 60,8 50,8 36C8 22,16 10,32 8Z" fill="url(#ag)" stroke="#8ab890" strokeWidth="1.5"/>
            <ellipse cx="26" cy="30" rx="3.5" ry="4" fill="#8ab890"/>
            <ellipse cx="25" cy="28.5" rx="1.2" ry="1.2" fill="white" opacity="0.7"/>
            <ellipse cx="38" cy="30" rx="3.5" ry="4" fill="#8ab890"/>
            <ellipse cx="37" cy="28.5" rx="1.2" ry="1.2" fill="white" opacity="0.7"/>
            <path d="M26 42 Q32 47 38 42" stroke="#8ab890" strokeWidth="2" fill="none" strokeLinecap="round"/>
          </svg>
        </div>

        <h1 style={S.title}>wellness</h1>
        <p style={S.sub}>
          {mode === "login"    ? "welcome back ✨" :
           mode === "register" ? "start your wellness journey 🌿" :
                                 "reset your password 💌"}
        </p>

        {error && <div style={S.error}>{error}</div>}
        {info  && <div style={S.info}>{info}</div>}

        {mode === "register" && (
          <>
            <label style={S.label}>your name</label>
            <input style={S.input} type="text" placeholder="e.g. Sofia" value={name} onChange={e => setName(e.target.value)}/>
          </>
        )}

        <label style={S.label}>email</label>
        <input style={S.input} type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)}/>

        {mode !== "reset" && (
          <>
            <label style={S.label}>password</label>
            <input style={S.input} type="password" placeholder={mode === "register" ? "min. 6 characters" : "••••••••"} value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleEmail()}/>
          </>
        )}

        <button style={S.btn()} onClick={handleEmail} disabled={loading}>
          {loading ? "..." : mode === "login" ? "sign in" : mode === "register" ? "create account" : "send reset email"}
        </button>

        {mode !== "reset" && (
          <>
            <div style={S.divider}>or continue with</div>
            <button style={S.outlineBtn("#4285F4")} onClick={handleGoogle} disabled={loading}>
              <svg width="16" height="16" viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.4 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.8 13.5-4.7l-6.2-5.2C29.4 35.6 26.8 36 24 36c-5.3 0-9.7-2.6-11.3-7H6.1v5.5C9.5 39.6 16.3 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.5-2.6 4.6-4.8 6l6.2 5.2C40.5 36.2 44 30.6 44 24c0-1.3-.1-2.7-.4-4z"/>
              </svg>
              Sign in with Google
            </button>
            <button style={S.outlineBtn("#000")} onClick={handleApple} disabled={loading}>
              <svg width="16" height="16" viewBox="0 0 814 1000" fill="currentColor">
                <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105-36.8-155.5-127.4C46 790.8 0 663.4 0 540.8c0-207.5 135.4-317.3 269-317.3 70.1 0 128.4 46.4 172.5 46.4 43.1 0 110.8-49 192.3-49 30.5 0 132.9 2.6 198.3 99zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
              </svg>
              Sign in with Apple
            </button>
          </>
        )}

        <div style={{ textAlign: "center", marginTop: "8px", display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          {mode === "login" && <>
            <button style={S.link} onClick={() => { clearMessages(); setMode("register"); }}>create account</button>
            <span style={{ color: "#c4b8a8" }}>·</span>
            <button style={S.link} onClick={() => { clearMessages(); setMode("reset"); }}>forgot password?</button>
          </>}
          {mode === "register" && <button style={S.link} onClick={() => { clearMessages(); setMode("login"); }}>already have an account?</button>}
          {mode === "reset"    && <button style={S.link} onClick={() => { clearMessages(); setMode("login"); }}>back to sign in</button>}
        </div>
      </div>
    </div>
  );
}
