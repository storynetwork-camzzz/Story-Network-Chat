// ============================================================
// FIREBASE CONFIG
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyC6UYTNPuaL2uldLCZQPyDO_8Tt4aPvA5k",
  authDomain: "story-network-chat-e6d00.firebaseapp.com",
  databaseURL: "https://story-network-chat-e6d00-default-rtdb.firebaseio.com",
  projectId: "story-network-chat-e6d00",
  storageBucket: "story-network-chat-e6d00.firebasestorage.app",
  messagingSenderId: "248782639971",
  appId: "1:248782639971:web:99512879a9c3eab6d63956"
};
try { firebase.initializeApp(firebaseConfig); } catch(e) {}
const auth = firebase.auth();
const db   = firebase.database();

// ============================================================
// CONSTANTS
// ============================================================
const IMGBB_KEY  = "7ae7b64cb4da961ab6a7d18d920099a8";
const MAX_CHARS  = 250;
const PAGE_SIZE  = 50;
const WEEK_MS    = 7 * 24 * 60 * 60 * 1000;
const BUILTIN_CHANNELS = ["general","offtopic","announcements","modchat","leaderboard","myleaderboard","rules","members","logs","reports","broadcast","modactions"];
function getAllChannels() {
  return [...BUILTIN_CHANNELS, ...Object.keys(customChannels)];
}
const IMAGE_URL_RE = /(https?:\/\/[^\s<]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s<]*)?)/gi;
const ANY_URL_RE   = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]{}])/g;

// ============================================================
// ACHIEVEMENTS DEFINITION
// ============================================================
const ACHIEVEMENTS = [
  { id: "first_message",   icon: "💬", name: "First Words",       desc: "Send your first message",             check: u => (u.messageCount||0) >= 1 },
  { id: "messages_10",     icon: "📨", name: "Getting Started",   desc: "Send 10 messages",                    check: u => (u.messageCount||0) >= 10 },
  { id: "messages_100",    icon: "💯", name: "Century",           desc: "Send 100 messages",                   check: u => (u.messageCount||0) >= 100 },
  { id: "messages_500",    icon: "🚀", name: "Rocket",            desc: "Send 500 messages",                   check: u => (u.messageCount||0) >= 500 },
  { id: "messages_1000",   icon: "👑", name: "Legend",            desc: "Send 1000 messages",                  check: u => (u.messageCount||0) >= 1000 },
  { id: "rep_1",           icon: "⭐", name: "Liked",             desc: "Receive your first rep",              check: u => (u.rep||0) >= 1 },
  { id: "rep_10",          icon: "🌟", name: "Fan Favourite",     desc: "Receive 10 rep",                      check: u => (u.rep||0) >= 10 },
  { id: "streak_3",        icon: "🔥", name: "On Fire",           desc: "3-day active streak",                 check: u => (u.currentStreak||0) >= 3 },
  { id: "streak_7",        icon: "🗓️", name: "Week Warrior",      desc: "7-day active streak",                 check: u => (u.currentStreak||0) >= 7 },
  { id: "streak_30",       icon: "🏅", name: "Dedicated",         desc: "30-day active streak",                check: u => (u.currentStreak||0) >= 30 },
  { id: "images_5",        icon: "📸", name: "Shutterbug",        desc: "Send 5 images",                       check: u => (u.imagesSent||0) >= 5 },
  { id: "polls_voted_5",   icon: "🗳️", name: "Voter",             desc: "Vote in 5 polls",                     check: u => (u.pollsVotedIn||0) >= 5 },
  { id: "online_60",       icon: "⏱️", name: "Settled In",        desc: "Spend 1 hour online",                 check: u => (u.timeOnlineMinutes||0) >= 60 },
  { id: "online_600",      icon: "🕰️", name: "Homebody",          desc: "Spend 10 hours online",               check: u => (u.timeOnlineMinutes||0) >= 600 },
  { id: "friends_1",       icon: "🤝", name: "Friendly",          desc: "Make your first friend",              check: (u, extra) => (extra.friendCount||0) >= 1 },
  { id: "friends_5",       icon: "👥", name: "Social Butterfly",  desc: "Have 5 friends",                      check: (u, extra) => (extra.friendCount||0) >= 5 },
];

// ============================================================
// STATE
// ============================================================
let currentUser    = null;
let myUid          = null;
let myUsername     = "";
let myColor        = "#4da6ff";
let myAvatar       = null;
let myStatus       = "";
let myBio          = "";
let myBanner       = null;
let ownerUid       = null;
let modUids        = {};
let devUids        = {};
let mutedUids      = {};
let bannedUids     = {};
let currentChannel = "general";
let replyingTo     = null;
let userScrolledUp = false;
let typingTimer    = null;
let isTyping       = false;
let lastSentTime   = 0;
let lastSentMsg    = "";
let sending        = false;
let activeColor    = "";
let allUsersCache  = {};
let myFriends      = {};
let myBlocked      = {}; // UIDs I have blocked
let displayedMsgs  = {};
let msgListeners   = {};
let appStarted     = false;
let muteExpireTimer = null;
let muteCountdownInterval = null;
let leaderboardTimer = null;
let searchActive   = false;
let customRoles    = {};
let customChannels = {};
let myCustomReactions = [];
let onlineMinuteTimer = null;
let myAchievements = {};

// ============================================================
// DOM HELPERS
// ============================================================
const $   = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const strip = html => { const d = document.createElement("div"); d.innerHTML = html; return d.textContent || ""; };

function showError(id, msg) { const el=$(id); el.textContent=msg; el.classList.add("show"); }
function clearError(id)     { const el=$(id); el.textContent="";  el.classList.remove("show"); }

function showToast(msg, type) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className="toast"; document.body.appendChild(t); }
  t.textContent = msg; t.className = "toast "+(type||"");
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2800);
}

function friendlyError(code) {
  return ({
    "auth/user-not-found":       "No account found with that username.",
    "auth/wrong-password":       "Incorrect password.",
    "auth/invalid-credential":   "Incorrect username or password.",
    "auth/email-already-in-use": "That username is already taken.",
    "auth/too-many-requests":    "Too many attempts — try again later.",
    "auth/weak-password":        "Password must be at least 6 characters."
  })[code] || "Something went wrong. Please try again.";
}

// ============================================================
// ROLE HELPERS
// ============================================================
function isOwner(uid)  { return ownerUid && uid === ownerUid; }
function isMod(uid)    { return modUids[uid] === true; }
function isDev(uid)    { return devUids[uid] === true; }
function amOwner()     { return isOwner(myUid); }
function amMod()       { return isMod(myUid); }
function canDelete()   { return amOwner() || amMod(); }
function canModerate() { return amOwner() || amMod(); }

// ============================================================
// SCROLL HELPERS
// ============================================================
function scrollToBottom(force) {
  const cb = $("chatbox");
  if (force || !userScrolledUp) cb.scrollTop = cb.scrollHeight;
}

