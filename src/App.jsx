// src/App.jsx — Wellness v2 with Firebase
import { useState, useEffect, useRef, useCallback } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { loadTodayLog, saveTodayLog, loadHistory } from "./db";
import AuthScreen from "./AuthScreen";
import {
  defaultNotifSettings, requestNotifPermission, getPermissionStatus,
  sendTestNotification, scheduleNotifications,
} from "./useNotifications";

// ── Constants ────────────────────────────────────────────────
const WATER_GOAL = 8, STEPS_GOAL = 10000, SLEEP_GOAL = 8, LEARNING_GOAL = 60;

const selfCareOptions = [
  "skincare 🧴","journaling 📓","reading 📖","bath 🛁",
  "walk outside 🌿","cooking healthy 🥗","nails 💅","tidying up 🧹",
];
const moodOptions = ["✨ glowing","🌸 soft","💪 strong","😴 tired","🌙 calm","🔥 motivated"];

const defaultWeights = {
  water:8, steps:6, workout:7, sleep:9, learning:7, selfCare:5, sweets:4, screenTime:4,
};

const defaultLog = {
  water:0, steps:0, sweets:0, workout:false, workoutType:"",
  screenTime:0, socialMedia:0, learningTime:0, learningProductivity:0,
  sleep:0, selfCare:[], mood:"",
};

