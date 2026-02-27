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
const IMGBB_KEY      = "7ae7b64cb4da961ab6a7d18d920099a8";
const MAX_CHARS      = 250;
const PAGE_SIZE      = 50;
const WEEK_MS        = 7 * 24 * 60 * 60 * 1000;
const CHANNELS       = ["general", "offtopic"];
// SET YOUR UID — loaded from Firebase at runtime (see setupOwner())
const OWNER_UID_KEY = "ownerUid"; // stored in Firebase under /config/ownerUid

// ============================================================
// STATE
// ============================================================
let currentUser     = null;
let myUid           = null;
let myUsername      = "";
let myColor         = "#1a8fff";
let myAvatar        = null;
let ownerUid        = null;
let currentChannel  = "general";
let replyingTo      = null;
let userScrolledUp  = false;
let typingTimer     = null;
let isTyping        = false;
let lastSentTime    = 0;
let lastSentMsg     = "";
let sending         = false;
let activeColor     = "";
let allUsersCache   = {};
let displayedMsgs   = {};
let msgListeners    = {};
let appStarted      = false;

// ============================================================
// DOM HELPERS
// ============================================================
const $  = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const strip = html => { const d = document.createElement("div"); d.innerHTML = html; return d.textContent || ""; };

function showError(id, msg) { const el = $(id); el.textContent = msg; el.classList.add("show"); }
function clearError(id) { const el = $(id); el.textContent = ""; el.classList.remove("show"); }

function showToast(msg, type) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.className = "toast " + (type||"");
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
// AVATAR BUILDER
// ============================================================
function buildAvatar(avatarUrl, username, color, size) {
  size = size || 36;
  if (avatarUrl) {
    const img = document.createElement("img");
    img.src = avatarUrl;
    img.className = "av-img";
    img.style.width = img.style.height = size + "px";
    img.style.borderRadius = "50%";
    img.style.objectFit = "cover";
    img.style.display = "block";
    img.style.flexShrink = "0";
    img.onerror = () => img.replaceWith(buildInitialAvatar(username, color, size));
    return img;
  }
  return buildInitialAvatar(username, color, size);
}
function buildInitialAvatar(username, color, size) {
  size = size || 36;
  const d = document.createElement("div");
  d.textContent = (username || "?").charAt(0).toUpperCase();
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
  let blocked = false;
  BAD_WORDS.forEach(w => { if (norm.includes(normalizeText(w))) blocked = true; });
  return blocked;
}