// ============================================================
// AVATAR BUILDER
// ============================================================
function buildAvatar(avatarUrl, username, color, size) {
  size = size || 36;
  if (avatarUrl) {
    const img = document.createElement("img");
    img.src = avatarUrl; img.className = "av-img";
    img.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;display:block;flex-shrink:0;`;
    img.onerror = () => img.replaceWith(buildInitialAvatar(username, color, size));
    return img;
  }
  return buildInitialAvatar(username, color, size);
}
function buildInitialAvatar(username, color, size) {
  size = size || 36;
  const d = document.createElement("div");
  d.textContent = (username||"?").charAt(0).toUpperCase();
  d.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,${color}cc,${color}66);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${Math.floor(size*0.4)}px;flex-shrink:0;color:#fff;user-select:none;`;
  return d;
}

// ============================================================
// BAD WORD / SLUR FILTER
// ============================================================
const BAD_WORDS = [
  "nigger","nigga","niga","niger","faggot","faggit","faget","chink","coon","gook",
  "kike","spic","wetback","fag","dyke","tranny","retard","retarded","spastic",
  "cracker","beaner","raghead","towelhead","zipperhead","slant","hymie","jigaboo",
  "porchmoney","uncletom","whitey","peckerwood","redneck","hillbilly",
  "porn","xxx","hardcore","incest","bestiality","pedophile","pedo","lolita"
];

function normalizeText(t) {
  // Step 1: lowercase
  let s = t.toLowerCase();
  // Step 2: remove separators between letters (handles d-o-g, d.o.g, d o g etc.)
  s = s.replace(/(.)\s*[-_.·•|*,;:'"`~^+=\/\\@#%&(){}<>[\]]\s*(?=.)/g, '$1');
  // Step 3: collapse remaining whitespace
  s = s.replace(/\s+/g,"");
  // Step 4: leet speak substitutions
  s = s.replace(/[1!|l]/g,"i")
       .replace(/3/g,"e")
       .replace(/0/g,"o")
       .replace(/@/g,"a")
       .replace(/[5$]/g,"s")
       .replace(/[7+]/g,"t")
       .replace(/ph/g,"f")
       .replace(/[ck]/g,"c")
       .replace(/vv/g,"w")
       .replace(/x/g,"cs")
       .replace(/[2z]/g,"z");
  // Step 5: collapse repeated characters (heeello -> hello)
  s = s.replace(/(.)\1{2,}/g,"$1$1");
  return s;
}

function buildSlurRegex(word) {
  // Build a regex that matches the word even with single separators between each letter
  const sep = "[-_.·\\s*|,;:'`~^+\\/\\\\]*";
  const chars = [...normalizeText(word)];
  const pattern = chars.map(c => {
    // Map back common leet variants
    const variants = {"i":"[i1l!|]","e":"[e3]","o":"[o0]","a":"[a@4]","s":"[s5$]","t":"[t7+]","g":"[g9]","b":"[b8]","c":"[ck]"};
    return variants[c] || c;
  }).join(sep);
  return new RegExp(pattern, "i");
}

const SLUR_REGEXES = BAD_WORDS.map(w => buildSlurRegex(w));

function filterBadWords(msg) {
  const norm = normalizeText(msg);
  // Use word-boundary style: only flag if bad word appears as a standalone token
  // Split normalized text into words (by any non-alpha boundary) to avoid partial matches
  const normWords = norm.split(/[^a-z]+/).filter(Boolean);
  if (BAD_WORDS.some(w => {
    const nw = normalizeText(w);
    return normWords.includes(nw);
  })) return true;
  // Regex check on original for spaced-out variants, but require word boundaries
  if (SLUR_REGEXES.some((re, i) => {
    const wordRe = new RegExp("(?<![a-z])" + re.source + "(?![a-z])", "i");
    return wordRe.test(msg);
  })) return true;
  return false;
}

async function applySlurTimeout(message) {
  if (!myUid) return;
  const duration = 30 * 60 * 1000; // 30 minutes
  const until = Date.now() + duration;
  await db.ref("config/muted/"+myUid).set({ until, by: "AutoMod", byUid: "system" });
  // Log to mod logs
  await db.ref("modLogs").push({
    type: "auto_mute",
    action: "Auto-muted 30min for slur",
    targetUid: myUid,
    targetUsername: myUsername,
    by: "AutoMod",
    byUid: "system",
    message: message,
    at: Date.now(),
    timestamp: Date.now()
  });
  await logPublicModAction("mute", "Auto-muted 30min (AutoMod)", myUid, myUsername, "Slur detected", "AutoMod");
}

async function autoModBan(targetUid, targetUsername, reason) {
  const banData = { reason: reason || "AutoMod ban", by: "AutoMod", byUid: "system", at: Date.now() };
  await db.ref("config/banned/"+targetUid).set(banData);
  // Device ban all known devices
  const devSnap = await db.ref("users/"+targetUid+"/devices").once("value");
  if (devSnap.exists()) {
    const updates = {};
    Object.keys(devSnap.val()).forEach(fp => {
      updates["config/deviceBans/"+fp] = { uid: targetUid, reason: banData.reason, at: banData.at };
    });
    await db.ref().update(updates);
  }
  await db.ref("modLogs").push({
    type:"auto_ban", action:"Auto-banned user", targetUid, targetUsername,
    by: "AutoMod", byUid: "system", reason: banData.reason, at: Date.now(), timestamp: Date.now()
  });
  await logPublicModAction("ban", "Auto-banned (AutoMod)", targetUid, targetUsername, banData.reason, "AutoMod");
}

// ============================================================
// MARKDOWN PARSER
// ============================================================
function parseMessage(raw) {
  let msg = esc(raw);
  msg = msg.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" onclick="this.classList.add(\'revealed\')">$1</span>');
  msg = msg.replace(/`([^`]+)`/g, '<code>$1</code>');
  msg = msg.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  msg = msg.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  msg = msg.replace(/~~(.+?)~~/g, '<s>$1</s>');
  ["red","orange","yellow","green","blue","purple","pink"].forEach(c => {
    msg = msg.replace(new RegExp("\\["+c+":([^\\]]+)\\]","g"), `<span class="text-${c}">$1</span>`);
  });
  msg = msg.replace(/@(\w+)/g, (match, name) => {
    const isMe = name.toLowerCase() === myUsername.toLowerCase();
    return `<span class="mention${isMe?" mention-me":""}">${esc(match)}</span>`;
  });
  msg = msg.replace(/(https?:\/\/[^\s<]+[^\s<.,:;"')\]{}])/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="chat-link">$1</a>');
  return msg;
}

function isImageUrl(url) {
  return /\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(url.split("?")[0]) ||
         /^https?:\/\/i\.ibb\.co\//i.test(url) ||
         /^https?:\/\/i\.imgur\.com\//i.test(url);
}

// ============================================================
// USERNAME AVAILABILITY
// ============================================================
function usernameToEmail(username) { return username.toLowerCase().trim()+"@storyn.chat"; }

let unameCheckTimer = null;
function liveUsernameCheck(inputEl, hintEl) {
  inputEl.addEventListener("input", () => {
    clearTimeout(unameCheckTimer);
    const val = inputEl.value.trim();
    if (!val || val.length < 2) { hintEl.textContent=""; hintEl.className="field-hint"; return; }
    hintEl.textContent="Checking..."; hintEl.className="field-hint";
    unameCheckTimer = setTimeout(() => {
      db.ref("users").orderByChild("usernameLower").equalTo(val.toLowerCase()).once("value", snap => {
        const taken = snap.exists();
        hintEl.textContent = taken ? "✗ Already taken" : "✓ Available";
        hintEl.className = "field-hint "+(taken?"bad":"ok");
      });
    }, 400);
  });
}
liveUsernameCheck($("signupUsername"), $("usernameHint"));

// ============================================================
// AUTH NAVIGATION
// ============================================================
function showCard(which) {
  ["loginCard","signupCard"].forEach(id => $(id).style.display="none");
  $({login:"loginCard",signup:"signupCard"}[which]).style.display="";
  clearError("loginError"); clearError("signupError");
}
$("showSignupBtn").addEventListener("click", e => { e.preventDefault(); showCard("signup"); });
$("showLoginBtn").addEventListener("click",  e => { e.preventDefault(); showCard("login"); });
["loginUsername","loginPassword"].forEach(id => {
  $(id).addEventListener("keydown", e => { if(e.key==="Enter") $("loginBtn").click(); });
});
["signupUsername","signupPassword","signupConfirm"].forEach(id => {
  $(id).addEventListener("keydown", e => { if(e.key==="Enter") $("signupBtn").click(); });
});

// ============================================================
// DEVICE FINGERPRINT (ban evasion prevention)
// ============================================================
function getDeviceFingerprint() {
  const nav = window.navigator;
  const parts = [
    nav.userAgent, nav.language, nav.hardwareConcurrency,
    screen.width+"x"+screen.height, screen.colorDepth,
    nav.platform, Intl.DateTimeFormat().resolvedOptions().timeZone
  ];
  let hash = 0;
  const str = parts.join("|");
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return "fp_" + Math.abs(hash).toString(36);
}

async function checkDeviceBan() {
  const fp = getDeviceFingerprint();
  const snap = await db.ref("config/deviceBans/"+fp).once("value");
  return snap.exists() ? snap.val() : null;
}

async function registerDevice(uid) {
  const fp = getDeviceFingerprint();
  await db.ref("users/"+uid+"/devices/"+fp).set({ lastSeen: Date.now() });
  await db.ref("config/deviceToUser/"+fp).set(uid);
}


$("loginBtn").addEventListener("click", async () => {
  clearError("loginError");
  const username = $("loginUsername").value.trim();
  const password = $("loginPassword").value;
  if (!username || !password) return showError("loginError","Please fill in all fields.");
  try {
    await auth.signInWithEmailAndPassword(usernameToEmail(username), password);
  } catch(err) { showError("loginError", friendlyError(err.code)); }
});

// ============================================================
// SIGN UP
// ============================================================
$("signupBtn").addEventListener("click", async () => {
  clearError("signupError");
  const username = $("signupUsername").value.trim();
  const password = $("signupPassword").value;
  const confirm  = $("signupConfirm").value;
  if (!username || username.length < 2) return showError("signupError","Username must be at least 2 characters.");
  if (/[^a-zA-Z0-9_]/.test(username)) return showError("signupError","Username can only contain letters, numbers, and underscores.");
  if (!password || password.length < 6) return showError("signupError","Password must be at least 6 characters.");
  if (password !== confirm) return showError("signupError","Passwords do not match.");
  const snap = await db.ref("users").orderByChild("usernameLower").equalTo(username.toLowerCase()).once("value");
  if (snap.exists()) return showError("signupError","That username is already taken.");
  try {
    const result = await auth.createUserWithEmailAndPassword(usernameToEmail(username), password);
    await db.ref("users/"+result.user.uid).set({
      username, usernameLower: username.toLowerCase(),
      color: "#4da6ff", avatarUrl: null, lastUsernameChange: 0,
      createdAt: Date.now(), messageCount: 0, rep: 0, status: "",
      bio: "", bannerUrl: null,
      timeOnlineMinutes: 0, currentStreak: 0, lastActiveDay: "",
      imagesSent: 0, pollsVotedIn: 0
    });
  } catch(err) { showError("signupError", friendlyError(err.code)); }
});

// ============================================================
// AUTH STATE
// ============================================================
auth.onAuthStateChanged(async user => {
  if (!user) {
    appStarted = false;
    $("authScreen").style.display = "flex";
    $("appContainer").style.display = "none";
    $("loadingScreen").style.display = "none";
    $("banScreen").style.display = "none";
    showCard("login"); return;
  }

  const banSnap = await db.ref("config/banned/"+user.uid).once("value");
  if (banSnap.exists()) {
    // Also ban this device fingerprint
    const fp = getDeviceFingerprint();
    const banData = banSnap.val();
    await db.ref("config/deviceBans/"+fp).set({ uid: user.uid, reason: banData.reason, at: banData.at||Date.now() });
    $("authScreen").style.display = "none";
    $("loadingScreen").style.display = "none";
    $("appContainer").style.display = "none";
    $("banScreen").style.display = "flex";
    $("banReason").textContent = banData.reason || "No reason given.";
    $("banBy").textContent = banData.by || "a moderator";
    return;
  }

  // Check if this device is fingerprint-banned (new account evasion)
  const deviceBan = await checkDeviceBan();
  if (deviceBan) {
    $("authScreen").style.display = "none";
    $("loadingScreen").style.display = "none";
    $("appContainer").style.display = "none";
    $("banScreen").style.display = "flex";
    $("banReason").textContent = (deviceBan.reason || "Ban evasion detected.") + " (Device banned)";
    $("banBy").textContent = "AutoMod";
    return;
  }

  const snap = await db.ref("users/"+user.uid).once("value");
  if (!snap.exists()) { await auth.signOut(); return; }
  if (appStarted) return;
  appStarted = true;
  currentUser = user; myUid = user.uid;
  const data = snap.val();
  myUsername = data.username || "User";
  myColor    = data.color    || "#4da6ff";
  myAvatar   = data.avatarUrl || null;
  myStatus   = data.status   || "";
  myBio      = data.bio      || "";
  myBanner   = data.bannerUrl || null;
  const savedBgUrl = data.bgImageUrl || null;
  if (savedBgUrl) { localStorage.setItem("snc_bg_image", savedBgUrl); }
  else { /* keep localStorage value if any */ }

  db.ref("config/ownerUid").once("value", ownerSnap => {
    if (ownerSnap.val()) {
      ownerUid = ownerSnap.val();
    } else {
      db.ref("config/ownerUid").set(myUid).then(() => { ownerUid = myUid; updateSidebarUser(); });
    }
    updateSidebarUser();
  });

  db.ref("config/mods").on("value", snap => {
    modUids = snap.val() || {};
    updateSidebarUser();
    if (currentChannel === "modchat" && !amOwner() && !amMod()) switchChannel("general");
  });
  db.ref("config/devs").on("value", snap => { devUids = snap.val() || {}; updateSidebarUser(); });
  db.ref("config/muted").on("value", snap => { mutedUids = snap.val() || {}; checkMuteStatus(); });
  db.ref("config/banned/"+myUid).on("value", snap => {
    if (snap.exists()) {
      const banData = snap.val();
      $("appContainer").style.display = "none";
      $("loadingScreen").style.display = "none";
      $("authScreen").style.display = "none";
      $("banScreen").style.display = "flex";
      $("banReason").textContent = banData.reason || "No reason given.";
      $("banBy").textContent = banData.by || "a moderator";
    } else {
      if ($("banScreen").style.display === "flex") {
        $("banScreen").style.display = "none";
        $("appContainer").style.display = "flex";
      }
    }
  });

  // Load my custom reactions
  db.ref("users/"+myUid+"/customReactions").on("value", snap => {
    myCustomReactions = snap.val() || [];
  });

  // Load my achievements
  db.ref("users/"+myUid+"/achievements").on("value", snap => {
    myAchievements = snap.val() || {};
  });

  checkPendingWarnNotification();
  updateStreakAndDay();
  registerDevice(myUid);

  // Multi-tab / multi-account detection: mark session in sessionStorage
  const sessionKey = "snc_session_uid";
  const existingSession = sessionStorage.getItem(sessionKey);
  if (existingSession && existingSession !== user.uid) {
    // Different UID in same tab session - force sign out of previous
    console.log("Session UID mismatch - enforcing single session");
  }
  sessionStorage.setItem(sessionKey, user.uid);

  $("authScreen").style.display = "none";
  startApp();
});

// ============================================================
// STREAK & DAY TRACKING
// ============================================================
async function updateStreakAndDay() {
  if (!myUid) return;
  const now = new Date();
  const today = now.getFullYear()+"_"+(now.getMonth()+1).toString().padStart(2,"0")+"_"+now.getDate().toString().padStart(2,"0");

  const snap = await db.ref("users/"+myUid).once("value");
  const data = snap.val() || {};
  const lastDay = data.lastActiveDay || "";

  if (lastDay === today) return; // already updated today

  // Calculate streak
  let streak = data.currentStreak || 0;
  if (lastDay) {
    const lastDate = new Date(lastDay.replace(/_/g, "-"));
    const todayDate = new Date(today.replace(/_/g, "-"));
    const diffDays = Math.round((todayDate - lastDate) / (1000*60*60*24));
    if (diffDays === 1) {
      streak += 1;
    } else if (diffDays > 1) {
      streak = 1;
    }
  } else {
    streak = 1;
  }

  await db.ref("users/"+myUid).update({
    lastActiveDay: today,
    currentStreak: streak,
    [`activeDays/${today}`]: true
  });
}

// ============================================================
// TIME ONLINE TRACKER (every 1 minute)
// ============================================================
function startOnlineTimer() {
  clearInterval(onlineMinuteTimer);
  onlineMinuteTimer = setInterval(() => {
    if (!myUid) return;
    db.ref("users/"+myUid+"/timeOnlineMinutes").transaction(c => (c||0)+1);
    checkAchievements();
  }, 60000);
}

// ============================================================
// ACHIEVEMENT CHECKER
// ============================================================
async function checkAchievements() {
  if (!myUid) return;
  const snap = await db.ref("users/"+myUid).once("value");
  const data = snap.val() || {};
  const friendSnap = await db.ref("users/"+myUid+"/friends").once("value");
  const extra = { friendCount: friendSnap.numChildren ? friendSnap.numChildren() : 0 };

  for (const ach of ACHIEVEMENTS) {
    if (myAchievements[ach.id]) continue;
    if (ach.check(data, extra)) {
      await db.ref("users/"+myUid+"/achievements/"+ach.id).set(true);
      showToast("🏅 Achievement unlocked: "+ach.name, "ok");
    }
  }
}

// ============================================================
// LOGOUT
// ============================================================
$("logoutBtn").addEventListener("click", () => {
  appStarted = false;
  cleanupPresence();
  setTyping(false);
  clearTimeout(muteExpireTimer);
  clearInterval(leaderboardTimer);
  clearInterval(onlineMinuteTimer);
  if (reportsListener) { db.ref("reports").off("value", reportsListener); reportsListener = null; }
  Object.values(msgListeners).forEach(({ ref: r, fn: f }) => { try { r.off("child_added", f); } catch(e){} });
  msgListeners = {};
  auth.signOut();
});

// ============================================================
// START APP
// ============================================================
function startApp() {
  $("loadingScreen").style.display = "flex";
  $("appContainer").style.display = "none";
  loadTheme();
  db.ref("users/"+myUid).on("value", snap => {
    const d = snap.val() || {};
    myUsername = d.username || myUsername;
    myColor    = d.color    || myColor;
    myAvatar   = d.avatarUrl || null;
    myStatus   = d.status   || "";
    myBio      = d.bio      || "";
    myBanner   = d.bannerUrl || null;
    updateSidebarUser();
  });
  db.ref("users").on("value", snap => { allUsersCache = snap.val() || {}; });
  db.ref("config/customRoles").on("value", snap => { customRoles = snap.val() || {}; });
  db.ref("config/customChannels").on("value", snap => {
    customChannels = snap.val() || {};
    renderCustomChannelButtons();
  });
  db.ref("presence").on("value", snap => {
    const data = snap.val() || {};
    $("onlineCount").textContent = Object.keys(data).length;
    renderOnlineList(data);
  });
  db.ref("users/"+myUid+"/friends").on("value", snap => {
    myFriends = snap.val() || {};
    // refresh friends modal if open
    if ($("friendsModal") && $("friendsModal").style.display !== "none" && friendsModalTab === "friends") {
      renderFriendsModalTab("friends");
    }
  });
  db.ref("users/"+myUid+"/blocked").on("value", snap => {
    myBlocked = snap.val() || {};
  });
  db.ref("friendRequests/"+myUid).on("value", snap => {
    renderFriendRequests(snap.val() || {});
  });
  runLoadingBar();
}

function runLoadingBar() {
  const bar = $("loadingBar"); let pct = 0;
  const iv = setInterval(() => {
    pct += 4; bar.style.width = Math.min(pct,100)+"%";
    if (pct >= 100) {
      clearInterval(iv);
      setTimeout(() => {
        $("loadingScreen").style.display = "none";
        $("appContainer").style.display = "flex";
        setupApp();
        applyBackgroundImage(localStorage.getItem("snc_bg_image")||null);
        setTimeout(() => { userScrolledUp = false; scrollToBottom(true); }, 120);
      }, 200);
    }
  }, 30);
}

// ============================================================
// SETUP APP
// ============================================================
function setupApp() {
  updateSidebarUser();
  setupAvatarUpload();
  setupPresence();
  setupChannelButtons();
  setupInput();
  setupSettings();
  setupFormatToolbar();
  setupSearch();
  buildThemeGrid();
  buildSizeRow();
  switchChannel("general");
  setupUnreadListeners();
  startOnlineTimer();

  // Logo click → leaderboard
  const logoBtn = document.querySelector(".sidebar-header");
  if (logoBtn) {
    logoBtn.style.cursor = "pointer";
    logoBtn.addEventListener("click", () => switchChannel("leaderboard"));
  }

  // Friends button → open friends modal
  const friendsBtn = $("friendsBtn");
  if (friendsBtn) friendsBtn.addEventListener("click", openFriendsModal);
  setupFriendsModal();

  // DM button
  const dmBtn = $("dmBtn");
  if (dmBtn) dmBtn.addEventListener("click", openDMOverlay);
  setupDMSystem();
  setupNotificationSystem();

  $("chatbox").addEventListener("scroll", function() {
    const dist = this.scrollHeight - this.scrollTop - this.clientHeight;
    userScrolledUp = dist > 120;
    if (!userScrolledUp) $("scrollBtn").style.display = "none";
  });
}

// ============================================================
// MUTE SYSTEM
// ============================================================
function checkMuteStatus() {
  if (!myUid) return;
  clearTimeout(muteExpireTimer);
  clearInterval(muteCountdownInterval);
  const muteData = mutedUids[myUid];
  if (muteData && muteData.until > Date.now()) {
    $("muteNotice").style.display = "flex";
    $("inputRow").style.display = "none";
    $("formatToolbar").style.display = "none";

    function updateCountdown() {
      const remaining = muteData.until - Date.now();
      if (remaining <= 0) {
        clearInterval(muteCountdownInterval);
        db.ref("config/muted/"+myUid).remove();
        $("muteNotice").style.display = "none";
        if (currentChannel !== "announcements" && currentChannel !== "leaderboard" && currentChannel !== "myleaderboard") {
          $("inputRow").style.display = "flex";
          $("formatToolbar").style.display = "flex";
        }
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      const untilTime = new Date(muteData.until).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
      $("muteUntilTime").textContent = untilTime + " (" + (mins > 0 ? mins+"m " : "") + secs+"s)";
    }
    updateCountdown();
    muteCountdownInterval = setInterval(updateCountdown, 1000);

    muteExpireTimer = setTimeout(() => {
      clearInterval(muteCountdownInterval);
      db.ref("config/muted/"+myUid).remove();
      $("muteNotice").style.display = "none";
      if (currentChannel !== "announcements" && currentChannel !== "leaderboard" && currentChannel !== "myleaderboard") {
        $("inputRow").style.display = "flex";
        $("formatToolbar").style.display = "flex";
      }
    }, muteData.until - Date.now());
  } else if (muteData && muteData.until <= Date.now()) {
    db.ref("config/muted/"+myUid).remove();
    $("muteNotice").style.display = "none";
  } else {
    $("muteNotice").style.display = "none";
  }
}

function isMuted(uid) {
  const muteData = mutedUids[uid];
  return muteData && muteData.until > Date.now();
}

async function muteUser(targetUid, targetUsername) {
  if (!canModerate()) return;
  $("muteModalTitle").textContent = "Mute " + targetUsername;
  $("muteModal").style.display = "flex";

  return new Promise(resolve => {
    const cleanup = () => { $("muteModal").style.display = "none"; resolve(false); };
    $("muteCancel").onclick = cleanup;

    document.querySelectorAll(".mute-dur-btn").forEach(btn => {
      btn.onclick = async () => {
        const dur = parseInt(btn.dataset.dur);
        $("muteModal").style.display = "none";
        await db.ref("config/muted/"+targetUid).set({
          until: Date.now() + dur,
          by: myUsername,
          byUid: myUid
        });
        // Log mute action
        await db.ref("modLogs").push({
          type:"mute", action:"Muted user for "+(dur/60000)+" minutes",
          targetUid, targetUsername,
          by: myUsername, byUid: myUid,
          duration: dur, at: Date.now(), timestamp: Date.now()
        });
        await logPublicModAction("mute", "Muted for "+(dur/60000)+" min", targetUid, targetUsername, "", myUsername);
        showToast("🔇 "+targetUsername+" has been muted", "ok");
        resolve(true);
      };
    });
  });
}

// ============================================================
// BAN SYSTEM
// ============================================================
async function banUser(targetUid, targetUsername) {
  if (!canModerate()) return;
  const reason = prompt("Ban reason for "+targetUsername+":");
  if (reason === null) return;
  const ok = await showConfirm("🔨","Ban "+targetUsername,"This will prevent them from accessing the chat.");
  if (!ok) return;
  const banData = { reason: reason || "No reason given.", by: myUsername, byUid: myUid, at: Date.now() };
  await db.ref("config/banned/"+targetUid).set(banData);
  // Clear any existing automod or manual mute so ban takes effect cleanly
  await db.ref("config/muted/"+targetUid).remove();
  // Device-ban all known fingerprints for this user
  const devSnap = await db.ref("users/"+targetUid+"/devices").once("value");
  if (devSnap.exists()) {
    const updates = {};
    Object.keys(devSnap.val()).forEach(fp => {
      updates["config/deviceBans/"+fp] = { uid: targetUid, reason: banData.reason, at: banData.at };
    });
    await db.ref().update(updates);
  }
  // Log to mod logs
  await db.ref("modLogs").push({
    type:"ban", action:"Banned user", targetUid, targetUsername,
    by: myUsername, byUid: myUid, reason: banData.reason, at: Date.now(), timestamp: Date.now()
  });
  await logPublicModAction("ban", "Banned", targetUid, targetUsername, banData.reason, myUsername);
  showToast("🔨 "+targetUsername+" has been banned", "ok");
}

// ============================================================
// WARN SYSTEM
// ============================================================
async function warnUser(targetUid, targetUsername) {
  if (!canModerate()) return;
  const reason = prompt("Warning reason for "+targetUsername+":");
  if (!reason || !reason.trim()) return;
  const warnRef = db.ref("users/"+targetUid+"/warnings").push();
  await warnRef.set({ reason: reason.trim(), by: myUsername, byUid: myUid, at: Date.now(), seen: false });
  showToast("⚠️ "+targetUsername+" has been warned", "ok");
}

async function checkPendingWarnNotification() {
  if (!myUid) return;
  const snap = await db.ref("users/"+myUid+"/warnings").orderByChild("seen").equalTo(false).once("value");
  if (!snap.exists()) return;
  const warns = snap.val();
  const entries = Object.entries(warns);
  if (!entries.length) return;
  entries.sort((a,b) => b[1].at - a[1].at);
  const [warnId, warn] = entries[0];
  setTimeout(() => {
    showToast("⚠️ You were warned: "+warn.reason, "warn");
    db.ref("users/"+myUid+"/warnings/"+warnId+"/seen").set(true);
  }, 2000);
}

// ============================================================
// SIDEBAR USER PANEL
// ============================================================
function updateSidebarUser() {
  $("sidebarName").textContent = myUsername;
  $("sidebarName").style.color = myColor;
  const tagEl = $("sidebarTag");

  let tags = [];
  if (ownerUid && myUid === ownerUid) tags.push("[Owner]");
  if (isMod(myUid)) tags.push("[Mod]");
  if (isDev(myUid)) tags.push("[Dev]");
  tagEl.textContent = tags.join(" ");

  if (ownerUid && myUid === ownerUid) {
    tagEl.style.color = "#ffffff";
    tagEl.style.textShadow = "0 0 8px rgba(255,255,255,0.7)";
  } else if (isMod(myUid)) {
    tagEl.style.color = "#ff4d4d";
    tagEl.style.textShadow = "0 0 8px rgba(255,77,77,0.7)";
  } else if (isDev(myUid)) {
    tagEl.style.color = "#aaaaaa";
    tagEl.style.textShadow = "0 0 6px rgba(180,180,180,0.5)";
  } else {
    tagEl.style.color = "";
    tagEl.style.textShadow = "";
  }

  const modSection = $("modSection");
  if (modSection) modSection.style.display = (amOwner() || amMod()) ? "" : "none";
  const broadcastBtn = $("broadcastBtn");
  if (broadcastBtn) broadcastBtn.style.display = amOwner() ? "" : "none";

  renderSidebarAvatar();
  updateAnnouncementsUI();
  checkMuteStatus();
  // Remove char limit for owner
  if (amOwner()) {
    const inp = $("msgInput");
    if (inp) inp.removeAttribute("maxlength");
  }
}

function renderSidebarAvatar() {
  const el = $("sidebarAvatar");
  el.innerHTML = ""; el.style.background = "";
  if (myAvatar) {
    const img = document.createElement("img");
    img.src = myAvatar; img.className = "av-img";
    img.onerror = () => { el.innerHTML=""; el.textContent=myUsername.charAt(0).toUpperCase(); el.style.background=`linear-gradient(135deg,${myColor}cc,${myColor}66)`; };
    el.appendChild(img);
  } else {
    el.textContent = myUsername.charAt(0).toUpperCase();
    el.style.background = `linear-gradient(135deg,${myColor}cc,${myColor}66)`;
  }
}

// ============================================================
// AVATAR UPLOAD
// ============================================================
function setupAvatarUpload() {
  const wrap = $("avatarWrap");
  wrap.addEventListener("click", () => $("avatarInput").click());
  $("avatarInput").addEventListener("change", async () => {
    const file = $("avatarInput").files[0]; if (!file) return;
    $("avatarInput").value = "";
    if (file.size > 5*1024*1024) return showToast("Image must be under 5MB","err");
    wrap.classList.add("uploading");
    const url = await uploadImgBB(file);
    wrap.classList.remove("uploading");
    if (!url) return showToast("Upload failed","err");
    myAvatar = url;
    await db.ref("users/"+myUid).update({ avatarUrl: url });
    renderSidebarAvatar();
  });
}

async function uploadImgBB(file) {
  const fd = new FormData(); fd.append("image", file);
  try {
    const res  = await fetch("https://api.imgbb.com/1/upload?key="+IMGBB_KEY, { method:"POST", body:fd });
    const json = await res.json();
    return json.success ? (json.data.display_url || json.data.url) : null;
  } catch(e) { return null; }
}

// ============================================================
// PRESENCE
// ============================================================
let presenceConnected = false;
function setupPresence() {
  const ref = db.ref("presence/"+myUid);
  db.ref(".info/connected").on("value", snap => {
    if (!snap.val()) { presenceConnected = false; return; }
    ref.onDisconnect().remove();
    ref.set({ username: myUsername, color: myColor, uid: myUid });
    const now = new Date();
    const today = now.getFullYear()+"_"+(now.getMonth()+1).toString().padStart(2,"0")+"_"+now.getDate().toString().padStart(2,"0");
    db.ref("users/"+myUid+"/activeDays/"+today).set(true);
    // Post welcome message to #general only once per tab session (not on Firebase reconnects)
    if (!presenceConnected) {
      presenceConnected = true;
      const welcomeKey = "snc_welcomed_" + myUid;
      if (!sessionStorage.getItem(welcomeKey)) {
        sessionStorage.setItem(welcomeKey, "1");
        const welcomeMsg = {
          name: "System", message: myUsername + " entered the chat 👋",
          time: new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
          timestamp: Date.now(), color: "#57f287", userId: "system", system: true
        };
        db.ref("messages/general").push(welcomeMsg);
      }
    }
  });
}

function cleanupPresence() {
  if (myUid) db.ref("presence/"+myUid).remove();
  db.ref("presence").off();
  db.ref(".info/connected").off();
}

function renderOnlineList(data) {
  const list = $("onlineList"); list.innerHTML = "";
  const entries = Object.entries(data);
  if (!entries.length) {
    list.innerHTML='<div style="font-size:11px;color:var(--text-dim);padding:4px 8px;">Nobody online</div>';
    return;
  }
  entries.forEach(([uid, d]) => {
    const row = document.createElement("div"); row.className = "online-row";
    row.style.cursor = "pointer";
    const av = buildAvatar(allUsersCache[uid]?.avatarUrl||null, d.username, d.color||"#4da6ff", 22);
    av.style.flexShrink = "0";
    const name = document.createElement("span"); name.className = "online-name";
    name.textContent = d.username+(uid===myUid?" (you)":""); name.style.color = d.color||"#4da6ff";
    const dot = document.createElement("span"); dot.className = "online-dot";
    row.appendChild(av); row.appendChild(name); row.appendChild(dot);
    row.addEventListener("click", () => openProfile(uid));
    list.appendChild(row);
  });
}

// ============================================================
// FRIENDS SYSTEM
// ============================================================
async function sendFriendRequest(targetUid) {
  if (targetUid === myUid) return showToast("You can't add yourself!","warn");
  if (myFriends[targetUid]) return showToast("Already friends!","warn");
  await db.ref("friendRequests/"+targetUid+"/"+myUid).set({
    username: myUsername, avatarUrl: myAvatar||null, color: myColor, sentAt: Date.now()
  });
  showToast("Friend request sent!","ok");
}

// ============================================================
// FRIENDS MODAL
// ============================================================
let friendsModalTab = "friends";
let myOutgoingRequests = {}; // requests I've sent

function openFriendsModal() {
  $("friendsModal").style.display = "flex";
  renderFriendsModalTab(friendsModalTab);
}

function setupFriendsModal() {
  $("friendsModalClose").addEventListener("click", () => { $("friendsModal").style.display = "none"; });
  $("friendsModal").addEventListener("click", e => { if (e.target === $("friendsModal")) $("friendsModal").style.display = "none"; });
  document.querySelectorAll(".friends-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".friends-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      friendsModalTab = tab.dataset.tab;
      renderFriendsModalTab(friendsModalTab);
    });
  });

  // Listen for outgoing requests I've sent
  db.ref("friendRequests").on("value", snap => {
    myOutgoingRequests = {};
    const all = snap.val() || {};
    Object.entries(all).forEach(([targetUid, requests]) => {
      if (requests[myUid]) myOutgoingRequests[targetUid] = requests[myUid];
    });
    if ($("friendsModal").style.display !== "none" && friendsModalTab === "outgoing") {
      renderFriendsModalTab("outgoing");
    }
  });
}

async function renderFriendsModalTab(tab) {
  const body = $("friendsModalBody");
  body.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">Loading...</div>';

  if (tab === "friends") {
    const entries = Object.entries(myFriends);
    if (!entries.length) {
      body.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-dim);font-size:13px;">No friends yet. Add someone from their profile!</div>';
      return;
    }
    const presSnap = await db.ref("presence").once("value");
    const online = presSnap.val() || {};
    body.innerHTML = "";
    // Sort: online first
    entries.sort(([a],[b]) => (!!online[b] - !!online[a]));
    entries.forEach(([uid, friendData]) => {
      const u = allUsersCache[uid] || {};
      const isOnline = !!online[uid];
      const row = document.createElement("div"); row.className = "fm-row";
      const av = buildAvatar(u.avatarUrl||null, u.username||"?", u.color||"#4da6ff", 38);
      const info = document.createElement("div"); info.className = "fm-info";
      const nameEl = document.createElement("div"); nameEl.className = "fm-name";
      nameEl.textContent = friendData.nickname || u.username || "Unknown";
      nameEl.style.color = u.color||"#4da6ff";
      const statusEl = document.createElement("div"); statusEl.className = "fm-status";
      statusEl.innerHTML = isOnline
        ? '<span style="color:#23d160;">● Online</span>'
        : '<span style="color:var(--text-dim);">○ Offline</span>';
      if (u.status) statusEl.innerHTML += ` · ${esc(u.status)}`;
      info.appendChild(nameEl); info.appendChild(statusEl);
      const btns = document.createElement("div"); btns.className = "fm-btns";
      const profileBtn = document.createElement("button"); profileBtn.className = "confirm-btn ok fm-btn";
      profileBtn.textContent = "Profile";
      profileBtn.addEventListener("click", () => { $("friendsModal").style.display="none"; openProfile(uid); });
      const dmFriendBtn = document.createElement("button"); dmFriendBtn.className = "confirm-btn ok fm-btn";
      dmFriendBtn.textContent = "💬 DM";
      dmFriendBtn.addEventListener("click", () => { $("friendsModal").style.display="none"; openDMWith(uid); });
      const removeBtn = document.createElement("button"); removeBtn.className = "confirm-btn cancel fm-btn";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", async () => {
        const ok = await showConfirm("🤝","Remove Friend","Remove "+(u.username||"this user")+" from your friends?");
        if (!ok) return;
        await db.ref("users/"+myUid+"/friends/"+uid).remove();
        await db.ref("users/"+uid+"/friends/"+myUid).remove();
        showToast("Friend removed.","ok");
        renderFriendsModalTab("friends");
      });
      btns.appendChild(profileBtn); btns.appendChild(dmFriendBtn); btns.appendChild(removeBtn);
      row.appendChild(av); row.appendChild(info); row.appendChild(btns);
      body.appendChild(row);
    });

  } else if (tab === "incoming") {
    const snap = await db.ref("friendRequests/"+myUid).once("value");
    const requests = snap.val() || {};
    const entries = Object.entries(requests);
    if (!entries.length) {
      body.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-dim);font-size:13px;">No incoming requests.</div>';
      return;
    }
    body.innerHTML = "";
    entries.forEach(([fromUid, data]) => {
      const row = document.createElement("div"); row.className = "fm-row";
      const av = buildAvatar(data.avatarUrl||null, data.username||"?", data.color||"#4da6ff", 38);
      const info = document.createElement("div"); info.className = "fm-info";
      const nameEl = document.createElement("div"); nameEl.className = "fm-name";
      nameEl.textContent = data.username||"Unknown"; nameEl.style.color = data.color||"#4da6ff";
      const timeEl = document.createElement("div"); timeEl.className = "fm-status";
      timeEl.textContent = "Sent " + new Date(data.sentAt||Date.now()).toLocaleDateString();
      info.appendChild(nameEl); info.appendChild(timeEl);
      const btns = document.createElement("div"); btns.className = "fm-btns";
      const acceptBtn = document.createElement("button"); acceptBtn.className = "confirm-btn ok fm-btn";
      acceptBtn.textContent = "✅ Accept";
      acceptBtn.addEventListener("click", async () => {
        await db.ref("users/"+myUid+"/friends/"+fromUid).set({ addedAt: Date.now(), nickname: "" });
        await db.ref("users/"+fromUid+"/friends/"+myUid).set({ addedAt: Date.now(), nickname: "" });
        await db.ref("friendRequests/"+myUid+"/"+fromUid).remove();
        showToast("Now friends with "+data.username+"!","ok");
        checkAchievements();
        renderFriendsModalTab("incoming");
      });
      const declineBtn = document.createElement("button"); declineBtn.className = "confirm-btn cancel fm-btn";
      declineBtn.textContent = "❌ Decline";
      declineBtn.addEventListener("click", async () => {
        await db.ref("friendRequests/"+myUid+"/"+fromUid).remove();
        renderFriendsModalTab("incoming");
      });
      btns.appendChild(acceptBtn); btns.appendChild(declineBtn);
      row.appendChild(av); row.appendChild(info); row.appendChild(btns);
      body.appendChild(row);
    });

  } else if (tab === "outgoing") {
    const entries = Object.entries(myOutgoingRequests);
    if (!entries.length) {
      body.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-dim);font-size:13px;">No pending outgoing requests.</div>';
      return;
    }
    body.innerHTML = "";
    entries.forEach(([targetUid, data]) => {
      const u = allUsersCache[targetUid] || {};
      const row = document.createElement("div"); row.className = "fm-row";
      const av = buildAvatar(u.avatarUrl||null, u.username||"?", u.color||"#4da6ff", 38);
      const info = document.createElement("div"); info.className = "fm-info";
      const nameEl = document.createElement("div"); nameEl.className = "fm-name";
      nameEl.textContent = u.username||"Unknown"; nameEl.style.color = u.color||"#4da6ff";
      const timeEl = document.createElement("div"); timeEl.className = "fm-status";
      timeEl.textContent = "Pending…";
      info.appendChild(nameEl); info.appendChild(timeEl);
      const btns = document.createElement("div"); btns.className = "fm-btns";
      const cancelBtn = document.createElement("button"); cancelBtn.className = "confirm-btn cancel fm-btn";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", async () => {
        await db.ref("friendRequests/"+targetUid+"/"+myUid).remove();
        showToast("Request cancelled.","ok");
        renderFriendsModalTab("outgoing");
      });
      btns.appendChild(cancelBtn);
      row.appendChild(av); row.appendChild(info); row.appendChild(btns);
      body.appendChild(row);
    });
  } else if (tab === "blocked") {
    const entries = Object.entries(myBlocked);
    if (!entries.length) {
      body.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-dim);font-size:13px;">You haven\'t blocked anyone.</div>';
      return;
    }
    body.innerHTML = "";
    entries.forEach(([uid, data]) => {
      const u = allUsersCache[uid] || {};
      const row = document.createElement("div"); row.className = "fm-row";
      const av = buildAvatar(u.avatarUrl||null, data.username||u.username||"?", u.color||"#4da6ff", 38);
      const info = document.createElement("div"); info.className = "fm-info";
      const nameEl = document.createElement("div"); nameEl.className = "fm-name";
      nameEl.textContent = data.username || u.username || "Unknown"; nameEl.style.color = u.color||"#4da6ff";
      const timeEl = document.createElement("div"); timeEl.className = "fm-status";
      timeEl.textContent = "Blocked " + (data.blockedAt ? new Date(data.blockedAt).toLocaleDateString() : "");
      info.appendChild(nameEl); info.appendChild(timeEl);
      const btns = document.createElement("div"); btns.className = "fm-btns";
      const unblockBtn = document.createElement("button"); unblockBtn.className = "confirm-btn ok fm-btn";
      unblockBtn.style.cssText = "background:rgba(87,242,135,0.1);border-color:rgba(87,242,135,0.3);color:#57f287;";
      unblockBtn.textContent = "✅ Unblock";
      unblockBtn.addEventListener("click", async () => {
        await db.ref("users/"+myUid+"/blocked/"+uid).remove();
        showToast("✅ " + (data.username||"User") + " unblocked.", "ok");
        renderFriendsModalTab("blocked");
      });
      btns.appendChild(unblockBtn);
      row.appendChild(av); row.appendChild(info); row.appendChild(btns);
      body.appendChild(row);
    });
  }
}

function renderFriendRequests(requests) {
  // Update badge count on the sidebar Friends button
  const badge = $("friendRequestBadge");
  const incomingBadge = $("incomingBadge");
  const count = Object.keys(requests).length;
  if (count > 0) {
    if (badge) { badge.style.display="inline-flex"; badge.textContent=count; }
    if (incomingBadge) { incomingBadge.style.display="inline-flex"; incomingBadge.textContent=count; }
  } else {
    if (badge) badge.style.display="none";
    if (incomingBadge) incomingBadge.style.display="none";
  }
  // Refresh modal if open on incoming tab
  if ($("friendsModal").style.display !== "none" && friendsModalTab === "incoming") {
    renderFriendsModalTab("incoming");
  }
}

function openNicknameModal(friendUid, currentNickname) {
  $("nicknameInput").value = currentNickname;
  $("nicknameModal").style.display = "flex";
  $("nicknameCancel").onclick = () => $("nicknameModal").style.display = "none";
  $("nicknameSave").onclick = async () => {
    const nick = $("nicknameInput").value.trim();
    await db.ref("users/"+myUid+"/friends/"+friendUid+"/nickname").set(nick);
    $("nicknameModal").style.display = "none";
    showToast("Nickname saved!","ok");
  };
}

// ============================================================
// USER PROFILE MODAL
// ============================================================
// ============================================================
// ROLE MANAGER MODAL (owner only, supports multiple roles)
// ============================================================
function openRoleManager(targetUid, username, userData) {
  let modal = $("roleManagerModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "roleManagerModal";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:600;backdrop-filter:blur(4px);";
    document.body.appendChild(modal);
    modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
  }
  const currentRoles = userData.customRoles || (userData.customRole ? [userData.customRole] : []);
  const roleKeys = Object.keys(customRoles);

  modal.innerHTML = "";
  const card = document.createElement("div");
  card.className = "confirm-card";
  card.style.cssText = "width:380px;max-width:95vw;text-align:left;";
  card.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <h3 style="font-size:15px;font-weight:800;">🏷️ Roles for ${esc(username)}</h3>
      <button onclick="this.closest('#roleManagerModal').remove()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:18px;">✕</button>
    </div>
    <div style="font-size:11px;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Current Roles</div>
    <div id="rmCurrentRoles" style="display:flex;flex-wrap:wrap;gap:6px;min-height:32px;margin-bottom:14px;"></div>
    <div style="font-size:11px;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Add Role</div>
    <div id="rmAddRoles" style="display:flex;flex-wrap:wrap;gap:6px;"></div>`;
  modal.appendChild(card);

  function refreshRoleManager(liveRoles) {
    const cur = $("rmCurrentRoles");
    const add = $("rmAddRoles");
    if (!cur || !add) return;
    cur.innerHTML = "";
    add.innerHTML = "";

    if (!liveRoles.length) {
      cur.innerHTML = '<span style="font-size:12px;color:var(--text-dim);">No roles assigned</span>';
    } else {
      liveRoles.forEach(rk => {
        if (!customRoles[rk]) return;
        const cr = customRoles[rk];
        const tag = document.createElement("span");
        tag.style.cssText = `display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:800;padding:3px 8px;border-radius:6px;background:${cr.color}22;color:${cr.color};border:1px solid ${cr.color}55;cursor:pointer;`;
        tag.innerHTML = `[${esc(cr.name)}] <span style="font-size:13px;opacity:.7;">✕</span>`;
        tag.title = "Click to remove";
        tag.addEventListener("click", async () => {
          const updated = liveRoles.filter(k => k !== rk);
          await db.ref("users/"+targetUid).update({ customRole: updated[0]||null, customRoles: updated });
          showToast("Role removed from "+username,"ok");
          refreshRoleManager(updated);
        });
        cur.appendChild(tag);
      });
    }

    const unassigned = roleKeys.filter(k => !liveRoles.includes(k));
    if (!unassigned.length) {
      add.innerHTML = '<span style="font-size:12px;color:var(--text-dim);">All roles assigned</span>';
    } else {
      unassigned.forEach(rk => {
        const cr = customRoles[rk];
        const btn = document.createElement("button");
        btn.style.cssText = `font-size:11px;font-weight:800;padding:3px 10px;border-radius:6px;background:var(--bg-lighter);color:${cr.color};border:1px solid ${cr.color}55;cursor:pointer;font-family:var(--font);transition:all .15s;`;
        btn.textContent = "+ " + cr.name;
        btn.addEventListener("click", async () => {
          const updated = [...liveRoles, rk];
          await db.ref("users/"+targetUid).update({ customRole: updated[0]||null, customRoles: updated });
          showToast("Role ["+cr.name+"] added to "+username,"ok");
          refreshRoleManager(updated);
        });
        add.appendChild(btn);
      });
    }
  }

  refreshRoleManager([...currentRoles]);
  modal.style.display = "flex";
}

async function openProfile(targetUid) {
  const modal = $("profileModal");
  const userData = allUsersCache[targetUid] || {};
  const color = userData.color || "#4da6ff";
  const username = userData.username || "Unknown";

  // Banner
  const bannerEl = $("profileBanner");
  if (bannerEl) {
    if (userData.bannerUrl) {
      bannerEl.style.backgroundImage = `url(${userData.bannerUrl})`;
      bannerEl.style.display = "block";
    } else {
      bannerEl.style.backgroundImage = `linear-gradient(135deg, ${color}44, ${color}11)`;
      bannerEl.style.display = "block";
    }
  }

  // Avatar — sits on top of banner
  const avWrap = $("profileAvatar");
  avWrap.innerHTML = "";
  const avEl = buildAvatar(userData.avatarUrl||null, username, color, 72);
  // Add border without clobbering the element's existing styles
  avEl.style.border = "4px solid var(--bg-dark)";
  avEl.style.flexShrink = "0";
  avEl.style.width = "72px";
  avEl.style.height = "72px";
  avEl.style.borderRadius = "50%";
  if (avEl.tagName === "IMG") {
    avEl.style.objectFit = "cover";
    avEl.style.display = "block";
  }
  avWrap.appendChild(avEl);

  // Name
  $("profileName").textContent = username;
  $("profileName").style.color = color;

  // Badges (roles only)
  const badgesEl = $("profileBadges"); badgesEl.innerHTML = "";
  if (isOwner(targetUid)) { const b=document.createElement("span"); b.className="owner-badge"; b.textContent="[Owner]"; badgesEl.appendChild(b); }
  if (isMod(targetUid))   { const b=document.createElement("span"); b.className="mod-badge"; b.textContent="[Mod]"; badgesEl.appendChild(b); }
  if (isDev(targetUid))   { const b=document.createElement("span"); b.className="dev-badge"; b.textContent="[Dev]"; badgesEl.appendChild(b); }
  // Support both single customRole (legacy) and customRoles array
  const userRoles = userData.customRoles || (userData.customRole ? [userData.customRole] : []);
  userRoles.forEach(roleKey => {
    if (customRoles[roleKey]) {
      const cr = customRoles[roleKey];
      const b = document.createElement("span");
      b.textContent = "[" + cr.name + "]";
      b.style.cssText = `font-size:10px;font-weight:800;padding:2px 6px;border-radius:3px;background:${cr.color}22;color:${cr.color};border:1px solid ${cr.color}55;margin-right:2px;`;
      badgesEl.appendChild(b);
    }
  });

  // Status
  $("profileStatus").textContent = userData.status ? "💬 "+userData.status : "";

  // Bio
  const bioEl = $("profileBio");
  if (bioEl) {
    if (userData.bio) {
      bioEl.textContent = userData.bio;
      bioEl.style.display = "";
    } else {
      bioEl.textContent = "";
      bioEl.style.display = "none";
    }
  }

  // Stats
  $("profileMsgCount").textContent = userData.messageCount || 0;
  $("profileRep").textContent = userData.rep || 0;

  const friendsSnap = await db.ref("users/"+targetUid+"/friends").once("value");
  $("profileFriendCount").textContent = friendsSnap.numChildren ? friendsSnap.numChildren() : 0;

  const joined = userData.createdAt ? new Date(userData.createdAt).toLocaleDateString() : "Unknown";
  $("profileJoined").textContent = joined;

  // Extra stats row
  const extraStats = $("profileExtraStats");
  if (extraStats) {
    extraStats.innerHTML = "";
    const stats = [
      { label: "⏱️ Online", value: formatMinutes(userData.timeOnlineMinutes||0) },
      { label: "🔥 Streak", value: (userData.currentStreak||0)+"d" },
      { label: "📸 Images", value: userData.imagesSent||0 },
      { label: "🗳️ Polls Voted", value: userData.pollsVotedIn||0 },
    ];
    stats.forEach(s => {
      const d = document.createElement("div"); d.className="profile-stat";
      d.innerHTML=`<span class="stat-value" style="font-size:14px;">${s.value}</span><span class="stat-label">${s.label}</span>`;
      extraStats.appendChild(d);
    });
  }

  // Actions
  const actionsEl = $("profileActions"); actionsEl.innerHTML = "";

  if (targetUid !== myUid) {
    // Rep button (toggle)
    const repGivenSnap = await db.ref("users/"+targetUid+"/repGivenBy/"+myUid).once("value");
    const alreadyRepped = repGivenSnap.exists();
    const repBtn = document.createElement("button"); repBtn.className="profile-action-btn rep-btn";
    repBtn.textContent = alreadyRepped ? "💔 Remove Rep" : "⭐ Give Rep";
    repBtn.addEventListener("click", () => toggleRep(targetUid, username, repBtn));
    actionsEl.appendChild(repBtn);

    // Friend button
    if (!myFriends[targetUid]) {
      if (!isBlocked(targetUid)) {
        const friendBtn = document.createElement("button"); friendBtn.className="profile-action-btn friend-btn";
        friendBtn.textContent = "➕ Add Friend";
        friendBtn.addEventListener("click", () => { sendFriendRequest(targetUid); friendBtn.textContent="✅ Sent!"; friendBtn.disabled=true; });
        actionsEl.appendChild(friendBtn);
      }
    } else {
      const friendedBtn = document.createElement("button"); friendedBtn.className="profile-action-btn friend-btn"; friendedBtn.disabled=true;
      friendedBtn.textContent = "✅ Friends";
      actionsEl.appendChild(friendedBtn);
      const dmProfileBtn = document.createElement("button"); dmProfileBtn.className="profile-action-btn friend-btn";
      dmProfileBtn.textContent = "💬 Send DM";
      dmProfileBtn.addEventListener("click", () => { $("profileModal").style.display="none"; openDMWith(targetUid); });
      actionsEl.appendChild(dmProfileBtn);
    }

    // Block / Unblock button
    if (isBlocked(targetUid)) {
      const unblockBtn = document.createElement("button"); unblockBtn.className="profile-action-btn";
      unblockBtn.style.cssText = "border-color:rgba(87,242,135,0.4);color:#57f287;";
      unblockBtn.textContent = "✅ Unblock";
      unblockBtn.addEventListener("click", () => unblockUser(targetUid, username));
      actionsEl.appendChild(unblockBtn);
    } else {
      const blockBtn = document.createElement("button"); blockBtn.className="profile-action-btn";
      blockBtn.style.cssText = "border-color:rgba(255,77,77,0.3);color:#ff4d4d;";
      blockBtn.textContent = "🚫 Block";
      blockBtn.addEventListener("click", () => blockUser(targetUid, username));
      actionsEl.appendChild(blockBtn);
    }

    if (canModerate() && !isOwner(targetUid)) {
      // Mod actions separator
      const modDivider = document.createElement("div");
      modDivider.style.cssText = "width:100%;border-top:1px solid var(--border);margin:6px 0 2px;padding-top:4px;";
      const modLabel = document.createElement("div");
      modLabel.style.cssText = "font-size:9px;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;width:100%;";
      modLabel.textContent = "🛡️ Mod Actions";
      actionsEl.appendChild(modDivider);
      actionsEl.appendChild(modLabel);

      const warnBtn = document.createElement("button"); warnBtn.className="profile-action-btn warn-btn";
      warnBtn.textContent = "⚠️ Warn";
      warnBtn.addEventListener("click", async () => {
        await warnUser(targetUid, username);
        $("profileModal").style.display = "none";
        openProfile(targetUid);
      });
      actionsEl.appendChild(warnBtn);

      // Manage Custom Roles (owner only, multiple roles per user)
      if (amOwner() && Object.keys(customRoles).length > 0) {
        const currentRoles = userData.customRoles || (userData.customRole ? [userData.customRole] : []);
        const roleBtn = document.createElement("button"); roleBtn.className="profile-action-btn";
        roleBtn.style.cssText = "border-color:rgba(168,85,247,0.4);color:#a855f7;";
        roleBtn.textContent = "🏷️ Manage Roles";
        roleBtn.addEventListener("click", () => openRoleManager(targetUid, username, userData));
        actionsEl.appendChild(roleBtn);
      }

      if (isMuted(targetUid)) {
        const unmuteBtn = document.createElement("button"); unmuteBtn.className="profile-action-btn mute-btn";
        unmuteBtn.textContent = "🔊 Unmute";
        unmuteBtn.addEventListener("click", async () => {
          await db.ref("config/muted/"+targetUid).remove();
          await db.ref("modLogs").push({
            type:"unmute", action:"Unmuted user",
            targetUid, targetUsername: username,
            by: myUsername, byUid: myUid,
            at: Date.now(), timestamp: Date.now()
          });
          showToast("🔊 "+username+" has been unmuted","ok");
          $("profileModal").style.display = "none";
        });
        actionsEl.appendChild(unmuteBtn);
      } else {
        const muteBtn = document.createElement("button"); muteBtn.className="profile-action-btn mute-btn";
        muteBtn.textContent = "🔇 Mute";
        muteBtn.addEventListener("click", async () => {
          await muteUser(targetUid, username);
          $("profileModal").style.display = "none";
          openProfile(targetUid);
        });
        actionsEl.appendChild(muteBtn);
      }

      const isBanned = await db.ref("config/banned/"+targetUid).once("value");
      if (isBanned.exists()) {
        const unbanBtn = document.createElement("button"); unbanBtn.className="profile-action-btn ban-btn";
        unbanBtn.textContent = "✅ Unban";
        unbanBtn.style.borderColor = "#57f287"; unbanBtn.style.color = "#57f287";
        unbanBtn.addEventListener("click", async () => {
          const ok = await showConfirm("✅","Unban "+username,"This will restore their access to the chat.");
          if (!ok) return;
          await db.ref("config/banned/"+targetUid).remove();
          // Also remove all device bans for this user
          const devSnap = await db.ref("users/"+targetUid+"/devices").once("value");
          if (devSnap.exists()) {
            const updates = {};
            Object.keys(devSnap.val()).forEach(fp => {
              updates["config/deviceBans/"+fp] = null;
            });
            await db.ref().update(updates);
          }
          // Log unban to mod logs
          await db.ref("modLogs").push({
            type:"unban", action:"Unbanned user",
            targetUid, targetUsername: username,
            by: myUsername, byUid: myUid,
            at: Date.now(), timestamp: Date.now()
          });
          showToast("✅ "+username+" has been unbanned","ok");
          $("profileModal").style.display = "none";
        });
        actionsEl.appendChild(unbanBtn);
      } else {
        const banBtn = document.createElement("button"); banBtn.className="profile-action-btn ban-btn";
        banBtn.textContent = "🔨 Ban";
        banBtn.addEventListener("click", async () => {
          await banUser(targetUid, username);
          $("profileModal").style.display = "none";
          openProfile(targetUid);
        });
        actionsEl.appendChild(banBtn);
      }
    }
  } else {
    // Own profile — no extra actions needed (banner is in settings)
  }

  // Warn history (mods/owner only)
  const warnsSection = $("profileWarns");
  const warnsList = $("warnsList");
  warnsList.innerHTML = "";
  if (canModerate()) {
    const warnsSnap = await db.ref("users/"+targetUid+"/warnings").once("value");
    if (warnsSnap.exists()) {
      warnsSection.style.display = "";
      const warns = warnsSnap.val();
      Object.entries(warns).sort((a,b)=>b[1].at-a[1].at).forEach(([warnId, w]) => {
        const item = document.createElement("div"); item.className="warn-item";
        item.style.position="relative";
        item.innerHTML = `<span class="warn-reason">${esc(w.reason)}</span><span class="warn-meta">by ${esc(w.by)} · ${new Date(w.at).toLocaleDateString()}</span>`;
        const delWarn = document.createElement("button");
        delWarn.textContent="✕"; delWarn.style.cssText="position:absolute;top:6px;right:6px;background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:12px;";
        delWarn.addEventListener("click", async () => {
          await db.ref("users/"+targetUid+"/warnings/"+warnId).remove();
          item.remove();
        });
        item.appendChild(delWarn);
        warnsList.appendChild(item);
      });
    } else {
      warnsSection.style.display = "";
      warnsList.innerHTML = '<div style="color:var(--text-dim);font-size:12px;">No warnings.</div>';
    }
  } else {
    warnsSection.style.display = "none";
  }

  modal.style.display = "flex";
  $("profileClose").onclick = () => { modal.style.display = "none"; };
  modal.onclick = e => { if (e.target === modal) modal.style.display = "none"; };
}

// Banner upload for own profile
document.addEventListener("DOMContentLoaded", () => {
  const bannerInput = $("bannerInput");
  if (bannerInput) {
    bannerInput.addEventListener("change", async () => {
      const file = bannerInput.files[0]; if (!file) return;
      bannerInput.value = "";
      if (file.size > 5*1024*1024) return showToast("Image must be under 5MB","err");
      showToast("Uploading banner...");
      const url = await uploadImgBB(file);
      if (!url) return showToast("Upload failed","err");
      myBanner = url;
      await db.ref("users/"+myUid).update({ bannerUrl: url });
      showToast("Banner updated!","ok");
    });
  }
});

function formatMinutes(mins) {
  if (mins < 60) return mins+"m";
  const h = Math.floor(mins/60);
  if (h < 24) return h+"h "+((mins%60))+"m";
  return Math.floor(h/24)+"d "+((h%24))+"h";
}

// ============================================================
// REP SYSTEM (toggle)
// ============================================================
async function toggleRep(targetUid, targetUsername, btn) {
  if (targetUid === myUid) return showToast("Can't rep yourself!","warn");
  const alreadySnap = await db.ref("users/"+targetUid+"/repGivenBy/"+myUid).once("value");
  if (alreadySnap.exists()) {
    // Remove rep
    await db.ref("users/"+targetUid+"/rep").transaction(cur => Math.max(0,(cur||0)-1));
    await db.ref("users/"+targetUid+"/repGivenBy/"+myUid).remove();
    showToast("💔 Removed rep from "+targetUsername, "warn");
    if (btn) { btn.textContent = "⭐ Give Rep"; }
    const repEl = $("profileRep");
    if (repEl) repEl.textContent = Math.max(0,(parseInt(repEl.textContent)||0)-1);
  } else {
    // Give rep
    await db.ref("users/"+targetUid+"/rep").transaction(cur => (cur||0)+1);
    await db.ref("users/"+targetUid+"/repGivenBy/"+myUid).set(true);
    showToast("⭐ Gave rep to "+targetUsername+"!", "ok");
    if (btn) { btn.textContent = "💔 Remove Rep"; }
    const repEl = $("profileRep");
    if (repEl) repEl.textContent = (parseInt(repEl.textContent)||0)+1;
  }
}

// ============================================================
// BLOCKING SYSTEM
// ============================================================
function isBlocked(uid) { return !!myBlocked[uid]; }

async function blockUser(targetUid, targetUsername) {
  const ok = await showConfirm("🚫","Block "+targetUsername,"You won't see their messages and they can't DM you.");
  if (!ok) return;
  await db.ref("users/"+myUid+"/blocked/"+targetUid).set({ username: targetUsername, blockedAt: Date.now() });
  // Remove from friends if friends
  if (myFriends[targetUid]) {
    await db.ref("users/"+myUid+"/friends/"+targetUid).remove();
    await db.ref("users/"+targetUid+"/friends/"+myUid).remove();
  }
  // Cancel any pending friend requests both ways
  await db.ref("friendRequests/"+myUid+"/"+targetUid).remove();
  await db.ref("friendRequests/"+targetUid+"/"+myUid).remove();
  showToast("🚫 "+targetUsername+" has been blocked.","ok");
  $("profileModal").style.display = "none";
}

async function unblockUser(targetUid, targetUsername) {
  await db.ref("users/"+myUid+"/blocked/"+targetUid).remove();
  showToast("✅ "+targetUsername+" has been unblocked.","ok");
  $("profileModal").style.display = "none";
  openProfile(targetUid);
}

// ============================================================
// TYPING
// ============================================================
function setTyping(active) {
  if (!myUid) return;
  if (currentChannel === "announcements" || currentChannel === "leaderboard" || currentChannel === "myleaderboard") return;
  const ref = db.ref("typing/"+currentChannel+"/"+myUid);
  active ? ref.set({ username: myUsername, ts: Date.now() }) : ref.remove();
}

function setupTypingListener(channel) {
  db.ref("typing/"+channel).off("value");
  if (channel === "announcements" || channel === "leaderboard" || channel === "myleaderboard") { $("typingDisplay").textContent = ""; return; }
  db.ref("typing/"+channel).on("value", snap => {
    const typers = snap.val() || {};
    const names = Object.entries(typers)
      .filter(([id,v]) => id!==myUid && v && Date.now()-(v.ts||0)<10000)
      .map(([,v]) => v.username);
    const el = $("typingDisplay");
    if (!names.length) { el.textContent=""; return; }
    el.textContent = names.length===1 ? names[0]+" is typing..."
      : names.length===2 ? names[0]+" and "+names[1]+" are typing..."
      : names.length+" people are typing...";
  });
}

// ============================================================
// ANNOUNCEMENTS UI
// ============================================================
function updateAnnouncementsUI() {
  if (currentChannel !== "announcements") return;
  const isAnnouncer = amOwner();
  if (!isMuted(myUid)) {
    $("inputRow").style.display     = isAnnouncer ? "flex" : "none";
    $("formatToolbar").style.display = isAnnouncer ? "flex" : "none";
  }
  $("replyBar").style.display = "none";
  let notice = $("announcementsNotice");
  if (!isAnnouncer) {
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "announcementsNotice";
      notice.className = "announcements-notice";
      notice.innerHTML = "📢 <strong>Announcements</strong> — Only the Owner can post here.";
      $("chatArea").appendChild(notice);
    }
    notice.style.display = "flex";
  } else {
    if (notice) notice.style.display = "none";
  }
}

// ============================================================
// SEARCH
// ============================================================
function setupSearch() {
  $("searchToggleBtn").addEventListener("click", () => {
    searchActive = !searchActive;
    $("searchBar").style.display = searchActive ? "flex" : "none";
    if (searchActive) $("searchInput").focus();
    else { $("searchInput").value = ""; clearSearchHighlights(); }
  });
  $("searchClear").addEventListener("click", () => {
    $("searchInput").value = ""; clearSearchHighlights();
    $("searchBar").style.display = "none"; searchActive = false;
  });
  $("searchInput").addEventListener("input", () => {
    const query = $("searchInput").value.trim().toLowerCase();
    if (!query) { clearSearchHighlights(); return; }
    performSearch(query);
  });
}

function performSearch(query) {
  clearSearchHighlights();
  if (!query) return;
  const messages = $("chatbox").querySelectorAll(".message");
  let firstMatch = null;
  messages.forEach(msg => {
    const text = (msg.querySelector(".msg-text")?.textContent || "").toLowerCase();
    if (text.includes(query)) {
      msg.classList.add("search-highlight");
      if (!firstMatch) firstMatch = msg;
    }
  });
  if (firstMatch) firstMatch.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearSearchHighlights() {
  $("chatbox").querySelectorAll(".search-highlight").forEach(el => el.classList.remove("search-highlight"));
}

// ============================================================
// CHANNEL SWITCHING
// ============================================================
function setupChannelButtons() {
  document.querySelectorAll(".channel-btn").forEach(btn => {
    if (!btn.dataset.channel) return; // skip non-channel buttons (e.g. friendsBtn)
    btn.addEventListener("click", () => switchChannel(btn.dataset.channel));
  });
}

function renderCustomChannelButtons() {
  document.querySelectorAll(".custom-ch-btn").forEach(b => b.remove());
  const $customSection = document.getElementById("customChannelsSection");
  if ($customSection) $customSection.remove();

  const entries = Object.entries(customChannels);
  if (!entries.length) return;

  const canSeeChannel = (ch) => {
    if (!ch.private) return true;
    if (ch.requiredRole === "mod") return amOwner() || amMod();
    if (ch.requiredRole === "dev") return isDev(myUid) || amOwner();
    const myUserData = allUsersCache[myUid] || {};
    const myRoles = myUserData.customRoles || (myUserData.customRole ? [myUserData.customRole] : []);
    return amOwner() || myRoles.includes(ch.requiredRole);
  };

  const visible = entries.filter(([, ch]) => canSeeChannel(ch));
  if (!visible.length) return;

  const section = document.createElement("div");
  section.className = "sidebar-section";
  section.id = "customChannelsSection";
  const label = document.createElement("div");
  label.className = "sidebar-label";
  label.textContent = "💬 CUSTOM";
  section.appendChild(label);

  visible.forEach(([id, ch]) => {
    const btn = document.createElement("button");
    btn.className = "channel-btn custom-ch-btn";
    btn.dataset.channel = id;
    if (currentChannel === id) btn.classList.add("selected");
    const icon = document.createElement("span"); icon.className = "ch-hash"; icon.textContent = ch.icon || "#";
    const name = document.createElement("span"); name.className = "ch-name"; name.textContent = ch.name;
    const pip = document.createElement("span"); pip.className = "unread-pip"; pip.id = "pip-" + id; pip.style.display = "none";
    btn.appendChild(icon); btn.appendChild(name); btn.appendChild(pip);
    btn.addEventListener("click", () => switchChannel(id));
    section.appendChild(btn);
  });

  const allSections = [...document.querySelectorAll(".sidebar-section")];
  const generalSection = allSections.find(s => s.querySelector(".sidebar-label")?.textContent.includes("GENERAL"));
  const target = generalSection || allSections[0];
  target.insertAdjacentElement("afterend", section);
}

function switchChannel(ch) {
  if (!ch) return; // guard against undefined (e.g. buttons without data-channel)
  if (msgListeners[currentChannel]) {
    try { msgListeners[currentChannel].ref.off("child_added", msgListeners[currentChannel].fn); } catch(e){}
    delete msgListeners[currentChannel];
  }
  setTyping(false); isTyping=false; clearTimeout(typingTimer);
  db.ref("typing/"+currentChannel).off("value");
  clearInterval(leaderboardTimer);
  clearSearchHighlights();
  if (searchActive) { $("searchInput").value = ""; }
  // Tear down reports live listener if leaving reports channel
  if (currentChannel === "reports" && reportsListener) {
    db.ref("reports").off("value", reportsListener);
    reportsListener = null;
  }

  currentChannel = ch;
  $("chatbox").innerHTML = "";
  displayedMsgs[ch] = new Set();
  userScrolledUp = false;

  document.querySelectorAll(".channel-btn").forEach(b => b.classList.toggle("selected", b.dataset.channel===ch));
  const builtinLabels = {
    general:"general", offtopic:"off-topic",
    announcements:"announcements", modchat:"mod-chat",
    leaderboard:"leaderboard", myleaderboard:"my leaderboard",
    rules:"rules", members:"members",
    logs:"mod-logs", reports:"reports", broadcast:"send-notification",
    modactions:"mod-actions", "gif-manager":"gif-manager"
  };
  const chLabel = builtinLabels[ch] || (customChannels[ch] ? customChannels[ch].name : ch);
  $("channelLabel").textContent = chLabel;
  $("msgInput").placeholder = "Message #" + chLabel;
  clearUnread(ch);

  const isAnnouncements = ch === "announcements";
  const isRules = ch === "rules";
  const isModChat = ch === "modchat";
  const isLeaderboard = ch === "leaderboard" || ch === "myleaderboard";
  const isSpecialReadOnly = ch === "members" || ch === "logs" || ch === "reports" || ch === "broadcast" || ch === "modactions" || ch === "gif-manager";

  $("inputRow").style.display = "flex";
  $("formatToolbar").style.display = "flex";
  $("typingBar").style.display = "block";
  $("muteNotice").style.display = "none";

  if (isLeaderboard || isSpecialReadOnly) {
    $("inputRow").style.display = "none";
    $("formatToolbar").style.display = "none";
    $("typingBar").style.display = "none";
  } else if (isAnnouncements || isRules) {
    $("inputRow").style.display = amOwner() ? "flex" : "none";
    $("formatToolbar").style.display = amOwner() ? "flex" : "none";
    $("typingBar").style.display = "none";
  } else if (isModChat) {
    $("inputRow").style.display = (amOwner() || amMod()) ? "flex" : "none";
    $("formatToolbar").style.display = (amOwner() || amMod()) ? "flex" : "none";
  }

  checkMuteStatus();

  if (customChannels[ch]) {
    const chData = customChannels[ch];
    if (chData.private) {
      const myUserData = allUsersCache[myUid] || {};
      const myRoles = myUserData.customRoles || (myUserData.customRole ? [myUserData.customRole] : []);
      const hasAccess = amOwner()
        || (chData.requiredRole === "mod" && amMod())
        || (chData.requiredRole === "dev" && isDev(myUid))
        || myRoles.includes(chData.requiredRole);
      if (!hasAccess) {
        $("inputRow").style.display = "none";
        $("formatToolbar").style.display = "none";
      }
    }
  }

  const oldNotice = $("announcementsNotice");
  if (!isAnnouncements && oldNotice) oldNotice.style.display = "none";
  const oldRulesNotice = $("rulesNotice");
  if (!isRules && oldRulesNotice) oldRulesNotice.style.display = "none";
  if (isAnnouncements) updateAnnouncementsUI();
  if (isRules) updateRulesUI();

  setupTypingListener(ch);

  if (ch === "leaderboard") {
    renderLeaderboard(false);
    leaderboardTimer = setInterval(() => renderLeaderboard(false), 5 * 60 * 1000);
  } else if (ch === "myleaderboard") {
    renderLeaderboard(true);
    leaderboardTimer = setInterval(() => renderLeaderboard(true), 5 * 60 * 1000);
  } else if (ch === "members") {
    renderMembersChannel();
  } else if (ch === "logs") {
    renderLogsChannel();
  } else if (ch === "reports") {
    renderReportsChannel();
  } else if (ch === "broadcast") {
    renderBroadcastChannel();
  } else if (ch === "modactions") {
    renderModActionsChannel();
  } else if (ch === "gif-manager") {
    renderGifManagerChannel();
  } else {
    loadMessages(ch);
  }
}

// ============================================================
// LEADERBOARD (global + friends)
// ============================================================
async function renderLeaderboard(friendsOnly) {
  const chatbox = $("chatbox");
  chatbox.innerHTML = "";

  // Tab switcher
  const tabs = document.createElement("div"); tabs.className="lb-tabs";
  const globalTab = document.createElement("button"); globalTab.className="lb-tab"+(friendsOnly?"":" active"); globalTab.textContent="🌍 Global";
  const friendTab = document.createElement("button"); friendTab.className="lb-tab"+(friendsOnly?" active":""); friendTab.textContent="👥 Friends";
  globalTab.addEventListener("click", () => { if(currentChannel!=="leaderboard") { switchChannel("leaderboard"); } else { renderLeaderboard(false); } });
  friendTab.addEventListener("click", () => { if(currentChannel!=="myleaderboard") { switchChannel("myleaderboard"); } else { renderLeaderboard(true); } });
  tabs.appendChild(globalTab); tabs.appendChild(friendTab);
  chatbox.appendChild(tabs);

  const refreshBtn = document.createElement("button");
  refreshBtn.className = "leaderboard-refresh-btn";
  refreshBtn.textContent = "🔄 Refresh";
  refreshBtn.addEventListener("click", () => renderLeaderboard(friendsOnly));
  chatbox.appendChild(refreshBtn);

  const usersSnap = await db.ref("users").once("value");
  const users = usersSnap.val() || {};
  let userList = Object.entries(users).map(([uid, d]) => ({ uid, ...d }));

  if (friendsOnly) {
    const friendUids = Object.keys(myFriends);
    friendUids.push(myUid); // include self
    userList = userList.filter(u => friendUids.includes(u.uid));
    if (userList.length <= 1) {
      const empty = document.createElement("div");
      empty.style.cssText = "text-align:center;color:var(--text-dim);padding:40px 16px;font-size:14px;";
      empty.textContent = "Add friends to see them on your leaderboard!";
      chatbox.appendChild(empty);
      return;
    }
  }

  const sections = [
    { title: "🥇 Most Messages Sent",    key: "messageCount",      label: "messages",  color: "#fbbf24" },
    { title: "❤️ Most Reactions",        key: "reactionsReceived", label: "reactions", color: "#f472b6" },
    { title: "⭐ Highest Rep",           key: "rep",               label: "rep",       color: "#a78bfa" },
    { title: "📅 Most Days Active",      key: "_daysActive",       label: "days",      color: "#34d399", compute: u => u.activeDays ? Object.keys(u.activeDays).length : 0 },
    { title: "⏱️ Most Time Online",      key: "timeOnlineMinutes", label: "min",       color: "#60a5fa", format: v => formatMinutes(v) },
    { title: "🔥 Longest Streak",        key: "currentStreak",     label: "days",      color: "#fb923c" },
    { title: "🗳️ Most Polls Voted",      key: "pollsVotedIn",      label: "votes",     color: "#e879f9" },
    { title: "📸 Most Images Sent",      key: "imagesSent",        label: "images",    color: "#38bdf8" },
  ];

  sections.forEach(section => {
    const wrapper = document.createElement("div"); wrapper.className = "leaderboard-section";
    const heading = document.createElement("div"); heading.className = "leaderboard-heading";
    heading.style.color = section.color;
    heading.textContent = section.title;
    wrapper.appendChild(heading);

    const sorted = [...userList]
      .map(u => ({ ...u, _score: section.compute ? section.compute(u) : (u[section.key]||0) }))
      .filter(u => u._score > 0)
      .sort((a,b) => b._score - a._score)
      .slice(0, 10);

    if (!sorted.length) {
      const empty = document.createElement("div"); empty.className="lb-empty"; empty.textContent="No data yet.";
      wrapper.appendChild(empty); chatbox.appendChild(wrapper); return;
    }

    sorted.forEach((u, i) => {
      const row = document.createElement("div"); row.className = "lb-row";
      const isSelf = u.uid === myUid;
      if (isSelf) row.classList.add("lb-self");
      row.style.cursor = "pointer";
      row.addEventListener("click", () => openProfile(u.uid));
      const rank = document.createElement("span"); rank.className="lb-rank";
      rank.textContent = i===0?"🥇":i===1?"🥈":i===2?"🥉":"#"+(i+1);
      const av = buildAvatar(u.avatarUrl||null, u.username, u.color||"#4da6ff", 28);
      const name = document.createElement("span"); name.className="lb-name";
      name.textContent = u.username+(isSelf?" (you)":""); name.style.color=u.color||"#4da6ff";
      const displayVal = section.format ? section.format(u._score) : u._score.toLocaleString();
      const score = document.createElement("span"); score.className="lb-score"; score.style.color=section.color;
      score.textContent = displayVal+" "+section.label;
      row.appendChild(rank); row.appendChild(av); row.appendChild(name); row.appendChild(score);
      wrapper.appendChild(row);
    });

    chatbox.appendChild(wrapper);
  });
}

// ============================================================
// RULES CHANNEL UI
// ============================================================
function updateRulesUI() {
  if (currentChannel !== "rules") return;
  const isWriter = amOwner();
  if (!isMuted(myUid)) {
    $("inputRow").style.display     = isWriter ? "flex" : "none";
    $("formatToolbar").style.display = isWriter ? "flex" : "none";
  }
  $("replyBar").style.display = "none";
  let notice = $("rulesNotice");
  if (!isWriter) {
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "rulesNotice";
      notice.className = "announcements-notice";
      notice.innerHTML = "📜 <strong>Rules</strong> — Only the Owner can post here.";
      $("chatArea").appendChild(notice);
    }
    notice.style.display = "flex";
  } else {
    if (notice) notice.style.display = "none";
  }
}

// ============================================================
// ACHIEVEMENTS CHANNEL
// ============================================================
async function renderAchievementsChannel() {
  const chatbox = $("chatbox");
  chatbox.innerHTML = "";

  const achSnap = await db.ref("users/"+myUid+"/achievements").once("value");
  const myAchs = achSnap.val() || {};

  const title = document.createElement("div");
  title.style.cssText = "padding:20px 16px 8px;font-size:18px;font-weight:800;color:var(--text-primary);";
  title.textContent = "🏅 All Achievements";
  chatbox.appendChild(title);

  const sub = document.createElement("div");
  sub.style.cssText = "padding:0 16px 16px;font-size:12px;color:var(--text-muted);";
  sub.textContent = "Complete these to earn badges on your profile.";
  chatbox.appendChild(sub);

  ACHIEVEMENTS.forEach(ach => {
    const have = !!myAchs[ach.id];
    const row = document.createElement("div");
    row.style.cssText = `display:flex;align-items:center;gap:14px;padding:12px 16px;margin:4px 12px;border-radius:10px;background:var(--bg-lighter);border:1px solid ${have?"var(--accent)":"var(--border)"};opacity:${have?1:0.55};`;

    const icon = document.createElement("div");
    icon.style.cssText = "font-size:28px;width:40px;text-align:center;flex-shrink:0;";
    icon.textContent = ach.icon;

    const info = document.createElement("div");
    info.style.flex = "1";
    const name = document.createElement("div");
    name.style.cssText = "font-weight:800;font-size:14px;color:var(--text-primary);";
    name.textContent = ach.name;
    const desc = document.createElement("div");
    desc.style.cssText = "font-size:12px;color:var(--text-muted);margin-top:2px;";
    desc.textContent = ach.desc;
    info.appendChild(name); info.appendChild(desc);

    const status = document.createElement("div");
    status.style.cssText = `font-size:11px;font-weight:800;padding:4px 10px;border-radius:6px;flex-shrink:0;${have?"background:var(--accent)22;color:var(--accent)":"background:var(--bg-input);color:var(--text-dim)"}`;
    status.textContent = have ? "✅ Earned" : "🔒 Locked";

    row.appendChild(icon); row.appendChild(info); row.appendChild(status);
    chatbox.appendChild(row);
  });
}

// ============================================================
// MEMBERS CHANNEL
// ============================================================
async function renderMembersChannel() {
  const chatbox = $("chatbox");
  chatbox.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:12px;">Loading members...</div>';

  const usersSnap = await db.ref("users").once("value");
  const users = usersSnap.val() || {};
  const presSnap = await db.ref("presence").once("value");
  const online = presSnap.val() || {};

  chatbox.innerHTML = "";

  const title = document.createElement("div");
  title.style.cssText = "padding:20px 16px 8px;font-size:18px;font-weight:800;color:var(--text-primary);";
  title.textContent = "👥 Members — "+Object.keys(users).length+" total";
  chatbox.appendChild(title);

  // Sort: online first, then by message count
  const list = Object.entries(users)
    .map(([uid,d]) => ({uid,...d, isOnline: !!online[uid]}))
    .sort((a,b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return (b.messageCount||0) - (a.messageCount||0);
    });

  list.forEach(u => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;border-radius:8px;margin:2px 8px;";
    row.style.transition = "background .15s";
    row.onmouseenter = () => row.style.background = "var(--bg-lighter)";
    row.onmouseleave = () => row.style.background = "";

    const av = buildAvatar(u.avatarUrl||null, u.username, u.color||"#4da6ff", 34);
    av.style.position = "relative"; av.style.flexShrink = "0";

    const dot = document.createElement("div");
    dot.style.cssText = `position:absolute;bottom:0;right:0;width:10px;height:10px;border-radius:50%;border:2px solid var(--bg-dark);background:${u.isOnline?"#23d160":"#555"};`;
    av.appendChild(dot);

    const info = document.createElement("div"); info.style.flex = "1";
    const nameEl = document.createElement("div");
    nameEl.style.cssText = "font-weight:700;font-size:14px;";
    nameEl.textContent = u.username; nameEl.style.color = u.color||"#4da6ff";

    const meta = document.createElement("div");
    meta.style.cssText = "font-size:11px;color:var(--text-muted);margin-top:1px;";
    const tags = [];
    if (isOwner(u.uid)) tags.push("[Owner]");
    else if (isMod(u.uid)) tags.push("[Mod]");
    else if (isDev(u.uid)) tags.push("[Dev]");
    tags.push((u.messageCount||0)+" msgs");
    if (u.isOnline) tags.push("🟢 Online");
    meta.textContent = tags.join(" · ");

    info.appendChild(nameEl); info.appendChild(meta);
    row.appendChild(av); row.appendChild(info);
    row.addEventListener("click", () => openProfile(u.uid));
    chatbox.appendChild(row);
  });
}

