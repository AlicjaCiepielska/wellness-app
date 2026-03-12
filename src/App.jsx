import { useState, useRef, useEffect, useCallback } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { loadTodayLog, saveTodayLog, loadProfile, saveProfile } from "./db";
import AuthScreen from "./AuthScreen";
import {
  defaultNotifSettings,
  requestNotifPermission,
  getPermissionStatus,
  scheduleNotifications,
  sendTestNotification,
} from "./useNotifications";

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
const ALL_HABITS = [
  { id:"water",      label:"water",       emoji:"💧", desc:"daily hydration",      unit:"glasses" },
  { id:"steps",      label:"steps",       emoji:"🌿", desc:"movement & walking",   unit:"steps"   },
  { id:"workout",    label:"workout",     emoji:"💪", desc:"exercise sessions",    unit:null      },
  { id:"running",    label:"running",     emoji:"🏃", desc:"track your runs",      unit:"km"      },
  { id:"sleep",      label:"sleep",       emoji:"🌙", desc:"rest & recovery",      unit:"hours"   },
  { id:"learning",   label:"learning",    emoji:"📚", desc:"study & courses",      unit:"min"     },
  { id:"reading",    label:"reading",     emoji:"📖", desc:"books & articles",     unit:"pages"   },
  { id:"sweets",     label:"sweets",      emoji:"🍫", desc:"track sugar intake",   unit:"clean days" },
  { id:"food",       label:"food quality",emoji:"🥗", desc:"how well did you eat?",unit:"/5"      },
  { id:"screenTime", label:"screen time", emoji:"📱", desc:"digital wellness",     unit:"min"     },
  { id:"selfCare",   label:"self care",   emoji:"🌸", desc:"rituals & routines",   unit:"rituals" },
  { id:"mood",       label:"mood",        emoji:"💫", desc:"emotional check-in",   unit:null      },
];

const ALL_SELFCARE = [
  "skincare 🧴","journaling 📓","running 🏃","meditation 🧘","stretching 🤸",
  "walk outside 🌿","cooking healthy 🥗","nails 💅","tidying up 🧹","friends 👯",
  "creative hobby 🎨","morning routine 🌞","self massage 💆","bath 🛁",
  "reading 📖","yoga 🌙","cold shower 🚿","gratitude 🙏",
];

const MOOD_OPTIONS = ["✨ glowing","💪 strong","🔥 motivated","🌙 calm","😴 tired","😔 sad","😤 stressed"];
const RUN_FEEL     = ["😩 tough","😐 okay","🙂 good","😊 great","🔥 amazing"];
const DEFAULT_GOALS   = { water:8, steps:10000, sleep:8, learning:60, reading:20, screenTime:120, running:5 };
const DEFAULT_WEIGHTS = { water:7, steps:6, workout:7, running:6, sleep:9, learning:6, reading:5, sweets:5, food:5, screenTime:4, selfCare:6 };
const EMPTY_LOG = {
  water:0, steps:0, sweets:null, foodQuality:null,
  workout:false, workoutTypes:[],
  screenTime:0, socialMedia:0,
  learningTime:0, learningProductivity:5,
  sleep:0, selfCare:[], mood:"",
  readingPages:0, runKm:0, runDuration:"", runFeel:"",
};

// ─────────────────────────────────────────────────────────────
// SCORE — starts at 0, only logged habits contribute
// ─────────────────────────────────────────────────────────────
function calcScore(log, habits, goals, weights) {
  // totalW = ALL active scorable habits (full denominator always)
  // earned = only from habits actually logged today
  // This way: logging only water gives partial score, not 100%
  const scorable = habits.filter(h => h !== "mood");
  if (!scorable.length) return 0;
  const totalW = scorable.reduce((sum, id) => sum + (weights[id] ?? 5), 0);
  if (totalW === 0) return 0;

  let earned = 0;
  const add = (id, ratio) => { earned += Math.max(0, Math.min(1, ratio)) * (weights[id] ?? 5); };

  if (habits.includes("water")      && log.water > 0)            add("water",      log.water / (goals.water||8));
  if (habits.includes("steps")      && log.steps > 0)            add("steps",      log.steps / (goals.steps||10000));
  if (habits.includes("workout")    && log.workout)              add("workout",    1);
  if (habits.includes("running")    && log.runKm > 0)            add("running",    log.runKm / (goals.running||5));
  if (habits.includes("sleep")      && log.sleep > 0)            add("sleep",      log.sleep / (goals.sleep||8));
  if (habits.includes("learning")   && log.learningTime > 0)     add("learning",   (log.learningTime/(goals.learning||60)) * (0.5+((log.learningProductivity||5)/10)*0.5));
  if (habits.includes("reading")    && log.readingPages > 0)     add("reading",    log.readingPages / (goals.reading||20));
  if (habits.includes("sweets")     && log.sweets !== null)      add("sweets",     Math.max(0, 1 - log.sweets/4));
  if (habits.includes("food")       && log.foodQuality !== null) add("food",       1 - (log.foodQuality-1)/4);
  if (habits.includes("screenTime") && log.screenTime > 0) {
    const s = log.socialMedia || 0;
    add("screenTime", s <= 60 ? 1 : Math.max(0, 1-(s-60)/120));
  }
  if (habits.includes("selfCare") && log.selfCare?.length > 0)   add("selfCare",   Math.min(log.selfCare.length/3, 1));

  return Math.min(Math.round((earned / totalW) * 100), 100);
}

// Value for goal auto-tracking
// Returns today's numeric value for a given habit (for goal tracking)
function habitValue(log, id) {
  switch (id) {
    case "water":      return log.water || 0;
    case "steps":      return log.steps || 0;
    case "workout":    return log.workout ? 1 : 0;
    case "running":    return log.runKm || 0;
    case "sleep":      return log.sleep || 0;
    case "learning":   return log.learningTime || 0;
    case "reading":    return log.readingPages || 0;
    case "screenTime": return log.screenTime || 0;
    case "selfCare":   return log.selfCare?.length || 0;
    case "sweets":     return log.sweets === 0 ? 1 : 0;
    default:           return 0;
  }
}

// For streak goals: did today meet the daily threshold?
function meetsThreshold(log, id, threshold) {
  const def = HABIT_GOAL_DEFAULTS[id];
  if (!def) return false;
  if (id === "sweets") return log.sweets === 0; // clean day = logged 0
  if (id === "screenTime") {
    return log.screenTime > 0 && log.screenTime <= (threshold ?? 120);
  }
  if (def.direction === "max") return habitValue(log, id) <= (threshold ?? def.streakDefault);
  return habitValue(log, id) >= (threshold ?? def.streakDefault);
}

// Per-habit goal config
// direction: "min" = need at least N (water, steps, sleep...)
//            "max" = need at most N (screenTime, sweets)
const HABIT_GOAL_DEFAULTS = {
  water:      { direction:"min", cumUnit:"glasses",  streakLabel:"min glasses/day", streakDefault:6,    cumDefault:42,    streakHint:"at least {n} glasses" },
  steps:      { direction:"min", cumUnit:"steps",    streakLabel:"min steps/day",   streakDefault:8000, cumDefault:50000, streakHint:"at least {n} steps"   },
  workout:    { direction:"min", cumUnit:"sessions", streakLabel:"sessions/period", streakDefault:1,    cumDefault:12,    streakHint:"at least 1 workout"   },
  running:    { direction:"min", cumUnit:"km",       streakLabel:"min km/run",      streakDefault:3,    cumDefault:30,    streakHint:"at least {n} km"      },
  sleep:      { direction:"min", cumUnit:"hours",    streakLabel:"min hours/night", streakDefault:7,    cumDefault:49,    streakHint:"at least {n} hours"   },
  learning:   { direction:"min", cumUnit:"min",      streakLabel:"min min/day",     streakDefault:30,   cumDefault:300,   streakHint:"at least {n} min"     },
  reading:    { direction:"min", cumUnit:"pages",    streakLabel:"min pages/day",   streakDefault:10,   cumDefault:100,   streakHint:"at least {n} pages"   },
  selfCare:   { direction:"min", cumUnit:"rituals",  streakLabel:"rituals/day",     streakDefault:1,    cumDefault:20,    streakHint:"at least {n} ritual"  },
  screenTime: { direction:"max", cumUnit:"min",      streakLabel:"max min/day",     streakDefault:120,  cumDefault:600,   streakHint:"max {n} min/day"      },
  sweets:     { direction:"max", cumUnit:"clean days",streakLabel:"clean days",     streakDefault:0,    cumDefault:7,     streakHint:"sugar-free days"      },
};

// ─────────────────────────────────────────────────────────────
// BLOB
// ─────────────────────────────────────────────────────────────
function Blob({ score }) {
  const [bounce, setBounce] = useState(false);
  const prev = useRef(score);
  useEffect(() => {
    if (score !== prev.current) { setBounce(true); setTimeout(() => setBounce(false), 700); prev.current = score; }
  }, [score]);

  const cfg =
    score >= 75 ? { body:"#e8d5a0", stroke:"#c4a860", aura:"rgba(255,215,100,0.32)", face:"glowing" } :
    score >= 55 ? { body:"#c8e0c0", stroke:"#6a9e70", aura:"rgba(140,200,150,0.28)", face:"happy"   } :
    score >= 30 ? { body:"#d8e8d0", stroke:"#8ab890", aura:"rgba(160,210,165,0.2)",  face:"gentle"  } :
    score >= 10 ? { body:"#e8e0d0", stroke:"#b8a888", aura:"rgba(200,190,170,0.16)", face:"neutral" } :
                  { body:"#e8e0d4", stroke:"#b8a888", aura:"rgba(200,185,170,0.12)", face:"blank"   };
  const { body, stroke, aura, face } = cfg;

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"4px 0 0" }}>
      <style>{`
        @keyframes bf{0%,100%{transform:translateY(0)}45%{transform:translateY(-8px)}75%{transform:translateY(-3px)}}
        @keyframes bi{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
        @keyframes bb{0%{transform:scale(1)}35%{transform:scale(1.12,.88)}65%{transform:scale(.94,1.06)}100%{transform:scale(1)}}
        @keyframes ap{0%,100%{transform:scale(1);opacity:.68}50%{transform:scale(1.06);opacity:1}}
      `}</style>
      <div style={{ position:"relative", width:108, height:108, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ position:"absolute", width:98, height:98, borderRadius:"50%", background:`radial-gradient(circle,${aura} 0%,transparent 72%)`, animation:"ap 3.2s ease-in-out infinite" }}/>
        <div style={{ animation: bounce?"bb .65s ease":score>=55?"bf 3s ease-in-out infinite":"bi 4s ease-in-out infinite" }}>
          <svg width="70" height="70" viewBox="0 0 84 84">
            <defs><radialGradient id="bg" cx="36%" cy="30%" r="65%"><stop offset="0%" stopColor="white" stopOpacity="0.5"/><stop offset="100%" stopColor={body}/></radialGradient></defs>
            <path d="M42 12 C58 10,72 22,73 41 C74 60,61 73,43 75 C25 77,10 64,10 46 C10 28,24 14,42 12Z" fill="url(#bg)" stroke={stroke} strokeWidth="1.5"/>
            {face==="glowing"&&<><text x="30" y="46" fontSize="12" textAnchor="middle" fill={stroke}>✦</text><text x="54" y="46" fontSize="12" textAnchor="middle" fill={stroke}>✦</text><ellipse cx="20" cy="50" rx="7" ry="3.5" fill="rgba(230,155,165,.22)"/><ellipse cx="64" cy="50" rx="7" ry="3.5" fill="rgba(230,155,165,.22)"/><path d="M30 58 Q42 67 54 58" stroke={stroke} strokeWidth="2.2" fill="none" strokeLinecap="round"/></>}
            {face==="happy"&&<><ellipse cx="30" cy="40" rx="4.5" ry="4.5" fill={stroke}/><ellipse cx="28.8" cy="38.2" rx="1.6" ry="1.6" fill="white" opacity=".7"/><ellipse cx="54" cy="40" rx="4.5" ry="4.5" fill={stroke}/><ellipse cx="52.8" cy="38.2" rx="1.6" ry="1.6" fill="white" opacity=".7"/><ellipse cx="21" cy="50" rx="6" ry="3.2" fill="rgba(230,155,165,.2)"/><ellipse cx="63" cy="50" rx="6" ry="3.2" fill="rgba(230,155,165,.2)"/><path d="M31 57 Q42 65 53 57" stroke={stroke} strokeWidth="2" fill="none" strokeLinecap="round"/></>}
            {face==="gentle"&&<><ellipse cx="30" cy="40" rx="4" ry="4" fill={stroke}/><ellipse cx="29" cy="38.5" rx="1.4" ry="1.4" fill="white" opacity=".65"/><ellipse cx="54" cy="40" rx="4" ry="4" fill={stroke}/><ellipse cx="53" cy="38.5" rx="1.4" ry="1.4" fill="white" opacity=".65"/><path d="M32 57 Q42 63 52 57" stroke={stroke} strokeWidth="1.8" fill="none" strokeLinecap="round"/></>}
            {face==="neutral"&&<><ellipse cx="30" cy="40" rx="3.8" ry="3.8" fill={stroke} opacity=".85"/><ellipse cx="29" cy="38.8" rx="1.3" ry="1.3" fill="white" opacity=".6"/><ellipse cx="54" cy="40" rx="3.8" ry="3.8" fill={stroke} opacity=".85"/><ellipse cx="53" cy="38.8" rx="1.3" ry="1.3" fill="white" opacity=".6"/><path d="M33 56 Q42 59 51 56" stroke={stroke} strokeWidth="1.4" fill="none" strokeLinecap="round"/></>}
            {face==="blank"&&<><ellipse cx="30" cy="41" rx="3.5" ry="3.5" fill={stroke} opacity=".75"/><ellipse cx="29.2" cy="39.8" rx="1.2" ry="1.2" fill="white" opacity=".55"/><ellipse cx="54" cy="41" rx="3.5" ry="3.5" fill={stroke} opacity=".75"/><ellipse cx="53.2" cy="39.8" rx="1.2" ry="1.2" fill="white" opacity=".55"/><path d="M34 57 Q42 57 50 57" stroke={stroke} strokeWidth="1.4" fill="none" strokeLinecap="round"/></>}
          </svg>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WEIGHT DOTS (1–10 tap)