// ============================================================
// MARKDOWN / FORMATTING PARSER
// ============================================================
function parseMessage(raw) {
  // Escape HTML first
  let msg = esc(raw);

  // Spoiler ||text||
  msg = msg.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" onclick="this.classList.add(\'revealed\')">$1</span>');

  // Code `text` (do before bold/italic so code isn't parsed)
  msg = msg.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold **text**
  msg = msg.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic *text*
  msg = msg.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Strikethrough ~~text~~
  msg = msg.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // Colored text [color:text]
  const COLORS = ["red","orange","yellow","green","blue","purple","pink"];
  COLORS.forEach(c => {
    const re = new RegExp("\\[" + c + ":([^\\]]+)\\]", "g");
    msg = msg.replace(re, `<span class="text-${c}">$1</span>`);
  });

  // @mentions
  msg = msg.replace(/@(\w+)/g, (match, name) => {
    const isMe = name.toLowerCase() === myUsername.toLowerCase();
    return `<span class="mention${isMe ? " mention-me" : ""}">${esc(match)}</span>`;
  });

  // Links
  msg = msg.replace(/(https?:\/\/[^\s<]+[^\s<.,:;"')\]{}])/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="chat-link">$1</a>');

  return msg;
}

// ============================================================
// USERNAME AVAILABILITY
// ============================================================
function usernameToEmail(username) { return username.toLowerCase().trim() + "@storyn.chat"; }

let unameCheckTimer = null;
function liveUsernameCheck(inputEl, hintEl, excludeEmail) {
  inputEl.addEventListener("input", () => {
    clearTimeout(unameCheckTimer);
    const val = inputEl.value.trim();
    if (!val || val.length < 2) { hintEl.textContent = ""; hintEl.className = "field-hint"; return; }
    hintEl.textContent = "Checking..."; hintEl.className = "field-hint";
    unameCheckTimer = setTimeout(() => {
      const email = usernameToEmail(val);
      if (email === excludeEmail) { hintEl.textContent = "✓ Available"; hintEl.className = "field-hint ok"; return; }
      db.ref("users").orderByChild("usernameLower").equalTo(val.toLowerCase()).once("value", snap => {
        const taken = snap.exists();
        hintEl.textContent = taken ? "✗ Already taken" : "✓ Available";
        hintEl.className = "field-hint " + (taken ? "bad" : "ok");
      });
    }, 400);
  });
}

liveUsernameCheck($("signupUsername"), $("usernameHint"));

// ============================================================
// AUTH NAVIGATION
// ============================================================
function showCard(which) {
  ["loginCard","signupCard"].forEach(id => $(id).style.display = "none");
  const map = { login:"loginCard", signup:"signupCard" };
  $(map[which]).style.display = "";
  clearError("loginError"); clearError("signupError");
}

$("showSignupBtn").addEventListener("click", e => { e.preventDefault(); showCard("signup"); });
$("showLoginBtn").addEventListener("click",  e => { e.preventDefault(); showCard("login"); });

// ENTER key support on auth forms
["loginUsername","loginPassword"].forEach(id => {
  $(id).addEventListener("keydown", e => { if (e.key === "Enter") $("loginBtn").click(); });
});
["signupUsername","signupPassword","signupConfirm"].forEach(id => {
  $(id).addEventListener("keydown", e => { if (e.key === "Enter") $("signupBtn").click(); });
});

// ============================================================
// SIGN IN
// ============================================================
$("loginBtn").addEventListener("click", async () => {
  clearError("loginError");
  const username = $("loginUsername").value.trim();
  const password = $("loginPassword").value;
  if (!username || !password) return showError("loginError", "Please fill in all fields.");
  const email = usernameToEmail(username);
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch(err) {
    showError("loginError", friendlyError(err.code));
  }
});

// ============================================================
// SIGN UP
// ============================================================
$("signupBtn").addEventListener("click", async () => {
  clearError("signupError");
  const username = $("signupUsername").value.trim();
  const password = $("signupPassword").value;
  const confirm  = $("signupConfirm").value;

  if (!username || username.length < 2) return showError("signupError", "Username must be at least 2 characters.");
  if (/[^a-zA-Z0-9_]/.test(username)) return showError("signupError", "Username can only contain letters, numbers, and underscores.");
  if (!password || password.length < 6) return showError("signupError", "Password must be at least 6 characters.");
  if (password !== confirm) return showError("signupError", "Passwords do not match.");

  // Check username availability
  const snap = await db.ref("users").orderByChild("usernameLower").equalTo(username.toLowerCase()).once("value");
  if (snap.exists()) return showError("signupError", "That username is already taken.");

  const email = usernameToEmail(username);
  try {
    const result = await auth.createUserWithEmailAndPassword(email, password);
    await db.ref("users/" + result.user.uid).set({
      username,
      usernameLower: username.toLowerCase(),
      color: "#4da6ff",
      avatarUrl: null,
      lastUsernameChange: 0,
      createdAt: Date.now()
    });
  } catch(err) {
    showError("signupError", friendlyError(err.code));
  }
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
    showCard("login");
    return;
  }

  const snap = await db.ref("users/" + user.uid).once("value");
  if (!snap.exists()) { await auth.signOut(); return; }

  if (appStarted) return;
  appStarted = true;
  currentUser = user;
  myUid = user.uid;

  const data = snap.val();
  myUsername = data.username || "User";
  myColor    = data.color || "#4da6ff";
  myAvatar   = data.avatarUrl || null;

  // Load owner UID from Firebase (secure — not in client code)
  db.ref("config/ownerUid").once("value", snap => {
    ownerUid = snap.val();
    // If ownerUid not set yet and this is the first user (K9fpoUStzQdGKGOFhKsrB0Bl5343), set it
    if (!ownerUid && myUid === "K9fpoUStzQdGKGOFhKsrB0Bl5343") {
      db.ref("config/ownerUid").set(myUid);
      ownerUid = myUid;
    }
    updateSidebarUser();
  });

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

  // Listen for own profile changes (avatar, color, username)
  db.ref("users/" + myUid).on("value", snap => {
    const d = snap.val() || {};
    myUsername = d.username || myUsername;
    myColor    = d.color    || myColor;
    myAvatar   = d.avatarUrl || null;
    updateSidebarUser();
  });

  // Cache all users
  db.ref("users").on("value", snap => {
    allUsersCache = snap.val() || {};
  });

  runLoadingBar();
}

function runLoadingBar() {
  const bar = $("loadingBar");
  let pct = 0;
  const iv = setInterval(() => {
    pct += 4;
    bar.style.width = Math.min(pct, 100) + "%";
    if (pct >= 100) {
      clearInterval(iv);
      setTimeout(() => {
        $("loadingScreen").style.display = "none";
        $("appContainer").style.display = "flex";
        setupApp();
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
  buildThemeGrid();
  buildSizeRow();
  switchChannel("general");
  setupUnreadListeners();
}

// ============================================================
// SIDEBAR USER PANEL
// ============================================================
function updateSidebarUser() {
  $("sidebarName").textContent = myUsername;
  $("sidebarName").style.color = myColor;
  const tagEl = $("sidebarTag");
  if (ownerUid && myUid === ownerUid) {
    tagEl.textContent = "[Owner]";
    tagEl.style.color = "#ffffff";
    tagEl.style.textShadow = "0 0 8px rgba(255,255,255,0.7)";
  } else {
    tagEl.textContent = "";
  }
  renderSidebarAvatar();
}

function renderSidebarAvatar() {
  const el = $("sidebarAvatar");
  el.innerHTML = "";
  el.style.background = "";
  if (myAvatar) {
    const img = document.createElement("img");
    img.src = myAvatar; img.className = "av-img";
    img.onerror = () => { el.innerHTML = ""; el.textContent = myUsername.charAt(0).toUpperCase(); el.style.background = `linear-gradient(135deg,${myColor}cc,${myColor}66)`; };
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
    const file = $("avatarInput").files[0];
    if (!file) return;
    $("avatarInput").value = "";
    if (file.size > 5 * 1024 * 1024) return showToast("Image must be under 5MB", "err");
    wrap.classList.add("uploading");
    const url = await uploadImgBB(file);
    wrap.classList.remove("uploading");
    if (!url) return showToast("Upload failed", "err");
    myAvatar = url;
    await db.ref("users/" + myUid).update({ avatarUrl: url });
    renderSidebarAvatar();
  });
}

async function uploadImgBB(file) {
  const fd = new FormData(); fd.append("image", file);
  try {
    const res  = await fetch("https://api.imgbb.com/1/upload?key=" + IMGBB_KEY, { method:"POST", body:fd });
    const json = await res.json();
    return json.success ? json.data.url : null;
  } catch(e) { return null; }
}

// ============================================================
// PRESENCE + ONLINE USERS
// ============================================================
function setupPresence() {
  const ref = db.ref("presence/" + myUid);
  db.ref(".info/connected").on("value", snap => {
    if (!snap.val()) return;
    ref.onDisconnect().remove();
    ref.set({ username: myUsername, color: myColor, uid: myUid });
  });
  db.ref("presence").on("value", snap => {
    const data = snap.val() || {};
    $("onlineCount").textContent = Object.keys(data).length;
    renderOnlineList(data);
  });
}

function cleanupPresence() {
  if (myUid) db.ref("presence/" + myUid).remove();
  db.ref("presence").off();
  db.ref(".info/connected").off();
}

function renderOnlineList(data) {
  const list = $("onlineList"); list.innerHTML = "";
  const entries = Object.entries(data);
  if (!entries.length) { list.innerHTML = '<div style="font-size:11px;color:var(--text-dim);padding:4px 8px;">Nobody online</div>'; return; }
  entries.forEach(([uid, d]) => {
    const row = document.createElement("div"); row.className = "online-row";
    const av = buildAvatar(allUsersCache[uid]?.avatarUrl || null, d.username, d.color||"#4da6ff", 22);
    av.style.flexShrink = "0";
    const name = document.createElement("span"); name.className = "online-name";
    name.textContent = d.username + (uid === myUid ? " (you)" : "");
    name.style.color = d.color || "#4da6ff";
    const dot = document.createElement("span"); dot.className = "online-dot";
    row.appendChild(av); row.appendChild(name); row.appendChild(dot);
    list.appendChild(row);
  });
}

// ============================================================
// TYPING
// ============================================================
function setTyping(active) {
  if (!myUid) return;
  const ref = db.ref("typing/" + currentChannel + "/" + myUid);
  active ? ref.set({ username: myUsername, ts: Date.now() }) : ref.remove();
}

function setupTypingListener(channel) {
  db.ref("typing/" + channel).off("value");
  db.ref("typing/" + channel).on("value", snap => {
    const typers = snap.val() || {};
    const names = Object.entries(typers)
      .filter(([id, v]) => id !== myUid && v && Date.now() - (v.ts||0) < 10000)
      .map(([, v]) => v.username);
    const el = $("typingDisplay");
    if (!names.length) { el.textContent = ""; return; }
    el.textContent = names.length === 1 ? names[0] + " is typing..."
      : names.length === 2 ? names[0] + " and " + names[1] + " are typing..."
      : names.length + " people are typing...";
  });
}

// ============================================================
// CHANNEL SWITCHING
// ============================================================
function setupChannelButtons() {
  document.querySelectorAll(".channel-btn").forEach(btn => {
    btn.addEventListener("click", () => switchChannel(btn.dataset.channel));
  });
}

function switchChannel(ch) {
  if (msgListeners[currentChannel]) {
    try { msgListeners[currentChannel].ref.off("child_added", msgListeners[currentChannel].fn); } catch(e){}
    delete msgListeners[currentChannel];
  }
  setTyping(false); isTyping = false; clearTimeout(typingTimer);
  db.ref("typing/" + currentChannel).off("value");

  currentChannel = ch;
  $("chatbox").innerHTML = "";
  displayedMsgs[ch] = new Set();

  document.querySelectorAll(".channel-btn").forEach(b => b.classList.toggle("selected", b.dataset.channel === ch));
  const labels = { general:"general", offtopic:"off-topic" };
  $("channelLabel").textContent = labels[ch] || ch;
  $("msgInput").placeholder = "Message #" + (labels[ch] || ch);

  // Clear unread pip
  const pip = $("pip-" + ch); if (pip) pip.style.display = "none";

  setupTypingListener(ch);
  loadMessages(ch);
}

// ============================================================
// LOAD MESSAGES (paginated)
// ============================================================
function loadMessages(ch) {
  const baseRef = db.ref("messages/" + ch);

  baseRef.orderByChild("timestamp").limitToLast(PAGE_SIZE).once("value", snap => {
    if (currentChannel !== ch) return;
    let msgs = []; let maxTs = 0;
    snap.forEach(child => { msgs.push({ key: child.key, ...child.val() }); });
    msgs.forEach(m => {
      if (!displayedMsgs[ch]) displayedMsgs[ch] = new Set();
      if (displayedMsgs[ch].has(m.key)) return;
      displayedMsgs[ch].add(m.key);
      renderMessage(m, ch, false);
      if ((m.timestamp||0) > maxTs) maxTs = m.timestamp||0;
    });

    // Load more button
    const loadBtn = document.createElement("button");
    loadBtn.className = "load-more-btn"; loadBtn.textContent = "📜 Load older messages";
    loadBtn.addEventListener("click", () => loadOlderMessages(ch, msgs[0]?.timestamp || 0, loadBtn));
    if ($("chatbox").firstChild) $("chatbox").insertBefore(loadBtn, $("chatbox").firstChild);
    else $("chatbox").appendChild(loadBtn);

    scrollToBottom();

    // Live listener for new messages
    const liveRef = baseRef.orderByChild("timestamp").startAt(maxTs + 1);
    let ready = false;
    const fn = liveRef.on("child_added", snap2 => {
      if (!ready) return;
      if (currentChannel !== ch) return;
      const key = snap2.key, data = snap2.val();
      if (!displayedMsgs[ch]) displayedMsgs[ch] = new Set();
      if (displayedMsgs[ch].has(key)) return;
      displayedMsgs[ch].add(key);
      renderMessage({ key, ...data }, ch, true);
    });
    setTimeout(() => { ready = true; }, 500);
    msgListeners[ch] = { ref: liveRef, fn };
    setupUnreadListeners();
  });
}

async function loadOlderMessages(ch, oldestTs, btn) {
  btn.textContent = "Loading..."; btn.disabled = true;
  const snap = await db.ref("messages/" + ch)
    .orderByChild("timestamp").endAt(oldestTs - 1).limitToLast(PAGE_SIZE).once("value");
  let msgs = []; snap.forEach(child => msgs.push({ key: child.key, ...child.val() }));
  if (!msgs.length) { btn.textContent = "No more messages"; return; }
  const prevScrollHeight = $("chatbox").scrollHeight;
  msgs.forEach(m => {
    if (displayedMsgs[ch].has(m.key)) return;
    displayedMsgs[ch].add(m.key);
    renderMessage(m, ch, false, true);
  });
  $("chatbox").scrollTop = $("chatbox").scrollHeight - prevScrollHeight;
  if (msgs.length < PAGE_SIZE) { btn.textContent = "No more messages"; btn.disabled = true; }
  else {
    btn.textContent = "📜 Load older messages"; btn.disabled = false;
    btn.onclick = () => loadOlderMessages(ch, msgs[0].timestamp||0, btn);
  }
}

// ============================================================
// UNREAD DOTS
// ============================================================
function setupUnreadListeners() {
  CHANNELS.forEach(ch => {
    if (ch === currentChannel) return;
    db.ref("messages/" + ch).off("child_added");
    const since = Date.now();
    db.ref("messages/" + ch).orderByChild("timestamp").startAt(since).on("child_added", () => {
      if (currentChannel !== ch) {
        const pip = $("pip-" + ch); if (pip) pip.style.display = "inline-block";
      }
    });
  });
}

// ============================================================
// SCROLL
// ============================================================
function scrollToBottom() { const cb = $("chatbox"); cb.scrollTop = cb.scrollHeight; }
$("scrollBtn").addEventListener("click", () => { scrollToBottom(); $("scrollBtn").style.display = "none"; userScrolledUp = false; });

// ============================================================
// RENDER MESSAGE
// ============================================================
function renderMessage(data, ch, isNew, prepend) {
  prepend = prepend || false;
  const { key, name, message, time, timestamp, userId, color, avatarUrl, replyTo, reactions } = data;
  const isMine = userId === myUid;
  const nameColor = color || "#ffffff";

  const wrapper = document.createElement("div");
  wrapper.className = "msg-wrapper " + (isMine ? "mine" : "other");
  wrapper.dataset.messageId = key;
  wrapper.dataset.timestamp = timestamp || 0;

  // Avatar
  const avEl = buildAvatar(avatarUrl || null, name, nameColor, 34);
  avEl.className = "msg-avatar";

  // Bubble
  const bubble = document.createElement("div");
  bubble.className = "message " + (isMine ? "mine" : "other");
  bubble.dataset.messageId = key;

  // Mentioned?
  if (message && message.includes("@" + myUsername)) bubble.classList.add("mentioned");

  // Owner tag
  if (ownerUid && userId === ownerUid) {
    const tag = document.createElement("span"); tag.className = "owner-tag"; tag.textContent = "[Owner]";
    bubble.appendChild(tag);
  }

  // Reply quote
  if (replyTo) {
    const q = document.createElement("div"); q.className = "reply-quote";
    const qName = document.createElement("span"); qName.className = "reply-quote-name"; qName.textContent = replyTo.name;
    const qText = document.createElement("span"); qText.className = "reply-quote-text"; qText.textContent = strip(replyTo.text).substring(0, 80);
    q.appendChild(qName); q.appendChild(qText); bubble.appendChild(q);
  }

  // Header
  const header = document.createElement("div"); header.className = "msg-header";
  const uname = document.createElement("span"); uname.className = "msg-username"; uname.textContent = name; uname.style.color = nameColor;
  const mtime = document.createElement("span"); mtime.className = "msg-time"; mtime.textContent = time;
  header.appendChild(uname); header.appendChild(mtime); bubble.appendChild(header);

  // Text or image
  const textEl = document.createElement("div"); textEl.className = "msg-text";
  if (data.type === "image" && data.imageUrl) {
    const img = document.createElement("img");
    img.src = data.imageUrl; img.className = "msg-image"; img.alt = "Image";
    img.addEventListener("click", () => openLightbox(data.imageUrl));
    textEl.appendChild(img);
  } else {
    textEl.innerHTML = parseMessage(message || "");
  }
  bubble.appendChild(textEl);

  // Reactions container
  const reactionsEl = document.createElement("div"); reactionsEl.className = "reactions"; bubble.appendChild(reactionsEl);

  // Reply action button
  const replyBtn = document.createElement("button"); replyBtn.className = "reply-action"; replyBtn.textContent = "↩";
  replyBtn.addEventListener("click", e => { e.stopPropagation(); setReply(key, name, message); });
  bubble.appendChild(replyBtn);

  // React button
  const reactBtn = document.createElement("button"); reactBtn.className = "react-btn"; reactBtn.textContent = "😀";
  reactBtn.addEventListener("click", e => { e.stopPropagation(); openEmojiPicker(key, ch, reactBtn); });
  bubble.appendChild(reactBtn);

  wrapper.appendChild(avEl);
  wrapper.appendChild(bubble);

  // Insert at correct position
  const chatbox = $("chatbox");
  if (prepend) {
    const firstMsg = chatbox.querySelector(".msg-wrapper");
    if (firstMsg) chatbox.insertBefore(wrapper, firstMsg);
    else chatbox.appendChild(wrapper);
  } else {
    chatbox.appendChild(wrapper);
  }

  // Live reactions listener
  db.ref("messages/" + ch + "/" + key + "/reactions").on("value", snap => {
    renderReactions(reactionsEl, snap.val() || {}, key, ch);
  });

  if (isNew) {
    if (!userScrolledUp) scrollToBottom();
    else { $("scrollBtn").style.display = "flex"; }
  }

  // Scroll detection
  $("chatbox").onscroll = function() {
    const dist = this.scrollHeight - this.scrollTop - this.clientHeight;
    userScrolledUp = dist > 120;
    if (!userScrolledUp) $("scrollBtn").style.display = "none";
  };
}

// ============================================================
// EMOJI PICKER (native)
// ============================================================
function openEmojiPicker(msgId, ch, anchor) {
  // Use native emoji picker via hidden input trick or EmojiButton
  // We'll use a custom small grid of common emojis + native support
  document.querySelectorAll(".emoji-popup").forEach(p => p.remove());

  const popup = document.createElement("div");
  popup.className = "emoji-popup";
  popup.style.cssText = `
    position:fixed; background:var(--bg-mid); border:1px solid var(--border);
    border-radius:12px; padding:10px; z-index:500; box-shadow:var(--shadow);
    display:flex; flex-direction:column; gap:8px; max-width:280px;
    animation: cardIn 0.15s ease;
  `;

  // Common emoji rows
  const EMOJI_ROWS = [
    ["👍","👎","❤️","😂","😮","😢","😡","🎉"],
    ["🔥","💯","✅","❌","⭐","💀","👀","🙏"],
    ["😀","😎","🤔","😴","🤣","😭","🥹","😤"],
    ["🐸","💀","🗿","🤡","👻","💩","🦆","🐧"]
  ];

  EMOJI_ROWS.forEach(row => {
    const rowEl = document.createElement("div");
    rowEl.style.cssText = "display:flex;gap:4px;";
    row.forEach(emoji => {
      const btn = document.createElement("button");
      btn.textContent = emoji;
      btn.style.cssText = `background:none;border:none;font-size:20px;cursor:pointer;padding:4px 6px;border-radius:6px;transition:background 0.15s,transform 0.1s;`;
      btn.addEventListener("mouseenter", () => btn.style.background = "var(--bg-lighter)");
      btn.addEventListener("mouseleave", () => btn.style.background = "none");
      btn.addEventListener("click", () => {
        toggleReaction(msgId, ch, emoji);
        popup.remove();
      });
      rowEl.appendChild(btn);
    });
    popup.appendChild(rowEl);
  });

  document.body.appendChild(popup);

  // Position near anchor
  const rect = anchor.getBoundingClientRect();
  const popupW = 280, popupH = 160;
  let top = rect.top - popupH - 8;
  let left = rect.left - popupW / 2;
  if (top < 8) top = rect.bottom + 8;
  if (left < 8) left = 8;
  if (left + popupW > window.innerWidth - 8) left = window.innerWidth - popupW - 8;
  popup.style.top = top + "px"; popup.style.left = left + "px";

  setTimeout(() => {
    document.addEventListener("click", function close(e) {
      if (!popup.contains(e.target) && e.target !== anchor) { popup.remove(); document.removeEventListener("click", close); }
    });
  }, 10);
}

function toggleReaction(msgId, ch, emoji) {
  const key = [...emoji].map(c => c.codePointAt(0).toString(16)).join("_");
  const ref = db.ref("messages/" + ch + "/" + msgId + "/reactions/" + key + "/" + myUid);
  ref.once("value", s => s.exists() ? ref.remove() : ref.set(true));
}

function renderReactions(container, reactions, msgId, ch) {
  container.innerHTML = "";
  Object.entries(reactions).forEach(([key, users]) => {
    const uids = Object.keys(users);
    if (!uids.length) return;
    // Convert key back to emoji
    const emoji = key.split("_").map(cp => String.fromCodePoint(parseInt(cp, 16))).join("");
    const reacted = uids.includes(myUid);

    const span = document.createElement("span");
    span.className = "reaction" + (reacted ? " reacted" : "");
    span.textContent = emoji + " " + uids.length;

    span.addEventListener("mouseenter", () => {
      const old = span.querySelector(".reaction-tooltip"); if (old) old.remove();
      const names = uids.map(uid => {
        const u = allUsersCache[uid];
        return u ? u.username : (uid === myUid ? myUsername : "Unknown");
      });
      const tip = document.createElement("div"); tip.className = "reaction-tooltip";
      tip.textContent = names.join(", ");
      span.appendChild(tip);
    });
    span.addEventListener("mouseleave", () => { const t = span.querySelector(".reaction-tooltip"); if (t) t.remove(); });
    span.addEventListener("click", () => toggleReaction(msgId, ch, emoji));
    container.appendChild(span);
  });
}

// ============================================================
// REPLY
// ============================================================
function setReply(msgId, name, text) {
  replyingTo = { msgId, name, text };
  $("replyName").textContent = name;
  $("replyPreview").textContent = strip(text).substring(0, 80);
  $("replyBar").style.display = "flex";
  $("msgInput").focus();
}
function clearReply() { replyingTo = null; $("replyBar").style.display = "none"; }
$("cancelReply").addEventListener("click", clearReply);

// ============================================================
// FORMAT TOOLBAR
// ============================================================
function setupFormatToolbar() {
  document.querySelectorAll(".fmt-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const fmt = btn.dataset.fmt;
      const input = $("msgInput");
      const start = input.selectionStart, end = input.selectionEnd;
      const selected = input.value.substring(start, end) || "text";
      const wrappers = { bold:"**", italic:"*", strike:"~~", code:"`" };
      let newText = "";
      if (fmt === "spoiler") {
        newText = "||" + selected + "||";
      } else if (wrappers[fmt]) {
        const w = wrappers[fmt];
        newText = w + selected + w;
      }
      const before = input.value.substring(0, start);
      const after  = input.value.substring(end);
      input.value = before + newText + after;
      input.focus();
      input.selectionStart = start + (fmt === "spoiler" ? 2 : wrappers[fmt]?.length || 0);
      input.selectionEnd   = input.selectionStart + selected.length;
      updateCharCounter();
    });
  });

  // Color palette
  document.querySelectorAll(".color-dot").forEach(dot => {
    dot.addEventListener("click", () => {
      document.querySelectorAll(".color-dot").forEach(d => d.classList.remove("selected"));
      dot.classList.add("selected");
      activeColor = dot.dataset.color;

      if (activeColor) {
        const input = $("msgInput");
        const start = input.selectionStart, end = input.selectionEnd;
        const selected = input.value.substring(start, end) || "text";
        const newText = "[" + activeColor + ":" + selected + "]";
        input.value = input.value.substring(0, start) + newText + input.value.substring(end);
        input.focus();
        updateCharCounter();
        // Reset color after insertion
        setTimeout(() => {
          document.querySelectorAll(".color-dot").forEach(d => d.classList.remove("selected"));
          activeColor = "";
        }, 200);
      }
    });
  });
}

// ============================================================
// INPUT SETUP
// ============================================================
function setupInput() {
  const input = $("msgInput");

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 130) + "px";
    updateCharCounter();
    handleTyping();
    handleMentionSuggest();
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    if (e.key === "Escape") { clearReply(); $("mentionDrop").style.display = "none"; }
  });

  $("sendBtn").addEventListener("click", sendMessage);
  setupAttachButton();
}

function setupAttachButton() {
  const btn = $("attachBtn");
  const menu = $("attachMenu");
  let menuOpen = false;

  btn.addEventListener("click", e => {
    e.stopPropagation();
    menuOpen = !menuOpen;
    menu.style.display = menuOpen ? "block" : "none";
  });

  document.addEventListener("click", () => { menu.style.display = "none"; menuOpen = false; });
  menu.addEventListener("click", e => e.stopPropagation());

  // Send image
  $("attachMediaBtn").addEventListener("click", () => {
    menu.style.display = "none"; menuOpen = false;
    $("mediaInput").click();
  });

  $("mediaInput").addEventListener("change", async () => {
    const file = $("mediaInput").files[0];
    if (!file) return;
    $("mediaInput").value = "";
    if (file.size > 5 * 1024 * 1024) return showToast("Image must be under 5MB", "err");
    showToast("Uploading image...");
    const url = await uploadImgBB(file);
    if (!url) return showToast("Upload failed", "err");
    sendImageMessage(url);
  });

  // Send link
  $("attachLinkBtn").addEventListener("click", () => {
    menu.style.display = "none"; menuOpen = false;
    const url = prompt("Enter a URL to share:");
    if (!url || !url.trim()) return;
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) return showToast("Please enter a valid URL (https://...)", "warn");
    sendLinkMessage(trimmed);
  });
}