// ============================================================
// LOGS CHANNEL (mod only)
// ============================================================
async function renderLogsChannel() {
  if (!canModerate()) {
    $("chatbox").innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-dim);">🔒 Moderators only.</div>';
    return;
  }
  const chatbox = $("chatbox");
  chatbox.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:12px;">Loading logs...</div>';

  const snap = await db.ref("modLogs").orderByChild("timestamp").limitToLast(100).once("value");
  const logs = snap.val() || {};
  chatbox.innerHTML = "";

  const title = document.createElement("div");
  title.style.cssText = "padding:20px 16px 8px;font-size:18px;font-weight:800;color:var(--text-primary);";
  title.textContent = "📋 Moderation Logs";
  chatbox.appendChild(title);

  const entries = Object.values(logs).sort((a,b) => b.timestamp - a.timestamp);
  if (!entries.length) {
    chatbox.innerHTML += '<div style="padding:20px;color:var(--text-dim);text-align:center;">No mod actions logged yet.</div>';
    return;
  }

  const typeColors = { ban:"#ff4d4d", unban:"#57f287", mute:"#fbbf24", unmute:"#67e8f9", delete:"#f472b6", auto_mute:"#fb923c", auto_ban:"#ff4d4d" };
  entries.forEach(log => {
    const row = document.createElement("div");
    row.style.cssText = "padding:10px 16px;border-bottom:1px solid var(--border);font-size:13px;";
    const color = typeColors[log.type]||"#aaa";
    const time = new Date(log.timestamp).toLocaleString();
    let html = `<span style="color:${color};font-weight:800;">[${(log.type||"").toUpperCase()}]</span> `;
    html += `<strong>${esc(log.action||"")}</strong>`;
    if (log.targetUsername) html += ` → <span style="color:var(--accent);">${esc(log.targetUsername)}</span>`;
    if (log.by) html += ` by <span style="font-weight:700;">${esc(log.by)}</span>`;
    if (log.reason) html += ` — <em style="color:var(--text-muted);">${esc(log.reason)}</em>`;
    if (log.message) html += `<div style="margin-top:4px;font-size:11px;color:var(--text-muted);font-style:italic;">"${esc(log.message.substring(0,120))}"</div>`;
    html += `<div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${time}</div>`;
    row.innerHTML = html;
    chatbox.appendChild(row);
  });
}

