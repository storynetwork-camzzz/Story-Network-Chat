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
const BUILTIN_CHANNELS = ["general", "offtopic", "announcements", "modchat", "leaderboard"];
function getAllChannels() {
  return [...BUILTIN_CHANNELS, ...Object.keys(customChannels)];
}
const IMAGE_URL_RE = /(https?:\/\/[^\s<]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s<]*)?)/gi;
const ANY_URL_RE   = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]{}])/g;

// ============================================================
// STATE
// ============================================================
let currentUser    = null;
let myUid          = null;
let myUsername     = "";
let myColor        = "#4da6ff";
let myAvatar       = null;
let myStatus       = "";
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
let displayedMsgs  = {};
let msgListeners   = {};
let appStarted     = false;
let muteExpireTimer = null;
let leaderboardTimer = null;
let searchActive   = false;
let customRoles    = {};
let customChannels = {};

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
// BAD WORD FILTER
// ============================================================
const BAD_WORDS = [
  "nigger","nigga","niga","niger","faggot","faggit","faget","chink","coon","gook",
  "kike","spic","wetback","fag","dyke","tranny","retard","retarded","spastic",
  "cracker","beaner","raghead","towelhead","zipperhead","slant","hymie","jigaboo",
  "porch monkey","Uncle Tom","whitey","peckerwood","redneck","hillbilly",
  "porn","xxx","hardcore","incest","bestiality","pedophile","pedo","lolita"
];
function normalizeText(t) {
  return t.toLowerCase()
    .replace(/[=\s\-_.|*]+/g,"")
    .replace(/[1!|]/g,"i").replace(/3/g,"e").replace(/0/g,"o")
    .replace(/@/g,"a").replace(/5/g,"s").replace(/7/g,"t")
    .replace(/\$/g,"s").replace(/\+/g,"t").replace(/ph/g,"f");
}
function filterBadWords(msg) {
  const norm = normalizeText(msg);
  return BAD_WORDS.some(w => norm.includes(normalizeText(w)));
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
// SIGN IN
// ============================================================
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
      createdAt: Date.now(), messageCount: 0, rep: 0, status: ""
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

  // Check ban first
  const banSnap = await db.ref("config/banned/"+user.uid).once("value");
  if (banSnap.exists()) {
    const banData = banSnap.val();
    $("authScreen").style.display = "none";
    $("loadingScreen").style.display = "none";
    $("appContainer").style.display = "none";
    $("banScreen").style.display = "flex";
    $("banReason").textContent = banData.reason || "No reason given.";
    $("banBy").textContent = banData.by || "a moderator";
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

  // Load config
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
    // If we're in modchat but lost mod, kick us out
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
      // Was unbanned while on ban screen — restore app
      if ($("banScreen").style.display === "flex") {
        $("banScreen").style.display = "none";
        $("appContainer").style.display = "flex";
      }
    }
  });

  // Check for pending warns notification
  checkPendingWarnNotification();

  $("authScreen").style.display = "none";
  startApp();
});

// ============================================================
// LOGOUT
// ============================================================
$("logoutBtn").addEventListener("click", () => {
  appStarted = false;
  cleanupPresence();
  setTyping(false);
  clearTimeout(muteExpireTimer);
  clearInterval(leaderboardTimer);
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
    updateSidebarUser();
  });
  db.ref("users").on("value", snap => { allUsersCache = snap.val() || {}; renderFriendsList(); });