function sendImageMessage(imageUrl) {
  const now = Date.now();
  const msgData = {
    name: myUsername, message: "", imageUrl,
    time: new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }),
    timestamp: now, color: myColor, userId: myUid, avatarUrl: myAvatar || null,
    type: "image"
  };
  db.ref("messages/" + currentChannel).push(msgData);
  db.ref("users/" + myUid).update({ username: myUsername, color: myColor, avatarUrl: myAvatar || null });
}

function sendLinkMessage(url) {
  const now = Date.now();
  const msgData = {
    name: myUsername, message: url,
    time: new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }),
    timestamp: now, color: myColor, userId: myUid, avatarUrl: myAvatar || null
  };
  db.ref("messages/" + currentChannel).push(msgData);
  db.ref("users/" + myUid).update({ username: myUsername, color: myColor, avatarUrl: myAvatar || null });
}

// Lightbox
function openLightbox(src) {
  let lb = $("lightbox");
  if (!lb) {
    lb = document.createElement("div"); lb.id = "lightbox";
    lb.addEventListener("click", () => lb.remove());
    document.body.appendChild(lb);
  }
  lb.innerHTML = `<img src="${src}" alt="Image">`;
  lb.style.display = "flex";
}

function updateCharCounter() {
  const len = $("msgInput").value.length;
  const el = $("charCounter");
  el.textContent = len + "/" + MAX_CHARS;
  el.className = "char-counter" + (len >= MAX_CHARS ? " over" : len >= MAX_CHARS * 0.8 ? " warn" : "");
}