// ============================================================
// REPORTS CHANNEL (mod only)
// ============================================================
function renderReportsChannel() {
  if (!canModerate()) {
    $("chatbox").innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-dim);">🔒 Moderators only.</div>';
    return;
  }

  // Tear down any previous listener
  if (reportsListener) { db.ref("reports").off("value", reportsListener); reportsListener = null; }

  const chatbox = $("chatbox");
  chatbox.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:12px;">Loading reports...</div>';

  function buildReportsUI(reports) {
    if (currentChannel !== "reports") return;
    chatbox.innerHTML = "";

    const title = document.createElement("div");
    title.style.cssText = "padding:20px 16px 8px;font-size:18px;font-weight:800;color:var(--text-primary);";
    title.textContent = "🚩 Reported Messages";
    chatbox.appendChild(title);

    const entries = Object.entries(reports).sort((a,b) => {
      if (!!a[1].resolved !== !!b[1].resolved) return a[1].resolved ? 1 : -1;
      return b[1].timestamp - a[1].timestamp;
    });

    if (!entries.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding:20px;color:var(--text-dim);text-align:center;";
      empty.textContent = "No reports yet.";
      chatbox.appendChild(empty);
      return;
    }

    entries.forEach(([reportId, r]) => {
      const isResolved = !!r.resolved;
      const card = document.createElement("div");
      card.style.cssText = `margin:8px 12px;padding:14px 16px;border-radius:10px;background:var(--bg-lighter);border:1px solid ${isResolved ? "rgba(87,242,135,0.4)" : "var(--border)"};${isResolved ? "opacity:0.75;" : ""}`;

      const time = new Date(r.timestamp).toLocaleString();
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <div>
            <span style="font-weight:800;color:${isResolved ? "#57f287" : "#f472b6"};">${isResolved ? "✅ Resolved" : "🚩 Report"}</span>
            <span style="font-size:11px;color:var(--text-dim);margin-left:8px;">${time}</span>
            ${isResolved && r.resolvedBy ? `<span style="font-size:11px;color:#57f287;margin-left:8px;">by ${esc(r.resolvedBy)}</span>` : ""}
          </div>
          <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:var(--bg-input);color:var(--text-muted);">#${esc(r.channel||"")}</span>
        </div>
        <div style="margin-bottom:8px;padding:10px;border-radius:8px;background:var(--bg-input);border-left:3px solid var(--accent);">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:3px;"><strong style="color:var(--accent);">${esc(r.messageAuthor||"?")}</strong> said:</div>
          <div style="font-size:13px;color:var(--text-primary);">${esc((r.message||"[media]").substring(0,200))}</div>
        </div>
        <div style="font-size:12px;color:var(--text-muted);">
          <strong>Reason:</strong> ${esc(r.reason||"")}
          &nbsp;·&nbsp;<strong>Reported by:</strong> ${esc(r.reportedBy||"")}
        </div>
      `;

      const btns = document.createElement("div");
      btns.style.cssText = "display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;";

      if (!isResolved) {
        const viewBtn = document.createElement("button"); viewBtn.className="confirm-btn ok";
        viewBtn.style.cssText = "padding:5px 12px;font-size:12px;";
        viewBtn.textContent = "👤 View User";
        viewBtn.addEventListener("click", () => openProfile(r.messageAuthorUid));

        const warnBtn = document.createElement("button"); warnBtn.className="confirm-btn ok";
        warnBtn.style.cssText = "padding:5px 12px;font-size:12px;background:rgba(251,191,36,0.15);border-color:rgba(251,191,36,0.4);color:#fbbf24;";
        warnBtn.textContent = "⚠️ Warn";
        warnBtn.addEventListener("click", async () => { await warnUser(r.messageAuthorUid, r.messageAuthor||"User"); });

        const muteBtn = document.createElement("button"); muteBtn.className="confirm-btn ok";
        muteBtn.style.cssText = "padding:5px 12px;font-size:12px;background:rgba(249,115,22,0.15);border-color:rgba(249,115,22,0.4);color:#f97316;";
        muteBtn.textContent = "🔇 Mute";
        muteBtn.addEventListener("click", async () => { await muteUser(r.messageAuthorUid, r.messageAuthor||"User"); });

        const banBtn = document.createElement("button"); banBtn.className="confirm-btn cancel";
        banBtn.style.cssText = "padding:5px 12px;font-size:12px;color:#ff4d4d;border-color:rgba(255,77,77,.4);";
        banBtn.textContent = "🔨 Ban";
        banBtn.addEventListener("click", async () => { await banUser(r.messageAuthorUid, r.messageAuthor||"User"); });

        const resolveBtn = document.createElement("button"); resolveBtn.className="confirm-btn ok";
        resolveBtn.style.cssText = "padding:5px 12px;font-size:12px;background:rgba(87,242,135,0.15);border-color:rgba(87,242,135,0.4);color:#57f287;";
        resolveBtn.textContent = "✅ Resolve";
        resolveBtn.addEventListener("click", async () => {
          await db.ref("reports/"+reportId).update({ resolved: true, resolvedBy: myUsername, resolvedAt: Date.now() });
          showToast("✅ Report marked as resolved.", "ok");
          // Live listener auto-updates for all mods
        });

        btns.appendChild(viewBtn); btns.appendChild(warnBtn); btns.appendChild(muteBtn); btns.appendChild(banBtn); btns.appendChild(resolveBtn);
      } else {
        if (amOwner()) {
          const unresolveBtn = document.createElement("button"); unresolveBtn.className="confirm-btn cancel";
          unresolveBtn.style.cssText = "padding:5px 12px;font-size:12px;";
          unresolveBtn.textContent = "↩ Un-resolve";
          unresolveBtn.addEventListener("click", async () => {
            await db.ref("reports/"+reportId).update({ resolved: false, resolvedBy: null, resolvedAt: null });
            showToast("Report re-opened.", "ok");
            // Live listener auto-updates
          });
          btns.appendChild(unresolveBtn);
        }
      }

      card.appendChild(btns);
      chatbox.appendChild(card);
    });
  }

  // Live listener — fires for all mods instantly on any resolve/unresolve
  reportsListener = db.ref("reports").orderByChild("timestamp").limitToLast(100).on("value", snap => {
    buildReportsUI(snap.val() || {});
  });
}
function loadMessages(ch) {
  const baseRef = db.ref("messages/"+ch);
  baseRef.orderByChild("timestamp").limitToLast(PAGE_SIZE).once("value", snap => {
    if (currentChannel !== ch) return;
    let msgs = [];
    const rawVal = snap.val() || {};
    Object.entries(rawVal).forEach(([key, val]) => msgs.push({ key, ...val }));
    msgs.sort((a, b) => a.timestamp - b.timestamp);

    msgs.forEach(m => {
      if (!displayedMsgs[ch]) displayedMsgs[ch] = new Set();
      if (displayedMsgs[ch].has(m.key)) return;
      displayedMsgs[ch].add(m.key);
      renderMessage(m, ch, false);
    });

    if (msgs.length >= PAGE_SIZE && msgs.length > 0) {
      const loadBtn = document.createElement("button");
      loadBtn.className = "load-more-btn";
      loadBtn.textContent = "📜 Load older messages";
      loadBtn.dataset.oldestTs = msgs[0].key;
      loadBtn.addEventListener("click", () => loadOlderMessages(ch, loadBtn.dataset.oldestTs, loadBtn));
      if ($("chatbox").firstChild) $("chatbox").insertBefore(loadBtn, $("chatbox").firstChild);
      else $("chatbox").appendChild(loadBtn);
    }
    setTimeout(() => scrollToBottom(true), 50);

    const maxTs = msgs.length > 0 ? msgs[msgs.length - 1].timestamp : Date.now();
    const liveRef = baseRef.orderByChild("timestamp").startAt(maxTs + 1);
    let ready = false;
    const fn = liveRef.on("child_added", snap2 => {
      if (!ready) return;
      if (currentChannel !== ch) return;
      const key=snap2.key, data=snap2.val();
      if (!displayedMsgs[ch]) displayedMsgs[ch]=new Set();
      if (displayedMsgs[ch].has(key)) return;
      displayedMsgs[ch].add(key);
      renderMessage({ key, ...data }, ch, true);
    });
    setTimeout(() => { ready=true; }, 500);
    msgListeners[ch] = { ref: liveRef, fn };
    setupUnreadListeners();
  });
}

async function loadOlderMessages(ch, oldestKey, btn) {
  btn.textContent = "Loading..."; btn.disabled = true;
  const snap = await db.ref("messages/"+ch).once("value");
  let allMsgs = [];
  const rawVal = snap.val() || {};
  Object.entries(rawVal).forEach(([key, val]) => allMsgs.push({ key, ...val }));
  const newMsgs = allMsgs.filter(m => m.key < oldestKey && !displayedMsgs[ch].has(m.key));
  if (!newMsgs.length) { btn.textContent = "No more messages"; btn.disabled = true; return; }
  const chatbox = $("chatbox");
  const prevH = chatbox.scrollHeight;
  newMsgs.forEach(m => displayedMsgs[ch].add(m.key));
  newMsgs.forEach(m => renderMessage(m, ch, false, false));
  const allWrappers = [...chatbox.querySelectorAll(".msg-wrapper")];
  const newWrappers = allWrappers.filter(w => newMsgs.find(m => m.key === w.dataset.messageId));
  let insertAfter = btn;
  newWrappers.forEach(w => { insertAfter.after(w); insertAfter = w; });
  chatbox.scrollTop = chatbox.scrollHeight - prevH;
  btn.textContent = "No more messages"; btn.disabled = true;
}

// ============================================================
// UNREAD DOTS
// ============================================================
const unreadCounts = {};

function setupUnreadListeners() {
  getAllChannels().forEach(ch => {
    if (ch===currentChannel || ch==="leaderboard" || ch==="myleaderboard") return;
    db.ref("messages/"+ch).off("child_added");
    if (!unreadCounts[ch]) unreadCounts[ch] = 0;
    const since = Date.now();
    db.ref("messages/"+ch).orderByChild("timestamp").startAt(since).on("child_added", () => {
      if (currentChannel!==ch) {
        unreadCounts[ch] = (unreadCounts[ch]||0) + 1;
        const pip=$("pip-"+ch);
        if(pip) {
          pip.style.display="inline-flex";
          pip.textContent = unreadCounts[ch] > 99 ? "99+" : String(unreadCounts[ch]);
        }
      }
    });
  });
}

function clearUnread(ch) {
  unreadCounts[ch] = 0;
  const pip = $("pip-"+ch);
  if (pip) { pip.style.display="none"; pip.textContent=""; }
}

// ============================================================
// SCROLL BUTTON
// ============================================================
$("scrollBtn").addEventListener("click", () => {
  userScrolledUp = false;
  scrollToBottom(true);
  $("scrollBtn").style.display = "none";
});

// ============================================================
// ACTION BAR HELPERS
// ============================================================
function closeAllActionBars()   { document.querySelectorAll(".msg-action-bar.open").forEach(b => b.classList.remove("open")); }
function closeAllEmojiPickers() { document.querySelectorAll(".emoji-popup").forEach(p => p.remove()); }

document.addEventListener("click", e => {
  if (!e.target.closest(".message")) {
    closeAllActionBars();
    closeAllEmojiPickers();
  }
  if (e.target !== $("msgInput")) $("mentionDrop").style.display="none";
});

// ============================================================
// RENDER MESSAGE
// ============================================================
function renderMessage(data, ch, isNew, prepend) {
  prepend = prepend || false;
  const { key, message, time, userId, color, avatarUrl, replyTo } = data;
  // Don't render messages from blocked users
  if (userId && userId !== myUid && isBlocked(userId)) return;
  const name        = data.name || "Unknown";
  const isMine      = userId === myUid;
  const nameColor   = color || "#ffffff";
  const isOwnerMsg  = isOwner(userId);
  const isModMsg    = isMod(userId);
  const isDevMsg    = isDev(userId);
  const canDel      = canDelete();
  const isAnnCh     = ch === "announcements";

  if (data.type === "poll") return renderPollMessage(data, ch, isNew, prepend);

  // System messages (join/leave/mod announcements)
  if (data.system || data.userId === "system") {
    const sysEl = document.createElement("div");
    sysEl.className = "sys-msg";
    sysEl.textContent = data.message || "";
    const chatbox = $("chatbox");
    if (prepend && chatbox.firstChild) chatbox.insertBefore(sysEl, chatbox.firstChild);
    else chatbox.appendChild(sysEl);
    if (isNew && !userScrolledUp) requestAnimationFrame(() => scrollToBottom(true));
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "msg-wrapper "+(isMine?"mine":"other");
  wrapper.dataset.messageId = key;

  const avEl = buildAvatar(avatarUrl||null, name, nameColor, 34);
  avEl.className = "msg-avatar";
  avEl.style.cursor = "pointer";
  avEl.addEventListener("click", () => openProfile(userId));

  const bubble = document.createElement("div");
  bubble.className = "message "+(isMine?"mine":"other");
  bubble.dataset.messageId = key;
  bubble.dataset.channel   = ch;
  if (message && message.includes("@"+myUsername)) bubble.classList.add("mentioned");

  if (replyTo) {
    const q = document.createElement("div"); q.className="reply-quote";
    const qName = document.createElement("span"); qName.className="reply-quote-name"; qName.textContent=replyTo.name;
    const qText = document.createElement("span"); qText.className="reply-quote-text";
    qText.textContent = strip(replyTo.text||"").substring(0,80);
    q.appendChild(qName); q.appendChild(qText);
    bubble.appendChild(q);
  }

  const header = document.createElement("div"); header.className="msg-header";
  const nameWrap = document.createElement("span"); nameWrap.className="msg-name-wrap";

  if (isOwnerMsg) {
    const badge = document.createElement("span"); badge.className="owner-badge";
    badge.textContent="[Owner]"; badge.style.marginRight="4px"; nameWrap.appendChild(badge);
  }
  if (isModMsg) {
    const badge = document.createElement("span"); badge.className="mod-badge";
    badge.textContent="[Mod]"; nameWrap.appendChild(badge);
  }
  if (isDevMsg) {
    const badge = document.createElement("span"); badge.className="dev-badge";
    badge.textContent="[Dev]"; nameWrap.appendChild(badge);
  }
  const userDataForRole = allUsersCache[userId] || {};
  const msgRoles = userDataForRole.customRoles || (userDataForRole.customRole ? [userDataForRole.customRole] : []);
  msgRoles.forEach(roleKey => {
    if (customRoles[roleKey]) {
      const cr = customRoles[roleKey];
      const badge = document.createElement("span");
      badge.textContent = "[" + cr.name + "]";
      badge.style.cssText = `font-size:10px;font-weight:800;color:${cr.color};text-shadow:0 0 6px ${cr.color}88;margin-right:3px;`;
      nameWrap.appendChild(badge);
    }
  });

  const uname = document.createElement("span");
  uname.className = "msg-username";
  uname.textContent = name;
  uname.style.color = nameColor;
  uname.style.cursor = "pointer";
  uname.addEventListener("click", e => { e.stopPropagation(); openProfile(userId); });
  nameWrap.appendChild(uname);

  header.appendChild(nameWrap);
  const mtime = document.createElement("span"); mtime.className="msg-time"; mtime.textContent=time;
  header.appendChild(mtime);
  bubble.appendChild(header);

  const textEl = document.createElement("div"); textEl.className="msg-text";

  if ((data.type==="image" || data.type==="gif") && data.imageUrl) {
    if (data.imageSpoiler) {
      const sw = document.createElement("div"); sw.className="img-spoiler";
      const si = document.createElement("img"); si.src=data.imageUrl; si.className="msg-image";
      const sl = document.createElement("div"); sl.className="img-spoiler-label"; sl.innerHTML="👁 Click to reveal image";
      sw.appendChild(si); sw.appendChild(sl);
      si.addEventListener("load", () => { if (!userScrolledUp) scrollToBottom(true); });
      sw.addEventListener("click", e => {
        e.stopPropagation(); sw.classList.add("revealed");
        requestAnimationFrame(() => { if (!userScrolledUp) scrollToBottom(true); });
        si.onclick = ev => { ev.stopPropagation(); openLightbox(data.imageUrl); };
      });
      textEl.appendChild(sw);
    } else {
      const img = document.createElement("img");
      img.src=data.imageUrl; img.className="msg-image"; img.alt="Image";
      img.addEventListener("load", () => { if (!userScrolledUp) scrollToBottom(true); });
      img.addEventListener("click", e => { e.stopPropagation(); openLightbox(data.imageUrl); });
      textEl.appendChild(img);
      if (data.type==="gif" && data.gifName) {
        const lbl = document.createElement("div");
        lbl.style.cssText = "font-size:10px;color:var(--text-dim);margin-top:3px;font-style:italic;";
        lbl.textContent = "GIF: " + data.gifName;
        textEl.appendChild(lbl);
      }
    }
  } else if (message) {
    const trimmed = message.trim();
    const singleImageUrl = /^https?:\/\/\S+$/i.test(trimmed) && isImageUrl(trimmed);
    if (singleImageUrl) {
      const img = document.createElement("img");
      img.src=trimmed; img.className="msg-image"; img.alt="Image";
      img.addEventListener("load", () => { if (!userScrolledUp) scrollToBottom(true); });
      img.addEventListener("click", e => { e.stopPropagation(); openLightbox(trimmed); });
      img.onerror = () => { textEl.innerHTML = parseMessage(message); };
      textEl.appendChild(img);
    } else {
      textEl.innerHTML = parseMessage(message);
      const imageMatches = [...message.matchAll(/(https?:\/\/\S+)/gi)]
        .map(m => m[1]).filter(url => isImageUrl(url));
      imageMatches.forEach(imgUrl => {
        const embedWrap = document.createElement("div"); embedWrap.className="url-embed";
        const img = document.createElement("img");
        img.src=imgUrl; img.className="msg-image embed-img"; img.alt="";
        img.addEventListener("load", () => { if (!userScrolledUp) scrollToBottom(true); });
        img.addEventListener("click", e => { e.stopPropagation(); openLightbox(imgUrl); });
        img.onerror = () => embedWrap.remove();
        embedWrap.appendChild(img); textEl.appendChild(embedWrap);
      });
    }
  }
  bubble.appendChild(textEl);

  const reactionsEl = document.createElement("div"); reactionsEl.className="reactions";
  bubble.appendChild(reactionsEl);

  const actionBar = document.createElement("div"); actionBar.className="msg-action-bar";

  if (!isAnnCh || amOwner()) {
    const replyBtn = document.createElement("button"); replyBtn.className="msg-action-btn";
    replyBtn.textContent="↩ Reply";
    replyBtn.addEventListener("click", e => { e.stopPropagation(); setReply(key, name, message||""); closeAllActionBars(); });
    actionBar.appendChild(replyBtn);
  }

  const reactBtn = document.createElement("button"); reactBtn.className="msg-action-btn";
  reactBtn.textContent="😀 React";
  reactBtn.addEventListener("click", e => { e.stopPropagation(); openEmojiPicker(key, ch, reactBtn); });
  actionBar.appendChild(reactBtn);

  if (canDel) {
    const delBtn = document.createElement("button"); delBtn.className="msg-action-btn delete-btn";
    delBtn.textContent="🗑 Delete";
    delBtn.addEventListener("click", async e => {
      e.stopPropagation(); closeAllActionBars();
      const ok = await showConfirm("🗑️","Delete Message","This will delete the message for everyone.");
      if (ok) {
        // Log deletion
        db.ref("modLogs").push({
          type:"delete", action:"Deleted message",
          targetUid: userId, targetUsername: name,
          by: myUsername, byUid: myUid,
          message: message||"[image/media]",
          at: Date.now(), timestamp: Date.now()
        });
        db.ref("messages/"+ch+"/"+key).remove().catch(err => showToast("Delete failed: "+err.message,"err"));
      }
    });
    actionBar.appendChild(delBtn);
  }

  // Report button (visible to everyone except message owner)
  if (!isMine) {
    const reportBtn = document.createElement("button"); reportBtn.className="msg-action-btn report-btn";
    reportBtn.textContent="🚩 Report";
    reportBtn.addEventListener("click", async e => {
      e.stopPropagation(); closeAllActionBars();
      const reason = prompt("Why are you reporting this message?");
      if (!reason || !reason.trim()) return;
      await db.ref("reports").push({
        reportedBy: myUsername, reportedByUid: myUid,
        messageId: key, channel: ch,
        messageAuthor: name, messageAuthorUid: userId,
        message: message||"[image/media]",
        reason: reason.trim(),
        at: Date.now(), timestamp: Date.now()
      });
      showToast("🚩 Message reported. Moderators will review it.", "ok");
    });
    actionBar.appendChild(reportBtn);
  }

  bubble.appendChild(actionBar);
  bubble.addEventListener("click", e => {
    // Mod/owner shift-click = instant delete
    if (e.shiftKey && canModerate()) {
      db.ref("messages/"+ch+"/"+key).remove();
      showToast("🗑️ Message deleted","ok");
      return;
    }
    const isOpen = actionBar.classList.contains("open");
    closeAllActionBars(); closeAllEmojiPickers();
    if (!isOpen) { actionBar.classList.add("open"); requestAnimationFrame(() => { if (!userScrolledUp) scrollToBottom(true); }); }
    e.stopPropagation();
  });

  wrapper.appendChild(avEl);
  wrapper.appendChild(bubble);

  const chatbox = $("chatbox");
  if (prepend) {
    const loadMoreBtn = chatbox.querySelector(".load-more-btn");
    const anchor = loadMoreBtn ? loadMoreBtn.nextSibling : chatbox.firstChild;
    if (anchor) chatbox.insertBefore(wrapper, anchor);
    else chatbox.appendChild(wrapper);
  } else {
    chatbox.appendChild(wrapper);
  }

  db.ref("messages/"+ch+"/"+key).on("value", snap => { if (!snap.exists()) wrapper.remove(); });
  db.ref("messages/"+ch+"/"+key+"/reactions").on("value", snap => {
    renderReactions(reactionsEl, snap.val()||{}, key, ch, userId);
  });

  if (isNew) {
    if (!userScrolledUp) requestAnimationFrame(() => scrollToBottom(true));
    else $("scrollBtn").style.display = "flex";
  }
}

// ============================================================
// POLL RENDERING
// ============================================================
function renderPollMessage(data, ch, isNew, prepend) {
  const { key, userId, name, color, time, pollQuestion, pollOptions, pollEndsAt, avatarUrl } = data;
  const nameColor = color || "#ffffff";

  const wrapper = document.createElement("div");
  wrapper.className = "msg-wrapper other poll-wrapper";
  wrapper.dataset.messageId = key;

  const avEl = buildAvatar(avatarUrl||null, name, nameColor, 34);
  avEl.className = "msg-avatar";
  avEl.style.cursor = "pointer";
  avEl.addEventListener("click", () => openProfile(userId));

  const bubble = document.createElement("div");
  bubble.className = "message other poll-bubble";
  bubble.dataset.messageId = key;
  bubble.dataset.channel = ch;

  const header = document.createElement("div"); header.className="msg-header";
  const nameWrap = document.createElement("span"); nameWrap.className="msg-name-wrap";
  const uname = document.createElement("span"); uname.className="msg-username"; uname.textContent=name; uname.style.color=nameColor;
  uname.style.cursor="pointer"; uname.addEventListener("click", () => openProfile(userId));
  nameWrap.appendChild(uname);
  header.appendChild(nameWrap);
  const mtime = document.createElement("span"); mtime.className="msg-time"; mtime.textContent=time;
  header.appendChild(mtime);
  bubble.appendChild(header);

  const pollEl = document.createElement("div"); pollEl.className="poll-display";
  const qEl = document.createElement("div"); qEl.className="poll-question"; qEl.textContent="📊 "+pollQuestion;
  pollEl.appendChild(qEl);

  const expired = pollEndsAt && Date.now() > pollEndsAt;
  const expEl = document.createElement("div"); expEl.className="poll-expires";
  expEl.textContent = expired ? "Poll ended" : "Ends "+new Date(pollEndsAt).toLocaleString();
  pollEl.appendChild(expEl);

  const optionsEl = document.createElement("div"); optionsEl.className="poll-options-display";
  pollEl.appendChild(optionsEl);

  // track whether user has already voted in this poll (loaded from DB once)
  let hasTrackedVoteForThisPoll = false;
  db.ref("messages/"+ch+"/"+key+"/votes/"+myUid).once("value", s => {
    if (s.exists()) hasTrackedVoteForThisPoll = true;
  });

  function refreshPollDisplay(votesData) {
    optionsEl.innerHTML = "";
    const votes = votesData || {};
    const totalVotes = Object.values(votes).length;
    const myVote = votes[myUid];

    (pollOptions||[]).forEach((opt, i) => {
      const optVoters = Object.entries(votes).filter(([,v]) => v===i);
      const count = optVoters.length;
      const pct = totalVotes > 0 ? Math.round((count/totalVotes)*100) : 0;

      const row = document.createElement("div"); row.className="poll-option-row"+(myVote===i?" my-vote":"");
      const btn = document.createElement("button"); btn.className="poll-vote-btn"+(myVote===i?" voted":"");
      btn.textContent = opt; btn.disabled = expired;
      btn.addEventListener("click", () => {
        if (expired) return;
        if (myVote === i) {
          db.ref("messages/"+ch+"/"+key+"/votes/"+myUid).remove();
        } else {
          db.ref("messages/"+ch+"/"+key+"/votes/"+myUid).set(i);
          // Only count first-ever vote in this poll toward the stat
          if (!hasTrackedVoteForThisPoll) {
            hasTrackedVoteForThisPoll = true;
            db.ref("users/"+myUid+"/pollsVotedIn").transaction(c => (c||0)+1);
            checkAchievements();
          }
        }
      });
      const bar = document.createElement("div"); bar.className="poll-bar-wrap";
      const fill = document.createElement("div"); fill.className="poll-bar-fill"; fill.style.width=pct+"%";
      bar.appendChild(fill);
      const pctEl = document.createElement("span"); pctEl.className="poll-pct"; pctEl.textContent=pct+"% ("+count+")";
      row.appendChild(btn); row.appendChild(bar); row.appendChild(pctEl);
      optionsEl.appendChild(row);
    });
  }

  bubble.appendChild(pollEl);

  if (canDelete()) {
    const delBtn = document.createElement("button"); delBtn.className="poll-delete-btn";
    delBtn.textContent="🗑";
    delBtn.addEventListener("click", async () => {
      const ok = await showConfirm("🗑️","Delete Poll","This will delete the poll for everyone.");
      if (ok) db.ref("messages/"+ch+"/"+key).remove();
    });
    bubble.appendChild(delBtn);
  }

  wrapper.appendChild(avEl);
  wrapper.appendChild(bubble);

  const chatbox = $("chatbox");
  if (prepend) {
    const loadMoreBtn = chatbox.querySelector(".load-more-btn");
    const anchor = loadMoreBtn ? loadMoreBtn.nextSibling : chatbox.firstChild;
    if (anchor) chatbox.insertBefore(wrapper, anchor);
    else chatbox.appendChild(wrapper);
  } else {
    chatbox.appendChild(wrapper);
  }

  db.ref("messages/"+ch+"/"+key+"/votes").on("value", snap => {
    refreshPollDisplay(snap.val()||{});
  });
  db.ref("messages/"+ch+"/"+key).on("value", snap => { if (!snap.exists()) wrapper.remove(); });

  if (isNew && !userScrolledUp) requestAnimationFrame(() => scrollToBottom(true));
}

// ============================================================
// CUSTOM REACTIONS MANAGER
// ============================================================
function openCustomReactionsModal() {
  let modal = $("customReactionsModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "customReactionsModal";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:400;backdrop-filter:blur(4px);";

    const card = document.createElement("div");
    card.className = "confirm-card";
    card.style.width = "400px";
    card.innerHTML = `
      <div class="confirm-icon">😀</div>
      <h3>My Custom Reactions</h3>
      <p>Upload up to 3 custom emoji images. They'll appear in the reaction picker!</p>
      <div id="customReactionSlots" style="display:flex;flex-direction:column;gap:12px;margin:16px 0;"></div>
      <div class="confirm-btns">
        <button class="confirm-btn cancel" id="customReactClose">Close</button>
      </div>
    `;
    modal.appendChild(card);
    document.body.appendChild(modal);
    modal.addEventListener("click", e => { if (e.target === modal) modal.style.display = "none"; });
    $("customReactClose").addEventListener("click", () => modal.style.display = "none");
  }

  const slots = $("customReactionSlots");
  slots.innerHTML = "";

  for (let i = 0; i < 3; i++) {
    const reaction = myCustomReactions[i] || null;
    const slot = document.createElement("div");
    slot.style.cssText = "display:flex;align-items:center;gap:12px;background:var(--bg-lighter);border:1px solid var(--border);border-radius:10px;padding:10px 14px;";

    const preview = document.createElement("div");
    preview.style.cssText = "width:36px;height:36px;border-radius:8px;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--bg-input);font-size:22px;";
    if (reaction && reaction.url) {
      const img = document.createElement("img");
      img.src = reaction.url;
      img.style.cssText = "width:100%;height:100%;object-fit:cover;";
      preview.appendChild(img);
    } else {
      preview.textContent = "➕";
    }

    const info = document.createElement("div");
    info.style.cssText = "flex:1;";
    const nameInput = document.createElement("input");
    nameInput.className = "settings-input";
    nameInput.placeholder = "Reaction name (e.g. catjam)";
    nameInput.maxLength = 20;
    nameInput.value = reaction ? reaction.name : "";
    nameInput.style.cssText = "width:100%;margin-bottom:6px;font-size:12px;padding:5px 8px;";
    info.appendChild(nameInput);

    const uploadBtn = document.createElement("button");
    uploadBtn.className = "confirm-btn ok";
    uploadBtn.style.cssText = "padding:5px 12px;font-size:12px;";
    uploadBtn.textContent = reaction ? "🔄 Replace" : "📤 Upload";

    const fileInput = document.createElement("input");
    fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.style.display = "none";
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0]; if (!file) return;
      if (file.size > 2*1024*1024) return showToast("Max 2MB per custom reaction","err");
      uploadBtn.textContent = "Uploading..."; uploadBtn.disabled = true;
      const url = await uploadImgBB(file);
      uploadBtn.disabled = false;
      if (!url) return showToast("Upload failed","err");
      const name = nameInput.value.trim() || ("custom"+(i+1));
      const updated = [...myCustomReactions];
      updated[i] = { url, name };
      await db.ref("users/"+myUid+"/customReactions").set(updated);
      showToast("Custom reaction saved!","ok");
      openCustomReactionsModal(); // refresh
    });

    uploadBtn.addEventListener("click", () => {
      // Save name first
      if (myCustomReactions[i]) {
        const updated = [...myCustomReactions];
        updated[i] = { ...updated[i], name: nameInput.value.trim() || updated[i].name };
        db.ref("users/"+myUid+"/customReactions").set(updated);
      }
      fileInput.click();
    });

    // Remove button
    if (reaction) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "confirm-btn cancel";
      removeBtn.style.cssText = "padding:5px 10px;font-size:12px;margin-left:4px;";
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", async () => {
        const updated = [...myCustomReactions];
        updated.splice(i, 1);
        await db.ref("users/"+myUid+"/customReactions").set(updated);
        showToast("Reaction removed","ok");
        openCustomReactionsModal();
      });
      slot.appendChild(preview); slot.appendChild(info); slot.appendChild(fileInput); slot.appendChild(uploadBtn); slot.appendChild(removeBtn);
    } else {
      slot.appendChild(preview); slot.appendChild(info); slot.appendChild(fileInput); slot.appendChild(uploadBtn);
    }

    slots.appendChild(slot);
  }

  modal.style.display = "flex";
}

// ============================================================
// EMOJI PICKER (with custom reactions)
// ============================================================
function openEmojiPicker(msgId, ch, anchor) {
  closeAllEmojiPickers();
  const EMOJI_ROWS = [
    ["👍","👎","❤️","😂","😮","😢","😡","🎉","🔥","💯"],
    ["✅","❌","⭐","💀","👀","🙏","😀","😎","🤔","😴"],
    ["🤣","😭","🥹","😤","🐸","🗿","🤡","👻","💩","🦆"],
    ["🐧","🎮","💅","🫡","🥶","🥵","😈","👾","🤩","😏"],
    ["🫀","🧠","👁","🫶","🤝","✌️","🤌","🤰","🧌","🫃"],
  ];
  const popup = document.createElement("div"); popup.className="emoji-popup";

  // Custom reactions section (if any)
  // Show all users' custom reactions who are in allUsersCache
  const allCustom = [];
  Object.values(allUsersCache).forEach(u => {
    if (u.customReactions && Array.isArray(u.customReactions)) {
      u.customReactions.forEach(r => { if (r && r.url) allCustom.push(r); });
    }
  });
  // Also add my own
  myCustomReactions.forEach(r => { if (r && r.url && !allCustom.find(x => x.url === r.url)) allCustom.push(r); });

  if (allCustom.length) {
    const customLabel = document.createElement("div");
    customLabel.style.cssText = "font-size:10px;font-weight:800;color:var(--text-dim);letter-spacing:.06em;text-transform:uppercase;padding:2px 4px 4px;";
    customLabel.textContent = "Custom";
    popup.appendChild(customLabel);

    const customRow = document.createElement("div"); customRow.className="emoji-row"; customRow.style.flexWrap="wrap";
    allCustom.forEach(r => {
      const btn = document.createElement("button"); btn.className="emoji-btn custom-emoji-btn";
      btn.title = ":"+r.name+":";
      const img = document.createElement("img");
      img.src = r.url;
      img.style.cssText = "width:24px;height:24px;object-fit:cover;border-radius:4px;";
      btn.appendChild(img);
      btn.addEventListener("click", e => {
        e.stopPropagation();
        toggleCustomReaction(msgId, ch, r);
        popup.remove();
      });
      customRow.appendChild(btn);
    });
    popup.appendChild(customRow);

    const divider = document.createElement("div");
    divider.style.cssText = "width:100%;height:1px;background:var(--border);margin:6px 0;";
    popup.appendChild(divider);
  }

  // Manage custom reactions button
  const manageBtn = document.createElement("button");
  manageBtn.style.cssText = "display:block;width:100%;background:var(--bg-lighter);border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;color:var(--text-muted);cursor:pointer;font-family:var(--font);margin-bottom:6px;";
  manageBtn.textContent = "⚙️ Manage My Custom Reactions";
  manageBtn.addEventListener("click", e => { e.stopPropagation(); popup.remove(); openCustomReactionsModal(); });
  popup.appendChild(manageBtn);

  EMOJI_ROWS.forEach(row => {
    const rowEl = document.createElement("div"); rowEl.className="emoji-row";
    row.forEach(emoji => {
      const btn = document.createElement("button"); btn.className="emoji-btn"; btn.textContent=emoji;
      btn.addEventListener("click", e => { e.stopPropagation(); toggleReaction(msgId, ch, emoji); popup.remove(); });
      rowEl.appendChild(btn);
    });
    popup.appendChild(rowEl);
  });

  document.body.appendChild(popup);
  const pw=popup.offsetWidth||340, ph=popup.offsetHeight||240;
  const rect=anchor.getBoundingClientRect();
  const vw=window.innerWidth, vh=window.innerHeight;
  let top=rect.top-ph-8, left=rect.left+rect.width/2-pw/2;
  if (top<8) top=rect.bottom+8;
  if (top+ph>vh-8) top=vh-ph-8;
  if (left<8) left=8;
  if (left+pw>vw-8) left=vw-pw-8;
  popup.style.top=top+"px"; popup.style.left=left+"px";
  setTimeout(() => {
    document.addEventListener("click", function closePopup(e) {
      if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener("click", closePopup); }
    });
  }, 10);
}

// ============================================================
// CUSTOM REACTION TOGGLE
// ============================================================
function toggleCustomReaction(msgId, ch, reaction) {
  // Generate a stable unique key from the reaction URL (unique per image)
  let urlHash = 0;
  for (let i = 0; i < reaction.url.length; i++) {
    urlHash = ((urlHash << 5) - urlHash) + reaction.url.charCodeAt(i);
    urlHash |= 0;
  }
  const key = "custom_" + Math.abs(urlHash).toString(36);
  const ref = db.ref("messages/"+ch+"/"+msgId+"/reactions/"+key+"/"+myUid);
  ref.once("value", async s => {
    if (s.exists()) {
      await ref.remove();
      const msgSnap = await db.ref("messages/"+ch+"/"+msgId).once("value");
      const msgData = msgSnap.val();
      if (msgData && msgData.userId && msgData.userId !== myUid) {
        db.ref("users/"+msgData.userId+"/reactionsReceived").transaction(c => Math.max(0,(c||0)-1));
      }
    } else {
      // Store the full custom reaction info at the key level too for rendering
      await db.ref("messages/"+ch+"/"+msgId+"/reactionsCustomMeta/"+key).set({ url: reaction.url, name: reaction.name });
      await ref.set(true);
      const msgSnap = await db.ref("messages/"+ch+"/"+msgId).once("value");
      const msgData = msgSnap.val();
      if (msgData && msgData.userId && msgData.userId !== myUid) {
        db.ref("users/"+msgData.userId+"/reactionsReceived").transaction(c => (c||0)+1);
      }
    }
  });
}

function toggleReaction(msgId, ch, emoji) {
  const key = [...emoji].map(c => c.codePointAt(0).toString(16)).join("_");
  const ref  = db.ref("messages/"+ch+"/"+msgId+"/reactions/"+key+"/"+myUid);
  ref.once("value", async s => {
    if (s.exists()) {
      await ref.remove();
      const msgSnap = await db.ref("messages/"+ch+"/"+msgId).once("value");
      const msgData = msgSnap.val();
      if (msgData && msgData.userId && msgData.userId !== myUid) {
        db.ref("users/"+msgData.userId+"/reactionsReceived").transaction(c => Math.max(0,(c||0)-1));
      }
    } else {
      await ref.set(true);
      const msgSnap = await db.ref("messages/"+ch+"/"+msgId).once("value");
      const msgData = msgSnap.val();
      if (msgData && msgData.userId && msgData.userId !== myUid) {
        db.ref("users/"+msgData.userId+"/reactionsReceived").transaction(c => (c||0)+1);
      }
    }
  });
}

function renderReactions(container, reactions, msgId, ch, msgUserId) {
  container.innerHTML = "";
  // Fetch custom meta for this message
  db.ref("messages/"+ch+"/"+msgId+"/reactionsCustomMeta").once("value", metaSnap => {
    const customMeta = metaSnap.val() || {};
    Object.entries(reactions).forEach(([key, users]) => {
      const uids = Object.keys(users);
      if (!uids.length) return;
      const reacted = uids.includes(myUid);
      const span = document.createElement("span");
      span.className = "reaction"+(reacted?" reacted":"");

      if (key.startsWith("custom_") && customMeta[key]) {
        const img = document.createElement("img");
        img.src = customMeta[key].url;
        img.style.cssText = "width:18px;height:18px;object-fit:cover;border-radius:3px;vertical-align:middle;";
        img.title = ":"+customMeta[key].name+":";
        span.appendChild(img);
        const countEl = document.createElement("span");
        countEl.textContent = " "+uids.length;
        span.appendChild(countEl);
        span.addEventListener("click", e => {
          e.stopPropagation();
          toggleCustomReaction(msgId, ch, customMeta[key]);
        });
      } else {
        const emoji = key.split("_").map(cp => String.fromCodePoint(parseInt(cp,16))).join("");
        span.textContent = emoji+" "+uids.length;
        span.addEventListener("click", e => { e.stopPropagation(); toggleReaction(msgId, ch, emoji); });
      }

      span.addEventListener("mouseenter", () => {
        const old=span.querySelector(".reaction-tooltip"); if(old) old.remove();
        const names=uids.map(uid => { const u=allUsersCache[uid]; return u?u.username:(uid===myUid?myUsername:"Unknown"); });
        const tip=document.createElement("div"); tip.className="reaction-tooltip"; tip.textContent=names.join(", ");
        span.appendChild(tip);
      });
      span.addEventListener("mouseleave", () => { const t=span.querySelector(".reaction-tooltip"); if(t) t.remove(); });
      container.appendChild(span);
    });
  });
}

// ============================================================
// REPLY
// ============================================================
function setReply(msgId, name, text) {
  replyingTo = { msgId, name, text };
  $("replyName").textContent = name;
  $("replyPreview").textContent = strip(text).substring(0,80);
  $("replyBar").style.display = "flex";
  $("msgInput").focus();
}
function clearReply() { replyingTo=null; $("replyBar").style.display="none"; }
$("cancelReply").addEventListener("click", clearReply);

// ============================================================
// GIF SYSTEM (preset GIFs — any user can upload, everyone can send)
// ============================================================
let allPresetGifs = []; // cache

function openGifPicker() {
  let modal = $("gifPickerModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "gifPickerModal";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:500;backdrop-filter:blur(4px);";
    document.body.appendChild(modal);
    modal.addEventListener("click", e => { if (e.target === modal) modal.style.display = "none"; });
  }

  modal.innerHTML = "";
  const card = document.createElement("div");
  card.className = "confirm-card";
  card.style.cssText = "width:460px;max-width:96vw;height:80vh;display:flex;flex-direction:column;overflow:hidden;text-align:left;";
  card.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-shrink:0;">
      <h3 style="font-size:15px;font-weight:800;">🎬 GIFs</h3>
      <button onclick="this.closest('#gifPickerModal').style.display='none'" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:18px;">✕</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-shrink:0;">
      <button id="gifBrowseTab" class="confirm-btn ok" style="flex:1;padding:7px;font-size:12px;">Browse GIFs</button>
      <button id="gifUploadTab" class="confirm-btn cancel" style="flex:1;padding:7px;font-size:12px;">+ Upload GIF</button>
    </div>
    <div id="gifBrowsePane" style="flex:1;overflow-y:auto;">
      <div id="gifGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;"></div>
    </div>
    <div id="gifUploadPane" style="display:none;flex:1;overflow-y:auto;">
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Upload a GIF that everyone can use. Max 4MB.</p>
      <div style="margin-bottom:10px;">
        <div style="font-size:10px;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px;">Name</div>
        <input id="gifNameInput" class="settings-input" placeholder="e.g. catjam" maxlength="30" style="width:100%;">
      </div>
      <button id="gifUploadBtn" class="confirm-btn ok" style="width:100%;padding:10px;">📤 Select & Upload GIF</button>
      <input type="file" id="gifFileInput" accept="image/gif" style="display:none;">
      <div id="gifUploadMsg" style="margin-top:8px;font-size:12px;"></div>
    </div>`;
  modal.appendChild(card);

  const browseTab = $("gifBrowseTab");
  const uploadTab = $("gifUploadTab");
  const browsePane = $("gifBrowsePane");
  const uploadPane = $("gifUploadPane");

  browseTab.addEventListener("click", () => {
    browsePane.style.display = ""; uploadPane.style.display = "none";
    browseTab.classList.add("ok"); browseTab.classList.remove("cancel");
    uploadTab.classList.add("cancel"); uploadTab.classList.remove("ok");
  });
  uploadTab.addEventListener("click", () => {
    browsePane.style.display = "none"; uploadPane.style.display = "";
    uploadTab.classList.add("ok"); uploadTab.classList.remove("cancel");
    browseTab.classList.add("cancel"); browseTab.classList.remove("ok");
  });

  // Upload handler
  $("gifUploadBtn").addEventListener("click", () => $("gifFileInput").click());
  $("gifFileInput").addEventListener("change", async () => {
    const file = $("gifFileInput").files[0]; if (!file) return;
    $("gifFileInput").value = "";
    if (!file.type.includes("gif")) return setGifMsg("Only GIF files allowed.", false);
    if (file.size > 4*1024*1024) return setGifMsg("Max 4MB per GIF.", false);
    const name = ($("gifNameInput").value.trim() || "gif_" + Date.now()).replace(/\s+/g,"_").substring(0,30);
    setGifMsg("Uploading...", true);
    const url = await uploadImgBB(file);
    if (!url) return setGifMsg("Upload failed.", false);
    await db.ref("config/presetGifs").push({ url, name, uploadedBy: myUsername, uploadedAt: Date.now() });
    setGifMsg("✅ GIF uploaded! Upload another or browse.", true);
    $("gifNameInput").value = "";
    loadGifGrid();
  });

  function setGifMsg(msg, ok) {
    const el = $("gifUploadMsg");
    if (el) { el.textContent = msg; el.style.color = ok ? "var(--accent)" : "#ff4d4d"; }
  }

  loadGifGrid();
  modal.style.display = "flex";
}

function loadGifGrid() {
  const grid = $("gifGrid");
  if (!grid) return;
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-muted);font-size:12px;">Loading GIFs...</div>';

  db.ref("config/presetGifs").once("value", snap => {
    // Re-query grid in case modal was rebuilt while async was in flight
    const g = $("gifGrid");
    if (!g) return;
    g.innerHTML = "";
    const val = snap.val();
    if (!val) {
      g.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-dim);font-size:12px;">No GIFs yet — be the first to upload one!</div>';
      return;
    }
    const gifs = Object.entries(val).map(([id, v]) => ({ id, ...v }));
    gifs.sort((a,b) => (b.uploadedAt||0) - (a.uploadedAt||0));

    gifs.forEach(gif => {
      const cell = document.createElement("div");
      cell.style.cssText = "position:relative;border-radius:8px;overflow:hidden;cursor:pointer;border:2px solid transparent;transition:border-color .15s;aspect-ratio:1;background:var(--bg-lighter);";
      cell.onmouseenter = () => cell.style.borderColor = "var(--accent)";
      cell.onmouseleave = () => cell.style.borderColor = "transparent";

      const img = document.createElement("img");
      img.src = gif.url;
      img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
      img.title = gif.name;

      const label = document.createElement("div");
      label.style.cssText = "position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.6);font-size:9px;font-weight:700;color:#fff;padding:3px 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      label.textContent = gif.name;

      cell.appendChild(img);
      cell.appendChild(label);

      cell.addEventListener("click", () => {
        sendGifMessage(gif.url, gif.name);
        $("gifPickerModal").style.display = "none";
      });

      g.appendChild(cell);
    });
  });
}

