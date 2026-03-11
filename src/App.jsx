import { useState, useRef, useEffect, useCallback } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { loadTodayLog, saveTodayLog, loadProfile, saveProfile } from "./db";
import AuthScreen from "./AuthScreen";

// ── CONSTANTS ──────────────────────────────────────────────────
const ALL_HABITS = [
  { id:"water",      label:"water",        emoji:"💧", desc:"daily hydration",      unit:"glasses", goalKey:"water" },
  { id:"steps",      label:"steps",        emoji:"🌿", desc:"movement & walking",   unit:"steps",   goalKey:"steps" },
  { id:"workout",    label:"workout",      emoji:"💪", desc:"exercise sessions",    unit:"sessions",goalKey:null },
  { id:"running",    label:"running",      emoji:"🏃", desc:"track your runs",      unit:"km",      goalKey:"running" },
  { id:"sleep",      label:"sleep",        emoji:"🌙", desc:"rest & recovery",      unit:"hours",   goalKey:"sleep" },
  { id:"learning",   label:"learning",     emoji:"📚", desc:"study & courses",      unit:"min",     goalKey:"learning" },
  { id:"reading",    label:"reading",      emoji:"📖", desc:"books & articles",     unit:"pages",   goalKey:"reading" },
  { id:"sweets",     label:"sweets",       emoji:"🍫", desc:"sugar intake",         unit:"treats",  goalKey:null },
  { id:"food",       label:"food quality", emoji:"🥗", desc:"how well did you eat?",unit:"/5",      goalKey:null },
  { id:"screenTime", label:"screen time",  emoji:"📱", desc:"digital wellness",     unit:"min",     goalKey:"screenTime" },
  { id:"selfCare",   label:"self care",    emoji:"🌸", desc:"rituals & routines",   unit:"rituals", goalKey:null },
  { id:"mood",       label:"mood",         emoji:"💫", desc:"emotional check-in",   unit:null,      goalKey:null },
];

const ALL_SELFCARE = [
  "skincare 🧴","journaling 📓","running 🏃","meditation 🧘","stretching 🤸",
  "walk outside 🌿","cooking healthy 🥗","nails 💅","tidying up 🧹",
  "friends 👯","creative hobby 🎨","morning routine 🌞","self massage 💆",
  "bath 🛁","reading 📖","yoga 🌙","cold shower 🚿","gratitude 🙏",
];

const MOOD_OPTIONS = ["✨ glowing","💪 strong","🔥 motivated","🌙 calm","😴 tired","😔 sad","😤 stressed"];
const RUN_FEEL = ["😩 tough","😐 okay","🙂 good","😊 great","🔥 amazing"];
const DEFAULT_GOALS = { water:8, steps:10000, sleep:8, learning:60, reading:20, screenTime:120, running:5 };
const DEFAULT_WEIGHTS = { water:7, steps:6, workout:7, running:6, sleep:9, learning:6, reading:5, sweets:5, food:5, screenTime:4, selfCare:6 };

// ── SCORE (weight-based) ───────────────────────────────────────
function calcScore(log, habits, goals, weights) {
  const scorable = habits.filter(h => h !== "mood");
  if (scorable.length === 0) return 0;

  let earned = 0, totalW = 0;

  const add = (habitId, achievement) => {
    const w = weights[habitId] ?? 5;
    earned += Math.min(achievement, 1) * w;
    totalW += w;
  };

  if (habits.includes("water") && log.water > 0)
    add("water", log.water / (goals.water || 8));
  else if (habits.includes("water")) { totalW += weights.water ?? 5; }

  if (habits.includes("steps") && log.steps > 0)
    add("steps", log.steps / (goals.steps || 10000));
  else if (habits.includes("steps")) { totalW += weights.steps ?? 5; }

  if (habits.includes("workout")) add("workout", log.workout ? 1 : 0);

  if (habits.includes("running") && log.runKm > 0)
    add("running", log.runKm / (goals.running || 5));
  else if (habits.includes("running")) { totalW += weights.running ?? 5; }

  if (habits.includes("sleep") && log.sleep > 0)
    add("sleep", log.sleep / (goals.sleep || 8));
  else if (habits.includes("sleep")) { totalW += weights.sleep ?? 5; }

  if (habits.includes("learning") && log.learningTime > 0)
    add("learning", (log.learningTime / (goals.learning || 60)) * (0.5 + ((log.learningProductivity||5)/10)*0.5));
  else if (habits.includes("learning")) { totalW += weights.learning ?? 5; }

  if (habits.includes("reading") && log.readingPages > 0)
    add("reading", log.readingPages / (goals.reading || 20));
  else if (habits.includes("reading")) { totalW += weights.reading ?? 5; }

  if (habits.includes("sweets") && log.sweets !== null)
    add("sweets", Math.max(0, 1 - log.sweets / 4));
  else if (habits.includes("sweets")) { totalW += weights.sweets ?? 5; }

  if (habits.includes("food") && log.foodQuality !== null)
    add("food", log.foodQuality / 5);
  else if (habits.includes("food")) { totalW += weights.food ?? 5; }

  if (habits.includes("screenTime") && log.screenTime > 0)
    add("screenTime", Math.max(0, 1 - Math.max(0, (log.screenTime/60 - 2)/3)));
  else if (habits.includes("screenTime")) { totalW += weights.screenTime ?? 5; }

  if (habits.includes("selfCare") && (log.selfCare?.length||0) > 0)
    add("selfCare", Math.min((log.selfCare?.length||0)/3, 1));
  else if (habits.includes("selfCare")) { totalW += weights.selfCare ?? 5; }

  if (totalW === 0) return 0;
  return Math.min(Math.round((earned / totalW) * 100), 100);
}

// get today's logged value for a habit (for goal progress)
function getHabitValue(log, habitId) {
  switch(habitId) {
    case "water":      return log.water || 0;
    case "steps":      return log.steps || 0;
    case "workout":    return log.workout ? 1 : 0;
    case "running":    return log.runKm || 0;
    case "sleep":      return log.sleep || 0;
    case "learning":   return log.learningTime || 0;
    case "reading":    return log.readingPages || 0;
    case "screenTime": return log.screenTime || 0;
    case "selfCare":   return log.selfCare?.length || 0;
    default:           return 0;
  }
}