function handleTyping() {
  if (!isTyping) { isTyping = true; setTyping(true); }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => { isTyping = false; setTyping(false); }, 3000);
}

// ============================================================
// @MENTION SUGGEST
// ============================================================
function handleMentionSuggest() {
  const input = $("msgInput");
  const val = input.value, cursor = input.selectionStart;
  const before = val.substring(0, cursor);
  const match = before.match(/@(\w*)$/);
  const drop = $("mentionDrop");
  if (!match) { drop.style.display = "none"; return; }
  const query = match[1].toLowerCase();
  const results = Object.values(allUsersCache)
    .filter(u => u.username && u.username.toLowerCase().startsWith(query))
    .slice(0, 6);
  if (!results.length) { drop.style.display = "none"; return; }
  drop.innerHTML = "";
  results.forEach(u => {
    const item = document.createElement("div"); item.className = "mention-item";
    const av = buildAvatar(u.avatarUrl||null, u.username, u.color||"#4da6ff", 24);
    const name = document.createElement("span"); name.textContent = u.username; name.style.color = u.color||"#fff"; name.style.fontWeight = "700";
    item.appendChild(av); item.appendChild(name);
    item.addEventListener("click", () => {
      const newBefore = before.replace(/@\w*$/, "@" + u.username + " ");
      input.value = newBefore + val.substring(cursor);
      input.focus(); drop.style.display = "none";
    });
    drop.appendChild(item);
  });
  drop.style.display = "block";
}
document.addEventListener("click", e => {
  if (e.target !== $("msgInput")) $("mentionDrop").style.display = "none";
});