function renderGifManagerChannel() {
  const chatbox = $("chatbox");
  chatbox.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.style.cssText = "padding:20px;";

  const title = document.createElement("div");
  title.style.cssText = "font-size:18px;font-weight:800;color:var(--text-primary);margin-bottom:6px;";
  title.textContent = "🎬 GIF Manager";
  const sub = document.createElement("div");
  sub.style.cssText = "font-size:12px;color:var(--text-muted);margin-bottom:20px;";
  sub.textContent = "All uploaded GIFs. Mods and owners can remove any GIF.";
  wrap.appendChild(title);
  wrap.appendChild(sub);

  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;";
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-dim);font-size:13px;">Loading GIFs...</div>';
  wrap.appendChild(grid);
  chatbox.appendChild(wrap);

  db.ref("config/presetGifs").once("value", snap => {
    grid.innerHTML = "";
    const val = snap.val();
    if (!val) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-dim);font-size:13px;">No GIFs uploaded yet.</div>';
      return;
    }
    const gifs = Object.entries(val).map(([id, v]) => ({ id, ...v }));
    gifs.sort((a,b) => (b.uploadedAt||0) - (a.uploadedAt||0));

    gifs.forEach(gif => {
      const card = document.createElement("div");
      card.style.cssText = "background:var(--bg-lighter);border:1px solid var(--border);border-radius:10px;overflow:hidden;display:flex;flex-direction:column;";

      const img = document.createElement("img");
      img.src = gif.url;
      img.style.cssText = "width:100%;aspect-ratio:1;object-fit:cover;display:block;";

      const info = document.createElement("div");
      info.style.cssText = "padding:8px 10px;";

      const name = document.createElement("div");
      name.style.cssText = "font-size:12px;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      name.textContent = gif.name || "untitled";

      const meta = document.createElement("div");
      meta.style.cssText = "font-size:10px;color:var(--text-muted);margin-top:2px;";
      const uploadDate = gif.uploadedAt ? new Date(gif.uploadedAt).toLocaleDateString() : "unknown date";
      meta.textContent = "by " + (gif.uploadedBy || "unknown") + " · " + uploadDate;

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "🗑️ Remove GIF";
      removeBtn.style.cssText = "margin-top:8px;width:100%;padding:6px;background:rgba(237,66,69,0.15);border:1px solid rgba(237,66,69,0.4);color:#ed4245;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;";
      removeBtn.addEventListener("click", async () => {
        const confirmed = await showConfirm("🗑️", "Remove GIF", "Remove \"" + (gif.name||"this GIF") + "\" for everyone?");
        if (!confirmed) return;
        await db.ref("config/presetGifs/" + gif.id).remove();
        card.remove();
        showToast("GIF removed.", "ok");
      });

      info.appendChild(name);
      info.appendChild(meta);
      info.appendChild(removeBtn);
      card.appendChild(img);
      card.appendChild(info);
      grid.appendChild(card);
    });
  });
}