db.ref("config/customRoles").on("value", snap => { customRoles = snap.val() || {}; });
db.ref("config/customChannels").on("value", snap => {
    customChannels = snap.val() || {};
    renderCustomChannelButtons();
  });
  db.ref("presence").on("value", snap => {
    const data = snap.val() || {};
    $("onlineCount").textContent = Object.keys(data).length;
    renderOnlineList(data);
    renderFriendsList();
  });
  // Friends listener
  db.ref("users/"+myUid+"/friends").on("value", snap => {
    myFriends = snap.val() || {};
    renderFriendsList();
  });
  // Friend requests listener
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
  const muteData = mutedUids[myUid];
  if (muteData && muteData.until > Date.now()) {
    // Currently muted
    const untilTime = new Date(muteData.until).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    $("muteUntilTime").textContent = untilTime;
    $("muteNotice").style.display = "flex";
    $("inputRow").style.display = "none";
    $("formatToolbar").style.display = "none";
    // Auto-unmute
    muteExpireTimer = setTimeout(() => {
      db.ref("config/muted/"+myUid).remove();
      $("muteNotice").style.display = "none";
      if (currentChannel !== "announcements" && currentChannel !== "leaderboard") {
        $("inputRow").style.display = "flex";
        $("formatToolbar").style.display = "flex";
      }
    }, muteData.until - Date.now());
  } else if (muteData && muteData.until <= Date.now()) {
    // Expired — clean up
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
  await db.ref("config/banned/"+targetUid).set({
    reason: reason || "No reason given.",
    by: myUsername,
    byUid: myUid,
    at: Date.now()
  });
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
  // Show the most recent unseen warn
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

  // Show/hide mod section
  const modSection = $("modSection");
  if (modSection) modSection.style.display = (amOwner() || amMod()) ? "" : "none";

  renderSidebarAvatar();
  updateAnnouncementsUI();
  checkMuteStatus();
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
    return json.success ? json.data.url : null;
  } catch(e) { return null; }
}