// ============================================================
// SEND MESSAGE
// ============================================================
function sendMessage() {
  const now = Date.now();
  if (sending || now - lastSentTime < 1200) return;
  const raw = $("msgInput").value.trim();
  if (!raw) return;
  if (raw.length > MAX_CHARS) return showToast("Message too long!", "warn");
  if (filterBadWords(raw)) return showToast("⚠️ Message contains disallowed words.", "warn");
  if (raw === lastSentMsg) return showToast("⚠️ Can't send the same message twice in a row.", "warn");

  sending = true;
  $("msgInput").value = "";
  $("msgInput").style.height = "auto";
  updateCharCounter();
  clearTimeout(typingTimer); isTyping = false; setTyping(false);

  const capturedReply = replyingTo;
  clearReply();

  const msgData = {
    name: myUsername,
    message: raw,
    time: new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }),
    timestamp: now,
    color: myColor,
    userId: myUid,
    avatarUrl: myAvatar || null
  };
  if (capturedReply) msgData.replyTo = { msgId: capturedReply.msgId, name: capturedReply.name, text: capturedReply.text };

  db.ref("messages/" + currentChannel).push(msgData)
    .then(() => { sending = false; lastSentTime = now; lastSentMsg = raw; })
    .catch(() => { sending = false; showToast("Failed to send message", "err"); });

  // Update profile snapshot in users node
  db.ref("users/" + myUid).update({ username: myUsername, color: myColor, avatarUrl: myAvatar || null });
}