function sendGifMessage(gifUrl, gifName) {
  if (currentChannel === "announcements" && !amOwner()) return;
  if (currentChannel === "modchat" && !amOwner() && !amMod()) return;
  if (currentChannel === "leaderboard" || currentChannel === "myleaderboard") return;
  if (isMuted(myUid)) return showToast("You are muted!", "warn");
  const now = Date.now();
  db.ref("messages/"+currentChannel).push({
    name: myUsername, message: "",
    imageUrl: gifUrl, type: "gif", gifName: gifName||"",
    time: new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
    timestamp: now, color: myColor, userId: myUid, avatarUrl: myAvatar||null
  });
  db.ref("users/"+myUid).update({ username: myUsername, color: myColor, avatarUrl: myAvatar||null });
  db.ref("users/"+myUid+"/messageCount").transaction(c => (c||0)+1);
  checkAchievements();
}

// ============================================================
// FORMAT TOOLBAR
// ============================================================
function setupFormatToolbar() {
  document.querySelectorAll(".fmt-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const fmt=btn.dataset.fmt, input=$("msgInput");
      const start=input.selectionStart, end=input.selectionEnd;
      const selected=input.value.substring(start,end)||"text";
      const wrappers={bold:"**",italic:"*",strike:"~~",code:"`"};
      let newText="";
      if (fmt==="spoiler") newText="||"+selected+"||";
      else if (wrappers[fmt]) { const w=wrappers[fmt]; newText=w+selected+w; }
      const before=input.value.substring(0,start), after=input.value.substring(end);
      input.value=before+newText+after; input.focus();
      input.selectionStart=start+(fmt==="spoiler"?2:wrappers[fmt]?.length||0);
      input.selectionEnd=input.selectionStart+selected.length;
      updateCharCounter();
    });
  });
  document.querySelectorAll(".color-dot").forEach(dot => {
    dot.addEventListener("click", () => {
      document.querySelectorAll(".color-dot").forEach(d=>d.classList.remove("selected"));
      dot.classList.add("selected"); activeColor=dot.dataset.color;
      if (activeColor) {
        const input=$("msgInput");
        const start=input.selectionStart, end=input.selectionEnd;
        const selected=input.value.substring(start,end)||"text";
        const newText="["+activeColor+":"+selected+"]";
        input.value=input.value.substring(0,start)+newText+input.value.substring(end);
        input.focus(); updateCharCounter();
        setTimeout(()=>{ document.querySelectorAll(".color-dot").forEach(d=>d.classList.remove("selected")); activeColor=""; },200);
      }
    });
  });
  // GIF picker button
  const gifBtn = $("gifPickerBtn");
  if (gifBtn) gifBtn.addEventListener("click", e => { e.stopPropagation(); openGifPicker(); });
}

// ============================================================
// INPUT SETUP
// ============================================================
function setupInput() {
  const input=$("msgInput");
  // Remove maxlength for owner so they have no character limit
  if (amOwner()) input.removeAttribute("maxlength");
  input.addEventListener("input", () => {
    input.style.height="auto"; input.style.height=Math.min(input.scrollHeight,130)+"px";
    updateCharCounter(); handleTyping(); handleMentionSuggest();
  });
  input.addEventListener("keydown", e => {
    if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); handleInputCommand(); }
    if (e.key==="Escape") { clearReply(); $("mentionDrop").style.display="none"; }
  });
  $("sendBtn").addEventListener("click", handleInputCommand);
  setupAttachButton();
}

function handleInputCommand() {
  const val = $("msgInput").value;
  if (val.trim().startsWith("/poll") && amOwner()) {
    $("msgInput").value = "";
    updateCharCounter();
    openPollModal();
    return;
  }
  sendMessage();
}