// ─────────────────────────────────────────────────────────────
function WeightDots({ value, onChange }) {
  return (
    <div style={{ display:"flex", gap:5, alignItems:"center" }}>
      {Array.from({ length:10 }, (_,i) => i+1).map(n => (
        <div key={n} onClick={() => onChange(n)} style={{
          width:8, height:8, borderRadius:"50%", cursor:"pointer", transition:"all .15s",
          background: n <= value ? `hsl(${125+n*3},${38+n*3}%,${56-n}%)` : "rgba(139,119,95,.12)",
          transform: n === value ? "scale(1.5)" : "scale(1)",
          boxShadow: n === value ? "0 0 0 2px rgba(90,122,90,.18)" : "none",
        }}/>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// GOAL MODAL
// ─────────────────────────────────────────────────────────────
// GoalModal — supports two goal types:
// "cumulative": total over period (e.g. run 100km this month)
// "streak": hit a daily target N days in the period (e.g. drink 8 glasses every day for 7 days)
function GoalModal({ habits, onSave, onClose, initial }) {
  const [name,      setName]      = useState(initial?.name       || "");
  const [goalType,  setGoalType]  = useState(initial?.goalType   || "cumulative");
  const [target,    setTarget]    = useState(initial?.target?.toString() || "");
  const [threshold, setThreshold] = useState(initial?.threshold?.toString() || ""); // streak: daily minimum
  const [unit,      setUnit]      = useState(initial?.unit       || "");
  const [period,    setPeriod]    = useState(initial?.period     || "weekly");
  const [linked,    setLinked]    = useState(initial?.linkedHabit || "");

  const linkable = habits.filter(h => !["mood","food"].includes(h));

  const pick = (id) => {
    setLinked(id);
    if (!id) return;
    const def = HABIT_GOAL_DEFAULTS[id];
    if (!def) return;
    if (goalType === "streak") {
      setUnit("days");
      setThreshold(def.streakDefault.toString());
      if (!target) setTarget(period === "weekly" ? "7" : "30");
    } else {
      setUnit(def.cumUnit);
      if (!target) setTarget(def.cumDefault.toString());
    }
  };

  const switchType = (type) => {
    setGoalType(type);
    if (linked) {
      const def = HABIT_GOAL_DEFAULTS[linked];
      if (!def) return;
      if (type === "streak") {
        setUnit("days");
        setThreshold(def.streakDefault.toString());
        setTarget(period === "weekly" ? "7" : "30");
      } else {
        setUnit(def.cumUnit);
        setThreshold("");
      }
    }
  };

  const submit = () => {
    if (!name.trim() || !target || isNaN(+target) || +target <= 0) return;
    if (goalType === "streak" && linked && (!threshold || isNaN(+threshold))) return;
    onSave({
      id: initial?.id || Date.now(),
      name: name.trim(),
      goalType,
      target: +target,
      threshold: goalType === "streak" ? +threshold : null,
      unit: unit.trim(),
      period,
      linkedHabit: linked,
      accumulatedProgress: initial?.accumulatedProgress || 0,
      streakDays: initial?.streakDays || 0, // days already counted
    });
    onClose();
  };

  const inp = { width:"100%", padding:"10px 13px", borderRadius:11, border:"1.5px solid rgba(139,119,95,.2)", background:"rgba(255,255,255,.8)", fontFamily:"inherit", fontSize:14, color:"#3d3530", outline:"none", boxSizing:"border-box" };
  const typeBtn = (t, label, desc) => (
    <button onClick={() => switchType(t)} style={{ flex:1, padding:"10px 8px", borderRadius:12, border:"1.5px solid "+(goalType===t?"#8ab890":"rgba(139,119,95,.16)"), background:goalType===t?"rgba(138,184,144,.1)":"transparent", cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}>
      <div style={{ fontSize:12, color:goalType===t?"#4a6e4a":"#5c4f42", marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:10, color:"#8b7763", fontStyle:"italic", lineHeight:1.3 }}>{desc}</div>
    </button>
  );

  const maxDays = period === "weekly" ? 7 : 31;

  return (
    <div onClick={e => { if(e.target===e.currentTarget) onClose(); }} style={{ position:"fixed", inset:0, background:"rgba(60,50,40,.35)", zIndex:200, display:"flex", alignItems:"flex-end", backdropFilter:"blur(4px)" }}>
      <div style={{ width:"100%", maxHeight:"92vh", overflowY:"auto", background:"#faf8f3", borderRadius:"22px 22px 0 0", padding:"28px 22px 44px", boxShadow:"0 -8px 32px rgba(139,119,95,.18)" }}>
        <div style={{ width:36, height:3, background:"rgba(139,119,95,.2)", borderRadius:2, margin:"0 auto 22px" }}/>
        <h3 style={{ fontSize:18, fontWeight:300, color:"#3d3530", marginBottom:18 }}>{initial?"edit goal":"new goal"}</h3>

        {/* Goal type */}
        <label style={{ fontSize:11, letterSpacing:"2px", textTransform:"uppercase", color:"#8b7763", display:"block", marginBottom:8 }}>type</label>
        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          {typeBtn("cumulative","📈 cumulative","total over the period — e.g. run 50 km this month")}
          {typeBtn("streak","🔥 daily streak","hit a daily target N days — e.g. drink 8 glasses every day")}
        </div>

        {/* Name */}
        <label style={{ fontSize:11, letterSpacing:"2px", textTransform:"uppercase", color:"#8b7763", display:"block", marginBottom:6 }}>goal name</label>
        <input value={name} onChange={e=>setName(e.target.value)}
          placeholder={goalType==="streak" ? "e.g. drink water every day" : "e.g. run 50 km this month"}
          style={{ ...inp, marginBottom:13 }}/>

        {/* Period */}
        <label style={{ fontSize:11, letterSpacing:"2px", textTransform:"uppercase", color:"#8b7763", display:"block", marginBottom:6 }}>period</label>
        <div style={{ display:"flex", gap:8, marginBottom:13 }}>
          {["weekly","monthly"].map(p => (
            <button key={p} onClick={()=>{ setPeriod(p); if(goalType==="streak"&&linked&&!target) setTarget(p==="weekly"?"7":"30"); }}
              style={{ flex:1, padding:9, borderRadius:11, border:"1.5px solid "+(period===p?"#8ab890":"rgba(139,119,95,.18)"), background:period===p?"rgba(138,184,144,.1)":"transparent", color:period===p?"#4a6e4a":"#8b7763", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
              {p}
            </button>
          ))}
        </div>

        {/* Target fields */}
        {goalType === "cumulative" ? (
          <div style={{ display:"flex", gap:10, marginBottom:13 }}>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:11, letterSpacing:"2px", textTransform:"uppercase", color:"#8b7763", display:"block", marginBottom:6 }}>total target</label>
              <input type="number" value={target} onChange={e=>setTarget(e.target.value)} placeholder="100" style={inp}/>
            </div>
            <div style={{ flex:1 }}>
              <label style={{ fontSize:11, letterSpacing:"2px", textTransform:"uppercase", color:"#8b7763", display:"block", marginBottom:6 }}>unit</label>
              <input value={unit} onChange={e=>setUnit(e.target.value)} placeholder="km, pages..." style={inp}/>
            </div>
          </div>
        ) : (
          <>
            <div style={{ background:"rgba(138,184,144,.07)", borderRadius:11, padding:"10px 13px", marginBottom:13, fontSize:12, color:"#5a7a5a", fontStyle:"italic", lineHeight:1.5 }}>
              {linked ? (() => {
                const def = HABIT_GOAL_DEFAULTS[linked];
                if (!def) return `hit daily target on ${target||"?"} days`;
                const dir = def.direction === "max" ? "max" : "min";
                const thr = threshold || def.streakDefault;
                return `${dir} ${thr} ${def.cumUnit}/day · on ${target||"?"} out of ${maxDays} days`;
              })() : `hit your daily target on ${target||"?"} out of ${maxDays} days`}
            </div>
            <div style={{ display:"flex", gap:10, marginBottom:13 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, letterSpacing:"2px", textTransform:"uppercase", color:"#8b7763", display:"block", marginBottom:6 }}>target days</label>
                <input type="number" value={target} onChange={e=>setTarget(e.target.value)} placeholder={period==="weekly"?"7":"30"} style={inp}/>
              </div>
              {linked && linked !== "workout" && linked !== "sweets" && (
                <div style={{ flex:1 }}>
                  <label style={{ fontSize:11, letterSpacing:"2px", textTransform:"uppercase", color:"#8b7763", display:"block", marginBottom:6 }}>
                    {HABIT_GOAL_DEFAULTS[linked]?.direction === "max" ? "daily maximum" : "daily minimum"}
                  </label>
                  <input type="number" value={threshold} onChange={e=>setThreshold(e.target.value)}
                    placeholder={HABIT_GOAL_DEFAULTS[linked]?.streakDefault?.toString()||"1"} style={inp}/>
                </div>
              )}
            </div>
          </>
        )}

        {/* Habit link */}
        <label style={{ fontSize:11, letterSpacing:"2px", textTransform:"uppercase", color:"#8b7763", display:"block", marginBottom:6 }}>
          {goalType==="streak" ? "track habit (auto)" : "link to habit (auto-tracks)"}
        </label>
        <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:linked?10:20 }}>
          <button onClick={()=>{ setLinked(""); setThreshold(""); }} style={{ padding:"7px 12px", borderRadius:14, border:"1.5px solid "+(linked===""?"#c4a882":"rgba(139,119,95,.15)"), background:linked===""?"rgba(196,168,130,.1)":"transparent", fontSize:12, color:linked===""?"#8b6b3d":"#8b7763", cursor:"pointer", fontFamily:"inherit" }}>
            {goalType==="streak"?"manual":"none (manual)"}
          </button>
          {linkable.map(id => {
            const d = ALL_HABITS.find(x=>x.id===id); if(!d) return null;
            return <button key={id} onClick={()=>pick(id)} style={{ padding:"7px 12px", borderRadius:14, border:"1.5px solid "+(linked===id?"#8ab890":"rgba(139,119,95,.15)"), background:linked===id?"rgba(138,184,144,.1)":"transparent", fontSize:12, color:linked===id?"#4a6e4a":"#8b7763", cursor:"pointer", fontFamily:"inherit" }}>{d.emoji} {d.label}</button>;
          })}
        </div>
        {linked && <p style={{ fontSize:11, color:"#8ab890", fontStyle:"italic", margin:"0 0 16px" }}>updates automatically from your daily log ✨</p>}

        <button onClick={submit} style={{ width:"100%", padding:14, borderRadius:14, border:"none", background:"linear-gradient(135deg,#8ab890,#5a7a5a)", color:"#fff", fontSize:14, cursor:"pointer", fontFamily:"inherit", boxShadow:"0 4px 14px rgba(90,122,90,.22)" }}>
          {initial?"save changes ✨":"add goal ✨"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// GOALS TAB
// ─────────────────────────────────────────────────────────────
function GoalsTab({ goals, setGoals, log, habits }) {
  const [modal,  setModal]  = useState(null);
  const [filter, setFilter] = useState("all");

  const upsert = g => setGoals(p => p.find(x=>x.id===g.id) ? p.map(x=>x.id===g.id?g:x) : [...p,g]);
  const remove = id => setGoals(p => p.filter(g=>g.id!==id));
  const nudge  = (id,d) => setGoals(p => p.map(g => g.id!==id ? g : { ...g, accumulatedProgress:Math.max(0,(g.accumulatedProgress||0)+d) }));

  // For cumulative goals: past accumulated + today's value
  // For streak goals: past streak days + (did today meet threshold? 1 : 0)
  const getProgress = (g) => {
    if (!g.linkedHabit) return g.accumulatedProgress || 0;
    if (g.goalType === "streak") {
      const todayMet = meetsThreshold(log, g.linkedHabit, g.threshold);
      return (g.streakDays || 0) + (todayMet ? 1 : 0);
    }
    return (g.accumulatedProgress || 0) + habitValue(log, g.linkedHabit);
  };

  const filtered = goals.filter(g => filter==="all"||g.period===filter);

  const nudgeBtn = (style) => ({ ...style, width:24, height:24, borderRadius:"50%", border:"1.5px solid rgba(139,119,95,.2)", background:"transparent", cursor:"pointer", color:"#8b7763", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" });

  return (
    <>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0 16px 12px" }}>
        <div style={{ display:"flex", gap:6 }}>
          {["all","weekly","monthly"].map(f => (
            <button key={f} onClick={()=>setFilter(f)} style={{ padding:"6px 13px", borderRadius:14, border:"1.5px solid "+(filter===f?"#8ab890":"rgba(139,119,95,.18)"), background:filter===f?"rgba(138,184,144,.1)":"transparent", color:filter===f?"#4a6e4a":"#8b7763", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>{f}</button>
          ))}
        </div>
        <button onClick={()=>setModal("new")} style={{ padding:"7px 14px", borderRadius:14, border:"none", background:"linear-gradient(135deg,#8ab890,#5a7a5a)", color:"#fff", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>+ add goal</button>
      </div>

      {filtered.length===0 && (
        <div style={{ margin:"0 16px", background:"rgba(255,255,255,.58)", borderRadius:16, padding:"36px 20px", textAlign:"center", boxShadow:"0 2px 12px rgba(139,119,95,.07)" }}>
          <div style={{ fontSize:28, marginBottom:10 }}>🎯</div>
          <div style={{ fontSize:14, color:"#8b7763", fontStyle:"italic" }}>no goals yet</div>
          <div style={{ fontSize:12, color:"#a89880", marginTop:5 }}>tap + add goal to get started</div>
        </div>
      )}

      {filtered.map(goal => {
        const progress  = getProgress(goal);
        const target    = Math.max(goal.target || 1, 0.001);
        const pct       = Math.min(Math.round((progress / target) * 100), 100);
        const bar       = pct>=100?"linear-gradient(90deg,#8ab890,#5a7a5a)":pct>=60?"linear-gradient(90deg,#c4d4a8,#8ab890)":"linear-gradient(90deg,#d4c4a8,#c4a882)";
        const isStreak  = goal.goalType === "streak";
        const isLinked  = !!goal.linkedHabit;

        // Streak: did today count?
        const todayMet  = isStreak && isLinked && meetsThreshold(log, goal.linkedHabit, goal.threshold);
        const hDefaults = goal.linkedHabit ? HABIT_GOAL_DEFAULTS[goal.linkedHabit] : null;

        // Subtitle
        let subtitle = "";
        if (isStreak && isLinked && goal.threshold != null) {
          const dir = hDefaults?.direction === "max" ? "max" : "min";
          subtitle = `${dir} ${goal.threshold} ${hDefaults?.cumUnit||"units"}/day · ${progress}/${goal.target} days`;
        } else if (isStreak && !isLinked) {
          subtitle = `${progress} / ${goal.target} days`;
        } else {
          subtitle = `${progress} / ${goal.target} ${goal.unit}`;
        }

        return (
          <div key={goal.id} style={{ margin:"0 16px 9px" }}>
            <div style={{ borderRadius:13, padding:"13px 14px", background:"rgba(255,255,255,.5)", border:"1px solid rgba(139,119,95,.09)" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:10, color:"#a89880", background:"rgba(139,119,95,.07)", padding:"1px 7px", borderRadius:8 }}>{goal.period}</span>
                  </div>
                  <div style={{ fontSize:13, color:"#3d3530", marginTop:5 }}>{goal.name}</div>
                  <div style={{ fontSize:11, color:"#8b7763", fontStyle:"italic", marginTop:2 }}>{subtitle}</div>
                  {isStreak && isLinked && (
                    <div style={{ fontSize:11, marginTop:4, color:todayMet?"#5a7a5a":"#a89880", fontStyle:"italic" }}>
                      {todayMet ? "✓ today counts!" : "not yet today"}
                    </div>
                  )}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:20, fontWeight:300, color:pct>=100?"#5a7a5a":"#8b7763" }}>{pct}%</span>
                  <button onClick={()=>setModal(goal)} style={{ background:"rgba(139,119,95,.07)", border:"none", borderRadius:8, padding:"3px 8px", fontSize:11, color:"#8b7763", cursor:"pointer", fontFamily:"inherit" }}>edit</button>
                  <button onClick={()=>remove(goal.id)} style={{ background:"none", border:"none", color:"rgba(139,119,95,.3)", fontSize:18, cursor:"pointer", padding:0, lineHeight:1 }}>×</button>
                </div>
              </div>

              <div style={{ height:6, borderRadius:3, background:"rgba(139,119,95,.08)", overflow:"hidden", marginTop:9 }}>
                <div style={{ height:"100%", width:pct+"%", background:bar, borderRadius:3, transition:"width 1s ease" }}/>
              </div>

              {/* Manual update for non-linked goals */}
              {!isLinked && (
                <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:9 }}>
                  <span style={{ fontSize:11, color:"#8b7763", fontStyle:"italic" }}>
                    {isStreak ? "days hit:" : "add progress:"}
                  </span>
                  <button onClick={()=>nudge(goal.id,-1)} style={nudgeBtn({})}>−</button>
                  <span style={{ fontSize:13, fontWeight:300, color:"#5a7a5a", minWidth:24, textAlign:"center" }}>{goal.accumulatedProgress||0}</span>
                  <button onClick={()=>nudge(goal.id,1)} style={nudgeBtn({})}>+</button>
                </div>
              )}

              {pct>=100 && <div style={{ fontSize:11, color:"#5a7a5a", marginTop:6, fontStyle:"italic" }}>goal reached ✨</div>}
            </div>
          </div>
        );
      })}

      {modal && <GoalModal habits={habits} initial={modal==="new"?null:modal} onSave={upsert} onClose={()=>setModal(null)}/>}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// WORKOUT TAGS
// ─────────────────────────────────────────────────────────────
function WorkoutTags({ types, onChange }) {
  const [inp, setInp] = useState("");
  const add = v => { const t=v.trim().toLowerCase(); if(t&&!types.includes(t)) onChange([...types,t]); setInp(""); };
  return (
    <div style={{ marginTop:10 }}>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:7 }}>
        {types.map(t => <div key={t} style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 10px", borderRadius:14, background:"rgba(138,184,144,.14)", border:"1px solid rgba(90,122,90,.18)", fontSize:12, color:"#4a6e4a" }}>{t}<span onClick={()=>onChange(types.filter(x=>x!==t))} style={{ cursor:"pointer", color:"#8ab890", fontSize:14, marginLeft:2 }}>×</span></div>)}
      </div>
      <input type="text" placeholder="pilates, yoga, gym..." value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"||e.key===","){e.preventDefault();add(inp);}}} style={{ width:"100%", padding:"8px 12px", borderRadius:10, border:"1.5px solid rgba(139,119,95,.2)", background:"rgba(255,255,255,.7)", fontFamily:"inherit", fontSize:13, color:"#3d3530", outline:"none", boxSizing:"border-box" }}/>
      <div style={{ fontSize:10, color:"#a89880", marginTop:3, fontStyle:"italic" }}>press Enter after each activity</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SETTINGS TAB
// ─────────────────────────────────────────────────────────────
function SettingsTab({ habits, setHabits, goals, setGoals, selfCarePool, setSelfCarePool, weights, setWeights, notif, setNotif, onSignOut }) {
  const [open, setOpen] = useState(null);
  const tog = s => setOpen(p => p===s?null:s);

  const goalConfig = [
    { key:"water",      label:"💧 water",    unit:"glasses",  min:1,    max:20,    step:1    },
    { key:"steps",      label:"🌿 steps",    unit:"per day",  min:1000, max:30000, step:1000 },
    { key:"sleep",      label:"🌙 sleep",    unit:"hours",    min:4,    max:12,    step:0.5  },
    { key:"running",    label:"🏃 running",  unit:"km",       min:1,    max:42,    step:0.5  },
    { key:"learning",   label:"📚 learning", unit:"min/day",  min:10,   max:240,   step:10   },
    { key:"reading",    label:"📖 reading",  unit:"pages/day",min:5,    max:200,   step:5    },
    { key:"screenTime", label:"📱 screen",   unit:"limit min",min:30,   max:600,   step:15   },
  ].filter(c => habits.includes(c.key));

  const scorable = habits.filter(h => h !== "mood");
  const panel  = { margin:"0 16px 10px", background:"rgba(255,255,255,.58)", borderRadius:16, overflow:"hidden", boxShadow:"0 2px 12px rgba(139,119,95,.07)" };
  const hdr    = { padding:"15px 17px", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer" };
  const body   = { padding:"4px 17px 16px" };
  const stepB  = { width:28, height:28, borderRadius:"50%", border:"1.5px solid rgba(139,119,95,.18)", background:"rgba(255,255,255,.7)", cursor:"pointer", fontSize:16, color:"#8b7763", display:"flex", alignItems:"center", justifyContent:"center" };
  const pill   = sel => ({ padding:"7px 12px", borderRadius:18, border:"1.5px solid "+(sel?"#8ab890":"rgba(139,119,95,.19)"), background:sel?"rgba(138,184,144,.1)":"transparent", fontSize:12, color:sel?"#4a6e4a":"#8b7763", cursor:"pointer", fontFamily:"inherit" });
  const perm   = getPermissionStatus();

  return (
    <>
      {/* What i'm tracking */}
      <div style={panel}>
        <div style={hdr} onClick={()=>tog("habits")}>
          <span style={{ fontSize:13, color:"#3d3530" }}>📋  what i'm tracking</span>
          <span style={{ color:"#8b7763", fontSize:10 }}>{open==="habits"?"▲":"▼"}</span>
        </div>
        {open==="habits" && <div style={body}>
          <p style={{ fontSize:11, color:"#8b7763", fontStyle:"italic", margin:"0 0 12px" }}>toggle habits on/off anytime</p>
          {ALL_HABITS.map(({ id, label, emoji, desc }) => (
            <div key={id} onClick={()=>setHabits(p=>p.includes(id)?p.filter(h=>h!==id):[...p,id])} style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 0", borderBottom:"1px solid rgba(139,119,95,.06)", cursor:"pointer" }}>
              <span style={{ fontSize:20, width:26, textAlign:"center" }}>{emoji}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, color:"#3d3530" }}>{label}</div>
                <div style={{ fontSize:10, color:"#8b7763", fontStyle:"italic" }}>{desc}</div>
              </div>
              <div style={{ width:18, height:18, borderRadius:"50%", border:"2px solid "+(habits.includes(id)?"#8ab890":"rgba(139,119,95,.2)"), background:habits.includes(id)?"#8ab890":"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {habits.includes(id) && <span style={{ color:"white", fontSize:10 }}>✓</span>}
              </div>
            </div>
          ))}
        </div>}
      </div>

      {/* Daily goals */}
      {goalConfig.length > 0 && <div style={panel}>
        <div style={hdr} onClick={()=>tog("goals")}>
          <span style={{ fontSize:13, color:"#3d3530" }}>⚙️  daily goals</span>
          <span style={{ color:"#8b7763", fontSize:10 }}>{open==="goals"?"▲":"▼"}</span>
        </div>
        {open==="goals" && <div style={body}>
          {goalConfig.map(({ key, label, unit, min, max, step }) => (
            <div key={key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid rgba(139,119,95,.07)" }}>
              <div><div style={{ fontSize:13, color:"#3d3530" }}>{label}</div><div style={{ fontSize:10, color:"#8b7763", fontStyle:"italic" }}>{unit}</div></div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <button style={stepB} onClick={()=>setGoals(p=>({...p,[key]:Math.max(min,+(p[key]||DEFAULT_GOALS[key]||0)-step)}))}>−</button>
                <div style={{ textAlign:"center", minWidth:44, fontSize:17, fontWeight:300, color:"#5a7a5a" }}>{goals[key]||DEFAULT_GOALS[key]}</div>
                <button style={stepB} onClick={()=>setGoals(p=>({...p,[key]:Math.min(max,+(p[key]||DEFAULT_GOALS[key]||0)+step)}))}>+</button>
              </div>
            </div>
          ))}
        </div>}
      </div>}

      {/* Score weights */}
      <div style={panel}>
        <div style={hdr} onClick={()=>tog("weights")}>
          <span style={{ fontSize:13, color:"#3d3530" }}>⚖️  score weights</span>
          <span style={{ color:"#8b7763", fontSize:10 }}>{open==="weights"?"▲":"▼"}</span>
        </div>
        {open==="weights" && <div style={body}>
          <p style={{ fontSize:11, color:"#8b7763", fontStyle:"italic", margin:"0 0 16px" }}>how much does each habit affect your score?</p>
          {scorable.map(id => {
            const d = ALL_HABITS.find(x=>x.id===id); if(!d) return null;
            const v = weights[id]??5;
            return (
              <div key={id} style={{ marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:7 }}>
                  <span style={{ fontSize:13, color:"#3d3530" }}>{d.emoji} {d.label}</span>
                  <span style={{ fontSize:11, color:"#5a7a5a", fontWeight:300 }}>{v} / 10</span>
                </div>
                <WeightDots value={v} onChange={val=>setWeights(p=>({...p,[id]:val}))}/>
              </div>
            );
          })}
        </div>}
      </div>

      {/* Self care pool */}
      {habits.includes("selfCare") && <div style={panel}>
        <div style={hdr} onClick={()=>tog("sc")}>
          <span style={{ fontSize:13, color:"#3d3530" }}>🌸  self care menu</span>
          <span style={{ color:"#8b7763", fontSize:10 }}>{open==="sc"?"▲":"▼"}</span>
        </div>
        {open==="sc" && <div style={{ ...body, paddingTop:12 }}>
          <div style={{ display:"flex", flexWrap:"wrap", gap:7 }}>
            {ALL_SELFCARE.map(it => <div key={it} style={pill(selfCarePool.includes(it))} onClick={()=>setSelfCarePool(p=>p.includes(it)?p.filter(s=>s!==it):[...p,it])}>{it}</div>)}
          </div>
        </div>}
      </div>}

      {/* Notifications */}
      <div style={panel}>
        <div style={hdr} onClick={()=>tog("notif")}>
          <span style={{ fontSize:13, color:"#3d3530" }}>🔔  notifications</span>
          <span style={{ color:"#8b7763", fontSize:10 }}>{open==="notif"?"▲":"▼"}</span>
        </div>
        {open==="notif" && <div style={body}>
          {perm==="unsupported" && <p style={{ fontSize:12, color:"#c47a7a", fontStyle:"italic", margin:"8px 0" }}>not supported on this device</p>}
          {perm==="denied"      && <p style={{ fontSize:12, color:"#c47a7a", fontStyle:"italic", margin:"8px 0" }}>blocked — enable in browser/phone settings</p>}
          {perm!=="unsupported" && <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid rgba(139,119,95,.08)", marginBottom:12 }}>
              <span style={{ fontSize:13, color:"#3d3530" }}>enable notifications</span>
              <div onClick={async () => {
                if (!notif.enabled) { const ok = await requestNotifPermission(); if(ok){const n={...notif,enabled:true};setNotif(n);scheduleNotifications(n);} }
                else { const n={...notif,enabled:false}; setNotif(n); scheduleNotifications(n); }
              }} style={{ width:40, height:22, borderRadius:11, background:notif.enabled?"#8ab890":"rgba(139,119,95,.15)", cursor:"pointer", position:"relative", transition:"background .2s" }}>
                <div style={{ position:"absolute", top:2, left:notif.enabled?20:2, width:18, height:18, borderRadius:"50%", background:"white", transition:"left .2s", boxShadow:"0 1px 4px rgba(0,0,0,.15)" }}/>
              </div>
            </div>
            {notif.enabled && Object.entries(notif).map(([key,val]) => {
              if (key==="enabled"||!val?.time) return null;
              return (
                <div key={key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid rgba(139,119,95,.06)" }}>
                  <div>
                    <div style={{ fontSize:12, color:"#3d3530" }}>{val.message.slice(0,34)}...</div>
                    <div style={{ fontSize:10, color:"#8b7763", fontStyle:"italic" }}>{val.time}</div>
                  </div>
                  <div onClick={()=>{const n={...notif,[key]:{...val,enabled:!val.enabled}};setNotif(n);scheduleNotifications(n);}} style={{ width:32, height:18, borderRadius:9, background:val.enabled?"#8ab890":"rgba(139,119,95,.15)", cursor:"pointer", position:"relative", transition:"background .2s", flexShrink:0 }}>
                    <div style={{ position:"absolute", top:1, left:val.enabled?15:1, width:16, height:16, borderRadius:"50%", background:"white", transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,.15)" }}/>
                  </div>
                </div>
              );
            })}
            {notif.enabled && perm==="granted" && <button onClick={sendTestNotification} style={{ marginTop:12, padding:"8px 14px", borderRadius:10, border:"1.5px solid rgba(139,119,95,.2)", background:"transparent", fontSize:12, color:"#8b7763", cursor:"pointer", fontFamily:"inherit" }}>send test notification</button>}
          </>}
        </div>}
      </div>

      {/* Account */}
      <div style={panel}>
        <div style={hdr} onClick={()=>tog("acc")}>
          <span style={{ fontSize:13, color:"#3d3530" }}>👤  account</span>
          <span style={{ color:"#8b7763", fontSize:10 }}>{open==="acc"?"▲":"▼"}</span>
        </div>
        {open==="acc" && <div style={body}>
          <button onClick={onSignOut} style={{ width:"100%", padding:11, borderRadius:12, border:"1.5px solid rgba(196,120,120,.28)", background:"transparent", color:"#c47a7a", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>sign out</button>
        </div>}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// ONBOARDING
// ─────────────────────────────────────────────────────────────
function Onboarding({ onDone }) {
  const [step,   setStep]   = useState(0);
  const [habits, setHabits] = useState(["water","steps","sleep","selfCare","mood"]);
  const [goals,  setGoals]  = useState({...DEFAULT_GOALS});
  const [scPool, setScPool] = useState(["skincare 🧴","journaling 📓","walk outside 🌿","meditation 🧘"]);

  const goalConfig = [
    { key:"water",   label:"💧 water",    unit:"glasses",  min:1,    max:20,    step:1    },
    { key:"steps",   label:"🌿 steps",    unit:"per day",  min:1000, max:30000, step:1000 },
    { key:"sleep",   label:"🌙 sleep",    unit:"hours",    min:4,    max:12,    step:0.5  },
    { key:"running", label:"🏃 running",  unit:"km",       min:1,    max:42,    step:0.5  },
    { key:"learning",label:"📚 learning", unit:"min/day",  min:10,   max:240,   step:10   },
    { key:"reading", label:"📖 reading",  unit:"pages/day",min:5,    max:200,   step:5    },
    { key:"screenTime",label:"📱 screen", unit:"limit min",min:30,   max:600,   step:15   },
  ].filter(c => habits.includes(c.key));

  const W = {
    wrap: { minHeight:"100vh", background:"linear-gradient(155deg,#faf8f3 0%,#f0ebe0 50%,#e9f0e9 100%)", fontFamily:"'Cormorant Garamond',Georgia,serif", display:"flex", flexDirection:"column", padding:"36px 22px 44px", color:"#3d3530" },
    prog: { height:3, background:"rgba(139,119,95,.12)", borderRadius:2, overflow:"hidden", marginBottom:30 },
    bar:  pct => ({ height:"100%", width:pct+"%", background:"linear-gradient(90deg,#8ab890,#5a7a5a)", borderRadius:2, transition:"width .5s" }),
    card: sel => ({ padding:"12px 14px", borderRadius:14, border:"2px solid "+(sel?"#8ab890":"rgba(139,119,95,.14)"), background:sel?"rgba(138,184,144,.08)":"rgba(255,255,255,.45)", cursor:"pointer", display:"flex", alignItems:"center", gap:11, marginBottom:7 }),
    pill: sel => ({ padding:"8px 13px", borderRadius:20, border:"1.5px solid "+(sel?"#8ab890":"rgba(139,119,95,.19)"), background:sel?"rgba(138,184,144,.1)":"transparent", fontSize:12, color:sel?"#4a6e4a":"#8b7763", cursor:"pointer", fontFamily:"inherit" }),
    btn:  { width:"100%", padding:14, borderRadius:15, border:"none", background:"linear-gradient(135deg,#8ab890,#5a7a5a)", color:"#fff", fontSize:14, cursor:"pointer", fontFamily:"inherit", marginTop:24, boxShadow:"0 4px 14px rgba(90,122,90,.22)" },
    row:  { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 0", borderBottom:"1px solid rgba(139,119,95,.08)" },
    sB:   { width:30, height:30, borderRadius:"50%", border:"1.5px solid rgba(139,119,95,.2)", background:"rgba(255,255,255,.6)", cursor:"pointer", fontSize:18, color:"#8b7763", display:"flex", alignItems:"center", justifyContent:"center" },
  };

  const finish = () => onDone({ habits, goals, selfCarePool:scPool, weights:{...DEFAULT_WEIGHTS}, bigGoals:[], notif:defaultNotifSettings, trophies:[] });

  if (step===0) return (
    <div style={W.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet"/>
      <style>{`@keyframes dotPulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(138,184,144,.6)}60%{transform:scale(1.2);box-shadow:0 0 0 5px rgba(138,184,144,0)}}`}</style>
      <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", textAlign:"center" }}>
        <Blob score={65}/>
        <h1 style={{ fontSize:38, fontWeight:300, color:"#3d3530", margin:"16px 0 7px", letterSpacing:1 }}>wellness</h1>
        <p style={{ fontSize:14, color:"#8b7763", fontStyle:"italic", marginBottom:34, lineHeight:1.8, maxWidth:250 }}>your personal wellness companion.<br/>let's set it up just for you 🌿</p>
        <button style={W.btn} onClick={()=>setStep(1)}>let's start →</button>
      </div>
    </div>
  );

  if (step===1) return (
    <div style={W.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet"/>
      <style>{`@keyframes dotPulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(138,184,144,.6)}60%{transform:scale(1.2);box-shadow:0 0 0 5px rgba(138,184,144,0)}}`}</style>
      <div style={W.prog}><div style={W.bar(33)}/></div>
      <h2 style={{ fontSize:22, fontWeight:300, marginBottom:5 }}>what do you want to track?</h2>
      <p style={{ fontSize:11, color:"#8b7763", fontStyle:"italic", marginBottom:18 }}>changeable anytime in settings</p>
      <div style={{ flex:1, overflowY:"auto" }}>
        {ALL_HABITS.map(({ id, label, emoji, desc }) => (
          <div key={id} style={W.card(habits.includes(id))} onClick={()=>setHabits(p=>p.includes(id)?p.filter(h=>h!==id):[...p,id])}>
            <span style={{ fontSize:21, width:27, textAlign:"center" }}>{emoji}</span>
            <div style={{ flex:1 }}><div style={{ fontSize:13, color:"#3d3530" }}>{label}</div><div style={{ fontSize:10, color:"#8b7763", fontStyle:"italic" }}>{desc}</div></div>
            <div style={{ width:19, height:19, borderRadius:"50%", border:"2px solid "+(habits.includes(id)?"#8ab890":"rgba(139,119,95,.2)"), background:habits.includes(id)?"#8ab890":"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              {habits.includes(id)&&<span style={{ color:"white", fontSize:10 }}>✓</span>}
            </div>
          </div>
        ))}
      </div>
      <button style={W.btn} onClick={()=>setStep(2)}>next →</button>
    </div>
  );

  if (step===2) return (
    <div style={W.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet"/>
      <style>{`@keyframes dotPulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(138,184,144,.6)}60%{transform:scale(1.2);box-shadow:0 0 0 5px rgba(138,184,144,0)}}`}</style>
      <div style={W.prog}><div style={W.bar(habits.includes("selfCare")?66:100)}/></div>
      <h2 style={{ fontSize:22, fontWeight:300, marginBottom:5 }}>your daily goals</h2>
      <p style={{ fontSize:11, color:"#8b7763", fontStyle:"italic", marginBottom:14 }}>adjustable anytime in settings</p>
      <div style={{ flex:1, overflowY:"auto" }}>
        {goalConfig.length===0
          ? <p style={{ color:"#8b7763", fontStyle:"italic", textAlign:"center", paddingTop:40, fontSize:13 }}>no numeric goals for your selection 🌿</p>
          : goalConfig.map(({ key, label, unit, min, max, step }) => (
            <div key={key} style={W.row}>
              <div><div style={{ fontSize:13, color:"#3d3530" }}>{label}</div><div style={{ fontSize:10, color:"#8b7763", fontStyle:"italic" }}>{unit}</div></div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <button style={W.sB} onClick={()=>setGoals(p=>({...p,[key]:Math.max(min,+(p[key]||DEFAULT_GOALS[key]||0)-step)}))}>−</button>
                <div style={{ textAlign:"center", minWidth:50, fontSize:19, fontWeight:300, color:"#5a7a5a" }}>{goals[key]||DEFAULT_GOALS[key]}</div>
                <button style={W.sB} onClick={()=>setGoals(p=>({...p,[key]:Math.min(max,+(p[key]||DEFAULT_GOALS[key]||0)+step)}))}>+</button>
              </div>
            </div>
          ))}
      </div>
      <button style={W.btn} onClick={()=>habits.includes("selfCare")?setStep(3):finish()}>{habits.includes("selfCare")?"next →":"finish ✨"}</button>
    </div>
  );

  return (
    <div style={W.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet"/>
      <style>{`@keyframes dotPulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(138,184,144,.6)}60%{transform:scale(1.2);box-shadow:0 0 0 5px rgba(138,184,144,0)}}`}</style>
      <div style={W.prog}><div style={W.bar(100)}/></div>
      <h2 style={{ fontSize:22, fontWeight:300, marginBottom:5 }}>your self care menu</h2>
      <p style={{ fontSize:11, color:"#8b7763", fontStyle:"italic", marginBottom:18 }}>pick what counts as self care for you</p>
      <div style={{ flex:1, display:"flex", flexWrap:"wrap", gap:8, alignContent:"flex-start", overflowY:"auto" }}>
        {ALL_SELFCARE.map(it => <div key={it} style={W.pill(scPool.includes(it))} onClick={()=>setScPool(p=>p.includes(it)?p.filter(s=>s!==it):[...p,it])}>{it}</div>)}
      </div>
      <button style={W.btn} onClick={finish}>finish ✨</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TROPHY SVG
// ─────────────────────────────────────────────────────────────
function TrophySVG({ gold = true, size = 44 }) {
  const g = gold
    ? { cup:"#f0d060", cupShine:"#f8ec98", cupShadow:"#c09020", base:"#e0b840", stem:"#d4a030", shine:"rgba(255,255,240,.55)" }
    : { cup:"#d8d8e8", cupShine:"#eeeef8", cupShadow:"#9898b8", base:"#c8c8dc", stem:"#b8b8cc", shine:"rgba(255,255,255,.5)" };
  const uid = gold?"gtc":"gts";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <defs>
        <radialGradient id={uid} cx="38%" cy="28%" r="65%">
          <stop offset="0%" stopColor={g.cupShine}/>
          <stop offset="100%" stopColor={g.cup}/>
        </radialGradient>
        <filter id={uid+"f"}>
          <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor={g.cupShadow} floodOpacity="0.4"/>
        </filter>
      </defs>
      <path d="M14 6 L34 6 L32 24 Q30 30 24 32 Q18 30 16 24 Z" fill={`url(#${uid})`} filter={`url(#${uid}f)`}/>
      <ellipse cx="20" cy="11" rx="3.5" ry="5" fill={g.shine} transform="rotate(-15 20 11)"/>
      <path d="M14 9 Q7 9 7 16 Q7 22 14 22" fill="none" stroke={g.cup} strokeWidth="3.5" strokeLinecap="round"/>
      <path d="M34 9 Q41 9 41 16 Q41 22 34 22" fill="none" stroke={g.cup} strokeWidth="3.5" strokeLinecap="round"/>
      <path d="M14 9 Q7 9 7 16 Q7 22 14 22" fill="none" stroke={g.cupShine} strokeWidth="1.2" strokeLinecap="round" opacity=".6"/>
      <path d="M34 9 Q41 9 41 16 Q41 22 34 22" fill="none" stroke={g.cupShine} strokeWidth="1.2" strokeLinecap="round" opacity=".6"/>
      <rect x="21" y="32" width="6" height="7" rx="1" fill={g.stem}/>
      <rect x="15" y="38" width="18" height="4" rx="2" fill={g.base}/>
      <rect x="15" y="38" width="18" height="1.5" rx="1" fill={g.cupShine} opacity=".5"/>
      <text x="24" y="22" fontSize="9" textAnchor="middle" fill={gold?"#8a6010":"#6868a0"} opacity=".8">★</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// GOLDEN BLOB (only used in celebration popup)
// ─────────────────────────────────────────────────────────────
function GoldenBlob({ size = 80 }) {
  return (
    <div style={{ position:"relative", width:size+48, height:size+48, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <style>{`
        @keyframes goldenAura1{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.12);opacity:.85}}
        @keyframes goldenAura2{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.6}}
        @keyframes goldenFloat{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-11px) rotate(1deg)}}
      `}</style>
      <div style={{ position:"absolute", width:"100%", height:"100%", borderRadius:"50%", background:"radial-gradient(circle,rgba(255,210,80,.38) 0%,transparent 70%)", animation:"goldenAura1 2.8s ease-in-out infinite" }}/>
      <div style={{ position:"absolute", width:"115%", height:"115%", top:"-7.5%", left:"-7.5%", borderRadius:"50%", background:"radial-gradient(circle,rgba(255,185,40,.18) 0%,transparent 65%)", animation:"goldenAura2 3.4s ease-in-out infinite" }}/>
      <div style={{ animation:"goldenFloat 2.2s ease-in-out infinite", position:"relative", zIndex:2 }}>
        <svg width={size} height={size} viewBox="0 0 84 84">
          <defs>
            <radialGradient id="blobGoldPop" cx="38%" cy="28%" r="68%">
              <stop offset="0%" stopColor="#fff8e8" stopOpacity="0.9"/>
              <stop offset="45%" stopColor="#f0d880"/>
              <stop offset="100%" stopColor="#c8a040"/>
            </radialGradient>
          </defs>
          <path d="M42 12 C58 10,72 22,73 41 C74 60,61 73,43 75 C25 77,10 64,10 46 C10 28,24 14,42 12Z" fill="url(#blobGoldPop)" stroke="#b8880a" strokeWidth="1.2"/>
          <text x="29" y="44" fontSize="13" textAnchor="middle" fill="#8a6010" opacity=".9">✦</text>
          <text x="55" y="44" fontSize="13" textAnchor="middle" fill="#8a6010" opacity=".9">✦</text>
          <ellipse cx="18" cy="52" rx="7" ry="3.8" fill="rgba(220,140,130,.25)"/>
          <ellipse cx="66" cy="52" rx="7" ry="3.8" fill="rgba(220,140,130,.25)"/>
          <path d="M28 59 Q42 70 56 59" stroke="#8a6010" strokeWidth="2.4" fill="none" strokeLinecap="round"/>
          <ellipse cx="33" cy="26" rx="6" ry="3.5" fill="rgba(255,255,255,.35)" transform="rotate(-20 33 26)"/>
        </svg>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CONFETTI
// ─────────────────────────────────────────────────────────────
function Confetti() {
  const pieces = Array.from({length:36}, (_,i) => ({
    id:i, x:5+Math.random()*90, delay:Math.random()*.7, dur:1.6+Math.random()*1.5,
    w:4+Math.random()*9, h:4+Math.random()*5,
    color:["#f0d460","#8ab890","#c4a882","#b8c4e8","#d4c4e8","#c8e0c0","#f0c8a0","#e8a0b0"][i%8],
    shape:["circle","square","rect"][i%3],
  }));
  return (
    <div style={{ position:"fixed", inset:0, overflow:"hidden", pointerEvents:"none", zIndex:302 }}>
      <style>{`@keyframes confFall{0%{opacity:1;transform:translateY(-15px) rotate(0deg)}100%{opacity:0;transform:translateY(108vh) rotate(620deg) scale(.4)}}`}</style>
      {pieces.map(p => (
        <div key={p.id} style={{ position:"absolute", top:0, left:p.x+"%", width:p.shape==="rect"?p.w*.55:p.w, height:p.h, background:p.color, borderRadius:p.shape==="circle"?"50%":"3px", animation:`confFall ${p.dur}s ${p.delay}s cubic-bezier(.2,.6,.4,1) forwards`, opacity:0 }}/>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CELEBRATION POPUP
// ─────────────────────────────────────────────────────────────
function CelebrationPopup({ goal, onClose }) {
  const [ph, setPh] = useState("in");
  useEffect(() => {
    const t1 = setTimeout(() => setPh("show"), 40);
    const t2 = setTimeout(() => setPh("out"), 4600);
    const t3 = setTimeout(onClose, 5100);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onClose]);
  const show = ph==="show", out = ph==="out";
  return (
    <>
      <Confetti/>
      <div onClick={onClose} style={{ position:"fixed", inset:0, zIndex:300, background:show?"rgba(38,30,22,.58)":"rgba(38,30,22,0)", backdropFilter:show?"blur(8px)":"none", transition:"all .5s ease", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ textAlign:"center", maxWidth:292, width:"90%", transform:out?"scale(.88) translateY(14px)":show?"scale(1) translateY(0)":"scale(.5) translateY(36px)", opacity:out?0:show?1:0, transition:out?"all .4s ease-in":"all .6s cubic-bezier(.34,1.5,.64,1)" }}>
          <style>{`
            @keyframes cardPop{0%{transform:scale(.85);opacity:0}60%{transform:scale(1.03)}100%{transform:scale(1);opacity:1}}
            @keyframes trophyBounce{0%{transform:translateY(20px) rotate(-8deg);opacity:0}55%{transform:translateY(-6px) rotate(3deg);opacity:1}80%{transform:translateY(2px) rotate(-1deg)}100%{transform:translateY(0) rotate(0deg);opacity:1}}
          `}</style>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:2 }}>
            <GoldenBlob size={80}/>
          </div>
          <div style={{ background:"rgba(252,250,245,.97)", borderRadius:26, padding:"22px 26px 28px", boxShadow:"0 28px 70px rgba(80,60,20,.18), 0 6px 22px rgba(139,119,95,.1), inset 0 1px 0 rgba(255,255,255,.9)", border:"1.5px solid rgba(196,160,64,.28)", animation:show?"cardPop .55s .1s cubic-bezier(.34,1.4,.64,1) both":"none" }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:12, animation:show?"trophyBounce .7s .3s cubic-bezier(.34,1.5,.64,1) both":"none" }}>
              <TrophySVG gold={goal.period==="monthly"} size={52}/>
            </div>
            <div style={{ fontSize:10, letterSpacing:"3.5px", textTransform:"uppercase", color:goal.period==="monthly"?"#c4a040":"#8ab890", marginBottom:9 }}>
              {goal.period} goal complete ✦
            </div>
            <div style={{ fontSize:21, fontWeight:300, color:"#3d3530", lineHeight:1.3, marginBottom:10, fontFamily:"'Cormorant Garamond',Georgia,serif" }}>
              {goal.name}
            </div>
            <div style={{ display:"flex", gap:7, justifyContent:"center", marginBottom:16 }}>
              <span style={{ fontSize:11, color:"#8b6b3d", background:"rgba(196,168,130,.12)", padding:"3px 11px", borderRadius:10 }}>{goal.target} {goal.unit}</span>
            </div>
            <div style={{ fontSize:13, color:"#5a7a5a", fontStyle:"italic", lineHeight:1.7 }}>
              you did it ✨<br/><span style={{ fontSize:11, color:"#8b7763" }}>trophy saved to your collection</span>
            </div>
          </div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,.45)", marginTop:11, fontStyle:"italic" }}>tap to dismiss</div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// TROPHY CARD
// ─────────────────────────────────────────────────────────────
function TrophyCard({ trophy, index, isNew }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), index*80+40); return ()=>clearTimeout(t); }, [index]);
  const gold = trophy.period === "monthly";
  return (
    <div style={{ transform:vis?"translateY(0)":"translateY(20px)", opacity:vis?1:0, transition:"all .45s cubic-bezier(.34,1.2,.64,1)", background:gold?"linear-gradient(135deg,rgba(255,248,220,.7),rgba(255,255,255,.55))":"linear-gradient(135deg,rgba(248,248,255,.85),rgba(255,255,255,.7))", borderRadius:16, padding:"14px 16px", border:isNew?`1.5px solid ${gold?"rgba(196,160,64,.4)":"rgba(160,160,210,.35)"}`:`1px solid ${gold?"rgba(196,160,64,.18)":"rgba(160,160,210,.18)"}`, boxShadow:gold?"0 4px 18px rgba(196,160,64,.1), 0 2px 8px rgba(139,119,95,.05)":"0 4px 16px rgba(160,160,210,.1), 0 2px 8px rgba(139,119,95,.04)", display:"flex", alignItems:"center", gap:15, position:"relative" }}>
      {isNew && <div style={{ position:"absolute", top:9, right:11, fontSize:9, letterSpacing:"1.5px", textTransform:"uppercase", color:gold?"#c4a040":"#8ab890", background:gold?"rgba(196,160,64,.1)":"rgba(138,184,144,.1)", padding:"2px 8px", borderRadius:8 }}>new ✦</div>}
      <div style={{ flexShrink:0, filter:gold?"drop-shadow(0 2px 6px rgba(196,160,64,.4))":"drop-shadow(0 2px 6px rgba(120,120,160,.2))" }}>
        <TrophySVG gold={gold} size={48}/>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, color:"#3d3530", marginBottom:3, lineHeight:1.3 }}>{trophy.name}</div>
        <div style={{ fontSize:10, color:"#8b7763", fontStyle:"italic" }}>{trophy.target} {trophy.unit}</div>
        <div style={{ fontSize:10, color:"#a89880", marginTop:3 }}>{new Date(trophy.completedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>
      </div>
      <div style={{ fontSize:16, opacity:.55 }}>{gold?"✨":"🌿"}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TROPHIES TAB
// ─────────────────────────────────────────────────────────────
function TrophiesTab({ trophies, newIds }) {
  const monthly = trophies.filter(t=>t.period==="monthly");
  const weekly  = trophies.filter(t=>t.period==="weekly");
  if (!trophies.length) return (
    <div style={{ textAlign:"center", padding:"52px 24px" }}>
      <div style={{ opacity:.25, marginBottom:14, display:"flex", justifyContent:"center" }}><TrophySVG gold size={64}/></div>
      <div style={{ fontSize:16, color:"#8b7763", fontStyle:"italic", fontFamily:"'Cormorant Garamond',Georgia,serif" }}>no trophies yet</div>
      <div style={{ fontSize:12, color:"#a89880", marginTop:7, lineHeight:1.8 }}>complete a goal and your first<br/>trophy will appear here ✨</div>
    </div>
  );
  const Section = ({label, items, startIdx, color}) => !items.length ? null : (
    <div style={{ marginBottom:20 }}>
      <div style={{ fontSize:9, letterSpacing:"3px", textTransform:"uppercase", color, marginBottom:10, display:"flex", alignItems:"center", gap:8 }}>
        <TrophySVG gold={color==="#c4a040"} size={16}/>{label}
      </div>
      {items.map((t,i) => <div key={t.id} style={{marginBottom:9}}><TrophyCard trophy={t} index={startIdx+i} isNew={newIds.includes(t.id)}/></div>)}
    </div>
  );
  return (
    <div style={{ padding:"4px 16px 0" }}>
      <div style={{ textAlign:"center", marginBottom:18 }}>
        <div style={{ fontSize:11, color:"#8b7763", fontStyle:"italic" }}>{trophies.length} trophy{trophies.length!==1?"s":""} earned ✦</div>
        <div style={{ display:"flex", justifyContent:"center", gap:8, marginTop:8 }}>
          {monthly.length>0 && <span style={{ fontSize:10, color:"#c4a040", background:"rgba(196,160,64,.1)", padding:"2px 10px", borderRadius:10 }}>🏆 {monthly.length} monthly</span>}
          {weekly.length>0  && <span style={{ fontSize:10, color:"#7878a8", background:"rgba(140,140,200,.1)", padding:"2px 10px", borderRadius:10 }}>🏆 {weekly.length} weekly</span>}
        </div>
      </div>
      <Section label="monthly trophies" items={monthly} startIdx={0}           color="#c4a040"/>
      <Section label="weekly trophies"  items={weekly}  startIdx={monthly.length} color="#7878a8"/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────
function MainApp({ profile: init, user, onSignOut }) {
  // ── state ──
  const [habits,   setHabitsS]   = useState(init.habits        || ["water","steps","sleep","mood"]);
  const [goals,    setGoalsS]    = useState(init.goals         || {...DEFAULT_GOALS});
  const [scPool,   setScPoolS]   = useState(init.selfCarePool  || []);
  const [weights,  setWeightsS]  = useState(init.weights       || {...DEFAULT_WEIGHTS});
  const [bigGoals, setBigGoalsS] = useState(init.bigGoals      || []);
  const [notif,    setNotifS]    = useState(init.notif         || defaultNotifSettings);
  const [log,      setLog]       = useState({...EMPTY_LOG});
  const [activeTab,setActiveTab] = useState("today");
  const [menuOpen, setMenuOpen]  = useState(false);
  const [trophies, setTrophies]  = useState(init.trophies || []);
  const [newTrophyIds, setNewTrophyIds] = useState([]);
  const [celebGoal, setCelebGoal] = useState(null);

  // ── refs for latest values (no stale closure in callbacks) ──
  const rH = useRef(habits);   useEffect(()=>{rH.current=habits;},   [habits]);
  const rG = useRef(goals);    useEffect(()=>{rG.current=goals;},    [goals]);
  const rS = useRef(scPool);   useEffect(()=>{rS.current=scPool;},   [scPool]);
  const rW = useRef(weights);  useEffect(()=>{rW.current=weights;},  [weights]);
  const rB = useRef(bigGoals); useEffect(()=>{rB.current=bigGoals;}, [bigGoals]);
  const rN = useRef(notif);    useEffect(()=>{rN.current=notif;},    [notif]);
  const rT = useRef(trophies); useEffect(()=>{rT.current=trophies;}, [trophies]);

  // ── save profile — always full snapshot from refs + override ──
  const logTimer = useRef(null);
  const saveProf = useCallback(async (override={}) => {
    if (!user) return;
    try {
      await saveProfile(user.uid, {
        habits:      rH.current,
        goals:       rG.current,
        selfCarePool:rS.current,
        weights:     rW.current,
        bigGoals:    rB.current,
        notif:       rN.current,
        trophies:    rT.current,
        ...override,
      });
    } catch(e) { console.error("saveProf", e); }
  }, [user]); // eslint-disable-line

  // ── setters that also persist ──
  const setHabits  = v => { setHabitsS(v);   saveProf({habits:v});       };
  const setGoals   = v => { setGoalsS(v);    saveProf({goals:v});        };
  const setScPool  = v => { setScPoolS(v);   saveProf({selfCarePool:v}); };
  const setWeights = v => { setWeightsS(v);  saveProf({weights:v});      };
  const setBigGoals= v => { setBigGoalsS(v); };
  // save bigGoals + trophies whenever they change
  const bigGoalsRef = useRef(false);
  useEffect(() => {
    if (!bigGoalsRef.current) { bigGoalsRef.current=true; return; }
    saveProf({ bigGoals });
  }, [bigGoals]); // eslint-disable-line
  const trophiesRef = useRef(false);
  useEffect(() => {
    if (!trophiesRef.current) { trophiesRef.current=true; return; }
    saveProf({ trophies });
  }, [trophies]); // eslint-disable-line
  const setNotif   = v => { setNotifS(v);    saveProf({notif:v});        };

  // ── auto-detect completed goals → trigger celebration ──
  useEffect(() => {
    bigGoals.forEach(g => {
      if (g.celebrated) return;
      const progress = g.linkedHabit
        ? (g.goalType === "streak"
            ? (g.streakDays || 0) + (meetsThreshold(log, g.linkedHabit, g.threshold) ? 1 : 0)
            : (g.accumulatedProgress || 0) + habitValue(log, g.linkedHabit))
        : (g.accumulatedProgress || 0);
      if (progress >= (g.target || 1)) {
        const t = setTimeout(() => {
          // Mark goal as celebrated
          setBigGoals(prev => prev.map(x => x.id===g.id ? {...x, celebrated:true} : x));
          // Add trophy
          const newT = { id:Date.now()+g.id, name:g.name, target:g.target, unit:g.unit, period:g.period, completedAt:new Date().toISOString() };
          setTrophies(prev => [newT, ...prev]);
          setNewTrophyIds(prev => [...prev, newT.id]);
          setCelebGoal(g);
        }, 500);
        return () => clearTimeout(t);
      }
    });
  }, [bigGoals, log]); // eslint-disable-line

  // ── load today's log ──
  useEffect(() => {
    if (!user) return;
    loadTodayLog(user.uid).then(data => {
      if (data) { const {updatedAt,...rest}=data; setLog({...EMPTY_LOG,...rest}); }
    }).catch(e => console.error("loadLog", e));
  }, [user]);

  // ── save log (debounced) ──
  const saveLog = useCallback((nl) => {
    if (!user) return;
    clearTimeout(logTimer.current);
    logTimer.current = setTimeout(() => saveTodayLog(user.uid, nl).catch(e=>console.error("saveLog",e)), 1200);
  }, [user]);

  // ── notifications ──
  useEffect(() => { if (notif?.enabled) scheduleNotifications(notif); }, [notif]);

  // ── helpers ──
  const update   = (k,v) => setLog(p => { const n={...p,[k]:v}; saveLog(n); return n; });
  const togSC    = it => update("selfCare", log.selfCare.includes(it)?log.selfCare.filter(s=>s!==it):[...log.selfCare,it]);
  const fmt      = m => { if(!m)return"0m"; const h=Math.floor(m/60),mn=m%60; return h>0?`${h}h${mn>0?` ${mn}m`:""}`:mn+"m"; };
  const score    = calcScore(log, habits, goals, weights);
  const scoreLabel = score>=85?"glowing ✨":score>=65?"on track 🌿":score>=40?"building habits 🌸":score>=15?"starting fresh 🌱":"let's begin 🤍";
  const G = goals;

  const sweetHint = {0:"no sweets — glowing 🌿",1:"one treat — balance 🌸",2:"two treats — c'est la vie",3:"three treats — sweet tooth showing",4:"four+ — tomorrow is a new day ✨"};
  const foodHint  = {1:"absolutely nourishing 🌿",2:"pretty good — balanced 🥗",3:"okay-ish",4:"comfort food day 🍕",5:"damage control tomorrow ✨"};

  // ── styles ──
  const S = {
    app:  { minHeight:"100vh", background:"linear-gradient(155deg,#faf8f3 0%,#f0ebe0 50%,#e9f0e9 100%)", fontFamily:"'Cormorant Garamond',Georgia,serif", color:"#3d3530", paddingBottom:84 },
    sec:  { margin:"0 16px 11px", background:"rgba(255,255,255,.58)", borderRadius:16, padding:"15px 17px", boxShadow:"0 2px 12px rgba(139,119,95,.07)" },
    ttl:  { fontSize:9, letterSpacing:"3px", textTransform:"uppercase", color:"#8b7763", marginBottom:12 },
    iRow: { display:"flex", alignItems:"center", gap:10, marginBottom:7 },
    lbl:  { fontSize:12, color:"#5c4f42", minWidth:68, fontStyle:"italic" },
    inp:  { flex:1, padding:"7px 11px", borderRadius:10, border:"1.5px solid rgba(139,119,95,.18)", background:"rgba(255,255,255,.7)", fontFamily:"inherit", fontSize:14, color:"#3d3530", outline:"none" },
    bar:  { height:5, borderRadius:3, background:"rgba(139,119,95,.08)", marginTop:5, overflow:"hidden" },
    fill: (p,c) => ({ height:"100%", width:Math.min(p||0,100)+"%", background:c||"linear-gradient(90deg,#8ab890,#5a7a5a)", borderRadius:3, transition:"width .7s cubic-bezier(.4,0,.2,1)" }),
    hint: { fontSize:11, color:"#8b7763", marginTop:3, fontStyle:"italic" },
    tog:  a => ({ padding:"7px 17px", borderRadius:18, border:"1.5px solid "+(a?"#5a7a5a":"rgba(139,119,95,.22)"), background:a?"linear-gradient(135deg,#8ab890,#5a7a5a)":"transparent", color:a?"#fff":"#8b7763", fontSize:12, cursor:"pointer", fontFamily:"inherit" }),
    scG:  { display:"grid", gridTemplateColumns:"1fr 1fr", gap:7 },
    scI:  a => ({ padding:"9px 10px", borderRadius:11, border:"1.5px solid "+(a?"#8ab890":"rgba(139,119,95,.14)"), background:a?"rgba(138,184,144,.1)":"rgba(255,255,255,.4)", fontSize:12, cursor:"pointer", textAlign:"center", color:a?"#4a6e4a":"#8b7763" }),
    mood: a => ({ padding:"7px 13px", borderRadius:17, border:"1.5px solid "+(a?"#c4a882":"rgba(139,119,95,.14)"), background:a?"rgba(196,168,130,.12)":"transparent", fontSize:12, cursor:"pointer", color:a?"#8b6b3d":"#8b7763", fontFamily:"inherit" }),
    glass:f => ({ width:23, height:29, borderRadius:"3px 3px 5px 5px", background:f?"linear-gradient(180deg,#a8d4e6,#7bbcd4)":"rgba(139,119,95,.07)", border:"1.5px solid "+(f?"#7bbcd4":"rgba(139,119,95,.14)"), cursor:"pointer" }),
    tab:  a => ({ padding:"10px 11px", fontSize:9, letterSpacing:"1.8px", textTransform:"uppercase", border:"none", background:"none", cursor:"pointer", color:a?"#5a7a5a":"#a89880", borderBottom:a?"2px solid #5a7a5a":"2px solid transparent", fontFamily:"inherit", whiteSpace:"nowrap" }),
    sCard:c => ({ background:c, borderRadius:13, padding:"12px 14px", border:"1px solid rgba(139,119,95,.08)" }),
    scale:a => ({ flex:1, padding:"8px 0", borderRadius:10, border:"1.5px solid "+(a?"#c4a882":"rgba(139,119,95,.13)"), background:a?"rgba(196,168,130,.11)":"transparent", cursor:"pointer", fontSize:14, color:a?"#8b6b3d":"#8b7763", fontFamily:"inherit", display:"flex", flexDirection:"column", alignItems:"center", gap:2 }),
  };

  return (
    <div style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet"/>
      <style>{`@keyframes dotPulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(138,184,144,.6)}60%{transform:scale(1.2);box-shadow:0 0 0 5px rgba(138,184,144,0)}}`}</style>
      {menuOpen && <div onClick={()=>setMenuOpen(false)} style={{ position:"fixed", inset:0, zIndex:50 }}/>}

      {/* HEADER */}
      <div style={{ padding:"18px 18px 10px", textAlign:"center", borderBottom:"1px solid rgba(139,119,95,.1)", position:"relative" }}>
        <div style={{ position:"absolute", top:15, right:15, zIndex:60 }}>
          <button onClick={()=>setMenuOpen(p=>!p)} style={{ background:"rgba(255,255,255,.72)", border:"1.5px solid rgba(139,119,95,.17)", borderRadius:11, padding:"7px 11px", cursor:"pointer", fontSize:14, lineHeight:1, backdropFilter:"blur(8px)", position:"relative" }}>
            ☰
            {newTrophyIds.length>0 && <div style={{ position:"absolute", top:-5, right:-5, width:11, height:11, borderRadius:"50%", background:"#8ab890", border:"2.5px solid #faf8f3", animation:"dotPulse 1.8s ease-in-out infinite" }}/>}
          </button>
          {menuOpen && (
            <div style={{ position:"absolute", right:0, top:40, background:"rgba(252,250,246,.98)", borderRadius:14, boxShadow:"0 8px 28px rgba(139,119,95,.14)", border:"1.5px solid rgba(139,119,95,.1)", padding:7, minWidth:155, zIndex:100 }}>
              {[["history","📓  history"],["trophies","🏆  trophies"],["settings","⚙️  settings"]].map(([id,lbl])=>(
                <button key={id} onClick={()=>{ if(id==="trophies"){ setActiveTab("trophies"); setNewTrophyIds([]); } else setActiveTab(id); setMenuOpen(false); }} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", padding:"10px 13px", borderRadius:10, border:"none", background:activeTab===id?"rgba(138,184,144,.1)":"transparent", color:"#5c4f42", fontSize:13, cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}>
                  <span>{lbl}</span>
                  {id==="trophies"&&newTrophyIds.length>0&&<span style={{ width:19, height:19, borderRadius:"50%", background:"#8ab890", color:"white", fontSize:10, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"sans-serif" }}>{newTrophyIds.length}</span>}
                </button>
              ))}
              <div style={{ margin:"5px 0", borderTop:"1px solid rgba(139,119,95,.09)" }}/>
              <button onClick={onSignOut} style={{ display:"block", width:"100%", padding:"8px 13px", borderRadius:10, border:"none", background:"transparent", color:"#c47a7a", fontSize:12, cursor:"pointer", fontFamily:"inherit", textAlign:"left", fontStyle:"italic" }}>sign out</button>
            </div>
          )}
        </div>
        <div style={{ fontSize:9, letterSpacing:"3px", textTransform:"uppercase", color:"#8b7763", marginBottom:3 }}>{new Date().toLocaleDateString("en-US",{weekday:"long",day:"numeric",month:"long"})}</div>
        <h1 style={{ fontSize:27, fontWeight:300, color:"#3d3530", margin:"0 0 1px", letterSpacing:.5 }}>wellness</h1>
        <p style={{ fontSize:12, color:"#a89880", fontStyle:"italic", margin:0 }}>your daily ritual</p>
        <Blob score={score}/>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", margin:"6px auto 0" }}>
          <div style={{ position:"relative", width:64, height:64 }}>
            <svg width="64" height="64" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(139,119,95,.1)" strokeWidth="4"/>
              <circle cx="32" cy="32" r="26" fill="none" stroke="url(#sg)" strokeWidth="4" strokeLinecap="round"
                strokeDasharray={`${(score/100)*(2*Math.PI*26)} ${2*Math.PI*26}`}
                transform="rotate(-90 32 32)" style={{transition:"stroke-dasharray 1s"}}/>
              <defs><linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#8ab890"/><stop offset="100%" stopColor="#5a7a5a"/></linearGradient></defs>
            </svg>
            <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", fontSize:16, fontWeight:300, color:"#5a7a5a" }}>{score}</div>
          </div>
          <div style={{ fontSize:11, color:"#8b7763", fontStyle:"italic", marginTop:2 }}>{scoreLabel}</div>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display:"flex", justifyContent:"center", borderBottom:"1px solid rgba(139,119,95,.12)", marginBottom:14 }}>
        {[["today","today"],["stats","summary"],["goals","goals"]].map(([id,lbl])=>(
          <button key={id} style={S.tab(activeTab===id)} onClick={()=>setActiveTab(id)}>{lbl}</button>
        ))}
      </div>

      {/* TODAY */}
      {activeTab==="today" && <>
        {habits.includes("water")&&<div style={S.sec}>
          <div style={S.ttl}>💧 water</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{Array.from({length:Math.min(G.water||8,14)}).map((_,i)=><div key={i} style={S.glass(i<log.water)} onClick={()=>update("water",i<log.water?log.water-1:log.water+1)}/>)}</div>
          <div style={S.bar}><div style={S.fill((log.water/(G.water||8))*100,"linear-gradient(90deg,#a8d4e6,#7bbcd4)")}/></div>
          <div style={S.hint}>{log.water}/{G.water||8} glasses {log.water>=(G.water||8)?"· goal reached ✓":`· ${(G.water||8)-log.water} more`}</div>
        </div>}

        {habits.includes("steps")&&<div style={S.sec}>
          <div style={S.ttl}>🌿 steps</div>
          <div style={S.iRow}><span style={S.lbl}>today</span><input type="number" placeholder="0" value={log.steps||""} onChange={e=>update("steps",+e.target.value)} style={S.inp}/></div>
          <div style={S.bar}><div style={S.fill(((log.steps||0)/(G.steps||10000))*100)}/></div>
          <div style={S.hint}>{(log.steps||0).toLocaleString()} / {(G.steps||10000).toLocaleString()}</div>
        </div>}

        {habits.includes("workout")&&<div style={S.sec}>
          <div style={S.ttl}>💪 workout</div>
          <button style={S.tog(log.workout)} onClick={()=>update("workout",!log.workout)}>{log.workout?"done ✓":"not yet"}</button>
          {log.workout&&<WorkoutTags types={log.workoutTypes||[]} onChange={v=>update("workoutTypes",v)}/>}
        </div>}

        {habits.includes("running")&&<div style={S.sec}>
          <div style={S.ttl}>🏃 running</div>
          <div style={S.iRow}><span style={S.lbl}>distance</span><input type="number" step="0.1" placeholder="0" value={log.runKm||""} onChange={e=>update("runKm",+e.target.value)} style={{...S.inp,maxWidth:88}}/><span style={S.hint}>km</span></div>
          <div style={S.bar}><div style={S.fill(((log.runKm||0)/(G.running||5))*100,"linear-gradient(90deg,#a8c4e6,#6a8ed4)")}/></div>
          <div style={S.iRow}><span style={S.lbl}>duration</span><input type="text" placeholder="e.g. 35 min" value={log.runDuration||""} onChange={e=>update("runDuration",e.target.value)} style={S.inp}/></div>
          <div style={{display:"flex",gap:5,marginTop:8,flexWrap:"wrap"}}>{RUN_FEEL.map(f=><button key={f} onClick={()=>update("runFeel",log.runFeel===f?"":f)} style={{padding:"5px 10px",borderRadius:13,border:"1.5px solid "+(log.runFeel===f?"#8ab890":"rgba(139,119,95,.14)"),background:log.runFeel===f?"rgba(138,184,144,.11)":"transparent",fontSize:11,color:log.runFeel===f?"#4a6e4a":"#8b7763",cursor:"pointer",fontFamily:"inherit"}}>{f}</button>)}</div>
        </div>}

        {habits.includes("sleep")&&<div style={S.sec}>
          <div style={S.ttl}>🌙 sleep</div>
          <div style={S.iRow}><span style={S.lbl}>hours</span><input type="number" step="0.5" placeholder="0" value={log.sleep||""} onChange={e=>update("sleep",+e.target.value)} style={{...S.inp,maxWidth:88}}/><span style={S.hint}>{log.sleep||0}h / {G.sleep||8}h</span></div>
          <div style={S.bar}><div style={S.fill(((log.sleep||0)/(G.sleep||8))*100,"linear-gradient(90deg,#b8c4e8,#8a9ed4)")}/></div>
          <div style={S.hint}>{!log.sleep?"log last night's sleep 😴":log.sleep<6?"that's rough 🌙":log.sleep>=(G.sleep||8)?"beautifully rested ✨":"pretty good 🌿"}</div>
        </div>}

        {habits.includes("learning")&&<div style={S.sec}>
          <div style={S.ttl}>📚 learning</div>
          <div style={S.iRow}><span style={S.lbl}>time</span><input type="number" placeholder="min" value={log.learningTime||""} onChange={e=>update("learningTime",+e.target.value)} style={{...S.inp,maxWidth:88}}/><span style={S.hint}>{fmt(log.learningTime)} / {fmt(G.learning||60)}</span></div>
          <div style={S.bar}><div style={S.fill(((log.learningTime||0)/(G.learning||60))*100,"linear-gradient(90deg,#c4d4a8,#8ab890)")}/></div>
          <div style={{display:"flex",gap:4,marginTop:10}}>{[1,2,3,4,5,6,7,8,9,10].map(n=><div key={n} onClick={()=>update("learningProductivity",(log.learningProductivity||0)===n?0:n)} style={{flex:1,height:8,borderRadius:2,background:(log.learningProductivity||0)>=n?"#8ab890":"rgba(139,119,95,.1)",cursor:"pointer"}}/>)}</div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:2}}><span style={{fontSize:9,color:"#b5a898"}}>distracted</span><span style={{fontSize:9,color:"#b5a898"}}>in the zone</span></div>
        </div>}

        {habits.includes("reading")&&<div style={S.sec}>
          <div style={S.ttl}>📖 reading</div>
          <div style={S.iRow}><span style={S.lbl}>pages</span><input type="number" placeholder="0" value={log.readingPages||""} onChange={e=>update("readingPages",+e.target.value)} style={{...S.inp,maxWidth:88}}/><span style={S.hint}>{log.readingPages||0} / {G.reading||20} pages</span></div>
          <div style={S.bar}><div style={S.fill(((log.readingPages||0)/(G.reading||20))*100,"linear-gradient(90deg,#d4c4e8,#9a7ab8)")}/></div>
          <div style={S.hint}>{!log.readingPages?"pick up your book 📖":log.readingPages>=(G.reading||20)?"goal reached ✓":`${(G.reading||20)-(log.readingPages||0)} pages to go`}</div>
        </div>}

        {habits.includes("sweets")&&<div style={S.sec}>
          <div style={S.ttl}>🍫 sweets</div>
          <div style={{display:"flex",gap:7}}>{[0,1,2,3,4].map(n=><button key={n} onClick={()=>update("sweets",log.sweets===n?null:n)} style={{width:36,height:36,borderRadius:"50%",border:"1.5px solid "+(log.sweets===n?"#c4a882":"rgba(139,119,95,.14)"),background:log.sweets===n?"rgba(196,168,130,.14)":"transparent",cursor:"pointer",fontSize:12,color:log.sweets===n?"#8b6b3d":"#8b7763",fontFamily:"inherit"}}>{n===4?"4+":n}</button>)}</div>
          <div style={{...S.hint,marginTop:7,fontSize:12,color:"#8b6b3d"}}>{log.sweets===null?"tap to log today's sweets":sweetHint[Math.min(log.sweets,4)]}</div>
        </div>}

        {habits.includes("food")&&<div style={S.sec}>
          <div style={S.ttl}>🥗 food quality</div>
          <div style={{display:"flex",gap:6}}>{[1,2,3,4,5].map(n=><button key={n} onClick={()=>update("foodQuality",log.foodQuality===n?null:n)} style={S.scale(log.foodQuality===n)}><span>{["🌿","🙂","😐","😕","😩"][n-1]}</span><span style={{fontSize:9}}>{["great","good","ok","meh","bad"][n-1]}</span></button>)}</div>
          <div style={{...S.hint,marginTop:7,fontSize:12,color:"#8b6b3d"}}>{log.foodQuality===null?"rate how you ate today":foodHint[log.foodQuality]}</div>
        </div>}

        {habits.includes("screenTime")&&<div style={S.sec}>
          <div style={S.ttl}>📱 screen time</div>
          <div style={S.iRow}><span style={S.lbl}>total</span><input type="number" placeholder="min" value={log.screenTime||""} onChange={e=>update("screenTime",+e.target.value)} style={{...S.inp,maxWidth:88}}/><span style={S.hint}>{fmt(log.screenTime)}</span></div>
          <div style={S.iRow}><span style={S.lbl}>social media</span><input type="number" placeholder="min" value={log.socialMedia||""} onChange={e=>update("socialMedia",+e.target.value)} style={{...S.inp,maxWidth:88}}/><span style={S.hint}>{fmt(log.socialMedia)}</span></div>
          <div style={S.hint}>score: ≤60 min social = full points</div>
        </div>}

        {habits.includes("selfCare")&&<div style={S.sec}>
          <div style={S.ttl}>🌸 self care</div>
          <div style={S.scG}>{scPool.map(it=><div key={it} style={S.scI(log.selfCare?.includes(it))} onClick={()=>togSC(it)}>{it}</div>)}</div>
        </div>}

        {habits.includes("mood")&&<div style={S.sec}>
          <div style={S.ttl}>💫 mood</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:7}}>{MOOD_OPTIONS.map(m=><button key={m} style={S.mood(log.mood===m)} onClick={()=>update("mood",log.mood===m?"":m)}>{m}</button>)}</div>
        </div>}
      </>}

      {/* SUMMARY */}
      {activeTab==="stats"&&<div style={S.sec}>
        <div style={S.ttl}>✨ today at a glance</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:13}}>
          {[
            habits.includes("water")      &&{l:"water",    v:`${log.water} glasses`,        c:"rgba(168,212,230,.16)"},
            habits.includes("steps")      &&{l:"steps",    v:(log.steps||0).toLocaleString(),c:"rgba(138,184,144,.16)"},
            habits.includes("sleep")      &&{l:"sleep",    v:`${log.sleep||0}h`,             c:"rgba(184,196,232,.16)"},
            habits.includes("learning")   &&{l:"learning", v:fmt(log.learningTime),           c:"rgba(196,218,168,.16)"},
            habits.includes("reading")    &&{l:"reading",  v:`${log.readingPages||0} pages`,  c:"rgba(212,196,232,.16)"},
            habits.includes("running")    &&{l:"running",  v:`${log.runKm||0} km`,            c:"rgba(168,196,230,.16)"},
            habits.includes("screenTime") &&{l:"screen",   v:fmt(log.screenTime),             c:"rgba(212,168,184,.16)"},
            habits.includes("selfCare")   &&{l:"self care",v:`${log.selfCare?.length||0} rituals`,c:"rgba(232,218,196,.16)"},
          ].filter(Boolean).map(({l,v,c})=>(
            <div key={l} style={S.sCard(c)}>
              <div style={{fontSize:18,fontWeight:300,color:"#5a7a5a",lineHeight:1}}>{v}</div>
              <div style={{fontSize:9,letterSpacing:"2px",textTransform:"uppercase",color:"#8b7763",marginTop:3}}>{l}</div>
            </div>
          ))}
        </div>
        {log.workout&&log.workoutTypes?.length>0&&<div style={{padding:"8px 13px",background:"rgba(138,184,144,.09)",borderRadius:10,fontSize:12,color:"#5a7a5a",fontStyle:"italic",marginBottom:8}}>💪 {log.workoutTypes.join(", ")} ✓</div>}
        {log.runKm>0&&<div style={{padding:"8px 13px",background:"rgba(168,196,230,.09)",borderRadius:10,fontSize:12,color:"#5a7a5a",fontStyle:"italic",marginBottom:8}}>🏃 {log.runKm}km{log.runDuration?` · ${log.runDuration}`:""}{log.runFeel?` · ${log.runFeel}`:""}</div>}
        {log.mood&&<div style={{textAlign:"center",fontSize:14,color:"#8b7763",fontStyle:"italic",marginBottom:9}}>{log.mood}</div>}
        {log.selfCare?.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:11}}>{log.selfCare.map(s=><span key={s} style={{padding:"3px 9px",borderRadius:10,background:"rgba(138,184,144,.1)",border:"1px solid rgba(90,122,90,.13)",fontSize:11,color:"#4a6e4a"}}>{s}</span>)}</div>}
        <div style={{borderTop:"1px solid rgba(139,119,95,.1)",paddingTop:13,textAlign:"center"}}>
          <div style={{fontSize:44,fontWeight:300,color:"#5a7a5a",lineHeight:1}}>{score}</div>
          <div style={{fontSize:12,color:"#8b7763",fontStyle:"italic",marginTop:3}}>{scoreLabel}</div>
          <div style={{height:5,borderRadius:3,background:"rgba(139,119,95,.08)",overflow:"hidden",marginTop:9}}><div style={{height:"100%",width:score+"%",background:"linear-gradient(90deg,#8ab890,#5a7a5a)",borderRadius:3,transition:"width .8s"}}/></div>
        </div>
      </div>}

      {activeTab==="goals"   && <GoalsTab goals={bigGoals} setGoals={setBigGoals} log={log} habits={habits}/>}
      {activeTab==="history" && <div style={S.sec}><div style={S.ttl}>📓 history</div><div style={{textAlign:"center",padding:28,color:"#8b7763",fontStyle:"italic"}}>your journey starts today 🌱</div></div>}
      {activeTab==="trophies" && <TrophiesTab trophies={trophies} newIds={newTrophyIds}/>}
      {celebGoal && <CelebrationPopup goal={celebGoal} onClose={()=>setCelebGoal(null)}/>}
      {activeTab==="settings"&& <SettingsTab habits={habits} setHabits={setHabits} goals={goals} setGoals={setGoals} selfCarePool={scPool} setSelfCarePool={setScPool} weights={weights} setWeights={setWeights} notif={notif} setNotif={setNotif} onSignOut={onSignOut}/>}

      {/* BOTTOM NAV */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(250,248,243,.96)",backdropFilter:"blur(12px)",borderTop:"1px solid rgba(139,119,95,.09)",display:"flex",justifyContent:"center",padding:"5px 0 10px"}}>
        {[["today","🌿","today"],["stats","✨","summary"],["goals","🎯","goals"]].map(([id,icon,lbl])=>(
          <button key={id} onClick={()=>setActiveTab(id)} style={{background:"none",border:"none",cursor:"pointer",padding:"5px 20px",display:"flex",flexDirection:"column",alignItems:"center",gap:2,fontFamily:"inherit"}}>
            <span style={{fontSize:16}}>{icon}</span>
            <span style={{fontSize:8,letterSpacing:"1.5px",textTransform:"uppercase",color:activeTab===id?"#5a7a5a":"#a89880"}}>{lbl}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────
export default function Root() {
  const [user,    setUser]    = useState(undefined);
  const [profile, setProfile] = useState(undefined);

  useEffect(() => {
    return onAuthStateChanged(auth, async u => {
      setUser(u||null);
      if (u) {
        try {
          const prof = await loadProfile(u.uid);
          setProfile(prof?.habits ? prof : null);
        } catch(e) { console.error("loadProfile",e); setProfile(null); }
      } else {
        setProfile(null);
      }
    });
  }, []);

  const handleDone = async prof => {
    try { if (auth.currentUser) await saveProfile(auth.currentUser.uid, prof); } catch(e) { console.error("saveProfile",e); }
    setProfile(prof);
  };

  const handleSignOut = async () => {
    try { await signOut(auth); } catch(e) {}
    setUser(null); setProfile(null);
  };

  if (user===undefined||profile===undefined) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(155deg,#faf8f3,#f0ebe0,#e9f0e9)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Georgia,serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:12,animation:"pulse 2s ease-in-out infinite"}}>🌿</div>
        <div style={{fontSize:13,color:"#8b7763",fontStyle:"italic"}}>loading...</div>
        <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}`}</style>
      </div>
    </div>
  );

  if (!user)    return <AuthScreen/>;
  if (!profile) return <Onboarding onDone={handleDone}/>;
  return <MainApp profile={profile} user={user} onSignOut={handleSignOut}/>;
}