// ============================================================
// SETTINGS
// ============================================================
function setupSettings() {
  $("settingsBtn").addEventListener("click", openSettings);
  $("settingsClose").addEventListener("click", closeSettings);
  $("settingsOverlay").addEventListener("click", e => { if (e.target === $("settingsOverlay")) closeSettings(); });

  // Username change
  $("saveUsernameBtn").addEventListener("click", async () => {
    const msg = $("usernameChangeMsg");
    const newName = $("newUsernameInput").value.trim();
    if (!newName || newName.length < 2) return setMsg(msg, "Must be at least 2 characters.", false);
    if (/[^a-zA-Z0-9_]/.test(newName)) return setMsg(msg, "Letters, numbers, underscores only.", false);
    if (newName === myUsername) { closeSettings(); return; }

    const snap = await db.ref("users/" + myUid + "/lastUsernameChange").once("value");
    const last = snap.val() || 0;
    if (Date.now() - last < WEEK_MS) {
      const rem = WEEK_MS - (Date.now() - last);
      const days = Math.floor(rem / 86400000), hrs = Math.floor((rem % 86400000) / 3600000);
      return setMsg(msg, "⏳ Available in " + days + "d " + hrs + "h", false);
    }

    const taken = await db.ref("users").orderByChild("usernameLower").equalTo(newName.toLowerCase()).once("value");
    if (taken.exists()) return setMsg(msg, "That username is taken.", false);

    await db.ref("users/" + myUid).update({ username: newName, usernameLower: newName.toLowerCase(), lastUsernameChange: Date.now() });
    myUsername = newName;
    updateSidebarUser();
    setMsg(msg, "✓ Username updated!", true);
  });

  const cp = $("colorPicker");
  cp.value = myColor;
  $("colorLabel").textContent = myColor;
  cp.addEventListener("input", e => {
    myColor = e.target.value;
    $("colorLabel").textContent = myColor;
    db.ref("users/" + myUid).update({ color: myColor });
    updateSidebarUser();
  });
}