function setupAttachButton() {
  const btn=$("attachBtn"), menu=$("attachMenu");
  let menuOpen=false;
  btn.addEventListener("click", e => { e.stopPropagation(); menuOpen=!menuOpen; menu.style.display=menuOpen?"block":"none"; });
  document.addEventListener("click", ()=>{ menu.style.display="none"; menuOpen=false; });
  menu.addEventListener("click", e=>e.stopPropagation());

  $("attachMediaBtn").addEventListener("click", ()=>{ menu.style.display="none"; menuOpen=false; $("mediaInput").dataset.spoiler="false"; $("mediaInput").click(); });
  $("attachSpoilerBtn").addEventListener("click", ()=>{ menu.style.display="none"; menuOpen=false; $("mediaInput").dataset.spoiler="true"; $("mediaInput").click(); });
  $("attachLinkBtn").addEventListener("click", ()=>{
    menu.style.display="none"; menuOpen=false;
    const url=prompt("Enter a URL to share:");
    if (!url||!url.trim()) return;
    const trimmed=url.trim();
    if (!/^https?:\/\//i.test(trimmed)) return showToast("Please enter a valid URL (https://...)","warn");
    sendLinkMessage(trimmed);
  });

  $("mediaInput").addEventListener("change", async ()=>{
    const file=$("mediaInput").files[0];
    const isSpoiler=$("mediaInput").dataset.spoiler==="true";
    if (!file) return; $("mediaInput").value="";
    if (file.size>5*1024*1024) return showToast("Image must be under 5MB","err");
    showToast("Uploading image...");
    const url=await uploadImgBB(file);
    if (!url) return showToast("Upload failed","err");
    sendImageMessage(url, isSpoiler);
  });
}

function sendImageMessage(imageUrl, isSpoiler) {
  if (currentChannel==="announcements" && !amOwner()) return;
  if (currentChannel==="modchat" && !amOwner() && !amMod()) return;
  if (currentChannel==="leaderboard" || currentChannel==="myleaderboard") return;
  if (isMuted(myUid)) return showToast("You are muted!","warn");
  const now=Date.now();
  db.ref("messages/"+currentChannel).push({
    name:myUsername, message:"", imageUrl,
    imageSpoiler:isSpoiler===true,
    time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
    timestamp:now, color:myColor, userId:myUid, avatarUrl:myAvatar||null, type:"image"
  });
  db.ref("users/"+myUid).update({username:myUsername,color:myColor,avatarUrl:myAvatar||null});
  db.ref("users/"+myUid+"/messageCount").transaction(c=>(c||0)+1);
  db.ref("users/"+myUid+"/imagesSent").transaction(c=>(c||0)+1);
  checkAchievements();
}

function sendLinkMessage(url) {
  if (currentChannel==="announcements" && !amOwner()) return;
  if (currentChannel==="leaderboard" || currentChannel==="myleaderboard") return;
  if (isMuted(myUid)) return showToast("You are muted!","warn");
  const now=Date.now();
  db.ref("messages/"+currentChannel).push({
    name:myUsername, message:url,
    time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
    timestamp:now, color:myColor, userId:myUid, avatarUrl:myAvatar||null
  });
  db.ref("users/"+myUid+"/messageCount").transaction(c=>(c||0)+1);
}

function openLightbox(src) {
  let lb=$("lightbox");
  if (!lb) {
    lb=document.createElement("div"); lb.id="lightbox";
    lb.addEventListener("click", ()=>lb.remove()); document.body.appendChild(lb);
  }
  lb.innerHTML=`<img src="${src}" alt="Image">`; lb.style.display="flex";
}

function updateCharCounter() {
  const len=$("msgInput").value.length, el=$("charCounter");
  if (amOwner()) { el.textContent="∞"; el.className="char-counter"; return; }
  el.textContent=len+"/"+MAX_CHARS;
  el.className="char-counter"+(len>=MAX_CHARS?" over":len>=MAX_CHARS*0.8?" warn":"");
}

function handleTyping() {
  if (currentChannel==="announcements"||currentChannel==="leaderboard"||currentChannel==="myleaderboard") return;
  if (!isTyping) { isTyping=true; setTyping(true); }
  clearTimeout(typingTimer);
  typingTimer=setTimeout(()=>{ isTyping=false; setTyping(false); },3000);
}

// ============================================================
// POLL MODAL
// ============================================================
let selectedPollDuration = 3600000;

function openPollModal() {
  $("pollModal").style.display = "flex";
  $("pollQuestion").value = "";
  $("pollOptions").innerHTML = "";
  ["Option 1","Option 2"].forEach((ph) => {
    const inp = document.createElement("input");
    inp.className="poll-option-input settings-input"; inp.type="text"; inp.placeholder=ph; inp.maxLength=60;
    $("pollOptions").appendChild(inp);
  });
  selectedPollDuration = 3600000;
  document.querySelectorAll(".poll-dur-btn").forEach(b => b.classList.toggle("active", b.dataset.dur==selectedPollDuration));
}

$("pollClose").addEventListener("click", ()=>{ $("pollModal").style.display="none"; });
$("pollCancel").addEventListener("click", ()=>{ $("pollModal").style.display="none"; });

$("addPollOption").addEventListener("click", ()=>{
  const opts = $("pollOptions").querySelectorAll(".poll-option-input");
  if (opts.length >= 4) return showToast("Max 4 options","warn");
  const inp=document.createElement("input");
  inp.className="poll-option-input settings-input"; inp.type="text";
  inp.placeholder="Option "+(opts.length+1); inp.maxLength=60;
  $("pollOptions").appendChild(inp);
});

document.querySelectorAll(".poll-dur-btn").forEach(btn => {
  btn.addEventListener("click", ()=>{
    selectedPollDuration=parseInt(btn.dataset.dur);
    document.querySelectorAll(".poll-dur-btn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
  });
});

$("pollPost").addEventListener("click", async ()=>{
  const question=$("pollQuestion").value.trim();
  if (!question) return showToast("Enter a question","warn");
  const optInputs=[...$("pollOptions").querySelectorAll(".poll-option-input")];
  const options=optInputs.map(i=>i.value.trim()).filter(Boolean);
  if (options.length<2) return showToast("Need at least 2 options","warn");
  const now=Date.now();
  await db.ref("messages/"+currentChannel).push({
    name:myUsername, userId:myUid, color:myColor, avatarUrl:myAvatar||null,
    time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
    timestamp:now, type:"poll",
    pollQuestion:question, pollOptions:options,
    pollEndsAt:now+selectedPollDuration, votes:{}
  });
  $("pollModal").style.display="none";
  showToast("Poll posted!","ok");
});

// ============================================================
// @MENTION SUGGEST
// ============================================================
function handleMentionSuggest() {
  const input=$("msgInput"), val=input.value, cursor=input.selectionStart;
  const before=val.substring(0,cursor);
  const match=before.match(/@(\w*)$/);
  const drop=$("mentionDrop");
  if (!match) { drop.style.display="none"; return; }
  const query=match[1].toLowerCase();
  const results=Object.values(allUsersCache).filter(u=>u.username&&u.username.toLowerCase().startsWith(query)).slice(0,6);
  if (!results.length) { drop.style.display="none"; return; }
  drop.innerHTML="";
  results.forEach(u => {
    const item=document.createElement("div"); item.className="mention-item";
    const av=buildAvatar(u.avatarUrl||null,u.username,u.color||"#4da6ff",24);
    const name=document.createElement("span"); name.textContent=u.username; name.style.color=u.color||"#fff"; name.style.fontWeight="700";
    item.appendChild(av); item.appendChild(name);
    item.addEventListener("click", ()=>{
      const newBefore=before.replace(/@\w*$/,"@"+u.username+" ");
      input.value=newBefore+val.substring(cursor);
      input.focus(); drop.style.display="none";
    });
    drop.appendChild(item);
  });
  drop.style.display="block";
}

// ============================================================
// SEND MESSAGE
// ============================================================
function sendMessage() {
  if (currentChannel==="announcements" && !amOwner()) return;
  if (currentChannel==="modchat" && !amOwner() && !amMod()) return;
  if (currentChannel==="leaderboard" || currentChannel==="myleaderboard") return;
  if (isMuted(myUid)) return showToast("You are muted!","warn");

  const now=Date.now();
  if (sending || now-lastSentTime<1200) return;
  const raw=$("msgInput").value.trim();
  if (!raw) return;
  if (raw.length>MAX_CHARS && !amOwner()) return showToast("Message too long!","warn");
  if (filterBadWords(raw)) {
    showToast("⚠️ Message contains disallowed words. You have been muted for 30 minutes.","warn");
    applySlurTimeout(raw);
    return;
  }
  if (raw===lastSentMsg) return showToast("⚠️ Can't send the same message twice in a row.","warn");

  sending=true;
  $("msgInput").value=""; $("msgInput").style.height="auto"; updateCharCounter();
  clearTimeout(typingTimer); isTyping=false; setTyping(false);
  const capturedReply=replyingTo; clearReply();

  const msgData={
    name:myUsername, message:raw,
    time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
    timestamp:now, color:myColor, userId:myUid, avatarUrl:myAvatar||null
  };
  if (capturedReply) msgData.replyTo={msgId:capturedReply.msgId,name:capturedReply.name,text:capturedReply.text};

  db.ref("messages/"+currentChannel).push(msgData)
    .then(()=>{ sending=false; lastSentTime=now; lastSentMsg=raw; })
    .catch(()=>{ sending=false; showToast("Failed to send message","err"); });

  db.ref("users/"+myUid).update({username:myUsername,color:myColor,avatarUrl:myAvatar||null});
  db.ref("users/"+myUid+"/messageCount").transaction(c=>(c||0)+1);
  checkAchievements();
}

// ============================================================
// SETTINGS
// ============================================================
function setupSettings() {
  $("settingsBtn").addEventListener("click", openSettings);
  $("settingsClose").addEventListener("click", closeSettings);
  $("settingsOverlay").addEventListener("click", e=>{ if(e.target===$("settingsOverlay")) closeSettings(); });

  $("saveUsernameBtn").addEventListener("click", async ()=>{
    const msg=$("usernameChangeMsg"), newName=$("newUsernameInput").value.trim();
    if (!newName||newName.length<2) return setMsg(msg,"Must be at least 2 characters.",false);
    if (/[^a-zA-Z0-9_]/.test(newName)) return setMsg(msg,"Letters, numbers, underscores only.",false);
    if (newName===myUsername) { closeSettings(); return; }
    const snap=await db.ref("users/"+myUid+"/lastUsernameChange").once("value");
    const last=snap.val()||0;
    if (Date.now()-last<WEEK_MS) {
      const rem=WEEK_MS-(Date.now()-last), days=Math.floor(rem/86400000), hrs=Math.floor((rem%86400000)/3600000);
      return setMsg(msg,"⏳ Available in "+days+"d "+hrs+"h",false);
    }
    const taken=await db.ref("users").orderByChild("usernameLower").equalTo(newName.toLowerCase()).once("value");
    if (taken.exists()) return setMsg(msg,"That username is taken.",false);
    await db.ref("users/"+myUid).update({username:newName,usernameLower:newName.toLowerCase(),lastUsernameChange:Date.now()});
    myUsername=newName; updateSidebarUser(); setMsg(msg,"✓ Username updated!",true);
  });

  $("saveStatusBtn").addEventListener("click", async ()=>{
    const status=$("statusInput").value.trim();
    myStatus=status;
    await db.ref("users/"+myUid+"/status").set(status);
    setMsg($("statusMsg"),"✓ Status updated!",true);
    setTimeout(()=>setMsg($("statusMsg"),"",true),2000);
  });

  $("saveBioBtn").addEventListener("click", async ()=>{
    const bio=$("bioInput").value.trim();
    myBio=bio;
    await db.ref("users/"+myUid+"/bio").set(bio);
    setMsg($("bioMsg"),"✓ Bio updated!",true);
    setTimeout(()=>setMsg($("bioMsg"),"",true),2000);
  });

  const cp=$("colorPicker"); cp.value=myColor; $("colorLabel").textContent=myColor;
  cp.addEventListener("input", e=>{
    myColor=e.target.value; $("colorLabel").textContent=myColor;
    db.ref("users/"+myUid).update({color:myColor}); updateSidebarUser();
  });

  // Settings banner button
  const sBannerBtn=$("settingsBannerBtn");
  if (sBannerBtn) sBannerBtn.addEventListener("click", () => { $("bannerInput").click(); });

  // Background image upload
  const saveBgBtn=$("saveBgImageBtn");
  const clearBgBtn=$("clearBgImageBtn");
  const bgFileInput=$("bgImageFileInput");
  if (saveBgBtn) saveBgBtn.addEventListener("click", ()=>{ if (bgFileInput) bgFileInput.click(); });
  if (bgFileInput) bgFileInput.addEventListener("change", async ()=>{
    const file=bgFileInput.files[0]; if (!file) return;
    bgFileInput.value="";
    if (file.size>5*1024*1024) return setMsg($("bgImageMsg"),"Image must be under 5MB.",false);
    setMsg($("bgImageMsg"),"Uploading...",true);
    const url=await uploadImgBB(file);
    if (!url) return setMsg($("bgImageMsg"),"Upload failed.",false);
    localStorage.setItem("snc_bg_image", url);
    await db.ref("users/"+myUid).update({ bgImageUrl: url });
    applyBackgroundImage(url);
    setMsg($("bgImageMsg"),"✓ Background set!",true);
    setTimeout(()=>setMsg($("bgImageMsg"),"",true),2000);
  });
  if (clearBgBtn) clearBgBtn.addEventListener("click", async ()=>{
    localStorage.removeItem("snc_bg_image");
    await db.ref("users/"+myUid+"/bgImageUrl").remove();
    applyBackgroundImage(null);
    setMsg($("bgImageMsg"),"✓ Background cleared.",true);
    setTimeout(()=>setMsg($("bgImageMsg"),"",true),2000);
  });
}

function setMsg(el,text,ok){ el.textContent=text; el.className="settings-msg "+(ok?"ok":"bad"); }

function openSettings() {
  $("settingsOverlay").style.display="flex";
  $("newUsernameInput").value=myUsername;
  $("colorPicker").value=myColor; $("colorLabel").textContent=myColor;
  $("statusInput").value=myStatus||"";
  $("bioInput").value=myBio||"";
  checkUsernameCooldown();
  buildCustomThemeBuilder();
}
function closeSettings(){ $("settingsOverlay").style.display="none"; }

async function checkUsernameCooldown() {
  const msg=$("usernameChangeMsg");
  const snap=await db.ref("users/"+myUid+"/lastUsernameChange").once("value");
  const last=snap.val()||0;
  if (Date.now()-last<WEEK_MS) {
    const rem=WEEK_MS-(Date.now()-last), days=Math.floor(rem/86400000), hrs=Math.floor((rem%86400000)/3600000);
    setMsg(msg,"⏳ Next change in "+days+"d "+hrs+"h",false);
    $("newUsernameInput").disabled=true; $("saveUsernameBtn").disabled=true;
  } else {
    setMsg(msg,"✓ Change available",true);
    $("newUsernameInput").disabled=false; $("saveUsernameBtn").disabled=false;
  }
}

// ============================================================
// THEMES
// ============================================================
const THEMES = {
  "Story Network": {
    "--accent":"#0055ff","--accent-hover":"#0033cc",
    "--accent-glow":"rgba(0,85,255,0.55)","--accent-light":"rgba(0,85,255,0.12)",
    "--bg-darkest":"#030305","--bg-dark":"#07070f","--bg-mid":"#0a0a18",
    "--bg-light":"#0d0d20","--bg-lighter":"#111128","--bg-input":"#14142e",
    "--text-primary":"#e8e8ff","--text-muted":"#7070aa","--text-dim":"#35355a",
    "--border":"rgba(0,85,255,0.10)","--border-hover":"rgba(0,85,255,0.28)",
    "--msg-mine":"rgba(0,60,200,0.28)","--msg-other":"rgba(255,255,255,0.04)",
    preview:{sidebar:"#0a0a18",chat:"#0d0d20",accent:"#0055ff"}
  },
  "Dark": {
    "--accent":"#5865f2","--accent-hover":"#4752c4",
    "--accent-glow":"rgba(88,101,242,0.35)","--accent-light":"rgba(88,101,242,0.12)",
    "--bg-darkest":"#0e0f11","--bg-dark":"#161719","--bg-mid":"#1e2024",
    "--bg-light":"#26282d","--bg-lighter":"#2e3136","--bg-input":"#383b42",
    "--text-primary":"#e3e5e8","--text-muted":"#949ba4","--text-dim":"#55585f",
    "--border":"rgba(255,255,255,0.06)","--border-hover":"rgba(255,255,255,0.12)",
    "--msg-mine":"#2b3175","--msg-other":"#1e2024",
    preview:{sidebar:"#1e2024",chat:"#26282d",accent:"#5865f2"}
  },
  "Green": {
    "--accent":"#22c55e","--accent-hover":"#16a34a",
    "--accent-glow":"rgba(34,197,94,0.35)","--accent-light":"rgba(34,197,94,0.12)",
    "--bg-darkest":"#071410","--bg-dark":"#0d1f18","--bg-mid":"#122b21",
    "--bg-light":"#183829","--bg-lighter":"#1e4533","--bg-input":"#24523d",
    "--text-primary":"#d1fae5","--text-muted":"#86efac","--text-dim":"#2d6b45",
    "--border":"rgba(34,197,94,0.1)","--border-hover":"rgba(34,197,94,0.2)",
    "--msg-mine":"#1a4d30","--msg-other":"#122b21",
    preview:{sidebar:"#122b21",chat:"#183829",accent:"#22c55e"}
  },
  "Pink": {
    "--accent":"#f472b6","--accent-hover":"#ec4899",
    "--accent-glow":"rgba(244,114,182,0.35)","--accent-light":"rgba(244,114,182,0.12)",
    "--bg-darkest":"#150a10","--bg-dark":"#1e0f18","--bg-mid":"#281420",
    "--bg-light":"#321928","--bg-lighter":"#3c1e30","--bg-input":"#48243a",
    "--text-primary":"#fce7f3","--text-muted":"#f9a8d4","--text-dim":"#7a3555",
    "--border":"rgba(244,114,182,0.1)","--border-hover":"rgba(244,114,182,0.2)",
    "--msg-mine":"#4a1a35","--msg-other":"#281420",
    preview:{sidebar:"#281420",chat:"#321928",accent:"#f472b6"}
  },
  "Orange": {
    "--accent":"#f97316","--accent-hover":"#ea580c",
    "--accent-glow":"rgba(249,115,22,0.35)","--accent-light":"rgba(249,115,22,0.12)",
    "--bg-darkest":"#150d05","--bg-dark":"#20130a","--bg-mid":"#2d1c0f",
    "--bg-light":"#3a2514","--bg-lighter":"#472e19","--bg-input":"#54371e",
    "--text-primary":"#ffedd5","--text-muted":"#fdba74","--text-dim":"#7c4a1e",
    "--border":"rgba(249,115,22,0.1)","--border-hover":"rgba(249,115,22,0.2)",
    "--msg-mine":"#5a2a0a","--msg-other":"#2d1c0f",
    preview:{sidebar:"#2d1c0f",chat:"#3a2514",accent:"#f97316"}
  },
  "Purple": {
    "--accent":"#a855f7","--accent-hover":"#9333ea",
    "--accent-glow":"rgba(168,85,247,0.35)","--accent-light":"rgba(168,85,247,0.12)",
    "--bg-darkest":"#0d0714","--bg-dark":"#140d1f","--bg-mid":"#1c142b",
    "--bg-light":"#241b38","--bg-lighter":"#2c2245","--bg-input":"#342952",
    "--text-primary":"#f3e8ff","--text-muted":"#d8b4fe","--text-dim":"#6b3fa0",
    "--border":"rgba(168,85,247,0.1)","--border-hover":"rgba(168,85,247,0.2)",
    "--msg-mine":"#3a1a5e","--msg-other":"#1c142b",
    preview:{sidebar:"#1c142b",chat:"#241b38",accent:"#a855f7"}
  },
  "Red": {
    "--accent":"#ef4444","--accent-hover":"#dc2626",
    "--accent-glow":"rgba(239,68,68,0.35)","--accent-light":"rgba(239,68,68,0.12)",
    "--bg-darkest":"#150508","--bg-dark":"#200810","--bg-mid":"#2d0d18",
    "--bg-light":"#3a1020","--bg-lighter":"#47142a","--bg-input":"#541834",
    "--text-primary":"#fee2e2","--text-muted":"#fca5a5","--text-dim":"#7f2f3f",
    "--border":"rgba(239,68,68,0.1)","--border-hover":"rgba(239,68,68,0.2)",
    "--msg-mine":"#5a1020","--msg-other":"#2d0d18",
    preview:{sidebar:"#2d0d18",chat:"#3a1020",accent:"#ef4444"}
  },
  "Cyan": {
    "--accent":"#06b6d4","--accent-hover":"#0891b2",
    "--accent-glow":"rgba(6,182,212,0.35)","--accent-light":"rgba(6,182,212,0.12)",
    "--bg-darkest":"#050a10","--bg-dark":"#0a1520","--bg-mid":"#102030",
    "--bg-light":"#152840","--bg-lighter":"#1a3050","--bg-input":"#1f3860",
    "--text-primary":"#e0f7ff","--text-muted":"#67e8f9","--text-dim":"#2a6080",
    "--border":"rgba(6,182,212,0.1)","--border-hover":"rgba(6,182,212,0.2)",
    "--msg-mine":"#0a3a4e","--msg-other":"#102030",
    preview:{sidebar:"#102030",chat:"#152840",accent:"#06b6d4"}
  },
  "Yellow": {
    "--accent":"#fbbf24","--accent-hover":"#f59e0b",
    "--accent-glow":"rgba(251,191,36,0.35)","--accent-light":"rgba(251,191,36,0.12)",
    "--bg-darkest":"#0e0a00","--bg-dark":"#180f00","--bg-mid":"#221500",
    "--bg-light":"#2c1b00","--bg-lighter":"#362200","--bg-input":"#422900",
    "--text-primary":"#fef3c7","--text-muted":"#fcd34d","--text-dim":"#78560a",
    "--border":"rgba(251,191,36,0.1)","--border-hover":"rgba(251,191,36,0.2)",
    "--msg-mine":"#4a2800","--msg-other":"#221500",
    preview:{sidebar:"#221500",chat:"#2c1b00",accent:"#fbbf24"}
  },
  "Light": {
    "--accent":"#2563eb","--accent-hover":"#1d4ed8",
    "--accent-glow":"rgba(37,99,235,0.25)","--accent-light":"rgba(37,99,235,0.1)",
    "--bg-darkest":"#e2e8f0","--bg-dark":"#f1f5f9","--bg-mid":"#f8fafc",
    "--bg-light":"#ffffff","--bg-lighter":"#f1f5f9","--bg-input":"#e2e8f0",
    "--text-primary":"#0f172a","--text-muted":"#475569","--text-dim":"#94a3b8",
    "--border":"rgba(0,0,0,0.08)","--border-hover":"rgba(0,0,0,0.15)",
    "--msg-mine":"#dbeafe","--msg-other":"#f1f5f9",
    preview:{sidebar:"#f8fafc",chat:"#ffffff",accent:"#2563eb"}
  }
};

function buildThemeGrid() {
  const grid=$("themeGrid"); grid.innerHTML="";
  const saved=localStorage.getItem("snc_theme")||"Story Network";
  Object.entries(THEMES).forEach(([name,t]) => {
    const card=document.createElement("div"); card.className="theme-card"+(name===saved?" active":"");
    card.innerHTML=`
      <div class="theme-preview" style="background:${t.preview.chat};">
        <div class="theme-preview-sidebar" style="background:${t.preview.sidebar};"></div>
        <div class="theme-preview-chat" style="background:${t.preview.chat};">
          <div class="theme-preview-bubble" style="background:${t.preview.accent};"></div>
          <div class="theme-preview-bubble r" style="background:${t.preview.sidebar};"></div>
        </div>
      </div>
      <div class="theme-card-name">${name}</div>`;
    card.addEventListener("click", ()=>{
      applyTheme(name);
      document.querySelectorAll(".theme-card").forEach(c=>c.classList.remove("active"));
      card.classList.add("active");
    });
    grid.appendChild(card);
  });
}

function applyTheme(name) {
  const t=THEMES[name]; if(!t) return;
  const root=document.documentElement;
  Object.entries(t).forEach(([k,v])=>{ if(k!=="preview") root.style.setProperty(k,v); });
  localStorage.setItem("snc_theme",name);
}

function loadTheme() {
  applyTheme(localStorage.getItem("snc_theme")||"Story Network");
  applyTextSize(localStorage.getItem("snc_textsize")||"14px");
  applyBackgroundImage(localStorage.getItem("snc_bg_image")||null);
}

function applyBackgroundImage(url) {
  const chatArea = $("chatArea");
  if (!chatArea) return;
  if (url) {
    chatArea.style.backgroundImage = `url(${url})`;
    chatArea.style.backgroundSize = "cover";
    chatArea.style.backgroundPosition = "center";
    chatArea.style.backgroundRepeat = "no-repeat";
    chatArea.style.backgroundAttachment = "scroll";
    // Make chatbox transparent so the background shows through
    const chatbox = $("chatbox");
    if (chatbox) chatbox.style.background = "transparent";
  } else {
    chatArea.style.backgroundImage = "";
    chatArea.style.backgroundSize = "";
    chatArea.style.backgroundPosition = "";
    chatArea.style.backgroundRepeat = "";
    chatArea.style.backgroundAttachment = "";
    const chatbox = $("chatbox");
    if (chatbox) chatbox.style.background = "";
  }
}

function buildSizeRow() {
  const row=$("sizeRow"); row.innerHTML="";
  const saved=localStorage.getItem("snc_textsize")||"14px";
  ["12px","14px","16px","18px"].forEach(size=>{
    const btn=document.createElement("button");
    btn.className="size-btn"+(saved===size?" active":""); btn.textContent=size;
    btn.addEventListener("click",()=>{
      applyTextSize(size); localStorage.setItem("snc_textsize",size);
      row.querySelectorAll(".size-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
    });
    row.appendChild(btn);
  });
}
function applyTextSize(size){ $("chatbox").style.fontSize=size; }

function buildCustomThemeBuilder() {
  const btn = $("applyCustomThemeBtn");
  if (!btn) return;
  // Load saved custom theme values
  const saved = JSON.parse(localStorage.getItem("snc_custom_theme")||"{}");
  if (saved.accent) $("ct_accent").value = saved.accent;
  if (saved.bg) $("ct_bg").value = saved.bg;
  if (saved.sidebar) $("ct_sidebar").value = saved.sidebar;
  if (saved.text) $("ct_text").value = saved.text;
  if (saved.msgmine) $("ct_msgmine").value = saved.msgmine;
  if (saved.msgother) $("ct_msgother").value = saved.msgother;

  btn.addEventListener("click", () => {
    const accent = $("ct_accent").value;
    const bg = $("ct_bg").value;
    const sidebar = $("ct_sidebar").value;
    const text = $("ct_text").value;
    const msgmine = $("ct_msgmine").value;
    const msgother = $("ct_msgother").value;

    // Derive glow/hover/light variants from accent
    const root = document.documentElement;
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-hover", shadeColor(accent, -20));
    root.style.setProperty("--accent-glow", hexToRgba(accent, 0.35));
    root.style.setProperty("--accent-light", hexToRgba(accent, 0.12));
    root.style.setProperty("--bg-darkest", shadeColor(bg, -30));
    root.style.setProperty("--bg-dark", bg);
    root.style.setProperty("--bg-mid", shadeColor(bg, 10));
    root.style.setProperty("--bg-light", shadeColor(bg, 18));
    root.style.setProperty("--bg-lighter", shadeColor(bg, 25));
    root.style.setProperty("--bg-input", shadeColor(bg, 32));
    root.style.setProperty("--text-primary", text);
    root.style.setProperty("--text-muted", shadeColor(text, -30));
    root.style.setProperty("--text-dim", shadeColor(text, -60));
    root.style.setProperty("--border", hexToRgba(accent, 0.1));
    root.style.setProperty("--border-hover", hexToRgba(accent, 0.28));
    root.style.setProperty("--msg-mine", msgmine);
    root.style.setProperty("--msg-other", msgother);

    // Mark as custom active in theme grid
    document.querySelectorAll(".theme-card").forEach(c => c.classList.remove("active"));

    const customVals = { accent, bg, sidebar, text, msgmine, msgother };
    localStorage.setItem("snc_custom_theme", JSON.stringify(customVals));
    localStorage.setItem("snc_theme", "__custom__");
    showToast("🎨 Custom theme applied!", "ok");
  });
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function shadeColor(hex, pct) {
  let r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  r = Math.max(0,Math.min(255, r + Math.round(pct*2.55)));
  g = Math.max(0,Math.min(255, g + Math.round(pct*2.55)));
  b = Math.max(0,Math.min(255, b + Math.round(pct*2.55)));
  return "#"+[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join("");
}

// ============================================================
// DM SYSTEM
// ============================================================
let currentDMConvId = null;
let dmListeners = {};
let dmUnreadCounts = {};
let dmConvListener = null; // live listener for conv list
let dmRenderedIds = {}; // track rendered message IDs per conv to prevent duplicates
let dmRenderListTimer = null; // debounce re-renders of conv list
let reportsListener = null; // live listener for reports channel

function getDMConvId(uid1, uid2) {
  return [uid1, uid2].sort().join("_dm_");
}

function setupDMSystem() {
  $("dmClose").addEventListener("click", () => { $("dmOverlay").style.display = "none"; currentDMConvId = null; });
  $("dmOverlay").addEventListener("click", e => { if (e.target === $("dmOverlay")) { $("dmOverlay").style.display = "none"; currentDMConvId = null; } });
  $("dmSendBtn").addEventListener("click", sendDMMessage);
  $("dmInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDMMessage(); } });
  $("dmInput").addEventListener("input", () => {
    $("dmInput").style.height = "auto";
    $("dmInput").style.height = Math.min($("dmInput").scrollHeight, 120) + "px";
  });
  $("dmImageBtn").addEventListener("click", () => $("dmImageInput").click());
  $("dmImageInput").addEventListener("change", async () => {
    const file = $("dmImageInput").files[0]; if (!file) return;
    $("dmImageInput").value = "";
    if (!currentDMConvId) return showToast("Select a conversation first.","warn");
    if (file.size > 5*1024*1024) return showToast("Image must be under 5MB","err");
    showToast("📤 Uploading image...","ok");
    const url = await uploadImgBB(file);
    if (!url) return showToast("Image upload failed","err");
    const now = Date.now();
    const msgData = {
      name: myUsername, message: "📷 Image",
      type: "image", imageUrl: url,
      time: new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
      timestamp: now, color: myColor, userId: myUid, avatarUrl: myAvatar||null
    };
    await db.ref("dmMessages/"+currentDMConvId).push(msgData);
    await db.ref("dmConversations/"+currentDMConvId).update({ lastMessage: "📷 Image", lastMessageAt: now });
    await db.ref("dmConversations/"+currentDMConvId+"/members/"+myUid+"/lastRead").set(now);
  });
  $("newGroupBtn").addEventListener("click", openNewGroupModal);
  $("newGroupCancel").addEventListener("click", () => $("newGroupModal").style.display = "none");
  $("newGroupCreate").addEventListener("click", createGroupChat);

  // GC settings button
  $("gcSettingsBtn").addEventListener("click", openGCSettings);
  $("gcSettingsClose").addEventListener("click", () => $("gcSettingsModal").style.display = "none");
  $("gcSettingsModal").addEventListener("click", e => { if (e.target === $("gcSettingsModal")) $("gcSettingsModal").style.display = "none"; });
  $("gcRenameBtn").addEventListener("click", renameGC);
  $("gcPhotoBtn").addEventListener("click", () => $("gcPhotoInput").click());
  $("gcPhotoInput").addEventListener("change", uploadGCPhoto);
  $("gcAddMembersBtn").addEventListener("click", addGCMembers);
  $("gcLeaveBtn").addEventListener("click", leaveGC);

  // Live listener for unread badges — fires whenever any conv changes
  db.ref("dmConversations").on("value", snap => {
    if (!snap.exists()) return;
    let totalUnread = 0;
    snap.forEach(convSnap => {
      const conv = convSnap.val();
      if (!conv || !conv.members || !conv.members[myUid]) return;
      const lastRead = conv.members[myUid].lastRead || 0;
      const lastMsg = conv.lastMessageAt || 0;
      if (lastMsg > lastRead) totalUnread++;
    });
    const badge = $("dmUnreadBadge");
    if (badge) {
      badge.style.display = totalUnread > 0 ? "inline-flex" : "none";
      badge.textContent = totalUnread;
    }
    // Debounce conv list re-render so rapid message sends don't cause flicker
    if ($("dmOverlay").style.display !== "none") {
      clearTimeout(dmRenderListTimer);
      dmRenderListTimer = setTimeout(renderDMConvList, 400);
    }
  });
}

function openDMOverlay() {
  $("dmOverlay").style.display = "flex";
  renderDMConvList().then(() => {
    // Auto-select last opened DM
    const lastId = localStorage.getItem("snc_last_dm_conv");
    if (lastId && !currentDMConvId) {
      db.ref("dmConversations/"+lastId).once("value", snap => {
        if (snap.exists() && snap.val().members && snap.val().members[myUid]) {
          openDMConversation(lastId);
        } else {
          // fallback: pick the most recent conv
          db.ref("dmConversations").orderByChild("lastMessageAt").limitToLast(1).once("value", s => {
            s.forEach(c => { if (c.val().members && c.val().members[myUid]) openDMConversation(c.key); });
          });
        }
      });
    } else if (!currentDMConvId) {
      db.ref("dmConversations").orderByChild("lastMessageAt").limitToLast(1).once("value", s => {
        s.forEach(c => { if (c.val().members && c.val().members[myUid]) openDMConversation(c.key); });
      });
    }
  });
}

function openDMWith(friendUid) {
  if (isBlocked(friendUid)) return showToast("You have blocked this user.","warn");
  $("dmOverlay").style.display = "flex";
  const convId = getDMConvId(myUid, friendUid);
  db.ref("dmConversations/"+convId).once("value", snap => {
    if (!snap.exists()) {
      const friendData = allUsersCache[friendUid] || {};
      db.ref("dmConversations/"+convId).set({
        type: "dm",
        members: {
          [myUid]: { username: myUsername, color: myColor, avatarUrl: myAvatar||null, lastRead: 0 },
          [friendUid]: { username: friendData.username||"User", color: friendData.color||"#4da6ff", avatarUrl: friendData.avatarUrl||null, lastRead: 0 }
        },
        createdAt: Date.now(),
        lastMessageAt: 0
      });
    }
    renderDMConvList();
    openDMConversation(convId);
  });
}

async function renderDMConvList() {
  const list = $("dmConvList");
  const snap = await db.ref("dmConversations").once("value");
  list.innerHTML = "";
  if (!snap.exists()) {
    list.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--text-dim);">No conversations yet.<br>Add friends and send them a DM!</div>';
    return;
  }

  const dms = [], groups = [];
  snap.forEach(child => {
    const conv = child.val();
    // Only show conversations where this user is still a member (not just referenced)
    if (conv && conv.members && conv.members[myUid] !== undefined && conv.members[myUid] !== null) {
      const obj = { id: child.key, ...conv };
      if (conv.type === "group") groups.push(obj);
      else dms.push(obj);
    }
  });

  dms.sort((a, b) => (b.lastMessageAt||0) - (a.lastMessageAt||0));
  groups.sort((a, b) => (b.lastMessageAt||0) - (a.lastMessageAt||0));

  if (!dms.length && !groups.length) {
    list.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--text-dim);">No conversations yet.</div>';
    return;
  }

  function makeConvRow(conv) {
    const isGroup = conv.type === "group";
    let displayName, avatarEl;
    if (isGroup) {
      displayName = conv.groupName || "Group Chat";
      if (conv.groupAvatarUrl) {
        const img = document.createElement("img");
        img.src = conv.groupAvatarUrl;
        img.style.cssText = "width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0;";
        avatarEl = img;
      } else {
        avatarEl = buildInitialAvatar("G", "#5865f2", 34);
      }
    } else {
      const otherUid = Object.keys(conv.members).find(uid => uid !== myUid);
      const otherUser = allUsersCache[otherUid] || conv.members[otherUid] || {};
      displayName = otherUser.username || "Unknown";
      avatarEl = buildAvatar(otherUser.avatarUrl||null, displayName, otherUser.color||"#4da6ff", 34);
    }

    const lastRead = (conv.members[myUid]||{}).lastRead || 0;
    const hasUnread = (conv.lastMessageAt||0) > lastRead;

    const row = document.createElement("div");
    row.className = "dm-conv-row" + (currentDMConvId === conv.id ? " selected" : "") + (hasUnread ? " unread" : "");
    const nameEl = document.createElement("span"); nameEl.className = "dm-conv-name";
    nameEl.textContent = displayName;
    if (!isGroup) {
      const otherUid = Object.keys(conv.members).find(uid => uid !== myUid);
      const otherUser = allUsersCache[otherUid] || conv.members[otherUid] || {};
      nameEl.style.color = otherUser.color || "var(--text-primary)";
    }
    const previewEl = document.createElement("span"); previewEl.className = "dm-conv-preview";
    previewEl.textContent = conv.lastMessage ? conv.lastMessage.substring(0, 40) : "No messages yet";
    const info = document.createElement("div"); info.style.cssText = "flex:1;overflow:hidden;";
    info.appendChild(nameEl); info.appendChild(previewEl);
    row.appendChild(avatarEl); row.appendChild(info);
    if (hasUnread) {
      const dot = document.createElement("div");
      dot.style.cssText = "width:8px;height:8px;border-radius:50%;background:var(--accent);flex-shrink:0;";
      row.appendChild(dot);
    }
    row.addEventListener("click", () => openDMConversation(conv.id));
    return row;
  }

  // Direct Messages section
  if (dms.length) {
    const dmLabel = document.createElement("div");
    dmLabel.style.cssText = "font-size:10px;font-weight:800;color:var(--text-dim);letter-spacing:.08em;text-transform:uppercase;padding:10px 12px 4px;";
    dmLabel.textContent = "Direct Messages";
    list.appendChild(dmLabel);
    dms.forEach(conv => list.appendChild(makeConvRow(conv)));
  }

  // Group Chats section — separated with a divider
  if (groups.length) {
    const sep = document.createElement("div");
    sep.style.cssText = "height:1px;background:var(--border);margin:8px 10px;";
    list.appendChild(sep);
    const gcLabel = document.createElement("div");
    gcLabel.style.cssText = "font-size:10px;font-weight:800;color:var(--text-dim);letter-spacing:.08em;text-transform:uppercase;padding:4px 12px 4px;";
    gcLabel.textContent = "Group Chats";
    list.appendChild(gcLabel);
    groups.forEach(conv => list.appendChild(makeConvRow(conv)));
  }
}

function openDMConversation(convId) {
  // Tear down previous listener
  if (dmListeners[currentDMConvId]) {
    try { dmListeners[currentDMConvId].ref.off("child_added", dmListeners[currentDMConvId].fn); } catch(e){}
    delete dmListeners[currentDMConvId];
  }

  currentDMConvId = convId;
  localStorage.setItem("snc_last_dm_conv", convId);
  dmRenderedIds[convId] = {};

  db.ref("dmConversations/"+convId+"/members/"+myUid+"/lastRead").set(Date.now());
  document.querySelectorAll(".dm-conv-row").forEach(r => r.classList.remove("selected"));

  db.ref("dmConversations/"+convId).once("value", snap => {
    if (!snap.exists()) return;
    const conv = snap.val();
    // Guard: don't open a conversation the user is no longer a member of
    if (!conv.members || conv.members[myUid] === undefined || conv.members[myUid] === null) {
      if (currentDMConvId === convId) currentDMConvId = null;
      const storedLast = localStorage.getItem("snc_last_dm_conv");
      if (storedLast === convId) localStorage.removeItem("snc_last_dm_conv");
      renderDMConvList();
      return;
    }
    const isGroup = conv.type === "group";

    const titleEl = $("dmChatTitle");
    const membersEl = $("dmChatMembers");
    if (isGroup) {
      titleEl.textContent = conv.groupName || "Group Chat";
      titleEl.style.color = "";
      const memberNames = Object.values(conv.members).map(m => m.username).join(", ");
      membersEl.textContent = memberNames;
      $("gcSettingsBtn").style.display = "block";
    } else {
      const otherUid = Object.keys(conv.members).find(uid => uid !== myUid);
      const otherUser = allUsersCache[otherUid] || conv.members[otherUid] || {};
      titleEl.textContent = otherUser.username || "Unknown";
      titleEl.style.color = otherUser.color || "var(--text-primary)";
      membersEl.textContent = "";
      $("gcSettingsBtn").style.display = "none";
    }

    $("dmInputRow").style.display = "flex";
    $("dmChatbox").innerHTML = "";
    $("dmInput").focus();

    const msgRef = db.ref("dmMessages/"+convId);

    // Load history first, then attach live listener — no overlap, no duplicates
    msgRef.orderByChild("timestamp").limitToLast(60).once("value", msgSnap => {
      const msgs = [];
      msgSnap.forEach(child => {
        msgs.push({ id: child.key, ...child.val() });
        dmRenderedIds[convId][child.key] = true;
      });
      msgs.sort((a,b) => a.timestamp - b.timestamp);
      msgs.forEach(m => renderDMMessage(m, convId, false));
      setTimeout(() => { $("dmChatbox").scrollTop = $("dmChatbox").scrollHeight; }, 50);

      // Live listener: child_added fires for ALL existing + new children,
      // so we use the rendered ID set to skip already-shown messages
      const liveQuery = msgRef.orderByChild("timestamp");
      const fn = child => {
        const id = child.key;
        if (dmRenderedIds[convId] && dmRenderedIds[convId][id]) return; // already rendered
        if (!dmRenderedIds[convId]) return;
        dmRenderedIds[convId][id] = true;
        const msgData = { id, ...child.val() };
        renderDMMessage(msgData, convId, true);
        db.ref("dmConversations/"+convId+"/members/"+myUid+"/lastRead").set(Date.now());
        // Fire DM notification toast if message is from someone else
        if (msgData.userId && msgData.userId !== myUid) {
          triggerDMNotification(convId, msgData.userId, msgData.name, msgData.color, msgData.avatarUrl, msgData.type==="image"?"📷 Image":(msgData.message||"").substring(0,60));
        }
      };
      liveQuery.on("child_added", fn);
      dmListeners[convId] = { ref: liveQuery, fn };
    });
  });
}

function renderDMMessage(data, convId, isNew) {
  const chatbox = $("dmChatbox");

  // Don't render messages from blocked users (in group chats)
  if (data.userId && data.userId !== myUid && isBlocked(data.userId)) return;

  // System messages (join/leave/remove notices)
  if (data.system || data.userId === "system") {
    const wrapper = document.createElement("div");
    wrapper.className = "dm-msg-wrapper system";
    const bubble = document.createElement("div");
    bubble.className = "dm-bubble";
    bubble.style.cssText = "background:transparent;border:none;font-size:11px;color:var(--text-dim);font-style:italic;text-align:center;padding:3px 12px;";
    bubble.textContent = data.message || "";
    wrapper.appendChild(bubble);
    chatbox.appendChild(wrapper);
    if (isNew) chatbox.scrollTop = chatbox.scrollHeight;
    return;
  }

  const isMine = data.userId === myUid;
  const wrapper = document.createElement("div");
  wrapper.className = "dm-msg-wrapper " + (isMine ? "mine" : "other");

  const avEl = buildAvatar(data.avatarUrl||null, data.name||"?", data.color||"#4da6ff", 30);
  avEl.style.cssText = "width:30px;height:30px;border-radius:50%;flex-shrink:0;cursor:pointer;overflow:hidden;";
  avEl.addEventListener("click", () => { if (data.userId) openProfile(data.userId); });

  const bubble = document.createElement("div"); bubble.className = "dm-bubble " + (isMine ? "mine" : "other");

  if (!isMine) {
    const nameEl = document.createElement("div"); nameEl.className = "dm-msg-name";
    nameEl.textContent = data.name || "Unknown"; nameEl.style.color = data.color || "var(--accent)";
    bubble.appendChild(nameEl);
  }

  const textEl = document.createElement("div"); textEl.className = "dm-msg-text";
  if (data.type === "image" && data.imageUrl) {
    const img = document.createElement("img");
    img.src = data.imageUrl;
    img.style.cssText = "max-width:260px;max-height:260px;border-radius:8px;cursor:zoom-in;display:block;margin-top:4px;";
    img.addEventListener("click", () => openLightbox(data.imageUrl));
    img.addEventListener("load", () => { if (isNew) chatbox.scrollTop = chatbox.scrollHeight; });
    textEl.appendChild(img);
  } else {
    textEl.innerHTML = parseMessage(data.message || "");
  }
  bubble.appendChild(textEl);

  const footer = document.createElement("div"); footer.className = "dm-msg-footer";
  footer.textContent = data.time || "";

  if (!isMine) {
    const reportBtn = document.createElement("button"); reportBtn.className = "dm-report-btn";
    reportBtn.textContent = "🚩";
    reportBtn.title = "Report message";
    reportBtn.addEventListener("click", async e => {
      e.stopPropagation();
      const reason = prompt("Why are you reporting this message?");
      if (!reason || !reason.trim()) return;
      await db.ref("reports").push({
        reportedBy: myUsername, reportedByUid: myUid,
        messageId: data.id, channel: "DM:"+convId,
        messageAuthor: data.name, messageAuthorUid: data.userId,
        message: data.message || "[media]",
        reason: reason.trim(),
        at: Date.now(), timestamp: Date.now()
      });
      showToast("🚩 Message reported to moderators.", "ok");
    });
    footer.appendChild(reportBtn);
  }

  bubble.appendChild(footer);
  wrapper.appendChild(avEl);
  wrapper.appendChild(bubble);
  chatbox.appendChild(wrapper);

  if (isNew) chatbox.scrollTop = chatbox.scrollHeight;
}

async function sendDMMessage() {
  if (!currentDMConvId) return;
  const input = $("dmInput");
  const raw = input.value.trim();
  if (!raw) return;
  if (raw.length > 500) return showToast("Message too long!","warn");

  if (filterBadWords(raw)) {
    showToast("⚠️ Message contains disallowed words.", "warn");
    applySlurTimeout(raw);
    return;
  }

  const convSnap = await db.ref("dmConversations/"+currentDMConvId).once("value");
  if (!convSnap.exists()) return;
  const conv = convSnap.val();
  // Strict membership check: user must still be a member (not removed/left)
  if (!conv.members || conv.members[myUid] === undefined || conv.members[myUid] === null) {
    return showToast("You are no longer in this conversation.","err");
  }

  // Only require friendship for 1-on-1 DMs, not group chats
  if (conv.type === "dm") {
    const otherUid = Object.keys(conv.members).find(uid => uid !== myUid);
    if (!myFriends[otherUid]) return showToast("You must be friends to send DMs.","warn");
    if (isBlocked(otherUid)) return showToast("You have blocked this user.","warn");
  }

  input.value = ""; input.style.height = "auto";
  const now = Date.now();
  const msgData = {
    name: myUsername, message: raw,
    time: new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
    timestamp: now, color: myColor, userId: myUid, avatarUrl: myAvatar||null
  };
  await db.ref("dmMessages/"+currentDMConvId).push(msgData);
  await db.ref("dmConversations/"+currentDMConvId).update({
    lastMessage: raw.substring(0, 60),
    lastMessageAt: now
  });
  await db.ref("dmConversations/"+currentDMConvId+"/members/"+myUid+"/lastRead").set(now);
}

function openNewGroupModal() {
  $("newGroupModal").style.display = "flex";
  const list = $("groupMemberList");
  list.innerHTML = "";
  // Only show friends
  const users = Object.entries(allUsersCache).filter(([uid]) => uid !== myUid && !!myFriends[uid]);
  if (!users.length) {
    list.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:8px;">You have no friends to add yet!</div>';
    return;
  }
  users.sort(([,a],[,b]) => (a.username||"").localeCompare(b.username||""));
  users.forEach(([uid, u]) => {
    const isFriend = !!myFriends[uid];
    const row = document.createElement("label");
    row.style.cssText = "display:flex;align-items:center;gap:10px;padding:8px 4px;cursor:pointer;border-radius:8px;";
    row.onmouseenter = () => row.style.background = "var(--bg-lighter)";
    row.onmouseleave = () => row.style.background = "";
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.value = uid;
    cb.style.cssText = "width:16px;height:16px;accent-color:var(--accent);flex-shrink:0;";
    const av = buildAvatar(u.avatarUrl||null, u.username||"?", u.color||"#4da6ff", 28);
    const nameEl = document.createElement("span");
    nameEl.textContent = (u.username||"Unknown") + (isFriend ? " 🤝" : "");
    nameEl.style.color = u.color||"var(--text-primary)"; nameEl.style.fontWeight = "700"; nameEl.style.fontSize = "13px";
    row.appendChild(cb); row.appendChild(av); row.appendChild(nameEl);
    list.appendChild(row);
  });
}

async function createGroupChat() {
  const checked = [...$("groupMemberList").querySelectorAll("input[type=checkbox]:checked")];
  if (!checked.length) return showToast("Select at least one friend.","warn");
  const memberUids = checked.map(cb => cb.value);
  // Only allow friends
  const nonFriends = memberUids.filter(uid => !myFriends[uid]);
  if (nonFriends.length) return showToast("You can only add friends to a group chat.","warn");
  if (memberUids.length + 1 > 13) return showToast("Max 13 members in a group.","warn");

  const groupName = $("groupNameInput").value.trim() || "Group Chat";
  const members = { [myUid]: { username: myUsername, color: myColor, avatarUrl: myAvatar||null, lastRead: 0 } };

  // Add all selected members regardless of whether they know each other
  for (const uid of memberUids) {
    const u = allUsersCache[uid] || {};
    members[uid] = { username: u.username||"User", color: u.color||"#4da6ff", avatarUrl: u.avatarUrl||null, lastRead: 0 };
  }

  const convRef = db.ref("dmConversations").push();
  await convRef.set({
    type: "group",
    groupName,
    members,
    createdAt: Date.now(),
    lastMessageAt: Date.now(), // set now so it shows at top and triggers live listeners
    createdBy: myUid
  });

  $("newGroupModal").style.display = "none";
  $("groupNameInput").value = "";
  showToast("✅ Group chat created!","ok");
  renderDMConvList();
  openDMConversation(convRef.key);
}

// ============================================================
// GROUP CHAT SETTINGS
// ============================================================
async function openGCSettings() {
  if (!currentDMConvId) return;
  const snap = await db.ref("dmConversations/"+currentDMConvId).once("value");
  if (!snap.exists()) return;
  const conv = snap.val();
  if (conv.type !== "group") return;

  // Populate current name
  $("gcRenameInput").value = conv.groupName || "";

  // Avatar preview
  const prevEl = $("gcAvatarPreview");
  prevEl.innerHTML = "";
  if (conv.groupAvatarUrl) {
    const img = document.createElement("img");
    img.src = conv.groupAvatarUrl;
    img.style.cssText = "width:100%;height:100%;object-fit:cover;";
    prevEl.appendChild(img);
  } else {
    prevEl.textContent = "👥";
  }

  // Add members: show only friends not already in the group
  const gcAddList = $("gcAddMemberList");
  gcAddList.innerHTML = "";
  const currentMemberUids = Object.keys(conv.members || {});
  const usersToAdd = Object.entries(allUsersCache)
    .filter(([uid]) => uid !== myUid && !currentMemberUids.includes(uid) && !!myFriends[uid])
    .sort(([,a],[,b]) => (a.username||"").localeCompare(b.username||""));
  if (!usersToAdd.length) {
    gcAddList.innerHTML = '<div style="font-size:11px;color:var(--text-dim);padding:8px;">No friends to add.</div>';
  } else {
    usersToAdd.forEach(([uid, u]) => {
      const isFriend = !!myFriends[uid];
      const row = document.createElement("label");
      row.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 4px;cursor:pointer;border-radius:6px;";
      row.onmouseenter = () => row.style.background = "var(--bg-lighter)";
      row.onmouseleave = () => row.style.background = "";
      const cb = document.createElement("input"); cb.type = "checkbox"; cb.value = uid;
      cb.style.cssText = "width:15px;height:15px;accent-color:var(--accent);flex-shrink:0;";
      const av = buildAvatar(u.avatarUrl||null, u.username||"?", u.color||"#4da6ff", 24);
      const nameEl = document.createElement("span");
      nameEl.textContent = (u.username||"Unknown") + (isFriend ? " 🤝" : "");
      nameEl.style.cssText = "font-size:12px;font-weight:700;color:"+(u.color||"var(--text-primary)")+";";
      row.appendChild(cb); row.appendChild(av); row.appendChild(nameEl);
      gcAddList.appendChild(row);
    });
  }

  // Members list
  const membersList = $("gcMembersList");
  membersList.innerHTML = "";
  const isCreator = conv.createdBy === myUid;
  for (const [uid, member] of Object.entries(conv.members || {})) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;padding:7px 6px;border-radius:6px;";
    const av = buildAvatar(member.avatarUrl||null, member.username||"?", member.color||"#4da6ff", 28);
    const nameEl = document.createElement("span");
    nameEl.textContent = member.username || "Unknown";
    nameEl.style.cssText = "flex:1;font-size:13px;font-weight:700;color:"+(member.color||"var(--text-primary)")+";";
    row.appendChild(av); row.appendChild(nameEl);

    if (uid === conv.createdBy) {
      const badge = document.createElement("span");
      badge.textContent = "Owner";
      badge.style.cssText = "font-size:9px;font-weight:800;color:var(--accent);background:var(--accent-light);padding:2px 6px;border-radius:4px;";
      row.appendChild(badge);
    } else if (isCreator && uid !== myUid) {
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Remove";
      removeBtn.style.cssText = "background:rgba(255,77,77,.12);border:1px solid rgba(255,77,77,.3);border-radius:6px;padding:3px 8px;font-size:10px;font-weight:700;color:#ff4d4d;cursor:pointer;font-family:var(--font);transition:all .15s;";
      removeBtn.addEventListener("click", async () => {
        const ok = await showConfirm("🚪","Remove "+member.username+"?","They will be removed from this group chat.");
        if (!ok) return;
        await db.ref("dmConversations/"+currentDMConvId+"/members/"+uid).remove();
        await db.ref("dmMessages/"+currentDMConvId).push({
          name: "System", message: member.username+" was removed from the group.",
          time: new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
          timestamp: Date.now(), color: "var(--text-dim)", userId: "system", system: true
        });
        showToast(member.username+" removed.","ok");
        openGCSettings(); // refresh
      });
      row.appendChild(removeBtn);
    }
    membersList.appendChild(row);
  }

  $("gcSettingsModal").style.display = "flex";
}

async function renameGC() {
  if (!currentDMConvId) return;
  const name = $("gcRenameInput").value.trim();
  if (!name) return showToast("Enter a group name.","warn");
  await db.ref("dmConversations/"+currentDMConvId).update({ groupName: name });
  // Update header immediately
  $("dmChatTitle").textContent = name;
  renderDMConvList();
  showToast("✅ Group renamed!","ok");
}

async function uploadGCPhoto() {
  const file = $("gcPhotoInput").files[0];
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) return showToast("Image too large (max 4MB).","warn");

  showToast("Uploading photo...","ok");
  const formData = new FormData();
  formData.append("image", file);
  try {
    const res = await fetch("https://api.imgbb.com/1/upload?key="+IMGBB_KEY, { method:"POST", body: formData });
    const data = await res.json();
    if (!data.success) throw new Error("Upload failed");
    const url = data.data.url;
    await db.ref("dmConversations/"+currentDMConvId).update({ groupAvatarUrl: url });
    // Update preview
    const prevEl = $("gcAvatarPreview");
    prevEl.innerHTML = "";
    const img = document.createElement("img");
    img.src = url; img.style.cssText = "width:100%;height:100%;object-fit:cover;";
    prevEl.appendChild(img);
    renderDMConvList();
    showToast("✅ Group photo updated!","ok");
  } catch(e) {
    showToast("Failed to upload photo.","err");
  }
}

async function addGCMembers() {
  if (!currentDMConvId) return;
  const checked = [...$("gcAddMemberList").querySelectorAll("input[type=checkbox]:checked")];
  if (!checked.length) return showToast("Select at least one friend to add.","warn");

  const snap = await db.ref("dmConversations/"+currentDMConvId+"/members").once("value");
  const currentCount = snap.numChildren ? snap.numChildren() : Object.keys(snap.val()||{}).length;
  if (currentCount + checked.length > 13) return showToast("Max 13 members in a group.","warn");

  const updates = {};
  const addedNames = [];
  for (const cb of checked) {
    const uid = cb.value;
    const u = allUsersCache[uid] || {};
    updates["dmConversations/"+currentDMConvId+"/members/"+uid] = {
      username: u.username||"User", color: u.color||"#4da6ff", avatarUrl: u.avatarUrl||null, lastRead: 0
    };
    addedNames.push(u.username||"User");
  }
  await db.ref().update(updates);

  // System message
  await db.ref("dmMessages/"+currentDMConvId).push({
    name: "System", message: addedNames.join(", ") + " joined the group.",
    time: new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
    timestamp: Date.now(), color: "var(--text-dim)", userId: "system", system: true
  });
  await db.ref("dmConversations/"+currentDMConvId).update({ lastMessageAt: Date.now() });

  showToast("✅ Members added!","ok");
  renderDMConvList();
  openGCSettings(); // refresh
}

async function leaveGC() {
  if (!currentDMConvId) return;
  const ok = await showConfirm("🚪","Leave Group?","You will no longer receive messages from this group.");
  if (!ok) return;

  const leavingConvId = currentDMConvId;

  // Immediately lock UI so the user can't interact while we process
  currentDMConvId = null;
  $("gcSettingsModal").style.display = "none";
  $("dmChatbox").innerHTML = "";
  $("dmChatTitle").textContent = "Select a conversation";
  $("dmChatMembers").textContent = "";
  $("dmInputRow").style.display = "none";
  $("gcSettingsBtn").style.display = "none";

  // Tear down listener immediately so no more messages render
  if (dmListeners[leavingConvId]) {
    try { dmListeners[leavingConvId].ref.off("child_added", dmListeners[leavingConvId].fn); } catch(e){}
    delete dmListeners[leavingConvId];
  }
  if (dmRenderedIds[leavingConvId]) delete dmRenderedIds[leavingConvId];

  // Clear from localStorage so reopening DM overlay doesn't restore this group
  const storedLast = localStorage.getItem("snc_last_dm_conv");
  if (storedLast === leavingConvId) localStorage.removeItem("snc_last_dm_conv");

  const snap = await db.ref("dmConversations/"+leavingConvId).once("value");
  if (!snap.exists()) {
    showToast("You left the group.", "ok");
    renderDMConvList();
    return;
  }
  const conv = snap.val();

  const memberUids = Object.keys(conv.members || {});
  const remaining = memberUids.filter(uid => uid !== myUid);

  if (!remaining.length) {
    await db.ref("dmConversations/"+leavingConvId).remove();
    await db.ref("dmMessages/"+leavingConvId).remove();
  } else {
    await db.ref("dmConversations/"+leavingConvId+"/members/"+myUid).remove();
    if (conv.createdBy === myUid) {
      await db.ref("dmConversations/"+leavingConvId+"/createdBy").set(remaining[0]);
    }
    await db.ref("dmMessages/"+leavingConvId).push({
      name: "System", message: myUsername+" left the group.",
      time: new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
      timestamp: Date.now(), color: "var(--text-dim)", userId: "system", system: true
    });
    await db.ref("dmConversations/"+leavingConvId).update({ lastMessageAt: Date.now() });
  }

  showToast("You left the group.", "ok");
  renderDMConvList();
}

function cleanupAfterLeaveGC(convId) {
  if (dmListeners[convId]) {
    try { dmListeners[convId].ref.off("child_added", dmListeners[convId].fn); } catch(e){}
    delete dmListeners[convId];
  }
  if (dmRenderedIds[convId]) delete dmRenderedIds[convId];
  const storedLast = localStorage.getItem("snc_last_dm_conv");
  if (storedLast === convId) localStorage.removeItem("snc_last_dm_conv");
  if (currentDMConvId === convId) currentDMConvId = null;
  $("gcSettingsModal").style.display = "none";
  $("dmChatbox").innerHTML = "";
  $("dmChatTitle").textContent = "Select a conversation";
  $("dmChatMembers").textContent = "";
  $("dmInputRow").style.display = "none";
  $("gcSettingsBtn").style.display = "none";
  showToast("You left the group.", "ok");
  renderDMConvList();
}

// ============================================================
// ============================================================
// ============================================================

// ============================================================
// NOTIFICATION SYSTEM
// ============================================================
let notifListener = null;
let dmToastTimer = null;
let dmToastQueue = [];
let dmToastShowing = false;

function setupNotificationSystem() {
  // Toggle panel on bell button
  $("notifBtn").addEventListener("click", () => {
    const panel = $("notifPanel");
    const isOpen = panel.style.display === "flex";
    panel.style.display = isOpen ? "none" : "flex";
    if (!isOpen) {
      // Mark all as read
      db.ref("notifications/"+myUid).once("value", snap => {
        const updates = {};
        snap.forEach(child => { updates[child.key+"/read"] = true; });
        if (Object.keys(updates).length) db.ref("notifications/"+myUid).update(updates);
      });
      $("notifBadge").style.display = "none";
      renderNotifPanel();
    }
  });

  $("notifPanelClose").addEventListener("click", () => { $("notifPanel").style.display = "none"; });
  $("clearNotifsBtn").addEventListener("click", async () => {
    await db.ref("notifications/"+myUid).remove();
    renderNotifPanel();
  });

  // DM toast close
  $("dmToastClose").addEventListener("click", e => {
    e.stopPropagation();
    $("dmToast").style.display = "none";
    dmToastShowing = false;
    clearTimeout(dmToastTimer);
    showNextDMToast();
  });
  $("dmToast").addEventListener("click", () => {
    const convId = $("dmToast").dataset.convId;
    $("dmToast").style.display = "none";
    dmToastShowing = false;
    if (convId) {
      $("dmOverlay").style.display = "flex";
      renderDMConvList();
      openDMConversation(convId);
    }
  });

  // Listen for new notifications for this user
  if (notifListener) db.ref("notifications/"+myUid).off("child_added", notifListener);
  notifListener = db.ref("notifications/"+myUid).orderByChild("timestamp").on("child_added", snap => {
    const n = snap.val();
    if (!n) return;
    // Only show toast for new ones (within last 10s)
    if (Date.now() - (n.timestamp||0) < 10000 && !n.read) {
      if (n.type === "dm") {
        queueDMToast(n);
      } else if (n.type === "broadcast") {
        showBroadcastToast(n);
      } else if (n.type === "mention") {
        showMentionToast(n);
      }
      $("notifBadge").style.display = "";
    }
  });

  // Listen for DM messages to generate toasts (if overlay closed)
  db.ref("dmConversations").on("value", snap => {
    if (!snap.exists()) return;
    snap.forEach(convSnap => {
      const conv = convSnap.val();
      if (!conv || !conv.members || !conv.members[myUid]) return;
      // re-listen handled by openDMConversation child_added
    });
  });
}

function queueDMToast(n) {
  if ($("dmOverlay").style.display === "flex") return; // overlay open, skip toast
  dmToastQueue.push(n);
  if (!dmToastShowing) showNextDMToast();
}

function showNextDMToast() {
  if (!dmToastQueue.length) return;
  const n = dmToastQueue.shift();
  dmToastShowing = true;

  const toast = $("dmToast");
  toast.dataset.convId = n.convId || "";
  $("dmToastName").textContent = n.senderName || "Someone";
  $("dmToastMsg").textContent = n.message || "sent you a message";

  const avatarEl = $("dmToastAvatar");
  avatarEl.innerHTML = "";
  const av = buildAvatar(n.senderAvatar||null, n.senderName||"?", n.senderColor||"#4da6ff", 36);
  avatarEl.appendChild(av);

  toast.style.display = "block";
  clearTimeout(dmToastTimer);
  dmToastTimer = setTimeout(() => {
    toast.style.display = "none";
    dmToastShowing = false;
    showNextDMToast();
  }, 5000);
}

function showBroadcastToast(n) {
  let t = document.querySelector(".broadcast-toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "broadcast-toast";
    t.style.cssText = "position:fixed;top:130px;right:20px;background:var(--bg-lighter);border:1px solid var(--accent);border-radius:12px;padding:12px 16px;z-index:9998;max-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.5);animation:slideInRight .3s ease;";
    document.body.appendChild(t);
  }
  t.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:10px;">
      <span style="font-size:20px;flex-shrink:0;">📢</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:800;color:var(--accent);">${esc(n.title||"Announcement")}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(n.body||"")}</div>
      </div>
      <button onclick="this.closest('.broadcast-toast').remove()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;flex-shrink:0;">✕</button>
    </div>`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.remove(), 7000);
}

function showMentionToast(n) {
  let t = document.querySelector(".mention-toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "mention-toast";
    t.style.cssText = "position:fixed;top:190px;right:20px;background:var(--bg-lighter);border:1px solid rgba(255,215,0,0.5);border-radius:12px;padding:12px 16px;z-index:9998;max-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.5);animation:slideInRight .3s ease;cursor:pointer;";
    document.body.appendChild(t);
  }
  t.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:10px;">
      <span style="font-size:20px;flex-shrink:0;">🔔</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:800;color:#ffd700;">${esc(n.title||"Mention")}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(n.body||"")}</div>
      </div>
      <button onclick="this.closest('.mention-toast').remove()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;flex-shrink:0;">✕</button>
    </div>`;
  if (n.channel) {
    t.addEventListener("click", () => { switchChannel(n.channel); t.remove(); });
  }
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.remove(), 5000);
}

async function renderNotifPanel() {
  const list = $("notifList");
  list.innerHTML = '<div style="padding:12px;font-size:12px;color:var(--text-dim);">Loading...</div>';
  const snap = await db.ref("notifications/"+myUid).orderByChild("timestamp").limitToLast(50).once("value");
  list.innerHTML = "";
  if (!snap.exists()) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:13px;">No notifications yet.</div>';
    return;
  }
  const items = [];
  snap.forEach(child => items.push({ id: child.key, ...child.val() }));
  items.sort((a,b) => (b.timestamp||0) - (a.timestamp||0));
  items.forEach(n => {
    const row = document.createElement("div");
    row.style.cssText = `padding:10px 12px;border-radius:8px;margin-bottom:4px;cursor:pointer;background:${n.read?"transparent":"var(--accent-light)"};border:1px solid ${n.read?"transparent":"var(--border-hover)"};transition:background .15s;`;
    row.onmouseenter = () => row.style.background = "var(--bg-lighter)";
    row.onmouseleave = () => row.style.background = n.read ? "transparent" : "var(--accent-light)";
    const icon = n.type === "dm" ? "💬" : n.type === "broadcast" ? "📢" : "🔔";
    const time = n.timestamp ? new Date(n.timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) : "";
    row.innerHTML = `<div style="display:flex;align-items:flex-start;gap:8px;">
      <span style="font-size:18px;flex-shrink:0;">${icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);">${esc(n.title||"Notification")}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${esc(n.body||"")}</div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">${time}</div>
      </div>
    </div>`;
    if (n.type === "dm" && n.convId) {
      row.addEventListener("click", () => {
        $("notifPanel").style.display = "none";
        $("dmOverlay").style.display = "flex";
        renderDMConvList();
        openDMConversation(n.convId);
      });
    }
    list.appendChild(row);
  });
}