// ── BLOB ───────────────────────────────────────────────────────
function BlobCreature({ score }) {
  const [bounce, setBounce] = useState(false);
  const prev = useRef(score);
  useEffect(() => {
    if (score !== prev.current) { setBounce(true); setTimeout(()=>setBounce(false),700); prev.current=score; }
  }, [score]);

  // 0-10: beige neutral (no smile, no frown — blank/calm), 10-30: beige tiny smile
  // 30-55: light green gentle smile, 55-75: green happy+cheeks, 75-100: golden star eyes
  const cfg = score>=75
    ? {body:"#e8d5a0",stroke:"#c4a860",aura:"rgba(255,215,100,0.32)",face:"glowing"}
    : score>=55
    ? {body:"#c8e0c0",stroke:"#6a9e70",aura:"rgba(140,200,150,0.28)",face:"happy"}
    : score>=30
    ? {body:"#d8e8d0",stroke:"#8ab890",aura:"rgba(160,210,165,0.2)",face:"gentle"}
    : score>=10
    ? {body:"#e8e0d0",stroke:"#b8a888",aura:"rgba(200,190,170,0.16)",face:"neutral"}
    : {body:"#e8e0d4",stroke:"#b8a888",aura:"rgba(200,185,170,0.12)",face:"blank"};

  const {body,stroke,aura,face} = cfg;

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"4px 0 0"}}>
      <style>{`
        @keyframes bf{0%,100%{transform:translateY(0)}45%{transform:translateY(-8px)}75%{transform:translateY(-3px)}}
        @keyframes bi{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
        @keyframes bb{0%{transform:scale(1)}35%{transform:scale(1.12,0.88)}65%{transform:scale(0.94,1.06)}100%{transform:scale(1)}}
        @keyframes ap{0%,100%{transform:scale(1);opacity:.68}50%{transform:scale(1.06);opacity:1}}
      `}</style>
      <div style={{position:"relative",width:"108px",height:"108px",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{position:"absolute",width:"98px",height:"98px",borderRadius:"50%",background:`radial-gradient(circle,${aura} 0%,transparent 72%)`,animation:"ap 3.2s ease-in-out infinite"}}/>
        <div style={{animation:bounce?"bb 0.65s ease":score>=55?"bf 3s ease-in-out infinite":"bi 4s ease-in-out infinite"}}>
          <svg width="70" height="70" viewBox="0 0 84 84">
            <defs>
              <radialGradient id="bg5" cx="36%" cy="30%" r="65%">
                <stop offset="0%" stopColor="white" stopOpacity="0.5"/>
                <stop offset="100%" stopColor={body}/>
              </radialGradient>
            </defs>
            <path d="M42 12 C58 10,72 22,73 41 C74 60,61 73,43 75 C25 77,10 64,10 46 C10 28,24 14,42 12Z" fill="url(#bg5)" stroke={stroke} strokeWidth="1.5"/>

            {face==="glowing"&&<>
              <text x="30" y="46" fontSize="12" textAnchor="middle" fill={stroke}>✦</text>
              <text x="54" y="46" fontSize="12" textAnchor="middle" fill={stroke}>✦</text>
              <ellipse cx="20" cy="50" rx="7" ry="3.5" fill="rgba(230,155,165,0.22)"/>
              <ellipse cx="64" cy="50" rx="7" ry="3.5" fill="rgba(230,155,165,0.22)"/>
              <path d="M30 58 Q42 67 54 58" stroke={stroke} strokeWidth="2.2" fill="none" strokeLinecap="round"/>
            </>}
            {face==="happy"&&<>
              <ellipse cx="30" cy="40" rx="4.5" ry="4.5" fill={stroke}/>
              <ellipse cx="28.8" cy="38.2" rx="1.6" ry="1.6" fill="white" opacity="0.7"/>
              <ellipse cx="54" cy="40" rx="4.5" ry="4.5" fill={stroke}/>
              <ellipse cx="52.8" cy="38.2" rx="1.6" ry="1.6" fill="white" opacity="0.7"/>
              <ellipse cx="21" cy="50" rx="6" ry="3.2" fill="rgba(230,155,165,0.2)"/>
              <ellipse cx="63" cy="50" rx="6" ry="3.2" fill="rgba(230,155,165,0.2)"/>
              <path d="M31 57 Q42 65 53 57" stroke={stroke} strokeWidth="2" fill="none" strokeLinecap="round"/>
            </>}
            {face==="gentle"&&<>
              <ellipse cx="30" cy="40" rx="4" ry="4" fill={stroke}/>
              <ellipse cx="29" cy="38.5" rx="1.4" ry="1.4" fill="white" opacity="0.65"/>
              <ellipse cx="54" cy="40" rx="4" ry="4" fill={stroke}/>
              <ellipse cx="53" cy="38.5" rx="1.4" ry="1.4" fill="white" opacity="0.65"/>
              <path d="M32 57 Q42 63 52 57" stroke={stroke} strokeWidth="1.8" fill="none" strokeLinecap="round"/>
            </>}
            {face==="neutral"&&<>
              <ellipse cx="30" cy="40" rx="3.8" ry="3.8" fill={stroke} opacity="0.85"/>
              <ellipse cx="29" cy="38.8" rx="1.3" ry="1.3" fill="white" opacity="0.6"/>
              <ellipse cx="54" cy="40" rx="3.8" ry="3.8" fill={stroke} opacity="0.85"/>
              <ellipse cx="53" cy="38.8" rx="1.3" ry="1.3" fill="white" opacity="0.6"/>
              <path d="M33 56 Q42 59 51 56" stroke={stroke} strokeWidth="1.4" fill="none" strokeLinecap="round"/>
            </>}
            {face==="blank"&&<>
              <ellipse cx="30" cy="41" rx="3.5" ry="3.5" fill={stroke} opacity="0.75"/>
              <ellipse cx="29.2" cy="39.8" rx="1.2" ry="1.2" fill="white" opacity="0.55"/>
              <ellipse cx="54" cy="41" rx="3.5" ry="3.5" fill={stroke} opacity="0.75"/>
              <ellipse cx="53.2" cy="39.8" rx="1.2" ry="1.2" fill="white" opacity="0.55"/>
              {/* straight line = neither happy nor sad */}
              <path d="M34 57 Q42 57 50 57" stroke={stroke} strokeWidth="1.4" fill="none" strokeLinecap="round"/>
            </>}
          </svg>
        </div>
      </div>
    </div>
  );
}

// ── WEIGHT SLIDER (dot-tap 1-10) ───────────────────────────────
function WeightSlider({ label, value, onChange }) {
  return (
    <div style={{marginBottom:"14px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
        <span style={{fontSize:"13px",color:"#3d3530"}}>{label}</span>
        <span style={{fontSize:"13px",fontWeight:"300",color:"#5a7a5a",minWidth:"18px",textAlign:"right"}}>{value}</span>
      </div>
      <div style={{display:"flex",gap:"5px",alignItems:"center"}}>
        {Array.from({length:10},(_,i)=>i+1).map(n=>(
          <div key={n} onClick={()=>onChange(n)}
            style={{flex:1,height:"8px",borderRadius:"2px",cursor:"pointer",
              background:n<=value?"linear-gradient(90deg,#8ab890,#5a7a5a)":"rgba(139,119,95,0.1)",
              transition:"background 0.15s",position:"relative"}}/>
        ))}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:"2px"}}>
        <span style={{fontSize:"9px",color:"#b5a898"}}>low</span>
        <span style={{fontSize:"9px",color:"#b5a898"}}>high</span>
      </div>
    </div>
  );
}