function setMsg(el, text, ok) { el.textContent = text; el.className = "settings-msg " + (ok ? "ok" : "bad"); }

function openSettings() {
  $("settingsOverlay").style.display = "flex";
  $("newUsernameInput").value = myUsername;
  $("colorPicker").value = myColor;
  $("colorLabel").textContent = myColor;
  checkUsernameCooldown();
}
function closeSettings() { $("settingsOverlay").style.display = "none"; }

async function checkUsernameCooldown() {
  const msg = $("usernameChangeMsg");
  const snap = await db.ref("users/" + myUid + "/lastUsernameChange").once("value");
  const last = snap.val() || 0;
  if (Date.now() - last < WEEK_MS) {
    const rem = WEEK_MS - (Date.now() - last);
    const days = Math.floor(rem / 86400000), hrs = Math.floor((rem % 86400000) / 3600000);
    setMsg(msg, "⏳ Next change in " + days + "d " + hrs + "h", false);
    $("newUsernameInput").disabled = true; $("saveUsernameBtn").disabled = true;
  } else {
    setMsg(msg, "✓ Change available", true);
    $("newUsernameInput").disabled = false; $("saveUsernameBtn").disabled = false;
  }
}

// ============================================================
// THEMES
// ============================================================
const THEMES = {
  "Story Network": {
    "--accent":"#1a8fff","--accent-hover":"#0070dd",
    "--accent-glow":"rgba(26,143,255,0.38)","--accent-light":"rgba(26,143,255,0.13)",
    "--bg-darkest":"#060a10","--bg-dark":"#0c1420","--bg-mid":"#101d30",
    "--bg-light":"#152540","--bg-lighter":"#1a2e50","--bg-input":"#1f3660",
    "--text-primary":"#e3eeff","--text-muted":"#7a9cc0","--text-dim":"#3a5a80",
    "--border":"rgba(26,143,255,0.08)","--border-hover":"rgba(26,143,255,0.18)",
    "--msg-mine":"#1a3a6e","--msg-other":"#162035",
    preview: { sidebar:"#101d30", chat:"#152540", accent:"#1a8fff" }
  },
  "Dark": {
    "--accent":"#5865f2","--accent-hover":"#4752c4",
    "--accent-glow":"rgba(88,101,242,0.35)","--accent-light":"rgba(88,101,242,0.12)",
    "--bg-darkest":"#0e0f11","--bg-dark":"#161719","--bg-mid":"#1e2024",
    "--bg-light":"#26282d","--bg-lighter":"#2e3136","--bg-input":"#383b42",
    "--text-primary":"#e3e5e8","--text-muted":"#949ba4","--text-dim":"#55585f",
    "--border":"rgba(255,255,255,0.06)","--border-hover":"rgba(255,255,255,0.12)",
    "--msg-mine":"#2b3175","--msg-other":"#1e2024",
    preview: { sidebar:"#1e2024", chat:"#26282d", accent:"#5865f2" }
  },
  "Green": {
    "--accent":"#22c55e","--accent-hover":"#16a34a",
    "--accent-glow":"rgba(34,197,94,0.35)","--accent-light":"rgba(34,197,94,0.12)",
    "--bg-darkest":"#071410","--bg-dark":"#0d1f18","--bg-mid":"#122b21",
    "--bg-light":"#183829","--bg-lighter":"#1e4533","--bg-input":"#24523d",
    "--text-primary":"#d1fae5","--text-muted":"#86efac","--text-dim":"#2d6b45",
    "--border":"rgba(34,197,94,0.1)","--border-hover":"rgba(34,197,94,0.2)",
    "--msg-mine":"#1a4d30","--msg-other":"#122b21",
    preview: { sidebar:"#122b21", chat:"#183829", accent:"#22c55e" }
  },
  "Pink": {
    "--accent":"#f472b6","--accent-hover":"#ec4899",
    "--accent-glow":"rgba(244,114,182,0.35)","--accent-light":"rgba(244,114,182,0.12)",
    "--bg-darkest":"#150a10","--bg-dark":"#1e0f18","--bg-mid":"#281420",
    "--bg-light":"#321928","--bg-lighter":"#3c1e30","--bg-input":"#48243a",
    "--text-primary":"#fce7f3","--text-muted":"#f9a8d4","--text-dim":"#7a3555",
    "--border":"rgba(244,114,182,0.1)","--border-hover":"rgba(244,114,182,0.2)",
    "--msg-mine":"#4a1a35","--msg-other":"#281420",
    preview: { sidebar:"#281420", chat:"#321928", accent:"#f472b6" }
  },
  "Orange": {
    "--accent":"#f97316","--accent-hover":"#ea580c",
    "--accent-glow":"rgba(249,115,22,0.35)","--accent-light":"rgba(249,115,22,0.12)",
    "--bg-darkest":"#150d05","--bg-dark":"#20130a","--bg-mid":"#2d1c0f",
    "--bg-light":"#3a2514","--bg-lighter":"#472e19","--bg-input":"#54371e",
    "--text-primary":"#ffedd5","--text-muted":"#fdba74","--text-dim":"#7c4a1e",
    "--border":"rgba(249,115,22,0.1)","--border-hover":"rgba(249,115,22,0.2)",
    "--msg-mine":"#5a2a0a","--msg-other":"#2d1c0f",
    preview: { sidebar:"#2d1c0f", chat:"#3a2514", accent:"#f97316" }
  },
  "Purple": {
    "--accent":"#a855f7","--accent-hover":"#9333ea",
    "--accent-glow":"rgba(168,85,247,0.35)","--accent-light":"rgba(168,85,247,0.12)",
    "--bg-darkest":"#0d0714","--bg-dark":"#140d1f","--bg-mid":"#1c142b",
    "--bg-light":"#241b38","--bg-lighter":"#2c2245","--bg-input":"#342952",
    "--text-primary":"#f3e8ff","--text-muted":"#d8b4fe","--text-dim":"#6b3fa0",
    "--border":"rgba(168,85,247,0.1)","--border-hover":"rgba(168,85,247,0.2)",
    "--msg-mine":"#3a1a5e","--msg-other":"#1c142b",
    preview: { sidebar:"#1c142b", chat:"#241b38", accent:"#a855f7" }
  },
  "Red": {
    "--accent":"#ef4444","--accent-hover":"#dc2626",
    "--accent-glow":"rgba(239,68,68,0.35)","--accent-light":"rgba(239,68,68,0.12)",
    "--bg-darkest":"#150508","--bg-dark":"#200810","--bg-mid":"#2d0d18",
    "--bg-light":"#3a1020","--bg-lighter":"#47142a","--bg-input":"#541834",
    "--text-primary":"#fee2e2","--text-muted":"#fca5a5","--text-dim":"#7f2f3f",
    "--border":"rgba(239,68,68,0.1)","--border-hover":"rgba(239,68,68,0.2)",
    "--msg-mine":"#5a1020","--msg-other":"#2d0d18",
    preview: { sidebar:"#2d0d18", chat:"#3a1020", accent:"#ef4444" }
  },
  "Cyan": {
    "--accent":"#06b6d4","--accent-hover":"#0891b2",
    "--accent-glow":"rgba(6,182,212,0.35)","--accent-light":"rgba(6,182,212,0.12)",
    "--bg-darkest":"#050a10","--bg-dark":"#0a1520","--bg-mid":"#102030",
    "--bg-light":"#152840","--bg-lighter":"#1a3050","--bg-input":"#1f3860",
    "--text-primary":"#e0f7ff","--text-muted":"#67e8f9","--text-dim":"#2a6080",
    "--border":"rgba(6,182,212,0.1)","--border-hover":"rgba(6,182,212,0.2)",
    "--msg-mine":"#0a3a4e","--msg-other":"#102030",
    preview: { sidebar:"#102030", chat:"#152840", accent:"#06b6d4" }
  },
  "Yellow": {
    "--accent":"#fbbf24","--accent-hover":"#f59e0b",
    "--accent-glow":"rgba(251,191,36,0.35)","--accent-light":"rgba(251,191,36,0.12)",
    "--bg-darkest":"#0e0a00","--bg-dark":"#180f00","--bg-mid":"#221500",
    "--bg-light":"#2c1b00","--bg-lighter":"#362200","--bg-input":"#422900",
    "--text-primary":"#fef3c7","--text-muted":"#fcd34d","--text-dim":"#78560a",
    "--border":"rgba(251,191,36,0.1)","--border-hover":"rgba(251,191,36,0.2)",
    "--msg-mine":"#4a2800","--msg-other":"#221500",
    preview: { sidebar:"#221500", chat:"#2c1b00", accent:"#fbbf24" }
  },
  "Light": {
    "--accent":"#2563eb","--accent-hover":"#1d4ed8",
    "--accent-glow":"rgba(37,99,235,0.25)","--accent-light":"rgba(37,99,235,0.1)",
    "--bg-darkest":"#e2e8f0","--bg-dark":"#f1f5f9","--bg-mid":"#f8fafc",
    "--bg-light":"#ffffff","--bg-lighter":"#f1f5f9","--bg-input":"#e2e8f0",
    "--text-primary":"#0f172a","--text-muted":"#475569","--text-dim":"#94a3b8",
    "--border":"rgba(0,0,0,0.08)","--border-hover":"rgba(0,0,0,0.15)",
    "--msg-mine":"#dbeafe","--msg-other":"#f1f5f9",
    preview: { sidebar:"#f8fafc", chat:"#ffffff", accent:"#2563eb" }
  }
};