// ── Blob Creature ────────────────────────────────────────────
function BlobCreature({ score, data }) {
  const [bounce, setBounce] = useState(false);
  const [sparkle, setSparkle] = useState(false);
  const prev = useRef(score);
  useEffect(() => {
    if (score !== prev.current) {
      setBounce(true); setTimeout(() => setBounce(false), 600);
      if (score >= 85) { setSparkle(true); setTimeout(() => setSparkle(false), 1200); }
      prev.current = score;
    }
  }, [score]);

  const state = score>=80?"glowing":score>=55?"happy":score>=30?"okay":(data.sleep>0&&data.sleep<5)?"sleepy":"sad";
  const aura = {glowing:["rgba(255,220,150,0.35)","rgba(200,230,180,0.25)"],happy:["rgba(180,220,190,0.3)","rgba(220,200,240,0.15)"],okay:["rgba(210,195,175,0.25)","rgba(180,200,210,0.15)"],sleepy:["rgba(180,190,220,0.25)","rgba(160,175,200,0.1)"],sad:["rgba(200,185,175,0.2)","rgba(180,180,195,0.1)"]}[state];
  const bodyColor={glowing:"#e8d5a8",happy:"#d4e4c8",okay:"#d4c8b8",sleepy:"#c8ccd8",sad:"#c8bfb8"}[state];
  const bodyStroke={glowing:"#c4a870",happy:"#8ab890",okay:"#b4a890",sleepy:"#909ab8",sad:"#a89890"}[state];
  const accessories=[];
  if(data.water>=WATER_GOAL)accessories.push("water");
  if(data.workout||data.steps>=STEPS_GOAL)accessories.push("yoga");
  if(data.learningTime>=30)accessories.push("book");
  if(data.selfCare?.length>=2)accessories.push("star");
  const blobAnim=state==="glowing"?"blob-float 2.8s ease-in-out infinite":state==="happy"?"blob-float 3.5s ease-in-out infinite":state==="sleepy"?"blob-sleepy 4s ease-in-out infinite":state==="sad"?"blob-droop 3s ease-in-out infinite":"blob-idle 4s ease-in-out infinite";
  const statusText={glowing:"living my best life ✨",happy:"feeling good today 🌿",okay:"taking it one step at a time 🌸",sleepy:"could use more sleep... 😴",sad:"let's build those habits 🌱"}[state];

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"10px 0 0"}}>
      <style>{`
        @keyframes blob-float{0%,100%{transform:translateY(0) scale(1,1)}40%{transform:translateY(-9px) scale(1.04,0.96)}70%{transform:translateY(-4px) scale(0.97,1.03)}}
        @keyframes blob-idle{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        @keyframes blob-sleepy{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(4px) rotate(2deg)}}
        @keyframes blob-droop{0%,100%{transform:translateY(0)}50%{transform:translateY(3px)}}
        @keyframes bounce-blob{0%{transform:scale(1)}35%{transform:scale(1.18,0.84)}65%{transform:scale(0.92,1.08)}100%{transform:scale(1)}}
        @keyframes sparkle-pop{0%,100%{opacity:0;transform:scale(0.4)}50%{opacity:1;transform:scale(1.3)}}
        @keyframes aura-pulse{0%,100%{transform:scale(1);opacity:0.75}50%{transform:scale(1.07);opacity:1}}
        @keyframes acc-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
      `}</style>
      <div style={{position:"relative",width:"150px",height:"150px",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{position:"absolute",width:"138px",height:"138px",borderRadius:"50%",background:`radial-gradient(circle, ${aura[0]} 0%, ${aura[1]} 60%, transparent 100%)`,animation:"aura-pulse 3s ease-in-out infinite"}}/>
        <div style={{position:"absolute",width:"112px",height:"112px",borderRadius:"50%",background:`radial-gradient(circle, ${aura[0]} 0%, transparent 70%)`,animation:"aura-pulse 3s ease-in-out infinite 0.6s"}}/>
        {sparkle&&["14px,12px","108px,10px","16px,88px","106px,82px"].map((p,i)=>(
          <div key={i} style={{position:"absolute",left:p.split(",")[0],top:p.split(",")[1],fontSize:"9px",color:"#c4a870",animation:`sparkle-pop 0.7s ease ${i*0.12}s both`}}>✦</div>
        ))}
        <div style={{animation:bounce?"bounce-blob 0.6s ease":blobAnim,position:"relative",zIndex:1}}>
          <svg width="86" height="86" viewBox="0 0 86 86">
            <defs><radialGradient id="bG" cx="38%" cy="32%" r="62%"><stop offset="0%" stopColor="white" stopOpacity="0.55"/><stop offset="100%" stopColor={bodyColor}/></radialGradient></defs>
            <path d={state==="sleepy"?"M43 13 C58 11,72 22,74 39 C76 56,65 70,49 74 C33 78,16 68,13 51 C10 34,22 15,43 13Z":state==="sad"?"M43 15 C57 13,70 24,72 41 C74 58,62 71,46 73 C30 75,16 65,14 48 C12 31,24 17,43 15Z":"M43 11 C60 9,74 22,75 41 C76 60,63 74,45 76 C27 78,11 66,11 47 C11 28,24 13,43 11Z"} fill="url(#bG)" stroke={bodyStroke} strokeWidth="1.5"/>
            {(state==="glowing"||state==="happy")&&<><ellipse cx="28" cy="50" rx="6.5" ry="4" fill="rgba(220,150,160,0.22)"/><ellipse cx="58" cy="50" rx="6.5" ry="4" fill="rgba(220,150,160,0.22)"/></>}
            {state==="sleepy"&&<><path d="M30 39 Q34 36 38 39" stroke={bodyStroke} strokeWidth="2.2" fill="none" strokeLinecap="round"/><path d="M48 39 Q52 36 56 39" stroke={bodyStroke} strokeWidth="2.2" fill="none" strokeLinecap="round"/><text x="64" y="30" fontSize="8" fill={bodyStroke} opacity="0.5">z</text><text x="69" y="23" fontSize="6" fill={bodyStroke} opacity="0.35">z</text></>}
            {state==="sad"&&<><ellipse cx="34" cy="40" rx="3.5" ry="4" fill={bodyStroke}/><ellipse cx="33.5" cy="38.5" rx="1.2" ry="1.5" fill="white" opacity="0.65"/><ellipse cx="52" cy="40" rx="3.5" ry="4" fill={bodyStroke}/><ellipse cx="51.5" cy="38.5" rx="1.2" ry="1.5" fill="white" opacity="0.65"/><path d="M35 57 Q43 53 51 57" stroke={bodyStroke} strokeWidth="1.8" fill="none" strokeLinecap="round"/></>}
            {state==="okay"&&<><ellipse cx="34" cy="40" rx="4" ry="4" fill={bodyStroke}/><ellipse cx="33" cy="38.5" rx="1.4" ry="1.4" fill="white" opacity="0.65"/><ellipse cx="52" cy="40" rx="4" ry="4" fill={bodyStroke}/><ellipse cx="51" cy="38.5" rx="1.4" ry="1.4" fill="white" opacity="0.65"/><path d="M36 56 Q43 58 50 56" stroke={bodyStroke} strokeWidth="1.6" fill="none" strokeLinecap="round"/></>}
            {(state==="happy")&&<><ellipse cx="34" cy="40" rx="4.5" ry="4.5" fill={bodyStroke}/><ellipse cx="32.8" cy="38.2" rx="1.6" ry="1.6" fill="white" opacity="0.7"/><ellipse cx="52" cy="40" rx="4.5" ry="4.5" fill={bodyStroke}/><ellipse cx="50.8" cy="38.2" rx="1.6" ry="1.6" fill="white" opacity="0.7"/><path d="M35 56 Q43 62 51 56" stroke={bodyStroke} strokeWidth="2" fill="none" strokeLinecap="round"/></>}
            {state==="glowing"&&<><text x="29" y="47" fontSize="14" textAnchor="middle" fill={bodyStroke}>✦</text><text x="57" y="47" fontSize="14" textAnchor="middle" fill={bodyStroke}>✦</text><path d="M34 58 Q43 65 52 58" stroke={bodyStroke} strokeWidth="2.2" fill="none" strokeLinecap="round"/></>}
          </svg>
          {accessories.includes("water")&&<div style={{position:"absolute",top:"-10px",right:"-14px",fontSize:"15px",animation:"acc-float 3s ease-in-out infinite 0.3s"}}>💧</div>}
          {accessories.includes("yoga")&&<div style={{position:"absolute",bottom:"-8px",right:"-15px",fontSize:"13px",animation:"acc-float 3.2s ease-in-out infinite 0.8s"}}>🧘</div>}
          {accessories.includes("book")&&<div style={{position:"absolute",bottom:"-6px",left:"-16px",fontSize:"13px",animation:"acc-float 3.4s ease-in-out infinite 0.5s"}}>📖</div>}
          {accessories.includes("star")&&<div style={{position:"absolute",top:"-8px",left:"-12px",fontSize:"12px",animation:"acc-float 2.9s ease-in-out infinite 0.2s"}}>✨</div>}
        </div>
      </div>
      <div style={{fontSize:"12px",color:"#8b7763",fontStyle:"italic",marginTop:"6px"}}>{statusText}</div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────
export default function App() {
  const [user, setUser]               = useState(undefined); // undefined = loading
  const [log, setLog]                 = useState(defaultLog);
  const [history, setHistory]         = useState([]);
  const [activeTab, setActiveTab]     = useState("today");
  const [toast, setToast]             = useState(null);
  const [animWater, setAnimWater]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [weights, setWeights]         = useState(defaultWeights);
  const [showWeights, setShowWeights] = useState(false);
  const [notifSettings, setNotifSettings] = useState(defaultNotifSettings);
  const [notifPermission, setNotifPermission] = useState("default");
  const saveTimer = useRef(null);

  // ── Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u || null));
    return unsub;
  }, []);

  // ── Load data when user logs in
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [todayData, hist] = await Promise.all([
        loadTodayLog(user.uid),
        loadHistory(user.uid),
      ]);
      if (todayData) setLog({ ...defaultLog, ...todayData });
      setHistory(hist);
      setNotifPermission(getPermissionStatus());
    })();
  }, [user]);

  // ── Auto-save with debounce (1.5s after last change)
  const autoSave = useCallback((newLog) => {
    if (!user) return;
    clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      await saveTodayLog(user.uid, newLog);
      setSaving(false);
    }, 1500);
  }, [user]);

  const update = (key, value) => {
    setLog(prev => {
      const next = { ...prev, [key]: value };
      autoSave(next);
      return next;
    });
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const addWater = () => {
    if (log.water >= 12) return;
    setAnimWater(true); setTimeout(() => setAnimWater(false), 500);
    const next = log.water + 1;
    update("water", next);
    if (next === WATER_GOAL) showToast("💧 water goal reached! amazing!");
  };
  const removeWater = () => { if (log.water > 0) update("water", log.water - 1); };
  const toggleSelfCare = (item) => {
    const arr = log.selfCare?.includes(item) ? log.selfCare.filter(s=>s!==item) : [...(log.selfCare||[]), item];
    update("selfCare", arr);
  };

  const getScore = () => {
    const w = weights;
    const totalW = w.water+w.steps+w.workout+w.sleep+w.learning+w.selfCare+w.sweets+w.screenTime;
    const waterPt    = (log.water>=WATER_GOAL?1:(log.water/WATER_GOAL)) * w.water;
    const stepsPt    = ((log.steps||0)>=STEPS_GOAL?1:(log.steps||0)/STEPS_GOAL) * w.steps;
    const workoutPt  = (log.workout?1:0) * w.workout;
    const sleepPt    = ((log.sleep||0)>=SLEEP_GOAL?1:(log.sleep||0)>0?(log.sleep||0)/SLEEP_GOAL:0) * w.sleep;
    const learnPt    = Math.min((log.learningTime||0)/LEARNING_GOAL,1)*(0.4+((log.learningProductivity||0)/10)*0.6) * w.learning;
    const selfCarePt = Math.min((log.selfCare?.length||0)/3,1) * w.selfCare;
    const sweetsPt   = Math.max(0,1-(log.sweets||0)/4) * w.sweets;
    const screenPt   = Math.max(0,1-Math.max(0,((log.screenTime||0)/60-2)/3)) * w.screenTime;
    return Math.min(Math.round((waterPt+stepsPt+workoutPt+sleepPt+learnPt+selfCarePt+sweetsPt+screenPt)/totalW*100),100);
  };
  const score = getScore();

  const fmt = (mins) => { if(!mins)return"0m"; const h=Math.floor(mins/60),m=mins%60; return h>0?`${h}h${m>0?` ${m}m`:""}`:m+"m"; };

  // ── Loading state
  if (user === undefined) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(155deg,#faf8f3,#f0ebe0)",fontFamily:"Georgia,serif",color:"#8b7763",fontSize:"14px",fontStyle:"italic"}}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet"/>
      loading your wellness...
    </div>
  );

  // ── Not logged in → show auth screen
  if (!user) return <AuthScreen />;

  // ── Styles
  const S = {
    app:{minHeight:"100vh",background:"linear-gradient(155deg,#faf8f3 0%,#f0ebe0 50%,#e9f0e9 100%)",fontFamily:"'Cormorant Garamond',Georgia,serif",color:"#3d3530",padding:"0 0 90px"},
    header:{padding:"24px 24px 12px",textAlign:"center",borderBottom:"1px solid rgba(139,119,95,0.1)"},
    dateLabel:{fontSize:"10px",letterSpacing:"3px",textTransform:"uppercase",color:"#8b7763",marginBottom:"4px"},
    title:{fontSize:"28px",fontWeight:"300",color:"#3d3530",margin:"0 0 2px"},
    subtitle:{fontSize:"13px",color:"#8b7763",fontStyle:"italic"},
    tabs:{display:"flex",justifyContent:"center",margin:"0 0 18px",borderBottom:"1px solid rgba(139,119,95,0.13)",overflowX:"auto"},
    tab:(a)=>({padding:"11px 16px",fontSize:"10px",letterSpacing:"2px",textTransform:"uppercase",border:"none",background:"none",cursor:"pointer",color:a?"#5a7a5a":"#a89880",borderBottom:a?"2px solid #5a7a5a":"2px solid transparent",fontFamily:"inherit",transition:"all 0.2s",whiteSpace:"nowrap"}),
    section:{margin:"0 18px 13px",background:"rgba(255,255,255,0.6)",borderRadius:"16px",padding:"17px 19px",backdropFilter:"blur(8px)",boxShadow:"0 2px 14px rgba(139,119,95,0.07)"},
    sTitle:{fontSize:"9px",letterSpacing:"3px",textTransform:"uppercase",color:"#8b7763",marginBottom:"13px",display:"flex",alignItems:"center",gap:"7px"},
    iRow:{display:"flex",alignItems:"center",gap:"10px",marginBottom:"7px"},
    lbl:{fontSize:"13px",color:"#5c4f42",minWidth:"72px",fontStyle:"italic"},
    inp:{flex:1,padding:"7px 12px",borderRadius:"10px",border:"1.5px solid rgba(139,119,95,0.2)",background:"rgba(255,255,255,0.7)",fontFamily:"inherit",fontSize:"14px",color:"#3d3530",outline:"none"},
    bar:{height:"5px",borderRadius:"3px",background:"rgba(139,119,95,0.09)",marginTop:"4px",overflow:"hidden"},
    fill:(p,c)=>({height:"100%",width:Math.min(p||0,100)+"%",background:c||"linear-gradient(90deg,#8ab890,#5a7a5a)",borderRadius:"3px",transition:"width 0.7s cubic-bezier(.4,0,.2,1)"}),
    hint:{fontSize:"11px",color:"#8b7763",marginTop:"4px",fontStyle:"italic"},
    tog:(a)=>({padding:"7px 18px",borderRadius:"18px",border:"1.5px solid "+(a?"#5a7a5a":"rgba(139,119,95,0.25)"),background:a?"linear-gradient(135deg,#8ab890,#5a7a5a)":"transparent",color:a?"#fff":"#8b7763",fontSize:"12px",cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"}),
    scGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"7px"},
    scItem:(a)=>({padding:"9px 10px",borderRadius:"11px",border:"1.5px solid "+(a?"#8ab890":"rgba(139,119,95,0.16)"),background:a?"rgba(138,184,144,0.1)":"rgba(255,255,255,0.4)",fontSize:"12px",cursor:"pointer",textAlign:"center",transition:"all 0.17s",color:a?"#4a6e4a":"#8b7763"}),
    moodGrid:{display:"flex",flexWrap:"wrap",gap:"7px"},
    moodItem:(a)=>({padding:"7px 14px",borderRadius:"18px",border:"1.5px solid "+(a?"#c4a882":"rgba(139,119,95,0.16)"),background:a?"rgba(196,168,130,0.13)":"transparent",fontSize:"12px",cursor:"pointer",color:a?"#8b6b3d":"#8b7763",fontFamily:"inherit",transition:"all 0.17s"}),
    glass:(f,p)=>({width:"25px",height:"32px",borderRadius:"3px 3px 5px 5px",background:f?"linear-gradient(180deg,#a8d4e6,#7bbcd4)":"rgba(139,119,95,0.08)",border:"1.5px solid "+(f?"#7bbcd4":"rgba(139,119,95,0.16)"),cursor:"pointer",transition:"all 0.17s",transform:p?"scale(1.22)":f?"scale(1)":"scale(0.94)"}),
    prodDot:(a)=>({width:"26px",height:"26px",borderRadius:"50%",border:"1.5px solid "+(a?"#8ab890":"rgba(139,119,95,0.18)"),background:a?"linear-gradient(135deg,#a8d0a8,#5a7a5a)":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"8px",color:a?"#fff":"#b0a090",fontFamily:"inherit",transition:"all 0.17s"}),
    statCard:(c)=>({background:c||"rgba(255,255,255,0.6)",borderRadius:"13px",padding:"13px 15px",border:"1px solid rgba(139,119,95,0.09)"}),
    statNum:{fontSize:"24px",fontWeight:"300",color:"#5a7a5a",lineHeight:1},
    statLbl:{fontSize:"9px",letterSpacing:"2px",textTransform:"uppercase",color:"#8b7763",marginTop:"3px"},
    toast:{position:"fixed",bottom:"98px",left:"50%",transform:"translateX(-50%)",background:"rgba(50,68,50,0.88)",color:"#fff",padding:"10px 22px",borderRadius:"18px",fontSize:"12px",letterSpacing:"0.5px",backdropFilter:"blur(8px)",zIndex:1000,whiteSpace:"nowrap"},
    nav:{position:"fixed",bottom:0,left:0,right:0,background:"rgba(250,248,243,0.96)",backdropFilter:"blur(12px)",borderTop:"1px solid rgba(139,119,95,0.1)",display:"flex",justifyContent:"center",padding:"6px 0 8px"},
  };

  const wPct=(log.water/WATER_GOAL)*100, stPct=((log.steps||0)/STEPS_GOAL)*100;
  const slPct=((log.sleep||0)/SLEEP_GOAL)*100, lPct=((log.learningTime||0)/LEARNING_GOAL)*100;
  const scoreLabel = score>=85?"glowing ✨":score>=65?"on track 🌿":score>=40?"building habits 🌸":"starting fresh 🌱";

  return (
    <div style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet"/>

      {/* HEADER */}
      <div style={S.header}>
        {/* user + sign out */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
          <div style={{fontSize:"11px",color:"#a89880",fontStyle:"italic"}}>
            {user.displayName || user.email?.split("@")[0]}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            {saving && <div style={{fontSize:"10px",color:"#a89880",fontStyle:"italic"}}>saving...</div>}
            <button onClick={()=>signOut(auth)} style={{background:"none",border:"1px solid rgba(139,119,95,0.2)",borderRadius:"10px",padding:"4px 10px",fontSize:"10px",color:"#a89880",cursor:"pointer",fontFamily:"inherit",letterSpacing:"1px"}}>sign out</button>
          </div>
        </div>
        <div style={S.dateLabel}>{new Date().toLocaleDateString("en-US",{weekday:"long",day:"numeric",month:"long"})}</div>
        <h1 style={S.title}>wellness</h1>
        <p style={S.subtitle}>your daily wellness ritual</p>

        <BlobCreature score={score} data={log}/>

        {/* score ring */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",margin:"10px auto 0"}}>
          <div style={{position:"relative",width:"72px",height:"72px"}}>
            <svg width="72" height="72" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(139,119,95,0.1)" strokeWidth="4"/>
              <circle cx="36" cy="36" r="30" fill="none" stroke="url(#sg)" strokeWidth="4" strokeLinecap="round"
                strokeDasharray={`${(score/100)*(2*Math.PI*30)} ${2*Math.PI*30}`}
                strokeDashoffset={(2*Math.PI*30)*0.25}
                style={{transition:"stroke-dasharray 1s cubic-bezier(.4,0,.2,1)"}}/>
              <defs><linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#8ab890"/><stop offset="100%" stopColor="#5a7a5a"/></linearGradient></defs>
            </svg>
            <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:"18px",fontWeight:"300",color:"#5a7a5a"}}>{score}</div>
          </div>
          <div style={{fontSize:"11px",color:"#8b7763",fontStyle:"italic",marginTop:"3px"}}>{scoreLabel}</div>
        </div>
      </div>

      {/* TABS */}
      <div style={{...S.tabs,marginTop:"16px"}}>
        {[["today","today"],["stats","summary"],["history","history"],["settings","settings"]].map(([id,lbl])=>(
          <button key={id} style={S.tab(activeTab===id)} onClick={()=>setActiveTab(id)}>{lbl}</button>
        ))}
      </div>

      {/* ── TODAY ── */}
      {activeTab==="today"&&<>
        {/* WATER */}
        <div style={S.section}>
          <div style={S.sTitle}><span>💧</span> water</div>
          <div style={{display:"flex",alignItems:"center",gap:"6px",flexWrap:"wrap"}}>
            {Array.from({length:8}).map((_,i)=>(
              <div key={i} style={S.glass(i<log.water,animWater&&i===log.water-1)} onClick={i<log.water?removeWater:addWater}/>
            ))}
            {log.water>8&&<span style={{fontSize:"11px",color:"#7bbcd4"}}>+{log.water-8}</span>}
          </div>
          <div style={S.bar}><div style={S.fill(wPct,"linear-gradient(90deg,#a8d4e6,#7bbcd4)")}/></div>
          <div style={S.hint}>{log.water}/{WATER_GOAL} glasses {log.water>=WATER_GOAL?"· goal reached ✓":`· ${WATER_GOAL-log.water} more`}</div>
          <div style={{display:"flex",gap:"8px",marginTop:"10px"}}>
            <button style={{...S.tog(false),borderColor:"#7bbcd4",color:"#7bbcd4"}} onClick={addWater}>+ add</button>
            <button style={S.tog(false)} onClick={removeWater}>− remove</button>
          </div>
        </div>

        {/* MOVEMENT */}
        <div style={S.section}>
          <div style={S.sTitle}><span>🌿</span> movement</div>
          <div style={S.iRow}>
            <span style={S.lbl}>steps</span>
            <input type="number" placeholder="0" value={log.steps||""} onChange={e=>update("steps",+e.target.value)} style={S.inp}/>
          </div>
          <div style={S.bar}><div style={S.fill(stPct)}/></div>
          <div style={S.hint}>{(log.steps||0).toLocaleString()} / {STEPS_GOAL.toLocaleString()}</div>
          <div style={{...S.iRow,marginTop:"14px"}}>
            <span style={S.lbl}>workout</span>
            <button style={S.tog(log.workout)} onClick={()=>update("workout",!log.workout)}>{log.workout?"done ✓":"not yet"}</button>
          </div>
          {log.workout&&<input type="text" placeholder="pilates, gym, high heels class, yoga, run, dance..." value={log.workoutType} onChange={e=>update("workoutType",e.target.value)} style={{...S.inp,marginTop:"8px",width:"100%",boxSizing:"border-box"}}/>}
        </div>

        {/* SWEETS */}
        <div style={S.section}>
          <div style={S.sTitle}><span>🍫</span> sweets</div>
          <div style={{display:"flex",gap:"8px"}}>
            {[0,1,2,3,4].map(n=>(
              <button key={n} onClick={()=>update("sweets",n)} style={{width:"36px",height:"36px",borderRadius:"50%",border:"1.5px solid "+(log.sweets===n?"#c4a882":"rgba(139,119,95,0.16)"),background:log.sweets===n?"rgba(196,168,130,0.16)":"transparent",cursor:"pointer",fontSize:"12px",color:log.sweets===n?"#8b6b3d":"#8b7763",fontFamily:"inherit"}}>{n===4?"4+":n}</button>
            ))}
          </div>
          <div style={S.hint}>{log.sweets===0?"no sweets — glowing from within 🌿":log.sweets===1?"one treat — balance is everything 🌸":log.sweets===2?"two treats — still cute 🍫":"sweet day — reset tomorrow ✨"}</div>
        </div>

        {/* SCREEN TIME */}
        <div style={S.section}>
          <div style={S.sTitle}><span>📱</span> screen time</div>
          <div style={S.iRow}>
            <span style={S.lbl}>total</span>
            <input type="number" placeholder="min" value={log.screenTime||""} onChange={e=>update("screenTime",+e.target.value)} style={{...S.inp,maxWidth:"88px"}}/>
            <span style={S.hint}>{fmt(log.screenTime)}</span>
          </div>
          <div style={S.iRow}>
            <span style={S.lbl}>social</span>
            <input type="number" placeholder="min" value={log.socialMedia||""} onChange={e=>update("socialMedia",+e.target.value)} style={{...S.inp,maxWidth:"88px"}}/>
            <span style={S.hint}>{fmt(log.socialMedia)}</span>
          </div>
          {log.screenTime>0&&log.socialMedia>0&&<>
            <div style={S.bar}><div style={S.fill((log.socialMedia/log.screenTime)*100,"linear-gradient(90deg,#d4a8b8,#c47a98)")}/></div>
            <div style={S.hint}>{Math.round((log.socialMedia/log.screenTime)*100)}% of screen time on social media</div>
          </>}
        </div>

        {/* LEARNING */}
        <div style={S.section}>
          <div style={S.sTitle}><span>📚</span> learning</div>
          <div style={S.iRow}>
            <span style={S.lbl}>time</span>
            <input type="number" placeholder="minutes" value={log.learningTime||""} onChange={e=>update("learningTime",+e.target.value)} style={{...S.inp,maxWidth:"88px"}}/>
            <span style={S.hint}>{fmt(log.learningTime)}</span>
          </div>
          <div style={S.bar}><div style={S.fill(lPct,"linear-gradient(90deg,#c4d4a8,#8ab890)")}/></div>
          <div style={S.hint}>{fmt(log.learningTime)} / {LEARNING_GOAL}min goal</div>
          <div style={{marginTop:"14px"}}>
            <div style={{fontSize:"11px",color:"#8b7763",marginBottom:"8px",fontStyle:"italic",display:"flex",justifyContent:"space-between"}}>
              <span>how productive was your learning?</span>
              <span style={{color:"#5a7a5a"}}>{!log.learningProductivity?"—":log.learningProductivity<=3?"distracted 🌀":log.learningProductivity<=6?"decent 🌸":log.learningProductivity<=8?"focused 🌿":"in the zone ✨"}</span>
            </div>
            <div style={{display:"flex",gap:"5px"}}>
              {[1,2,3,4,5,6,7,8,9,10].map(n=>(
                <button key={n} style={S.prodDot((log.learningProductivity||0)>=n)} onClick={()=>update("learningProductivity",(log.learningProductivity||0)===n?0:n)}>{(log.learningProductivity||0)>=n?"▪":""}</button>
              ))}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:"3px"}}>
              <span style={{fontSize:"9px",color:"#b5a898",letterSpacing:"1px"}}>distracted</span>
              <span style={{fontSize:"9px",color:"#b5a898",letterSpacing:"1px"}}>in the zone</span>
            </div>
          </div>
        </div>

        {/* SLEEP */}
        <div style={S.section}>
          <div style={S.sTitle}><span>🌙</span> sleep</div>
          <div style={S.iRow}>
            <span style={S.lbl}>hours</span>
            <input type="number" placeholder="0" step="0.5" value={log.sleep||""} onChange={e=>update("sleep",+e.target.value)} style={{...S.inp,maxWidth:"88px"}}/>
            <span style={S.hint}>{log.sleep}h</span>
          </div>
          <div style={S.bar}><div style={S.fill(slPct,"linear-gradient(90deg,#b8c4e8,#8a9ed4)")}/></div>
          <div style={S.hint}>{!log.sleep?"log your sleep 😴":log.sleep<6?"that's rough — rest more tonight 🌙":log.sleep<7?"almost there 🌸":log.sleep>=8?"beautifully rested ✨":"pretty good 🌿"}</div>
        </div>

        {/* SELF CARE */}
        <div style={S.section}>
          <div style={S.sTitle}><span>🌸</span> self care</div>
          <div style={S.scGrid}>
            {selfCareOptions.map(item=>(
              <div key={item} style={S.scItem(log.selfCare?.includes(item))} onClick={()=>toggleSelfCare(item)}>{item}</div>
            ))}
          </div>
        </div>

        {/* MOOD */}
        <div style={S.section}>
          <div style={S.sTitle}><span>💫</span> how do you feel?</div>
          <div style={S.moodGrid}>
            {moodOptions.map(m=>(
              <button key={m} style={S.moodItem(log.mood===m)} onClick={()=>update("mood",log.mood===m?"":m)}>{m}</button>
            ))}
          </div>
        </div>
      </>}

      {/* ── SUMMARY ── */}
      {activeTab==="stats"&&<>
        <div style={S.section}>
          <div style={S.sTitle}><span>✨</span> today at a glance</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"9px"}}>
            {[{label:"water",val:`${log.water} glasses`,c:"rgba(168,212,230,0.16)"},{label:"steps",val:(log.steps||0).toLocaleString(),c:"rgba(138,184,144,0.16)"},{label:"sleep",val:`${log.sleep}h`,c:"rgba(184,196,232,0.16)"},{label:"learning",val:fmt(log.learningTime),c:"rgba(196,218,168,0.16)"},{label:"social media",val:fmt(log.socialMedia),c:"rgba(212,168,184,0.16)"},{label:"self care",val:`${log.selfCare?.length||0} rituals`,c:"rgba(232,218,196,0.16)"}].map(({label,val,c})=>(
              <div key={label} style={S.statCard(c)}><div style={S.statNum}>{val}</div><div style={S.statLbl}>{label}</div></div>
            ))}
          </div>
          {log.learningTime>0&&<div style={{marginTop:"14px",padding:"12px 14px",background:"rgba(196,218,168,0.11)",borderRadius:"12px"}}>
            <div style={{fontSize:"9px",color:"#6a8a5a",letterSpacing:"2px",textTransform:"uppercase",marginBottom:"7px"}}>learning quality</div>
            <div style={{display:"flex",gap:"4px"}}>{[1,2,3,4,5,6,7,8,9,10].map(n=><div key={n} style={{flex:1,height:"7px",borderRadius:"2px",background:(log.learningProductivity||0)>=n?"#8ab890":"rgba(139,119,95,0.09)",transition:"background 0.3s"}}/>)}</div>
            <div style={S.hint}>{fmt(log.learningTime)} · productivity {log.learningProductivity}/10</div>
          </div>}
          {log.workout&&<div style={{marginTop:"9px",padding:"10px 13px",background:"rgba(138,184,144,0.09)",borderRadius:"11px",fontSize:"13px",color:"#5a7a5a",fontStyle:"italic"}}>workout: {log.workoutType||"done"} ✓</div>}
          {log.mood&&<div style={{marginTop:"10px",textAlign:"center",fontSize:"15px",color:"#8b7763",fontStyle:"italic"}}>feeling {log.mood} today</div>}
          {log.selfCare?.length>0&&<div style={{marginTop:"11px",display:"flex",flexWrap:"wrap",gap:"5px"}}>{log.selfCare.map(s=><span key={s} style={{padding:"3px 10px",borderRadius:"10px",background:"rgba(138,184,144,0.11)",border:"1px solid rgba(90,122,90,0.15)",fontSize:"11px",color:"#4a6e4a"}}>{s}</span>)}</div>}
        </div>
        <div style={S.section}>
          <div style={S.sTitle}><span>⭐</span> wellness score</div>
          <div style={{textAlign:"center",marginBottom:"16px"}}>
            <div style={{fontSize:"54px",fontWeight:"300",color:"#5a7a5a",lineHeight:1}}>{score}</div>
            <div style={{fontSize:"13px",color:"#8b7763",fontStyle:"italic",marginTop:"4px"}}>{scoreLabel}</div>
            <div style={{...S.bar,marginTop:"14px"}}><div style={S.fill(score)}/></div>
          </div>
          {/* score breakdown */}
          {(()=>{
            const w=weights, totalW=w.water+w.steps+w.workout+w.sleep+w.learning+w.selfCare+w.sweets+w.screenTime;
            const rows=[
              {label:"water 💧",    pts:Math.round((log.water>=WATER_GOAL?1:log.water/WATER_GOAL)*w.water/totalW*100)},
              {label:"steps 🌿",    pts:Math.round(((log.steps||0)>=STEPS_GOAL?1:(log.steps||0)/STEPS_GOAL)*w.steps/totalW*100)},
              {label:"workout 💪",  pts:Math.round((log.workout?1:0)*w.workout/totalW*100)},
              {label:"sleep 🌙",    pts:Math.round(((log.sleep||0)>=SLEEP_GOAL?1:(log.sleep||0)>0?(log.sleep||0)/SLEEP_GOAL:0)*w.sleep/totalW*100)},
              {label:"learning 📚", pts:Math.round(Math.min((log.learningTime||0)/LEARNING_GOAL,1)*(0.4+((log.learningProductivity||0)/10)*0.6)*w.learning/totalW*100)},
              {label:"self care 🌸",pts:Math.round(Math.min((log.selfCare?.length||0)/3,1)*w.selfCare/totalW*100)},
            ];
            return rows.map(({label,pts})=>(
              <div key={label} style={{marginBottom:"8px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"3px"}}>
                  <span style={{fontSize:"12px",color:"#5c4f42",fontStyle:"italic"}}>{label}</span>
                  <span style={{fontSize:"12px",color:"#8ab890"}}>+{pts} pts</span>
                </div>
                <div style={{height:"4px",borderRadius:"2px",background:"rgba(139,119,95,0.09)",overflow:"hidden"}}>
                  <div style={{height:"100%",width:pts+"%",background:"linear-gradient(90deg,#c4d4a8,#8ab890)",borderRadius:"2px",transition:"width 0.5s"}}/>
                </div>
              </div>
            ));
          })()}
        </div>
      </>}

      {/* ── HISTORY ── */}
      {activeTab==="history"&&(
        <div style={S.section}>
          <div style={S.sTitle}><span>📓</span> past days</div>
          {history.length===0?(
            <div style={{textAlign:"center",padding:"28px",color:"#8b7763",fontStyle:"italic",fontSize:"14px"}}>your journey starts today 🌱<br/><span style={{fontSize:"12px"}}>previous days will appear here</span></div>
          ):(
            history.map((day,i)=>{
              let s=0;
              s+=day.water>=8?20:Math.round(((day.water||0)/8)*20);
              s+=(day.steps||0)>=10000?20:Math.round(((day.steps||0)/10000)*20);
              if(day.workout)s+=12;
              s+=(day.sleep||0)>=8?15:((day.sleep||0)>0?Math.round(((day.sleep||0)/8)*15):0);
              s+=day.selfCare?.length>0?Math.min(day.selfCare.length*3,12):0;
              return(
                <div key={i} style={{borderBottom:"1px solid rgba(139,119,95,0.08)",paddingBottom:"10px",marginBottom:"10px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:"13px",color:"#5c4f42"}}>{new Date(day.id+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</div>
                      <div style={{fontSize:"11px",color:"#8b7763",fontStyle:"italic",marginTop:"2px"}}>{day.water}💧 · {(day.steps||0).toLocaleString()}🌿 · {day.sleep}h😴{day.mood?` · ${day.mood}`:""}{day.workoutType?` · ${day.workoutType}`:""}</div>
                    </div>
                    <div style={{fontSize:"22px",fontWeight:"300",color:s>=65?"#5a7a5a":"#c4a882"}}>{s}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── SETTINGS ── */}
      {activeTab==="settings"&&<>
        <div style={S.section}>
          <div style={S.sTitle}><span>👤</span> your account</div>
          <div style={{fontSize:"13px",color:"#5c4f42",marginBottom:"4px"}}>{user.displayName||"—"}</div>
          <div style={{fontSize:"12px",color:"#8b7763",fontStyle:"italic",marginBottom:"16px"}}>{user.email}</div>
          <button onClick={()=>signOut(auth)} style={{...S.tog(false),padding:"9px 22px"}}>sign out</button>
        </div>

        <div style={S.section}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
            <div style={{fontSize:"9px",letterSpacing:"3px",textTransform:"uppercase",color:"#8b7763",display:"flex",alignItems:"center",gap:"7px"}}><span>⚙️</span> score weights</div>
            <button style={{...S.tog(showWeights),padding:"5px 14px",fontSize:"11px"}} onClick={()=>setShowWeights(p=>!p)}>{showWeights?"hide":"edit"}</button>
          </div>
          {!showWeights&&<div style={{fontSize:"12px",color:"#8b7763",fontStyle:"italic",lineHeight:"1.6"}}>Customise how much each habit counts towards your score. Tap "edit" to adjust.</div>}
          {showWeights&&<>
            <div style={{fontSize:"11px",color:"#8b7763",fontStyle:"italic",marginBottom:"16px",lineHeight:"1.6",padding:"8px 10px",background:"rgba(138,184,144,0.07)",borderRadius:"10px"}}>Click dots to set importance 1–10. Higher = counts more towards your score.</div>
            {[
              {key:"sleep",label:"sleep",emoji:"🌙"},
              {key:"water",label:"water",emoji:"💧"},
              {key:"steps",label:"steps",emoji:"🌿"},
              {key:"workout",label:"workout",emoji:"💪"},
              {key:"learning",label:"learning",emoji:"📚"},
              {key:"selfCare",label:"self care",emoji:"🌸"},
              {key:"sweets",label:"less sweets",emoji:"🍫"},
              {key:"screenTime",label:"less screen time",emoji:"📱"},
            ].map(({key,label,emoji})=>{
              const v=weights[key];
              const color=v>=8?"#8ab890":v>=5?"#c4a882":"#b8b0a8";
              return(
                <div key={key} style={{marginBottom:"14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
                    <span style={{fontSize:"13px",color:"#5c4f42",fontStyle:"italic"}}>{emoji} {label}</span>
                    <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                      <span style={{fontSize:"14px",fontWeight:"300",color,minWidth:"14px",textAlign:"right"}}>{v}</span>
                      <div style={{display:"flex",gap:"4px"}}>
                        {Array.from({length:10}).map((_,i)=>(
                          <div key={i} onClick={()=>setWeights(prev=>({...prev,[key]:i+1}))}
                            style={{width:"11px",height:"11px",borderRadius:"50%",background:i<v?color:"rgba(139,119,95,0.12)",cursor:"pointer",transition:"background 0.15s",border:i<v?"none":"1px solid rgba(139,119,95,0.18)"}}/>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <button onClick={()=>setWeights({...defaultWeights})} style={{...S.tog(false),width:"100%",padding:"8px",fontSize:"11px",letterSpacing:"1px"}}>reset to defaults</button>
          </>}
        </div>

        <div style={S.section}>
          <div style={S.sTitle}><span>🔔</span> notifications</div>
          {notifPermission==="unsupported"&&<div style={{fontSize:"13px",color:"#a89880",fontStyle:"italic"}}>Not supported in this browser. Try Safari (iPhone) or Chrome (Android).</div>}
          {notifPermission==="denied"&&<div style={{fontSize:"13px",color:"#c47a98",fontStyle:"italic"}}>Notifications are blocked. Enable them in your device settings.</div>}
          {notifPermission!=="unsupported"&&notifPermission!=="denied"&&<>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"16px"}}>
              <div>
                <div style={{fontSize:"13px",color:"#5c4f42"}}>Enable reminders</div>
                <div style={{fontSize:"11px",color:"#8b7763",fontStyle:"italic"}}>{notifPermission==="granted"?"permission granted ✓":"will ask for permission"}</div>
              </div>
              <button style={S.tog(notifSettings.enabled)} onClick={async()=>{
                if(!notifSettings.enabled){
                  const ok=await requestNotifPermission();
                  setNotifPermission(getPermissionStatus());
                  if(ok){setNotifSettings(prev=>({...prev,enabled:true}));sendTestNotification();showToast("🔔 Notifications enabled!");}
                  else showToast("Permission denied — check settings.");
                } else setNotifSettings(prev=>({...prev,enabled:false}));
              }}>{notifSettings.enabled?"on ✓":"off"}</button>
            </div>
            {notifSettings.enabled&&<div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              {[{key:"morning",label:"Morning wake-up",emoji:"🌅"},{key:"water",label:"Water reminder",emoji:"💧"},{key:"lunch",label:"Midday check-in",emoji:"🌿"},{key:"workout",label:"Workout nudge",emoji:"💪"},{key:"evening",label:"Evening ritual",emoji:"🌸"},{key:"night",label:"Bedtime log",emoji:"🌙"}].map(({key,label,emoji})=>{
                const n=notifSettings[key];
                if(!n)return null;
                return(
                  <div key={key} style={{padding:"11px 13px",borderRadius:"12px",background:n.enabled?"rgba(138,184,144,0.08)":"rgba(255,255,255,0.4)",border:"1.5px solid "+(n.enabled?"rgba(138,184,144,0.3)":"rgba(139,119,95,0.12)")}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:n.enabled?"9px":"0"}}>
                      <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                        <span style={{fontSize:"15px"}}>{emoji}</span>
                        <span style={{fontSize:"13px",color:"#5c4f42"}}>{label}</span>
                      </div>
                      <button style={{...S.tog(n.enabled),padding:"5px 14px",fontSize:"11px"}} onClick={()=>setNotifSettings(prev=>({...prev,[key]:{...prev[key],enabled:!prev[key].enabled}}))}>{n.enabled?"on":"off"}</button>
                    </div>
                    {n.enabled&&<div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                      <input type="time" value={n.time} onChange={e=>setNotifSettings(prev=>({...prev,[key]:{...prev[key],time:e.target.value}}))} style={{...S.inp,maxWidth:"110px",fontSize:"13px"}}/>
                      <span style={{fontSize:"11px",color:"#8b7763",fontStyle:"italic",flex:1}}>{n.message}</span>
                    </div>}
                  </div>
                );
              })}
              <button style={{...S.tog(false),alignSelf:"center",padding:"9px 22px",marginTop:"4px"}} onClick={()=>{sendTestNotification();showToast("🔔 Test notification sent!");}}>send test notification</button>
            </div>}
          </>}
        </div>

        <div style={S.section}>
          <div style={S.sTitle}><span>📱</span> install as app</div>
          <div style={{fontSize:"13px",color:"#5c4f42",lineHeight:"1.8"}}>
            <div style={{marginBottom:"10px",fontStyle:"italic",color:"#8b7763"}}>Add to your home screen:</div>
            <div style={{marginBottom:"8px"}}><strong>iPhone / iPad</strong><br/>Open in Safari → Share icon → <em>Add to Home Screen</em></div>
            <div><strong>Android</strong><br/>Open in Chrome → ⋮ menu → <em>Add to Home Screen</em></div>
          </div>
        </div>
      </>}

      {toast&&<div style={S.toast}>{toast}</div>}

      <div style={S.nav}>
        {[["today","🌿","today"],["stats","✨","summary"],["history","📓","history"],["settings","⚙️","settings"]].map(([id,icon,lbl])=>(
          <button key={id} onClick={()=>setActiveTab(id)} style={{background:"none",border:"none",cursor:"pointer",padding:"5px 20px",display:"flex",flexDirection:"column",alignItems:"center",gap:"2px",fontFamily:"inherit"}}>
            <span style={{fontSize:"17px"}}>{icon}</span>
            <span style={{fontSize:"8px",letterSpacing:"1.5px",textTransform:"uppercase",color:activeTab===id?"#5a7a5a":"#a89880"}}>{lbl}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