// ── ADD GOAL MODAL ─────────────────────────────────────────────
function AddGoalModal({ habits, onAdd, onClose, initial }) {
  const [name, setName]     = useState(initial?.name || "");
  const [target, setTarget] = useState(initial?.target?.toString() || "");
  const [unit, setUnit]     = useState(initial?.unit || "");
  const [period, setPeriod] = useState(initial?.period || "weekly");
  const [linkedHabit, setLinkedHabit] = useState(initial?.linkedHabit || "");

  const linkableHabits = habits.filter(h => {
    const hDef = ALL_HABITS.find(x=>x.id===h);
    return hDef && hDef.unit;
  });

  const handleLink = (hId) => {
    setLinkedHabit(hId);
    if (hId) {
      const hDef = ALL_HABITS.find(x=>x.id===hId);
      if (hDef?.unit) setUnit(hDef.unit);
    }
  };

  const submit = () => {
    if (!name.trim() || !target || isNaN(+target)) return;
    onAdd({ id: Date.now(), name: name.trim(), target: +target, unit: unit.trim()||"", period, linkedHabit, progress: 0 });
    onClose();
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(60,50,40,0.35)",zIndex:200,display:"flex",alignItems:"flex-end",backdropFilter:"blur(4px)"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{width:"100%",background:"#faf8f3",borderRadius:"22px 22px 0 0",padding:"28px 22px 40px",boxShadow:"0 -8px 32px rgba(139,119,95,0.18)"}}>
        <div style={{width:"36px",height:"3px",background:"rgba(139,119,95,0.2)",borderRadius:"2px",margin:"0 auto 22px"}}/>
        <h3 style={{fontSize:"18px",fontWeight:"300",color:"#3d3530",marginBottom:"18px"}}>{initial?"edit goal":"new goal"}</h3>

        <div style={{marginBottom:"13px"}}>
          <label style={{fontSize:"11px",letterSpacing:"2px",textTransform:"uppercase",color:"#8b7763",display:"block",marginBottom:"6px"}}>goal name</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. read 100 pages this month"
            style={{width:"100%",padding:"10px 13px",borderRadius:"11px",border:"1.5px solid rgba(139,119,95,0.2)",background:"rgba(255,255,255,0.8)",fontFamily:"inherit",fontSize:"14px",color:"#3d3530",outline:"none",boxSizing:"border-box"}}/>
        </div>

        <div style={{display:"flex",gap:"10px",marginBottom:"13px"}}>
          <div style={{flex:1}}>
            <label style={{fontSize:"11px",letterSpacing:"2px",textTransform:"uppercase",color:"#8b7763",display:"block",marginBottom:"6px"}}>target</label>
            <input type="number" value={target} onChange={e=>setTarget(e.target.value)} placeholder="100"
              style={{width:"100%",padding:"10px 13px",borderRadius:"11px",border:"1.5px solid rgba(139,119,95,0.2)",background:"rgba(255,255,255,0.8)",fontFamily:"inherit",fontSize:"14px",color:"#3d3530",outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div style={{flex:1}}>
            <label style={{fontSize:"11px",letterSpacing:"2px",textTransform:"uppercase",color:"#8b7763",display:"block",marginBottom:"6px"}}>unit</label>
            <input value={unit} onChange={e=>setUnit(e.target.value)} placeholder="pages, km..."
              style={{width:"100%",padding:"10px 13px",borderRadius:"11px",border:"1.5px solid rgba(139,119,95,0.2)",background:"rgba(255,255,255,0.8)",fontFamily:"inherit",fontSize:"14px",color:"#3d3530",outline:"none",boxSizing:"border-box"}}/>
          </div>
        </div>

        <div style={{marginBottom:"13px"}}>
          <label style={{fontSize:"11px",letterSpacing:"2px",textTransform:"uppercase",color:"#8b7763",display:"block",marginBottom:"6px"}}>period</label>
          <div style={{display:"flex",gap:"8px"}}>
            {["weekly","monthly"].map(p=>(
              <button key={p} onClick={()=>setPeriod(p)}
                style={{flex:1,padding:"9px",borderRadius:"11px",border:"1.5px solid "+(period===p?"#8ab890":"rgba(139,119,95,0.18)"),background:period===p?"rgba(138,184,144,0.1)":"transparent",color:period===p?"#4a6e4a":"#8b7763",fontSize:"13px",cursor:"pointer",fontFamily:"inherit"}}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div style={{marginBottom:"20px"}}>
          <label style={{fontSize:"11px",letterSpacing:"2px",textTransform:"uppercase",color:"#8b7763",display:"block",marginBottom:"6px"}}>link to habit (auto-tracks progress)</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:"7px"}}>
            <button onClick={()=>handleLink("")}
              style={{padding:"7px 12px",borderRadius:"14px",border:"1.5px solid "+(linkedHabit===""?"#c4a882":"rgba(139,119,95,0.15)"),background:linkedHabit===""?"rgba(196,168,130,0.1)":"transparent",fontSize:"12px",color:linkedHabit===""?"#8b6b3d":"#8b7763",cursor:"pointer",fontFamily:"inherit"}}>
              none (manual)
            </button>
            {linkableHabits.map(hId=>{
              const hDef = ALL_HABITS.find(x=>x.id===hId);
              return (
                <button key={hId} onClick={()=>handleLink(hId)}
                  style={{padding:"7px 12px",borderRadius:"14px",border:"1.5px solid "+(linkedHabit===hId?"#8ab890":"rgba(139,119,95,0.15)"),background:linkedHabit===hId?"rgba(138,184,144,0.1)":"transparent",fontSize:"12px",color:linkedHabit===hId?"#4a6e4a":"#8b7763",cursor:"pointer",fontFamily:"inherit"}}>
                  {hDef.emoji} {hDef.label}
                </button>
              );
            })}
          </div>
          {linkedHabit&&<p style={{fontSize:"11px",color:"#8b7763",fontStyle:"italic",marginTop:"5px",margin:"5px 0 0"}}>progress will update automatically from your daily log ✨</p>}
        </div>

        <button onClick={submit}
          style={{width:"100%",padding:"14px",borderRadius:"14px",border:"none",background:"linear-gradient(135deg,#8ab890,#5a7a5a)",color:"#fff",fontSize:"14px",cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(90,122,90,0.22)"}}>
          add goal ✨
        </button>
      </div>
    </div>
  );
}

// ── GOALS TAB ──────────────────────────────────────────────────
function GoalsTab({ goals, setGoals, log, habits }) {
  const [showModal,    setShowModal]   = useState(false);
  const [editGoal,     setEditGoal]    = useState(null);
  const [filter,       setFilter]      = useState("all");
  const [manualEdits,  setManualEdits] = useState({});

  const addGoal    = (goal)    => setGoals(p => [...p, goal]);
  const removeGoal = (id)      => setGoals(p => p.filter(g=>g.id!==id));
  const updateGoal = (updated) => setGoals(p => p.map(g=>g.id===updated.id?updated:g));

  const getProgress = (goal) => {
    if (!goal.linkedHabit) {
      return manualEdits[goal.id] !== undefined ? manualEdits[goal.id] : (goal.progress || 0);
    }
    const todayVal    = getHabitValue(log, goal.linkedHabit);
    const accumulated = goal.accumulated || 0;
    return accumulated + todayVal;
  };

  const filtered = goals.filter(g => filter==="all" || g.period===filter);

  const S = {
    section:{margin:"0 16px 11px",background:"rgba(255,255,255,0.58)",borderRadius:"16px",padding:"15px 17px",boxShadow:"0 2px 12px rgba(139,119,95,0.07)"},
    card:{borderRadius:"13px",padding:"13px 14px",background:"rgba(255,255,255,0.5)",border:"1px solid rgba(139,119,95,0.09)",marginBottom:"8px"},
  };

  return (
    <>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 16px 12px"}}>
        <div style={{display:"flex",gap:"6px"}}>
          {["all","weekly","monthly"].map(f=>(
            <button key={f} onClick={()=>setFilter(f)}
              style={{padding:"6px 13px",borderRadius:"14px",border:"1.5px solid "+(filter===f?"#8ab890":"rgba(139,119,95,0.18)"),background:filter===f?"rgba(138,184,144,0.1)":"transparent",color:filter===f?"#4a6e4a":"#8b7763",fontSize:"11px",cursor:"pointer",fontFamily:"inherit"}}>
              {f}
            </button>
          ))}
        </div>
        <button onClick={()=>setShowModal(true)}
          style={{padding:"7px 14px",borderRadius:"14px",border:"none",background:"linear-gradient(135deg,#8ab890,#5a7a5a)",color:"#fff",fontSize:"12px",cursor:"pointer",fontFamily:"inherit",boxShadow:"0 2px 8px rgba(90,122,90,0.2)"}}>
          + add goal
        </button>
      </div>

      {filtered.length===0&&(
        <div style={{...S.section,textAlign:"center",padding:"32px 20px"}}>
          <div style={{fontSize:"28px",marginBottom:"10px"}}>🎯</div>
          <div style={{fontSize:"14px",color:"#8b7763",fontStyle:"italic"}}>no goals yet</div>
          <div style={{fontSize:"12px",color:"#a89880",marginTop:"5px"}}>tap + add goal to set your first target</div>
        </div>
      )}

      {filtered.map(goal=>{
        const hDef     = goal.linkedHabit ? ALL_HABITS.find(x=>x.id===goal.linkedHabit) : null;
        const progress = getProgress(goal);
        const target   = goal.target || 1;
        const rawPct   = target > 0 ? (progress / target) * 100 : 0;
        const pct      = Math.min(Math.round(rawPct), 100);
        const color    = pct>=100?"linear-gradient(90deg,#8ab890,#5a7a5a)":pct>=60?"linear-gradient(90deg,#c4d4a8,#8ab890)":"linear-gradient(90deg,#d4c4a8,#c4a882)";
        const manualVal = manualEdits[goal.id] ?? goal.progress ?? 0;

        return (
          <div key={goal.id} style={{margin:"0 16px 9px"}}>
            <div style={S.card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:"13px",color:"#3d3530"}}>{goal.name}</div>
                  <div style={{display:"flex",alignItems:"center",gap:"6px",marginTop:"3px",flexWrap:"wrap"}}>
                    <span style={{fontSize:"11px",color:"#8b7763",fontStyle:"italic"}}>{progress} / {target} {goal.unit||""}</span>
                    {hDef&&<span style={{fontSize:"10px",color:"#8ab890",background:"rgba(138,184,144,0.1)",padding:"1px 7px",borderRadius:"8px"}}>{hDef.emoji} auto</span>}
                    <span style={{fontSize:"10px",color:"#a89880",background:"rgba(139,119,95,0.07)",padding:"1px 7px",borderRadius:"8px"}}>{goal.period}</span>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                  <div style={{fontSize:"20px",fontWeight:"300",color:pct>=100?"#5a7a5a":"#8b7763"}}>{pct}%</div>
                  <button onClick={()=>setEditGoal(goal)}
                    style={{background:"rgba(139,119,95,0.07)",border:"none",borderRadius:"8px",padding:"4px 8px",fontSize:"11px",color:"#8b7763",cursor:"pointer",fontFamily:"inherit"}}>edit</button>
                  <button onClick={()=>removeGoal(goal.id)}
                    style={{background:"none",border:"none",color:"rgba(139,119,95,0.3)",fontSize:"18px",cursor:"pointer",padding:"0",lineHeight:1}}>×</button>
                </div>
              </div>
              <div style={{height:"6px",borderRadius:"3px",background:"rgba(139,119,95,0.08)",overflow:"hidden",marginTop:"9px"}}>
                <div style={{height:"100%",width:pct+"%",background:color,borderRadius:"3px",transition:"width 1s ease"}}/>
              </div>
              {!goal.linkedHabit&&(
                <div style={{display:"flex",alignItems:"center",gap:"8px",marginTop:"9px"}}>
                  <span style={{fontSize:"11px",color:"#8b7763",fontStyle:"italic"}}>update progress:</span>
                  <button onClick={()=>setManualEdits(p=>({...p,[goal.id]:Math.max(0,manualVal-1)}))}
                    style={{width:"24px",height:"24px",borderRadius:"50%",border:"1.5px solid rgba(139,119,95,0.2)",background:"transparent",cursor:"pointer",color:"#8b7763",fontSize:"14px",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                  <span style={{fontSize:"13px",fontWeight:"300",color:"#5a7a5a",minWidth:"24px",textAlign:"center"}}>{manualVal}</span>
                  <button onClick={()=>setManualEdits(p=>({...p,[goal.id]:Math.min(target,manualVal+1)}))}
                    style={{width:"24px",height:"24px",borderRadius:"50%",border:"1.5px solid rgba(139,119,95,0.2)",background:"transparent",cursor:"pointer",color:"#8b7763",fontSize:"14px",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                </div>
              )}
              {pct>=100&&<div style={{fontSize:"11px",color:"#5a7a5a",marginTop:"6px",fontStyle:"italic"}}>goal reached ✨</div>}
            </div>
          </div>
        );
      })}

      {showModal&&<AddGoalModal habits={habits} onAdd={addGoal} onClose={()=>setShowModal(false)}/>}
      {editGoal&&<AddGoalModal habits={habits} initial={editGoal} onAdd={(updated)=>{updateGoal({...editGoal,...updated,id:editGoal.id});setEditGoal(null);}} onClose={()=>setEditGoal(null)}/>}
    </>
  );
}

// ── SETTINGS TAB ───────────────────────────────────────────────
function SettingsTab({ habits, setHabits, goals, setGoals, selfCarePool, setSelfCarePool, weights, setWeights, onSignOut }) {
  const [open, setOpen] = useState(null);
  const toggle = (s) => setOpen(p=>p===s?null:s);
  const toggleH = (id) => setHabits(p => p.includes(id)?p.filter(h=>h!==id):[...p,id]);
  const toggleSC = (item) => setSelfCarePool(p => p.includes(item)?p.filter(s=>s!==item):[...p,item]);

  const goalConfig = [
    {key:"water",label:"💧 water",unit:"glasses",min:4,max:20,step:1},
    {key:"steps",label:"🌿 steps",unit:"steps",min:2000,max:30000,step:1000},
    {key:"sleep",label:"🌙 sleep",unit:"hours",min:4,max:12,step:0.5},
    {key:"running",label:"🏃 run",unit:"km",min:1,max:42,step:0.5},
    {key:"learning",label:"📚 learning",unit:"min/day",min:10,max:240,step:10},
    {key:"reading",label:"📖 reading",unit:"pages/day",min:5,max:100,step:5},
    {key:"screenTime",label:"📱 screen limit",unit:"min/day",min:30,max:600,step:15},
  ].filter(c=>habits.includes(c.key));

  const scorableHabits = habits.filter(h=>h!=="mood");

  const S = {
    panel:{margin:"0 16px 10px",background:"rgba(255,255,255,0.58)",borderRadius:"16px",overflow:"hidden",boxShadow:"0 2px 12px rgba(139,119,95,0.07)"},
    header:{padding:"15px 17px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"},
    body:{padding:"4px 17px 16px"},
    hTitle:{fontSize:"13px",color:"#3d3530"},
    gRow:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:"1px solid rgba(139,119,95,0.07)"},
    stepBtn:{width:"28px",height:"28px",borderRadius:"50%",border:"1.5px solid rgba(139,119,95,0.18)",background:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:"16px",color:"#8b7763",display:"flex",alignItems:"center",justifyContent:"center"},
    hCard:(sel)=>({padding:"10px 12px",borderRadius:"12px",border:"1.5px solid "+(sel?"#8ab890":"rgba(139,119,95,0.13)"),background:sel?"rgba(138,184,144,0.08)":"rgba(255,255,255,0.4)",cursor:"pointer",transition:"all 0.15s",display:"flex",alignItems:"center",gap:"9px",marginBottom:"7px"}),
    pill:(sel)=>({padding:"7px 12px",borderRadius:"18px",border:"1.5px solid "+(sel?"#8ab890":"rgba(139,119,95,0.18)"),background:sel?"rgba(138,184,144,0.1)":"transparent",fontSize:"11px",color:sel?"#4a6e4a":"#8b7763",cursor:"pointer",fontFamily:"inherit"}),
  };

  return (
    <>
      {/* Tracked habits */}
      <div style={S.panel}>
        <div style={S.header} onClick={()=>toggle("habits")}>
          <span style={S.hTitle}>📋  what i'm tracking</span>
          <span style={{color:"#8b7763",fontSize:"11px"}}>{open==="habits"?"▲":"▼"}</span>
        </div>
        {open==="habits"&&<div style={S.body}>
          <p style={{fontSize:"11px",color:"#8b7763",fontStyle:"italic",marginBottom:"12px",marginTop:"0"}}>toggle habits on/off anytime</p>
          {ALL_HABITS.map(({id,label,emoji,desc})=>(
            <div key={id} style={S.hCard(habits.includes(id))} onClick={()=>toggleH(id)}>
              <span style={{fontSize:"20px",width:"26px",textAlign:"center"}}>{emoji}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:"13px",color:"#3d3530"}}>{label}</div>
                <div style={{fontSize:"10px",color:"#8b7763",fontStyle:"italic"}}>{desc}</div>
              </div>
              <div style={{width:"18px",height:"18px",borderRadius:"50%",border:"2px solid "+(habits.includes(id)?"#8ab890":"rgba(139,119,95,0.2)"),background:habits.includes(id)?"#8ab890":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {habits.includes(id)&&<span style={{color:"white",fontSize:"10px"}}>✓</span>}
              </div>
            </div>
          ))}
        </div>}
      </div>

      {/* Daily goals */}
      <div style={S.panel}>
        <div style={S.header} onClick={()=>toggle("goals")}>
          <span style={S.hTitle}>⚙️  daily goals</span>
          <span style={{color:"#8b7763",fontSize:"11px"}}>{open==="goals"?"▲":"▼"}</span>
        </div>
        {open==="goals"&&<div style={S.body}>
          {goalConfig.map(({key,label,unit,min,max,step:st})=>(
            <div key={key} style={S.gRow}>
              <div>
                <div style={{fontSize:"13px",color:"#3d3530"}}>{label}</div>
                <div style={{fontSize:"10px",color:"#8b7763",fontStyle:"italic"}}>{unit}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                <button style={S.stepBtn} onClick={()=>setGoals(p=>({...p,[key]:Math.max(min,+(p[key]||DEFAULT_GOALS[key]||0)-st)}))}>−</button>
                <div style={{textAlign:"center",minWidth:"44px",fontSize:"17px",fontWeight:"300",color:"#5a7a5a"}}>{goals[key]||DEFAULT_GOALS[key]}</div>
                <button style={S.stepBtn} onClick={()=>setGoals(p=>({...p,[key]:Math.min(max,+(p[key]||DEFAULT_GOALS[key]||0)+st)}))}>+</button>
              </div>
            </div>
          ))}
        </div>}
      </div>

      {/* Score weights */}
      <div style={S.panel}>
        <div style={S.header} onClick={()=>toggle("weights")}>
          <span style={S.hTitle}>⚖️  score weights</span>
          <span style={{color:"#8b7763",fontSize:"11px"}}>{open==="weights"?"▲":"▼"}</span>
        </div>
        {open==="weights"&&<div style={S.body}>
          <p style={{fontSize:"11px",color:"#8b7763",fontStyle:"italic",marginBottom:"14px",marginTop:"0"}}>how much does each habit affect your score?</p>
          {scorableHabits.map(hId=>{
            const hDef = ALL_HABITS.find(x=>x.id===hId);
            if (!hDef) return null;
            return (
              <WeightSlider key={hId}
                label={`${hDef.emoji} ${hDef.label}`}
                value={weights[hId]??5}
                onChange={v=>setWeights(p=>({...p,[hId]:v}))}/>
            );
          })}
        </div>}
      </div>

      {/* Self care pool */}
      {habits.includes("selfCare")&&<div style={S.panel}>
        <div style={S.header} onClick={()=>toggle("sc")}>
          <span style={S.hTitle}>🌸  self care menu</span>
          <span style={{color:"#8b7763",fontSize:"11px"}}>{open==="sc"?"▲":"▼"}</span>
        </div>
        {open==="sc"&&<div style={S.body}>
          <div style={{display:"flex",flexWrap:"wrap",gap:"7px"}}>
            {ALL_SELFCARE.map(item=>(
              <div key={item} style={S.pill(selfCarePool.includes(item))} onClick={()=>toggleSC(item)}>{item}</div>
            ))}
          </div>
        </div>}
      </div>}

      {/* Account */}
      <div style={S.panel}>
        <div style={S.header} onClick={()=>toggle("acc")}>
          <span style={S.hTitle}>👤  account</span>
          <span style={{color:"#8b7763",fontSize:"11px"}}>{open==="acc"?"▲":"▼"}</span>
        </div>
        {open==="acc"&&<div style={S.body}>
          <button onClick={onSignOut} style={{width:"100%",padding:"11px",borderRadius:"12px",border:"1.5px solid rgba(196,120,120,0.28)",background:"transparent",color:"#c47a7a",fontSize:"13px",cursor:"pointer",fontFamily:"inherit"}}>sign out</button>
        </div>}
      </div>
    </>
  );
}

// ── WORKOUT TAGS ───────────────────────────────────────────────
function WorkoutTags({ types, onChange }) {
  const [input, setInput] = useState("");
  const add = (val) => { const t=val.trim().toLowerCase(); if(t&&!types.includes(t))onChange([...types,t]); setInput(""); };
  return (
    <div style={{marginTop:"10px"}}>
      <div style={{display:"flex",flexWrap:"wrap",gap:"6px",marginBottom:"7px"}}>
        {types.map(t=>(
          <div key={t} style={{display:"flex",alignItems:"center",gap:"4px",padding:"4px 10px",borderRadius:"14px",background:"rgba(138,184,144,0.14)",border:"1px solid rgba(90,122,90,0.18)",fontSize:"12px",color:"#4a6e4a"}}>
            {t}<span onClick={()=>onChange(types.filter(x=>x!==t))} style={{cursor:"pointer",color:"#8ab890",fontSize:"14px",lineHeight:1,marginLeft:"2px"}}>×</span>
          </div>
        ))}
      </div>
      <input type="text" placeholder="pilates, joga, siłownia..." value={input}
        onChange={e=>setInput(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter"||e.key===","){e.preventDefault();add(input);}}}
        style={{width:"100%",padding:"8px 12px",borderRadius:"10px",border:"1.5px solid rgba(139,119,95,0.2)",background:"rgba(255,255,255,0.7)",fontFamily:"inherit",fontSize:"13px",color:"#3d3530",outline:"none",boxSizing:"border-box"}}/>
      <div style={{fontSize:"10px",color:"#a89880",marginTop:"3px",fontStyle:"italic"}}>Enter po każdej aktywności</div>
    </div>
  );
}

// ── ONBOARDING ─────────────────────────────────────────────────
function Onboarding({ onDone }) {
  const [step, setStep]           = useState(0);
  const [habits, setHabits]       = useState(["water","steps","sleep","selfCare","mood"]);
  const [goals, setGoals]         = useState({...DEFAULT_GOALS});
  const [selfCarePool, setSelfCarePool] = useState(["skincare 🧴","journaling 📓","walk outside 🌿","meditation 🧘"]);
  const toggleH  = (id)   => setHabits(p => p.includes(id)?p.filter(h=>h!==id):[...p,id]);
  const toggleSC = (item) => setSelfCarePool(p => p.includes(item)?p.filter(s=>s!==item):[...p,item]);

  const goalConfig = [
    {key:"water",label:"💧 water",unit:"glasses",min:4,max:20,step:1},
    {key:"steps",label:"🌿 steps",unit:"steps",min:2000,max:30000,step:1000},
    {key:"sleep",label:"🌙 sleep",unit:"hours",min:4,max:12,step:0.5},
    {key:"running",label:"🏃 run target",unit:"km",min:1,max:42,step:0.5},
    {key:"learning",label:"📚 learning",unit:"min/day",min:10,max:240,step:10},
    {key:"reading",label:"📖 reading",unit:"pages/day",min:5,max:100,step:5},
    {key:"screenTime",label:"📱 max screen",unit:"min/day",min:30,max:600,step:15},
  ].filter(c=>habits.includes(c.key));

  const C = {
    wrap:{minHeight:"100vh",background:"linear-gradient(155deg,#faf8f3 0%,#f0ebe0 50%,#e9f0e9 100%)",fontFamily:"'Cormorant Garamond',Georgia,serif",display:"flex",flexDirection:"column",padding:"36px 22px 44px",color:"#3d3530"},
    prog:{height:"3px",background:"rgba(139,119,95,0.12)",borderRadius:"2px",overflow:"hidden",marginBottom:"30px"},
    bar:(p)=>({height:"100%",width:`${p}%`,background:"linear-gradient(90deg,#8ab890,#5a7a5a)",borderRadius:"2px",transition:"width 0.5s"}),
    card:(sel)=>({padding:"12px 14px",borderRadius:"14px",border:"2px solid "+(sel?"#8ab890":"rgba(139,119,95,0.14)"),background:sel?"rgba(138,184,144,0.08)":"rgba(255,255,255,0.45)",cursor:"pointer",transition:"all 0.15s",display:"flex",alignItems:"center",gap:"11px",marginBottom:"7px"}),
    pill:(sel)=>({padding:"8px 13px",borderRadius:"20px",border:"1.5px solid "+(sel?"#8ab890":"rgba(139,119,95,0.19)"),background:sel?"rgba(138,184,144,0.1)":"transparent",fontSize:"12px",color:sel?"#4a6e4a":"#8b7763",cursor:"pointer",fontFamily:"inherit"}),
    btn:{width:"100%",padding:"14px",borderRadius:"15px",border:"none",background:"linear-gradient(135deg,#8ab890,#5a7a5a)",color:"#fff",fontSize:"14px",letterSpacing:"0.3px",cursor:"pointer",fontFamily:"inherit",marginTop:"24px",boxShadow:"0 4px 14px rgba(90,122,90,0.22)"},
    gRow:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 0",borderBottom:"1px solid rgba(139,119,95,0.08)"},
    stepBtn:{width:"30px",height:"30px",borderRadius:"50%",border:"1.5px solid rgba(139,119,95,0.2)",background:"rgba(255,255,255,0.6)",cursor:"pointer",fontSize:"18px",color:"#8b7763",display:"flex",alignItems:"center",justifyContent:"center"},
  };

  if (step===0) return (
    <div style={C.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet"/>
      <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",textAlign:"center"}}>
        <BlobCreature score={68}/>
        <h1 style={{fontSize:"38px",fontWeight:"300",color:"#3d3530",margin:"16px 0 7px",letterSpacing:"1px"}}>wellness</h1>
        <p style={{fontSize:"14px",color:"#8b7763",fontStyle:"italic",marginBottom:"34px",lineHeight:"1.8",maxWidth:"250px"}}>your personal wellness tracker.<br/>let's set it up just for you 🌿</p>
        <button style={C.btn} onClick={()=>setStep(1)}>let's start →</button>
      </div>
    </div>
  );

  if (step===1) return (
    <div style={C.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet"/>
      <div style={C.prog}><div style={C.bar(33)}/></div>
      <h2 style={{fontSize:"22px",fontWeight:"300",marginBottom:"5px"}}>what do you want to track?</h2>
      <p style={{fontSize:"11px",color:"#8b7763",fontStyle:"italic",marginBottom:"18px"}}>you can change this anytime in settings</p>
      <div style={{flex:1,overflowY:"auto"}}>
        {ALL_HABITS.map(({id,label,emoji,desc})=>(
          <div key={id} style={C.card(habits.includes(id))} onClick={()=>toggleH(id)}>
            <span style={{fontSize:"21px",width:"27px",textAlign:"center"}}>{emoji}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:"13px",color:"#3d3530"}}>{label}</div>
              <div style={{fontSize:"10px",color:"#8b7763",fontStyle:"italic"}}>{desc}</div>
            </div>
            <div style={{width:"19px",height:"19px",borderRadius:"50%",border:"2px solid "+(habits.includes(id)?"#8ab890":"rgba(139,119,95,0.2)"),background:habits.includes(id)?"#8ab890":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {habits.includes(id)&&<span style={{color:"white",fontSize:"10px"}}>✓</span>}
            </div>
          </div>
        ))}
      </div>
      <button style={C.btn} onClick={()=>setStep(2)}>next →</button>
    </div>
  );

  if (step===2) return (
    <div style={C.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet"/>
      <div style={C.prog}><div style={C.bar(habits.includes("selfCare")?66:100)}/></div>
      <h2 style={{fontSize:"22px",fontWeight:"300",marginBottom:"5px"}}>your daily goals</h2>
      <p style={{fontSize:"11px",color:"#8b7763",fontStyle:"italic",marginBottom:"14px"}}>adjustable anytime in settings</p>
      <div style={{flex:1,overflowY:"auto"}}>
        {goalConfig.length===0
          ? <p style={{color:"#8b7763",fontStyle:"italic",textAlign:"center",paddingTop:"40px",fontSize:"13px"}}>no goals needed for your habits 🌿</p>
          : goalConfig.map(({key,label,unit,min,max,step:st})=>(
            <div key={key} style={C.gRow}>
              <div>
                <div style={{fontSize:"13px",color:"#3d3530"}}>{label}</div>
                <div style={{fontSize:"10px",color:"#8b7763",fontStyle:"italic"}}>{unit}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                <button style={C.stepBtn} onClick={()=>setGoals(p=>({...p,[key]:Math.max(min,+(p[key]||DEFAULT_GOALS[key]||0)-st)}))}>−</button>
                <div style={{textAlign:"center",minWidth:"50px",fontSize:"19px",fontWeight:"300",color:"#5a7a5a"}}>{goals[key]||DEFAULT_GOALS[key]}</div>
                <button style={C.stepBtn} onClick={()=>setGoals(p=>({...p,[key]:Math.min(max,+(p[key]||DEFAULT_GOALS[key]||0)+st)}))}>+</button>
              </div>
            </div>
          ))
        }
      </div>
      <button style={C.btn} onClick={()=>habits.includes("selfCare")?setStep(3):onDone({habits,goals,selfCarePool})}>
        {habits.includes("selfCare")?"next →":"finish ✨"}
      </button>
    </div>
  );

  return (
    <div style={C.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet"/>
      <div style={C.prog}><div style={C.bar(100)}/></div>
      <h2 style={{fontSize:"22px",fontWeight:"300",marginBottom:"5px"}}>your self care menu</h2>
      <p style={{fontSize:"11px",color:"#8b7763",fontStyle:"italic",marginBottom:"18px"}}>pick what counts as self care for you</p>
      <div style={{flex:1,display:"flex",flexWrap:"wrap",gap:"8px",alignContent:"flex-start",overflowY:"auto"}}>
        {ALL_SELFCARE.map(item=>(
          <div key={item} style={C.pill(selfCarePool.includes(item))} onClick={()=>toggleSC(item)}>{item}</div>
        ))}
      </div>
      <button style={C.btn} onClick={()=>onDone({habits,goals,selfCarePool})}>finish ✨</button>
    </div>
  );
}

// ── MAIN APP ───────────────────────────────────────────────────

// ── MAIN APP ───────────────────────────────────────────────────
function MainApp({ profile: init, user, onSignOut }) {
  const [habits,       setHabits]       = useState(init.habits       || ["water","steps","sleep","mood"]);
  const [goals,        setGoals]        = useState(init.goals        || {...DEFAULT_GOALS});
  const [selfCarePool, setSelfCarePool] = useState(init.selfCarePool || []);
  const [weights,      setWeights]      = useState(init.weights      || {...DEFAULT_WEIGHTS});
  const [bigGoals,     setBigGoals]     = useState(init.bigGoals     || []);

  const [log, setLog] = useState({
    water:0, steps:0, sweets:null, foodQuality:null, workout:false, workoutTypes:[],
    screenTime:0, socialMedia:0, learningTime:0, learningProductivity:0,
    sleep:0, selfCare:[], mood:"", readingPages:0, runKm:0, runDuration:"", runFeel:"",
  });

  const [activeTab, setActiveTab] = useState("today");
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [saveStatus, setSaveStatus] = useState(""); // "saving" | "saved" | ""
  const saveLogTimer = useRef(null);

  // ── LOAD today's log on mount ──────────────────────────────
  useEffect(() => {
    if (!user) return;
    console.log("[loadTodayLog] loading for uid:", user.uid);
    loadTodayLog(user.uid).then(data => {
      console.log("[loadTodayLog] result:", data);
      if (data) {
        const { updatedAt, ...rest } = data;
        setLog(l => ({ ...l, ...rest }));
      }
    });
  }, [user]);

  // ── SAVE log (debounced 1.5s) ──────────────────────────────
  const saveLog = useCallback((newLog) => {
    if (!user) return;
    clearTimeout(saveLogTimer.current);
    setSaveStatus("saving");
    saveLogTimer.current = setTimeout(async () => {
      await saveTodayLog(user.uid, newLog);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 2000);
    }, 1500);
  }, [user]);

  // ── SAVE profile ─────────────────────────────────────────────
  // We pass the ENTIRE new profile as `patch` — no stale state risk
  const saveProf = useCallback(async (newProfile) => {
    if (!user) return;
    console.log("[saveProf] saving to Firestore:", JSON.stringify(newProfile).slice(0,120));
    await saveProfile(user.uid, newProfile);
    console.log("[saveProf] done");
  }, [user]);

  // Helper: build full profile object from current state
  const buildProfile = (overrides) => ({
    habits, goals, selfCarePool, weights, bigGoals, ...overrides
  });

  // ── Helpers ────────────────────────────────────────────────
  const update = (k, v) => setLog(p => {
    const next = { ...p, [k]: v };
    saveLog(next);
    return next;
  });

  const toggleSC = (item) => update(
    "selfCare",
    log.selfCare.includes(item) ? log.selfCare.filter(s => s !== item) : [...log.selfCare, item]
  );

  const fmt = m => {
    if (!m || m === 0) return "0m";
    const h = Math.floor(m / 60), mn = m % 60;
    return h > 0 ? `${h}h${mn > 0 ? ` ${mn}m` : ""}` : mn + "m";
  };

  const score = calcScore(log, habits, goals, weights);
  const scoreLabel = score>=85?"glowing ✨":score>=65?"on track 🌿":score>=40?"building habits 🌸":score>=15?"starting fresh 🌱":"let's begin 🤍";
  const G = goals;

  const sweetComments = {0:"no sweets today — glowing 🌿",1:"one treat — balance 🌸",2:"two treats — c'est la vie",3:"three — sweet tooth showing",4:"four+ — tomorrow is a new day ✨"};
  const foodComments  = {1:"absolutely nourishing — glowing from within 🌿",2:"pretty good — balanced choices 🥗",3:"okay-ish — could be better",4:"comfort food day 🍕",5:"damage control tomorrow ✨"};

  const S = {
    app:{minHeight:"100vh",background:"linear-gradient(155deg,#faf8f3 0%,#f0ebe0 50%,#e9f0e9 100%)",fontFamily:"'Cormorant Garamond',Georgia,serif",color:"#3d3530",paddingBottom:"84px"},
    section:{margin:"0 16px 11px",background:"rgba(255,255,255,0.58)",borderRadius:"16px",padding:"15px 17px",boxShadow:"0 2px 12px rgba(139,119,95,0.07)"},
    sTitle:{fontSize:"9px",letterSpacing:"3px",textTransform:"uppercase",color:"#8b7763",marginBottom:"12px",display:"flex",alignItems:"center",gap:"6px"},
    iRow:{display:"flex",alignItems:"center",gap:"10px",marginBottom:"7px"},
    lbl:{fontSize:"12px",color:"#5c4f42",minWidth:"68px",fontStyle:"italic"},
    inp:{flex:1,padding:"7px 11px",borderRadius:"10px",border:"1.5px solid rgba(139,119,95,0.18)",background:"rgba(255,255,255,0.7)",fontFamily:"inherit",fontSize:"14px",color:"#3d3530",outline:"none"},
    bar:{height:"5px",borderRadius:"3px",background:"rgba(139,119,95,0.08)",marginTop:"5px",overflow:"hidden"},
    fill:(p,c)=>({height:"100%",width:Math.min(p||0,100)+"%",background:c||"linear-gradient(90deg,#8ab890,#5a7a5a)",borderRadius:"3px",transition:"width 0.7s cubic-bezier(.4,0,.2,1)"}),
    hint:{fontSize:"11px",color:"#8b7763",marginTop:"3px",fontStyle:"italic"},
    tog:(a)=>({padding:"7px 17px",borderRadius:"18px",border:"1.5px solid "+(a?"#5a7a5a":"rgba(139,119,95,0.22)"),background:a?"linear-gradient(135deg,#8ab890,#5a7a5a)":"transparent",color:a?"#fff":"#8b7763",fontSize:"12px",cursor:"pointer",fontFamily:"inherit",transition:"all 0.18s"}),
    scGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"7px"},
    scItem:(a)=>({padding:"9px 10px",borderRadius:"11px",border:"1.5px solid "+(a?"#8ab890":"rgba(139,119,95,0.14)"),background:a?"rgba(138,184,144,0.1)":"rgba(255,255,255,0.4)",fontSize:"12px",cursor:"pointer",textAlign:"center",transition:"all 0.15s",color:a?"#4a6e4a":"#8b7763"}),
    moodItem:(a)=>({padding:"7px 13px",borderRadius:"17px",border:"1.5px solid "+(a?"#c4a882":"rgba(139,119,95,0.14)"),background:a?"rgba(196,168,130,0.12)":"transparent",fontSize:"12px",cursor:"pointer",color:a?"#8b6b3d":"#8b7763",fontFamily:"inherit",transition:"all 0.15s"}),
    glass:(f)=>({width:"23px",height:"29px",borderRadius:"3px 3px 5px 5px",background:f?"linear-gradient(180deg,#a8d4e6,#7bbcd4)":"rgba(139,119,95,0.07)",border:"1.5px solid "+(f?"#7bbcd4":"rgba(139,119,95,0.14)"),cursor:"pointer",transition:"all 0.15s"}),
    tab:(a)=>({padding:"10px 11px",fontSize:"9px",letterSpacing:"1.8px",textTransform:"uppercase",border:"none",background:"none",cursor:"pointer",color:a?"#5a7a5a":"#a89880",borderBottom:a?"2px solid #5a7a5a":"2px solid transparent",fontFamily:"inherit",whiteSpace:"nowrap",transition:"color 0.2s"}),
    statCard:(c)=>({background:c,borderRadius:"13px",padding:"12px 14px",border:"1px solid rgba(139,119,95,0.08)"}),
    scaleBtn:(a)=>({flex:1,padding:"8px 0",borderRadius:"10px",border:"1.5px solid "+(a?"#c4a882":"rgba(139,119,95,0.13)"),background:a?"rgba(196,168,130,0.11)":"transparent",cursor:"pointer",fontSize:"14px",color:a?"#8b6b3d":"#8b7763",fontFamily:"inherit",transition:"all 0.15s",display:"flex",flexDirection:"column",alignItems:"center",gap:"2px"}),
  };

  return (
    <div style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet"/>
      {menuOpen&&<div onClick={()=>setMenuOpen(false)} style={{position:"fixed",inset:0,zIndex:50}}/>}

      {/* HEADER */}
      <div style={{padding:"18px 18px 10px",textAlign:"center",borderBottom:"1px solid rgba(139,119,95,0.1)",position:"relative"}}>
        <div style={{position:"absolute",top:"15px",right:"15px",zIndex:60}}>
          <button onClick={()=>setMenuOpen(p=>!p)} style={{background:"rgba(255,255,255,0.72)",border:"1.5px solid rgba(139,119,95,0.17)",borderRadius:"11px",padding:"7px 11px",cursor:"pointer",fontSize:"14px",lineHeight:1,backdropFilter:"blur(8px)"}}>☰</button>
          {menuOpen&&(
            <div style={{position:"absolute",right:0,top:"40px",background:"rgba(252,250,246,0.98)",borderRadius:"14px",boxShadow:"0 8px 28px rgba(139,119,95,0.14)",border:"1.5px solid rgba(139,119,95,0.1)",padding:"7px",minWidth:"155px",zIndex:100}}>
              {[["history","📓  history"],["settings","⚙️  settings"]].map(([id,lbl])=>(
                <button key={id} onClick={()=>{setActiveTab(id);setMenuOpen(false);}}
                  style={{display:"block",width:"100%",padding:"10px 13px",borderRadius:"10px",border:"none",background:activeTab===id?"rgba(138,184,144,0.1)":"transparent",color:"#5c4f42",fontSize:"13px",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                  {lbl}
                </button>
              ))}
              <div style={{margin:"5px 0",borderTop:"1px solid rgba(139,119,95,0.09)"}}/>
              <button onClick={onSignOut} style={{display:"block",width:"100%",padding:"8px 13px",borderRadius:"10px",border:"none",background:"transparent",color:"#c47a7a",fontSize:"12px",cursor:"pointer",fontFamily:"inherit",textAlign:"left",fontStyle:"italic"}}>sign out</button>
            </div>
          )}
        </div>
        <div style={{fontSize:"9px",letterSpacing:"3px",textTransform:"uppercase",color:"#8b7763",marginBottom:"3px"}}>{new Date().toLocaleDateString("en-US",{weekday:"long",day:"numeric",month:"long"})}</div>
        <h1 style={{fontSize:"27px",fontWeight:"300",color:"#3d3530",margin:"0 0 1px",letterSpacing:"0.5px"}}>wellness</h1>
        <p style={{fontSize:"12px",color:"#a89880",fontStyle:"italic",margin:0}}>
          {saveStatus==="saving"?"saving... 🌿":saveStatus==="saved"?"saved ✓":"your daily ritual"}
        </p>
        <BlobCreature score={score}/>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",margin:"6px auto 0"}}>
          <div style={{position:"relative",width:"64px",height:"64px"}}>
            <svg width="64" height="64" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(139,119,95,0.1)" strokeWidth="4"/>
              <circle cx="32" cy="32" r="26" fill="none" stroke="url(#sg5)" strokeWidth="4" strokeLinecap="round"
                strokeDasharray={`${(score/100)*(2*Math.PI*26)} ${2*Math.PI*26}`}
                strokeDashoffset={(2*Math.PI*26)*0.25} style={{transition:"stroke-dasharray 1s"}}/>
              <defs><linearGradient id="sg5" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#8ab890"/><stop offset="100%" stopColor="#5a7a5a"/></linearGradient></defs>
            </svg>
            <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontSize:"16px",fontWeight:"300",color:"#5a7a5a"}}>{score}</div>
          </div>
          <div style={{fontSize:"11px",color:"#8b7763",fontStyle:"italic",marginTop:"2px"}}>{scoreLabel}</div>
        </div>
      </div>

      {/* TABS */}
      <div style={{display:"flex",justifyContent:"center",borderBottom:"1px solid rgba(139,119,95,0.12)",marginBottom:"14px"}}>
        {[["today","today"],["stats","summary"],["goals","goals"]].map(([id,lbl])=>(
          <button key={id} style={S.tab(activeTab===id)} onClick={()=>setActiveTab(id)}>{lbl}</button>
        ))}
      </div>

      {/* TODAY */}
      {activeTab==="today"&&<>
        {habits.includes("water")&&<div style={S.section}>
          <div style={S.sTitle}>💧 water</div>
          <div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>
            {Array.from({length:Math.min(G.water||8,14)}).map((_,i)=>(
              <div key={i} style={S.glass(i<log.water)} onClick={i<log.water?()=>update("water",log.water-1):()=>update("water",log.water+1)}/>
            ))}
          </div>
          <div style={S.bar}><div style={S.fill((log.water/(G.water||8))*100,"linear-gradient(90deg,#a8d4e6,#7bbcd4)")}/></div>
          <div style={S.hint}>{log.water}/{G.water||8} glasses {log.water>=(G.water||8)?"· goal reached ✓":`· ${(G.water||8)-log.water} more`}</div>
        </div>}

        {habits.includes("steps")&&<div style={S.section}>
          <div style={S.sTitle}>🌿 steps</div>
          <div style={S.iRow}><span style={S.lbl}>today</span><input type="number" placeholder="0" value={log.steps||""} onChange={e=>update("steps",+e.target.value)} style={S.inp}/></div>
          <div style={S.bar}><div style={S.fill(((log.steps||0)/(G.steps||10000))*100)}/></div>
          <div style={S.hint}>{(log.steps||0).toLocaleString()} / {(G.steps||10000).toLocaleString()}</div>
        </div>}

        {habits.includes("workout")&&<div style={S.section}>
          <div style={S.sTitle}>💪 workout</div>
          <button style={S.tog(log.workout)} onClick={()=>update("workout",!log.workout)}>{log.workout?"done ✓":"not yet"}</button>
          {log.workout&&<WorkoutTags types={log.workoutTypes||[]} onChange={v=>update("workoutTypes",v)}/>}
        </div>}

        {habits.includes("running")&&<div style={S.section}>
          <div style={S.sTitle}>🏃 running</div>
          <div style={S.iRow}><span style={S.lbl}>distance</span><input type="number" step="0.1" placeholder="0" value={log.runKm||""} onChange={e=>update("runKm",+e.target.value)} style={{...S.inp,maxWidth:"88px"}}/><span style={S.hint}>km</span></div>
          <div style={S.bar}><div style={S.fill(((log.runKm||0)/(G.running||5))*100,"linear-gradient(90deg,#a8c4e6,#6a8ed4)")}/></div>
          <div style={S.iRow}><span style={S.lbl}>duration</span><input type="text" placeholder="np. 35 min" value={log.runDuration||""} onChange={e=>update("runDuration",e.target.value)} style={S.inp}/></div>
          <div style={{marginTop:"8px"}}>
            <div style={S.hint}>how did it feel?</div>
            <div style={{display:"flex",gap:"5px",marginTop:"5px",flexWrap:"wrap"}}>
              {RUN_FEEL.map(f=>(
                <button key={f} onClick={()=>update("runFeel",log.runFeel===f?"":f)}
                  style={{padding:"5px 10px",borderRadius:"13px",border:"1.5px solid "+(log.runFeel===f?"#8ab890":"rgba(139,119,95,0.14)"),background:log.runFeel===f?"rgba(138,184,144,0.11)":"transparent",fontSize:"11px",color:log.runFeel===f?"#4a6e4a":"#8b7763",cursor:"pointer",fontFamily:"inherit"}}>
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>}

        {habits.includes("sleep")&&<div style={S.section}>
          <div style={S.sTitle}>🌙 sleep</div>
          <div style={S.iRow}><span style={S.lbl}>hours</span><input type="number" step="0.5" placeholder="0" value={log.sleep||""} onChange={e=>update("sleep",+e.target.value)} style={{...S.inp,maxWidth:"88px"}}/><span style={S.hint}>{log.sleep||0}h / {G.sleep||8}h</span></div>
          <div style={S.bar}><div style={S.fill(((log.sleep||0)/(G.sleep||8))*100,"linear-gradient(90deg,#b8c4e8,#8a9ed4)")}/></div>
          <div style={S.hint}>{!log.sleep?"log last night's sleep 😴":log.sleep<6?"that's rough 🌙":log.sleep>=(G.sleep||8)?"beautifully rested ✨":"pretty good 🌿"}</div>
        </div>}

        {habits.includes("learning")&&<div style={S.section}>
          <div style={S.sTitle}>📚 learning</div>
          <div style={S.iRow}><span style={S.lbl}>time</span><input type="number" placeholder="min" value={log.learningTime||""} onChange={e=>update("learningTime",+e.target.value)} style={{...S.inp,maxWidth:"88px"}}/><span style={S.hint}>{fmt(log.learningTime)} / {fmt(G.learning||60)}</span></div>
          <div style={S.bar}><div style={S.fill(((log.learningTime||0)/(G.learning||60))*100,"linear-gradient(90deg,#c4d4a8,#8ab890)")}/></div>
          <div style={{marginTop:"10px",display:"flex",gap:"4px"}}>
            {[1,2,3,4,5,6,7,8,9,10].map(n=>(
              <div key={n} onClick={()=>update("learningProductivity",(log.learningProductivity||0)===n?0:n)} style={{flex:1,height:"8px",borderRadius:"2px",background:(log.learningProductivity||0)>=n?"#8ab890":"rgba(139,119,95,0.1)",cursor:"pointer",transition:"background 0.15s"}}/>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:"2px"}}><span style={{fontSize:"9px",color:"#b5a898"}}>distracted</span><span style={{fontSize:"9px",color:"#b5a898"}}>in the zone</span></div>
        </div>}

        {habits.includes("reading")&&<div style={S.section}>
          <div style={S.sTitle}>📖 reading</div>
          <div style={S.iRow}><span style={S.lbl}>pages</span><input type="number" placeholder="0" value={log.readingPages||""} onChange={e=>update("readingPages",+e.target.value)} style={{...S.inp,maxWidth:"88px"}}/><span style={S.hint}>{log.readingPages||0} / {G.reading||20} pages</span></div>
          <div style={S.bar}><div style={S.fill(((log.readingPages||0)/(G.reading||20))*100,"linear-gradient(90deg,#d4c4e8,#9a7ab8)")}/></div>
          <div style={S.hint}>{!log.readingPages?"pick up your book 📖":log.readingPages>=(G.reading||20)?"goal reached ✓":`${(G.reading||20)-(log.readingPages||0)} pages to go`}</div>
        </div>}

        {habits.includes("sweets")&&<div style={S.section}>
          <div style={S.sTitle}>🍫 sweets</div>
          <div style={{display:"flex",gap:"7px"}}>
            {[0,1,2,3,4].map(n=>(
              <button key={n} onClick={()=>update("sweets",log.sweets===n?null:n)}
                style={{width:"36px",height:"36px",borderRadius:"50%",border:"1.5px solid "+(log.sweets===n?"#c4a882":"rgba(139,119,95,0.14)"),background:log.sweets===n?"rgba(196,168,130,0.14)":"transparent",cursor:"pointer",fontSize:"12px",color:log.sweets===n?"#8b6b3d":"#8b7763",fontFamily:"inherit"}}>
                {n===4?"4+":n}
              </button>
            ))}
          </div>
          <div style={{...S.hint,marginTop:"7px",fontSize:"12px",color:"#8b6b3d"}}>
            {log.sweets===null?"tap to log today's sweets":sweetComments[Math.min(log.sweets,4)]}
          </div>
        </div>}

        {habits.includes("food")&&<div style={S.section}>
          <div style={S.sTitle}>🥗 food quality</div>
          <div style={{display:"flex",gap:"6px"}}>
            {[1,2,3,4,5].map(n=>(
              <button key={n} onClick={()=>update("foodQuality",log.foodQuality===n?null:n)} style={S.scaleBtn(log.foodQuality===n)}>
                <span>{["🌿","🙂","😐","😕","😩"][n-1]}</span>
                <span style={{fontSize:"9px"}}>{["great","good","ok","meh","bad"][n-1]}</span>
              </button>
            ))}
          </div>
          <div style={{...S.hint,marginTop:"7px",fontSize:"12px",color:"#8b6b3d"}}>{log.foodQuality===null?"rate how you ate today":foodComments[log.foodQuality]}</div>
        </div>}

        {habits.includes("screenTime")&&<div style={S.section}>
          <div style={S.sTitle}>📱 screen time</div>
          <div style={S.iRow}><span style={S.lbl}>total</span><input type="number" placeholder="min" value={log.screenTime||""} onChange={e=>update("screenTime",+e.target.value)} style={{...S.inp,maxWidth:"88px"}}/><span style={S.hint}>{fmt(log.screenTime)}</span></div>
          <div style={S.iRow}><span style={S.lbl}>social</span><input type="number" placeholder="min" value={log.socialMedia||""} onChange={e=>update("socialMedia",+e.target.value)} style={{...S.inp,maxWidth:"88px"}}/><span style={S.hint}>{fmt(log.socialMedia)}</span></div>
        </div>}

        {habits.includes("selfCare")&&<div style={S.section}>
          <div style={S.sTitle}>🌸 self care</div>
          <div style={S.scGrid}>{selfCarePool.map(item=><div key={item} style={S.scItem(log.selfCare?.includes(item))} onClick={()=>toggleSC(item)}>{item}</div>)}</div>
        </div>}

        {habits.includes("mood")&&<div style={S.section}>
          <div style={S.sTitle}>💫 mood</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:"7px"}}>{MOOD_OPTIONS.map(m=><button key={m} style={S.moodItem(log.mood===m)} onClick={()=>update("mood",log.mood===m?"":m)}>{m}</button>)}</div>
        </div>}
      </>}

      {/* SUMMARY */}
      {activeTab==="stats"&&<div style={S.section}>
        <div style={S.sTitle}>✨ today at a glance</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:"13px"}}>
          {[
            habits.includes("water")      && {l:"water",     v:`${log.water} glasses`,        c:"rgba(168,212,230,0.16)"},
            habits.includes("steps")      && {l:"steps",     v:(log.steps||0).toLocaleString(),c:"rgba(138,184,144,0.16)"},
            habits.includes("sleep")      && {l:"sleep",     v:`${log.sleep||0}h`,            c:"rgba(184,196,232,0.16)"},
            habits.includes("learning")   && {l:"learning",  v:fmt(log.learningTime),          c:"rgba(196,218,168,0.16)"},
            habits.includes("reading")    && {l:"reading",   v:`${log.readingPages||0} pages`, c:"rgba(212,196,232,0.16)"},
            habits.includes("running")    && {l:"running",   v:`${log.runKm||0} km`,           c:"rgba(168,196,230,0.16)"},
            habits.includes("screenTime") && {l:"screen",    v:fmt(log.screenTime),            c:"rgba(212,168,184,0.16)"},
            habits.includes("selfCare")   && {l:"self care", v:`${log.selfCare?.length||0} rituals`,c:"rgba(232,218,196,0.16)"},
          ].filter(Boolean).map(({l,v,c})=>(
            <div key={l} style={S.statCard(c)}>
              <div style={{fontSize:"18px",fontWeight:"300",color:"#5a7a5a",lineHeight:1}}>{v}</div>
              <div style={{fontSize:"9px",letterSpacing:"2px",textTransform:"uppercase",color:"#8b7763",marginTop:"3px"}}>{l}</div>
            </div>
          ))}
        </div>
        {log.workout&&log.workoutTypes?.length>0&&<div style={{padding:"8px 13px",background:"rgba(138,184,144,0.09)",borderRadius:"10px",fontSize:"12px",color:"#5a7a5a",fontStyle:"italic",marginBottom:"8px"}}>💪 {log.workoutTypes.join(", ")} ✓</div>}
        {log.runKm>0&&<div style={{padding:"8px 13px",background:"rgba(168,196,230,0.09)",borderRadius:"10px",fontSize:"12px",color:"#5a7a5a",fontStyle:"italic",marginBottom:"8px"}}>🏃 {log.runKm}km{log.runDuration?` · ${log.runDuration}`:""}{log.runFeel?` · ${log.runFeel}`:""}</div>}
        {log.mood&&<div style={{textAlign:"center",fontSize:"14px",color:"#8b7763",fontStyle:"italic",marginBottom:"9px"}}>{log.mood}</div>}
        {log.selfCare?.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginBottom:"11px"}}>{log.selfCare.map(s=><span key={s} style={{padding:"3px 9px",borderRadius:"10px",background:"rgba(138,184,144,0.1)",border:"1px solid rgba(90,122,90,0.13)",fontSize:"11px",color:"#4a6e4a"}}>{s}</span>)}</div>}
        <div style={{borderTop:"1px solid rgba(139,119,95,0.1)",paddingTop:"13px",textAlign:"center"}}>
          <div style={{fontSize:"44px",fontWeight:"300",color:"#5a7a5a",lineHeight:1}}>{score}</div>
          <div style={{fontSize:"12px",color:"#8b7763",fontStyle:"italic",marginTop:"3px"}}>{scoreLabel}</div>
          <div style={{height:"5px",borderRadius:"3px",background:"rgba(139,119,95,0.08)",overflow:"hidden",marginTop:"9px"}}>
            <div style={{height:"100%",width:score+"%",background:"linear-gradient(90deg,#8ab890,#5a7a5a)",borderRadius:"3px",transition:"width 0.8s"}}/>
          </div>
        </div>
      </div>}

      {activeTab==="goals"&&<GoalsTab goals={bigGoals} setGoals={g=>{setBigGoals(g);saveProf(buildProfile({bigGoals:g}));}} log={log} habits={habits}/>}
      {activeTab==="history"&&<div style={S.section}><div style={S.sTitle}>📓 history</div><div style={{textAlign:"center",padding:"28px",color:"#8b7763",fontStyle:"italic"}}>your journey starts today 🌱</div></div>}
      {activeTab==="settings"&&<SettingsTab
        habits={habits}      setHabits={h=>{setHabits(h);saveProf(buildProfile({habits:h}));}}
        goals={goals}        setGoals={g=>{setGoals(g);saveProf(buildProfile({goals:g}));}}
        selfCarePool={selfCarePool} setSelfCarePool={s=>{setSelfCarePool(s);saveProf(buildProfile({selfCarePool:s}));}}
        weights={weights}    setWeights={w=>{setWeights(w);saveProf(buildProfile({weights:w}));}}
        onSignOut={onSignOut}
      />}

      {/* BOTTOM NAV */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(250,248,243,0.96)",backdropFilter:"blur(12px)",borderTop:"1px solid rgba(139,119,95,0.09)",display:"flex",justifyContent:"center",padding:"5px 0 10px"}}>
        {[["today","🌿","today"],["stats","✨","summary"],["goals","🎯","goals"]].map(([id,icon,lbl])=>(
          <button key={id} onClick={()=>setActiveTab(id)} style={{background:"none",border:"none",cursor:"pointer",padding:"5px 20px",display:"flex",flexDirection:"column",alignItems:"center",gap:"2px",fontFamily:"inherit"}}>
            <span style={{fontSize:"16px"}}>{icon}</span>
            <span style={{fontSize:"8px",letterSpacing:"1.5px",textTransform:"uppercase",color:activeTab===id?"#5a7a5a":"#a89880",transition:"color 0.2s"}}>{lbl}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── ROOT ────────────────────────────────────────────────────────
export default function Root() {
  const [user,         setUser]        = useState(undefined);
  const [profile,      setProfile]     = useState(undefined);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u || null);
      if (u) {
        const prof = await loadProfile(u.uid);
        setProfile(prof?.habits ? prof : null);
      } else {
        setProfile(null);
      }
    });
  }, []);

  const handleOnboardingDone = async (prof) => {
    if (auth.currentUser) await saveProfile(auth.currentUser.uid, prof);
    setProfile(prof);
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setUser(null);
    setProfile(null);
  };

  // loading
  if (user === undefined || profile === undefined) return (
    <div style={{minHeight:"100vh",background:"linear-gradient(155deg,#faf8f3,#f0ebe0,#e9f0e9)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Georgia,serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:"32px",marginBottom:"12px"}}>🌿</div>
        <div style={{fontSize:"13px",color:"#8b7763",fontStyle:"italic"}}>loading your wellness...</div>
      </div>
    </div>
  );

  if (!user)    return <AuthScreen/>;
  if (!profile) return <Onboarding onDone={handleOnboardingDone}/>;
  return <MainApp profile={profile} user={user} onSignOut={handleSignOut}/>;
}