// Called when DM message arrives for a user (triggered from renderDMMessage listener)
function triggerDMNotification(convId, senderUid, senderName, senderColor, senderAvatar, messageText) {
  if (senderUid === myUid) return;
  if (isBlocked(senderUid)) return; // don't notify from blocked users
  if ($("dmOverlay").style.display === "flex" && currentDMConvId === convId) return;
  const n = {
    type: "dm", convId, senderName, senderColor: senderColor||"#4da6ff",
    senderAvatar: senderAvatar||null, message: messageText,
    title: senderName + " messaged you",
    body: messageText, timestamp: Date.now(), read: false
  };
  db.ref("notifications/"+myUid).push(n);
  $("notifBadge").style.display = "";
  queueDMToast(n);
}

// ============================================================
// BROADCAST CHANNEL (owner only — send custom notifications)
// ============================================================
function renderBroadcastChannel() {
  if (!amOwner()) {
    $("chatbox").innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-dim);">🔒 Owner only.</div>';
    return;
  }
  const chatbox = $("chatbox");
  chatbox.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.style.cssText = "padding:24px;max-width:520px;margin:0 auto;";
  wrap.innerHTML = `
    <h2 style="font-size:18px;font-weight:800;color:var(--text-primary);margin-bottom:6px;">📢 Send Custom Notification</h2>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">This will send a notification to ALL users that appears in their notification panel.</p>
    <div style="margin-bottom:12px;">
      <div style="font-size:11px;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">Title</div>
      <input id="broadcastTitle" class="settings-input" placeholder="Notification title..." maxlength="80" style="width:100%;">
    </div>
    <div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:800;color:var(--text-dim);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">Message</div>
      <textarea id="broadcastBody" class="settings-textarea" placeholder="Write your message..." maxlength="300" style="width:100%;height:80px;"></textarea>
    </div>
    <button id="broadcastSendBtn" class="confirm-btn ok" style="width:100%;padding:12px;">📢 Send to All Users</button>
    <div id="broadcastMsg" style="margin-top:10px;font-size:12px;"></div>
  `;
  chatbox.appendChild(wrap);

  $("broadcastSendBtn").addEventListener("click", async () => {
    const title = $("broadcastTitle").value.trim();
    const body = $("broadcastBody").value.trim();
    if (!title) return;
    const msg = $("broadcastMsg");
    msg.style.color = "var(--text-muted)"; msg.textContent = "Sending...";

    // Get all user UIDs and push notification to each individually
    const usersSnap = await db.ref("users").once("value");
    const notifPayload = {
      type: "broadcast", title, body,
      timestamp: Date.now(), read: false,
      sentBy: myUsername
    };
    const pushPromises = [];
    usersSnap.forEach(child => {
      pushPromises.push(db.ref("notifications/"+child.key).push(notifPayload));
    });
    await Promise.all(pushPromises);
    msg.style.color = "var(--accent)"; msg.textContent = "✅ Notification sent to all users!";
    $("broadcastTitle").value = ""; $("broadcastBody").value = "";
  });
}

// ============================================================
// PUBLIC MOD ACTIONS CHANNEL (visible to all, auto-populated)
// ============================================================
async function renderModActionsChannel() {
  const chatbox = $("chatbox");
  chatbox.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:12px;">Loading...</div>';

  const snap = await db.ref("publicModLogs").orderByChild("timestamp").limitToLast(100).once("value");
  chatbox.innerHTML = "";

  const title = document.createElement("div");
  title.style.cssText = "padding:20px 16px 4px;font-size:18px;font-weight:800;color:var(--text-primary);";
  title.textContent = "🔨 Mod Actions";
  chatbox.appendChild(title);
  const sub = document.createElement("div");
  sub.style.cssText = "padding:0 16px 16px;font-size:12px;color:var(--text-muted);";
  sub.textContent = "Public record of bans, mutes, and timeouts.";
  chatbox.appendChild(sub);

  if (!snap.exists()) {
    chatbox.innerHTML += '<div style="padding:20px;color:var(--text-dim);text-align:center;font-size:13px;">No mod actions yet.</div>';
    return;
  }

  const entries = [];
  snap.forEach(child => entries.push({ id: child.key, ...child.val() }));
  entries.sort((a,b) => b.timestamp - a.timestamp);

  const typeIcon = { ban:"🔨", unban:"✅", mute:"🔇", unmute:"🔊", timeout:"⏱️", warn:"⚠️" };
  const typeColor = { ban:"#ff4d4d", unban:"#57f287", mute:"#fbbf24", unmute:"#67e8f9", timeout:"#fb923c", warn:"#facc15" };

  entries.forEach(log => {
    const card = document.createElement("div");
    card.style.cssText = "display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);";
    const ic = typeIcon[log.type] || "🛡️";
    const col = typeColor[log.type] || "#aaa";
    const time = new Date(log.timestamp).toLocaleString();
    card.innerHTML = `
      <div style="font-size:24px;flex-shrink:0;line-height:1;">${ic}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:800;color:${col};">${esc(log.action||log.type)}</div>
        <div style="font-size:13px;color:var(--text-primary);margin-top:2px;">
          <strong style="color:var(--accent);">${esc(log.targetUsername||"Unknown")}</strong>
          ${log.reason ? '<span style="color:var(--text-muted);"> — ' + esc(log.reason) + '</span>' : ''}
        </div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:3px;">by ${esc(log.by||"System")} · ${time}</div>
      </div>`;
    chatbox.appendChild(card);
  });
}

// Call this whenever a ban/mute/timeout is issued to log it publicly
async function logPublicModAction(type, action, targetUid, targetUsername, reason, by) {
  await db.ref("publicModLogs").push({
    type, action, targetUid, targetUsername,
    reason: reason || "", by: by || myUsername,
    timestamp: Date.now()
  });
}

function openInBlank() {
  const w = window.open("about:blank", "_blank");
  if (!w) return showToast("Popup blocked — allow popups for this site.", "warn");
  const html = document.documentElement.outerHTML;
  w.document.open();
  w.document.write(html);
  w.document.close();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      w.localStorage.setItem(k, localStorage.getItem(k));
    }
  } catch(e) {}
}

// ============================================================
// MOBILE SIDEBAR
// ============================================================
function openMobileSidebar() {
  const overlay = $("sidebarOverlay");
  if (sidebar) sidebar.classList.add("mobile-open");
  if (overlay) overlay.style.display = "block";
}
function closeMobileSidebar() {
  const sidebar = $("sidebar");
  const overlay = $("sidebarOverlay");
  if (sidebar) sidebar.classList.remove("mobile-open");
  if (overlay) overlay.style.display = "none";
}
// Close mobile sidebar when a channel is selected
document.addEventListener("click", e => {
  if (e.target.closest(".channel-btn") && window.innerWidth <= 768) {
    closeMobileSidebar();
  }
});

// ============================================================
// CONFIRM DIALOG
// ============================================================
function showConfirm(icon, title, msg) {
  return new Promise(resolve => {
    const d=$("confirmDialog");
    $("confirmIcon").textContent=icon; $("confirmTitle").textContent=title; $("confirmMsg").textContent=msg;
    d.style.display="flex";
    const ok=$("confirmOk"), can=$("confirmCancel");
    const newOk=ok.cloneNode(true), newCan=can.cloneNode(true);
    ok.parentNode.replaceChild(newOk,ok); can.parentNode.replaceChild(newCan,can);
    const done=r=>{ d.style.display="none"; resolve(r); };
    newOk.addEventListener("click",()=>done(true));
    newCan.addEventListener("click",()=>done(false));
  });
}