// ============================================================
// PRESENCE
// ============================================================
function setupPresence() {
  const ref = db.ref("presence/"+myUid);
  db.ref(".info/connected").on("value", snap => {
    if (!snap.val()) return;
    ref.onDisconnect().remove();
    ref.set({ username: myUsername, color: myColor, uid: myUid });
    // Track last seen date for leaderboard
    const now = new Date();
const today = now.getFullYear()+"_"+(now.getMonth()+1).toString().padStart(2,"0")+"_"+now.getDate().toString().padStart(2,"0");
db.ref("users/"+myUid+"/activeDays/"+today).set(true);
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

function renderFriendRequests(requests) {
  const list = $("friendRequestsList");
  const badge = $("friendRequestBadge");
  const entries = Object.entries(requests);
  list.innerHTML = "";
  if (!entries.length) { badge.style.display="none"; return; }
  badge.style.display = "inline-flex";
  badge.textContent = entries.length;
  entries.forEach(([fromUid, data]) => {
    const row = document.createElement("div"); row.className = "friend-request-row";
    const av = buildAvatar(data.avatarUrl||null, data.username, data.color||"#4da6ff", 22);
    const name = document.createElement("span"); name.className="online-name"; name.textContent=data.username; name.style.color=data.color||"#4da6ff";
    const acceptBtn = document.createElement("button"); acceptBtn.className="friend-accept-btn"; acceptBtn.textContent="✅";
    const declineBtn = document.createElement("button"); declineBtn.className="friend-decline-btn"; declineBtn.textContent="❌";
    acceptBtn.addEventListener("click", async () => {
      await db.ref("users/"+myUid+"/friends/"+fromUid).set({ addedAt: Date.now(), nickname: "" });
      await db.ref("users/"+fromUid+"/friends/"+myUid).set({ addedAt: Date.now(), nickname: "" });
      await db.ref("friendRequests/"+myUid+"/"+fromUid).remove();
      showToast("You are now friends with "+data.username+"!","ok");
    });
    declineBtn.addEventListener("click", async () => {
      await db.ref("friendRequests/"+myUid+"/"+fromUid).remove();
    });
    row.appendChild(av); row.appendChild(name); row.appendChild(acceptBtn); row.appendChild(declineBtn);
    list.appendChild(row);
  });
}

function renderFriendsList() {
  const list = $("friendsList");
  const entries = Object.entries(myFriends);
  if (!entries.length) {
    list.innerHTML = '<div class="no-friends-msg">No friends yet!</div>';
    return;
  }
  list.innerHTML = "";
  const presenceSnap = {};
  db.ref("presence").once("value", snap => {
    const online = snap.val() || {};
    entries.forEach(([friendUid, friendData]) => {
      const userData = allUsersCache[friendUid] || {};
      const isOnline = !!online[friendUid];
      const displayName = friendData.nickname || userData.username || "Unknown";
      const color = userData.color || "#4da6ff";
      const row = document.createElement("div"); row.className = "online-row friend-row";
      row.style.cursor = "pointer";
      const av = buildAvatar(userData.avatarUrl||null, displayName, color, 22);
      const nameEl = document.createElement("span"); nameEl.className="online-name";
      nameEl.textContent = displayName; nameEl.style.color = color;
      const dot = document.createElement("span");
      dot.className = isOnline ? "online-dot" : "offline-dot";
      const nicknameBtn = document.createElement("button"); nicknameBtn.className="nickname-btn"; nicknameBtn.title="Set nickname"; nicknameBtn.textContent="✏️";
      nicknameBtn.addEventListener("click", e => { e.stopPropagation(); openNicknameModal(friendUid, friendData.nickname||""); });
      const removeBtn = document.createElement("button"); removeBtn.className="nickname-btn"; removeBtn.title="Remove friend"; removeBtn.textContent="❌";
      removeBtn.style.marginLeft="2px";
      removeBtn.addEventListener("click", async e => {
        e.stopPropagation();
        const ok = await showConfirm("❌","Remove Friend","Remove "+displayName+" from your friends?");
        if (!ok) return;
        await db.ref("users/"+myUid+"/friends/"+friendUid).remove();
        await db.ref("users/"+friendUid+"/friends/"+myUid).remove();
        showToast("Removed "+displayName+" from friends","ok");
      });
      row.appendChild(av); row.appendChild(nameEl); row.appendChild(dot); row.appendChild(nicknameBtn); row.appendChild(removeBtn);
      row.addEventListener("click", () => openProfile(friendUid));
      list.appendChild(row);
    });
  });
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
async function openProfile(targetUid) {
  const modal = $("profileModal");
  const userData = allUsersCache[targetUid] || {};
  const color = userData.color || "#4da6ff";
  const username = userData.username || "Unknown";

  // Avatar
  const avWrap = $("profileAvatar");
  avWrap.innerHTML = "";
  avWrap.appendChild(buildAvatar(userData.avatarUrl||null, username, color, 64));

  // Name
  $("profileName").textContent = username;
  $("profileName").style.color = color;

  // Badges
  const badgesEl = $("profileBadges"); badgesEl.innerHTML = "";
  if (isOwner(targetUid)) { const b=document.createElement("span"); b.className="owner-badge"; b.textContent="[Owner]"; badgesEl.appendChild(b); }
  if (isMod(targetUid))   { const b=document.createElement("span"); b.className="mod-badge"; b.textContent="[Mod]"; badgesEl.appendChild(b); }
  if (isDev(targetUid))   { const b=document.createElement("span"); b.className="dev-badge"; b.textContent="[Dev]"; badgesEl.appendChild(b); }
if (userData.customRole && customRoles[userData.customRole]) {
    const cr = customRoles[userData.customRole];
    const b = document.createElement("span");
    b.textContent = "[" + cr.name + "]";
    b.style.cssText = `font-size:10px;font-weight:800;padding:2px 6px;border-radius:3px;background:${cr.color}22;color:${cr.color};border:1px solid ${cr.color}55;`;
    badgesEl.appendChild(b);
  }

  // Status
  $("profileStatus").textContent = userData.status ? "💬 "+userData.status : "";

  // Stats
  $("profileMsgCount").textContent = userData.messageCount || 0;
  $("profileRep").textContent = userData.rep || 0;

  // Friends count
  const friendsSnap = await db.ref("users/"+targetUid+"/friends").once("value");
  $("profileFriendCount").textContent = friendsSnap.numChildren ? friendsSnap.numChildren() : 0;

  // Join date
  const joined = userData.createdAt ? new Date(userData.createdAt).toLocaleDateString() : "Unknown";
  $("profileJoined").textContent = joined;

  // Actions
  const actionsEl = $("profileActions"); actionsEl.innerHTML = "";

  if (targetUid !== myUid) {
    // Rep button
    const repBtn = document.createElement("button"); repBtn.className="profile-action-btn rep-btn";
    repBtn.textContent = "⭐ Give Rep";
    repBtn.addEventListener("click", () => giveRep(targetUid, username));
    actionsEl.appendChild(repBtn);

    // Friend button
    if (!myFriends[targetUid]) {
      const friendBtn = document.createElement("button"); friendBtn.className="profile-action-btn friend-btn";
      friendBtn.textContent = "➕ Add Friend";
      friendBtn.addEventListener("click", () => { sendFriendRequest(targetUid); friendBtn.textContent="✅ Sent!"; friendBtn.disabled=true; });
      actionsEl.appendChild(friendBtn);
    } else {
      const friendedBtn = document.createElement("button"); friendedBtn.className="profile-action-btn friend-btn"; friendedBtn.disabled=true;
      friendedBtn.textContent = "✅ Friends";
      actionsEl.appendChild(friendedBtn);
    }

    // Mod actions
    if (canModerate() && !isOwner(targetUid)) {
      const warnBtn = document.createElement("button"); warnBtn.className="profile-action-btn warn-btn";
      warnBtn.textContent = "⚠️ Warn";
      warnBtn.addEventListener("click", async () => {
        await warnUser(targetUid, username);
        $("profileModal").style.display = "none";
        openProfile(targetUid);
      });
      actionsEl.appendChild(warnBtn);

      if (isMuted(targetUid)) {
        const unmuteBtn = document.createElement("button"); unmuteBtn.className="profile-action-btn mute-btn";
        unmuteBtn.textContent = "🔊 Unmute";
        unmuteBtn.addEventListener("click", async () => {
          await db.ref("config/muted/"+targetUid).remove();
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

// ============================================================
// REP SYSTEM
// ============================================================
async function giveRep(targetUid, targetUsername) {
  if (targetUid === myUid) return showToast("Can't rep yourself!","warn");
  const alreadySnap = await db.ref("users/"+targetUid+"/repGivenBy/"+myUid).once("value");
  if (alreadySnap.exists()) return showToast("Already repped "+targetUsername+"!","warn");
  await db.ref("users/"+targetUid+"/rep").transaction(cur => (cur||0)+1);
  await db.ref("users/"+targetUid+"/repGivenBy/"+myUid).set(true);
  showToast("⭐ Gave rep to "+targetUsername+"!","ok");
  $("profileRep").textContent = (parseInt($("profileRep").textContent)||0)+1;
}

// ============================================================
// TYPING
// ============================================================
function setTyping(active) {
  if (!myUid) return;
  if (currentChannel === "announcements" || currentChannel === "leaderboard") return;
  const ref = db.ref("typing/"+currentChannel+"/"+myUid);
  active ? ref.set({ username: myUsername, ts: Date.now() }) : ref.remove();
}

function setupTypingListener(channel) {
  db.ref("typing/"+channel).off("value");
  if (channel === "announcements" || channel === "leaderboard") { $("typingDisplay").textContent = ""; return; }
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
    if (searchActive) {
      $("searchInput").focus();
    } else {
      $("searchInput").value = "";
      clearSearchHighlights();
    }
  });

  $("searchClear").addEventListener("click", () => {
    $("searchInput").value = "";
    clearSearchHighlights();
    $("searchBar").style.display = "none";
    searchActive = false;
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
    btn.addEventListener("click", () => switchChannel(btn.dataset.channel));
  });
}

function renderCustomChannelButtons() {
  // Remove any previously rendered custom channel buttons
  document.querySelectorAll(".custom-ch-btn").forEach(b => b.remove());
  const $customSection = document.getElementById("customChannelsSection");
  if ($customSection) $customSection.remove();

  const entries = Object.entries(customChannels);
  if (!entries.length) return;

  // Check access per channel
  const canSeeChannel = (ch) => {
    if (!ch.private) return true;
    if (ch.requiredRole === "mod") return amOwner() || amMod();
    if (ch.requiredRole === "dev") return isDev(myUid) || amOwner();
    // custom role check
    const myUserData = allUsersCache[myUid] || {};
    return amOwner() || myUserData.customRole === ch.requiredRole;
  };

  const visible = entries.filter(([, ch]) => canSeeChannel(ch));
  if (!visible.length) return;

  const sidebar = document.querySelector(".sidebar-section:last-of-type");
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

    const icon = document.createElement("span");
    icon.className = "ch-hash";
    icon.textContent = ch.icon || "#";

    const name = document.createElement("span");
    name.className = "ch-name";
    name.textContent = ch.name;

    const pip = document.createElement("span");
    pip.className = "unread-pip";
    pip.id = "pip-" + id;
    pip.style.display = "none";

    btn.appendChild(icon);
    btn.appendChild(name);
    btn.appendChild(pip);
    btn.addEventListener("click", () => switchChannel(id));
    section.appendChild(btn);
  });

  // Insert before the sidebar user panel at the bottom
  const sidebarEl = document.getElementById("sidebar");
  const spacer = sidebarEl.querySelector(".sidebar-spacer");
  sidebarEl.insertBefore(section, spacer);
}

function switchChannel(ch) {
  if (msgListeners[currentChannel]) {
    try { msgListeners[currentChannel].ref.off("child_added", msgListeners[currentChannel].fn); } catch(e){}
    delete msgListeners[currentChannel];
  }
  setTyping(false); isTyping=false; clearTimeout(typingTimer);
  db.ref("typing/"+currentChannel).off("value");
  clearInterval(leaderboardTimer);
  clearSearchHighlights();
  if (searchActive) { $("searchInput").value = ""; }

  currentChannel = ch;
  $("chatbox").innerHTML = "";
  displayedMsgs[ch] = new Set();
  userScrolledUp = false;

  document.querySelectorAll(".channel-btn").forEach(b => b.classList.toggle("selected", b.dataset.channel===ch));
  const builtinLabels = { general:"general", offtopic:"off-topic", announcements:"announcements", modchat:"mod-chat", leaderboard:"leaderboard" };
  const chLabel = builtinLabels[ch] || (customChannels[ch] ? customChannels[ch].name : ch);
  $("channelLabel").textContent = chLabel;
  $("msgInput").placeholder = "Message #" + chLabel;
  const pip = $("pip-"+ch); if(pip) pip.style.display="none";

  const isAnnouncements = ch === "announcements";
  const isModChat = ch === "modchat";
  const isLeaderboard = ch === "leaderboard";

  // Reset input visibility first
  $("inputRow").style.display = "flex";
  $("formatToolbar").style.display = "flex";
  $("typingBar").style.display = "block";
  $("muteNotice").style.display = "none";

  if (isLeaderboard) {
    $("inputRow").style.display = "none";
    $("formatToolbar").style.display = "none";
    $("typingBar").style.display = "none";
  } else if (isAnnouncements) {
    $("inputRow").style.display = amOwner() ? "flex" : "none";
    $("formatToolbar").style.display = amOwner() ? "flex" : "none";
    $("typingBar").style.display = "none";
  } else if (isModChat) {
    $("inputRow").style.display = (amOwner() || amMod()) ? "flex" : "none";
    $("formatToolbar").style.display = (amOwner() || amMod()) ? "flex" : "none";
  }

  // Apply mute on top
  checkMuteStatus();

	// Block input if private custom channel and user lacks access
  if (customChannels[ch]) {
    const chData = customChannels[ch];
    if (chData.private) {
      const myUserData = allUsersCache[myUid] || {};
      const hasAccess = amOwner()
        || (chData.requiredRole === "mod" && amMod())
        || (chData.requiredRole === "dev" && isDev(myUid))
        || myUserData.customRole === chData.requiredRole;
      if (!hasAccess) {
        $("inputRow").style.display = "none";
        $("formatToolbar").style.display = "none";
      }
    }
  }


  const oldNotice = $("announcementsNotice");
  if (!isAnnouncements && oldNotice) oldNotice.style.display = "none";
  if (isAnnouncements) updateAnnouncementsUI();

  setupTypingListener(ch);

  if (isLeaderboard) {
    renderLeaderboard();
    leaderboardTimer = setInterval(renderLeaderboard, 5 * 60 * 1000);
  } else {
    loadMessages(ch);
  }
}

// ============================================================
// LEADERBOARD
// ============================================================
async function renderLeaderboard() {
  const chatbox = $("chatbox");
  chatbox.innerHTML = "";

  const refreshBtn = document.createElement("button");
  refreshBtn.className = "leaderboard-refresh-btn";
  refreshBtn.textContent = "🔄 Refresh";
  refreshBtn.addEventListener("click", renderLeaderboard);
  chatbox.appendChild(refreshBtn);

  const usersSnap = await db.ref("users").once("value");
  const users = usersSnap.val() || {};
  const userList = Object.entries(users).map(([uid, d]) => ({ uid, ...d }));

  const sections = [
    {
      title: "🥇 Most Messages Sent",
      key: "messageCount",
      label: "messages",
      color: "#fbbf24"
    },
    {
      title: "❤️ Most Reactions Received",
      key: "reactionsReceived",
      label: "reactions",
      color: "#f472b6"
    },
    {
      title: "⭐ Highest Rep",
      key: "rep",
      label: "rep",
      color: "#a78bfa"
    },
    {
      title: "📅 Most Days Active",
      key: "_daysActive",
      label: "days",
      color: "#34d399",
      compute: u => u.activeDays ? Object.keys(u.activeDays).length : 0
    }
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
      row.style.cursor = "pointer";
      row.addEventListener("click", () => openProfile(u.uid));
      const rank = document.createElement("span"); rank.className="lb-rank";
      rank.textContent = i===0?"🥇":i===1?"🥈":i===2?"🥉":"#"+(i+1);
      const av = buildAvatar(u.avatarUrl||null, u.username, u.color||"#4da6ff", 28);
      const name = document.createElement("span"); name.className="lb-name"; name.textContent=u.username; name.style.color=u.color||"#4da6ff";
      const score = document.createElement("span"); score.className="lb-score"; score.style.color=section.color;
      score.textContent = u._score.toLocaleString()+" "+section.label;
      row.appendChild(rank); row.appendChild(av); row.appendChild(name); row.appendChild(score);
      wrapper.appendChild(row);
    });

    chatbox.appendChild(wrapper);
  });
}

// ============================================================
// LOAD MESSAGES
// ============================================================
function loadMessages(ch) {
  const baseRef = db.ref("messages/"+ch);
  baseRef.orderByChild("timestamp").limitToLast(PAGE_SIZE).once("value", snap => {
    if (currentChannel !== ch) return;
    let msgs = [];
    const rawVal = snap.val() || {};
    Object.entries(rawVal).forEach(([key, val]) => msgs.push({ key, ...val }));
    msgs.sort((a, b) => a.timestamp - b.timestamp);

    const totalLoaded = msgs.length;
    msgs.forEach(m => {
      if (!displayedMsgs[ch]) displayedMsgs[ch] = new Set();
      if (displayedMsgs[ch].has(m.key)) return;
      displayedMsgs[ch].add(m.key);
      renderMessage(m, ch, false);
    });

    if (totalLoaded >= PAGE_SIZE && msgs.length > 0) {
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
  btn.textContent = "No more messages";
  btn.disabled = true;
}

// ============================================================
// UNREAD DOTS
// ============================================================
function setupUnreadListeners() {
  getAllChannels().forEach(ch => {
    if (ch===currentChannel || ch==="leaderboard") return;
    db.ref("messages/"+ch).off("child_added");
    const since = Date.now();
    db.ref("messages/"+ch).orderByChild("timestamp").startAt(since).on("child_added", () => {
      if (currentChannel!==ch) { const pip=$("pip-"+ch); if(pip) pip.style.display="inline-block"; }
    });
  });
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
  const name        = data.name || "Unknown";
  const isMine      = userId === myUid;
  const nameColor   = color || "#ffffff";
  const isOwnerMsg  = isOwner(userId);
  const isModMsg    = isMod(userId);
  const isDevMsg    = isDev(userId);
  const canDel      = canDelete();
  const isAnnCh     = ch === "announcements";

  // Handle poll type
  if (data.type === "poll") {
    return renderPollMessage(data, ch, isNew, prepend);
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

  // Reply quote
  if (replyTo) {
    const q = document.createElement("div"); q.className="reply-quote";
    const qName = document.createElement("span"); qName.className="reply-quote-name"; qName.textContent=replyTo.name;
    const qText = document.createElement("span"); qText.className="reply-quote-text";
    qText.textContent = strip(replyTo.text||"").substring(0,80);
    q.appendChild(qName); q.appendChild(qText);
    bubble.appendChild(q);
  }

  // Header
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
  if (userDataForRole.customRole && customRoles[userDataForRole.customRole]) {
    const cr = customRoles[userDataForRole.customRole];
    const badge = document.createElement("span");
    badge.textContent = "[" + cr.name + "]";
    badge.style.cssText = `font-size:10px;font-weight:800;color:${cr.color};text-shadow:0 0 6px ${cr.color}88;margin-right:3px;`;
    nameWrap.appendChild(badge);
  }

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

  // Message content
  const textEl = document.createElement("div"); textEl.className="msg-text";

  if (data.type==="image" && data.imageUrl) {
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

  // Reactions
  const reactionsEl = document.createElement("div"); reactionsEl.className="reactions";
  bubble.appendChild(reactionsEl);

  // Action bar
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

  // Mod actions in action bar
if (canDel) {
    const delBtn = document.createElement("button"); delBtn.className="msg-action-btn delete-btn";
    delBtn.textContent="🗑 Delete";
    delBtn.addEventListener("click", async e => {
      e.stopPropagation(); closeAllActionBars();
      const ok = await showConfirm("🗑️","Delete Message","This will delete the message for everyone.");
      if (ok) db.ref("messages/"+ch+"/"+key).remove().catch(err => showToast("Delete failed: "+err.message,"err"));
    });
    actionBar.appendChild(delBtn);
  }

  bubble.appendChild(actionBar);
  bubble.addEventListener("click", e => {
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
  const { key, userId, name, color, time, pollQuestion, pollOptions, pollEndsAt } = data;
  const nameColor = color || "#ffffff";

  const wrapper = document.createElement("div");
  wrapper.className = "msg-wrapper other poll-wrapper";
  wrapper.dataset.messageId = key;

  const avEl = buildAvatar(null, name, nameColor, 34);
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

  // Delete for mods
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
// EMOJI PICKER
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
  const pw=popup.offsetWidth||340, ph=popup.offsetHeight||210;
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

function toggleReaction(msgId, ch, emoji) {
  const key = [...emoji].map(c => c.codePointAt(0).toString(16)).join("_");
  const ref  = db.ref("messages/"+ch+"/"+msgId+"/reactions/"+key+"/"+myUid);
  ref.once("value", async s => {
    if (s.exists()) {
      await ref.remove();
      // find message author and decrement
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
  Object.entries(reactions).forEach(([key, users]) => {
    const uids = Object.keys(users);
    if (!uids.length) return;
    const emoji   = key.split("_").map(cp => String.fromCodePoint(parseInt(cp,16))).join("");
    const reacted = uids.includes(myUid);
    const span = document.createElement("span");
    span.className = "reaction"+(reacted?" reacted":"");
    span.textContent = emoji+" "+uids.length;
    // Track reactions received for leaderboard
    if (reacted && msgUserId && msgUserId !== myUid) {
      // Don't update here on every render — it's handled on toggle
    }
    span.addEventListener("mouseenter", () => {
      const old=span.querySelector(".reaction-tooltip"); if(old) old.remove();
      const names=uids.map(uid => { const u=allUsersCache[uid]; return u?u.username:(uid===myUid?myUsername:"Unknown"); });
      const tip=document.createElement("div"); tip.className="reaction-tooltip"; tip.textContent=names.join(", ");
      span.appendChild(tip);
    });
    span.addEventListener("mouseleave", () => { const t=span.querySelector(".reaction-tooltip"); if(t) t.remove(); });
    span.addEventListener("click", e => { e.stopPropagation(); toggleReaction(msgId, ch, emoji); });
    container.appendChild(span);
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
}

// ============================================================
// INPUT SETUP
// ============================================================
function setupInput() {
  const input=$("msgInput");
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
  if (currentChannel==="leaderboard") return;
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
}

function sendLinkMessage(url) {
  if (currentChannel==="announcements" && !amOwner()) return;
  if (currentChannel==="leaderboard") return;
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
  el.textContent=len+"/"+MAX_CHARS;
  el.className="char-counter"+(len>=MAX_CHARS?" over":len>=MAX_CHARS*0.8?" warn":"");
}

function handleTyping() {
  if (currentChannel==="announcements"||currentChannel==="leaderboard") return;
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
  ["Option 1","Option 2"].forEach((ph,i) => {
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
  if (currentChannel==="leaderboard") return;
  if (isMuted(myUid)) return showToast("You are muted!","warn");

  const now=Date.now();
  if (sending || now-lastSentTime<1200) return;
  const raw=$("msgInput").value.trim();
  if (!raw) return;
  if (raw.length>MAX_CHARS) return showToast("Message too long!","warn");
  if (filterBadWords(raw)) return showToast("⚠️ Message contains disallowed words.","warn");
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

  const cp=$("colorPicker"); cp.value=myColor; $("colorLabel").textContent=myColor;
  cp.addEventListener("input", e=>{
    myColor=e.target.value; $("colorLabel").textContent=myColor;
    db.ref("users/"+myUid).update({color:myColor}); updateSidebarUser();
  });
}

function setMsg(el,text,ok){ el.textContent=text; el.className="settings-msg "+(ok?"ok":"bad"); }

function openSettings() {
  $("settingsOverlay").style.display="flex";
  $("newUsernameInput").value=myUsername;
  $("colorPicker").value=myColor; $("colorLabel").textContent=myColor;
  $("statusInput").value=myStatus||"";
  checkUsernameCooldown();
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