function buildThemeGrid() {
  const grid = $("themeGrid"); grid.innerHTML = "";
  const saved = localStorage.getItem("snc_theme") || "Story Network";
  Object.entries(THEMES).forEach(([name, t]) => {
    const card = document.createElement("div"); card.className = "theme-card" + (name === saved ? " active" : "");
    card.innerHTML = `
      <div class="theme-preview" style="background:${t.preview.chat};">
        <div class="theme-preview-sidebar" style="background:${t.preview.sidebar};"></div>
        <div class="theme-preview-chat" style="background:${t.preview.chat};">
          <div class="theme-preview-bubble" style="background:${t.preview.accent};"></div>
          <div class="theme-preview-bubble r" style="background:${t.preview.sidebar};"></div>
        </div>
      </div>
      <div class="theme-card-name">${name}</div>
    `;
    card.addEventListener("click", () => {
      applyTheme(name);
      document.querySelectorAll(".theme-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
    });
    grid.appendChild(card);
  });
}

function applyTheme(name) {
  const t = THEMES[name]; if (!t) return;
  const root = document.documentElement;
  Object.entries(t).forEach(([k, v]) => { if (k !== "preview") root.style.setProperty(k, v); });
  localStorage.setItem("snc_theme", name);
}

function loadTheme() {
  const saved = localStorage.getItem("snc_theme") || "Story Network";
  applyTheme(saved);
  const size = localStorage.getItem("snc_textsize") || "14px";
  applyTextSize(size);
}

// ========== TEXT SIZE ==========
function buildSizeRow() {
  const row = $("sizeRow"); row.innerHTML = "";
  const saved = localStorage.getItem("snc_textsize") || "14px";
  ["12px","14px","16px","18px"].forEach(size => {
    const btn = document.createElement("button");
    btn.className = "size-btn" + (saved === size ? " active" : "");
    btn.textContent = size;
    btn.addEventListener("click", () => {
      applyTextSize(size); localStorage.setItem("snc_textsize", size);
      row.querySelectorAll(".size-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
    row.appendChild(btn);
  });
}
function applyTextSize(size) { $("chatbox").style.fontSize = size; }

// ============================================================
// CONFIRM DIALOG
// ============================================================
function showConfirm(icon, title, msg) {
  return new Promise(resolve => {
    const d = $("confirmDialog");
    $("confirmIcon").textContent = icon;
    $("confirmTitle").textContent = title;
    $("confirmMsg").textContent = msg;
    d.style.display = "flex";
    const ok = $("confirmOk"), can = $("confirmCancel");
    const newOk = ok.cloneNode(true), newCan = can.cloneNode(true);
    ok.parentNode.replaceChild(newOk, ok); can.parentNode.replaceChild(newCan, can);
    const done = r => { d.style.display = "none"; resolve(r); };
    newOk.addEventListener("click", () => done(true));
    newCan.addEventListener("click", () => done(false));
  });
}
