/* ProofOfProcess MVP frontend — local-first, no build step */
const LS_KEY = "pop_projects_v1";
const $ = (id) => document.getElementById(id);

let projects = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
let currentId = Object.keys(projects)[0] || null;
if (!currentId) {
  currentId = "p_" + Math.random().toString(36).slice(2, 8);
  projects[currentId] = newProject();
  save();
}
function newProject() { return { id: currentId || "p_new", title: "", prompt: "", code_name: "", outline: "", text: "", sources: [], ai: { used: false, purpose: "", accepted: "", rejected: "" }, reflection: "", snapshots: [], milestones: [] }; }
function cur() { return projects[currentId]; }
function save() { localStorage.setItem(LS_KEY, JSON.stringify(projects)); }
function wc(s) { return (s.trim().match(/\S+/g) || []).length; }

async function sha256hex(str) {
  if (crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  return "FALLBACK-" + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

async function takeSnapshot(trigger, note) {
  const p = cur();
  const text = $("f-text").value;
  const last = p.snapshots[p.snapshots.length - 1];
  if (last && last.text === text) return null;
  const prev_hash = last ? last.hash : "GENESIS";
  const created_at = new Date().toISOString();
  const hash = await sha256hex(prev_hash + "|" + created_at + "|" + text);
  const snap = { seq: p.snapshots.length, created_at, trigger, text, word_count: wc(text), prev_hash, hash, note: note || "" };
  p.snapshots.push(snap);
  if (last) {
    const cls = classify(last.text, text);
    if (cls === "structural") p.milestones.push({ type: "paragraph_reorganized", kind: "structural", note: "Substantial reorganization detected", seq: snap.seq });
    else if (cls === "sentence_revision") p.milestones.push({ type: "claim_revised", kind: "sentence_revision", note: "Sentence-level revision", seq: snap.seq });
  } else { p.milestones.push({ type: "outline_created", kind: "outline", note: "First snapshot", seq: 0 }); }
  if (hash.startsWith("FALLBACK")) $("chain-state").textContent = "chain: WARNING non-secure hash";
  save(); renderTimeline(); updateCounts();
  $("save-state").textContent = "Saved snapshot #" + snap.seq + " • " + trigger + " • chained ✓";
  return snap;
}

function classify(a, b) {
  const wa = a.split(/\s+/).filter(Boolean), wb = b.split(/\s+/).filter(Boolean);
  const changed = Math.abs(wb.length - wa.length) + editHint(a, b);
  const headingChange = /^#|^[A-Z].*:$/.test(b.slice(0, 200)) && b.slice(0, 200) !== a.slice(0, 200);
  if (wb.length - (wa.length || 0) > 150 || changed > 150 || headingChange || movedParagraph(a, b)) return "structural";
  if (changed >= 20) return "sentence_revision";
  return "surface";
}
function editHint(a, b) { const n = Math.min(a.length, b.length, 2000); let d = 0; for (let i = 0; i < n; i += 50) if (a[i] !== b[i]) d += 10; return d + Math.abs(a.length - b.length) / 5; }
function movedParagraph(a, b) {
  const pa = a.split(/\n+/).map(s => s.trim()).filter(s => s.length > 40);
  const pb = b.split(/\n+/).map(s => s.trim()).filter(s => s.length > 40);
  if (pa.length < 2 || pb.length < 2) return false;
  const setB = new Set(pb); const same = pa.filter(p => setB.has(p)).length;
  if (same < 2) return false;
  const idx = pa.filter(p => setB.has(p)).map(p => pb.indexOf(p));
  for (let i = 1; i < idx.length; i++) if (idx[i] < idx[i - 1]) return true;
  return false;
}
function diffWords(a, b) {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/);
  const N = Math.min(A.length, 1500), M = Math.min(B.length, 1500);
  const aT = A.slice(0, N), bT = B.slice(0, M);
  const dp = Array.from({ length: N + 1 }, () => new Uint16Array(M + 1));
  for (let i = N - 1; i >= 0; i--) for (let j = M - 1; j >= 0; j--)
    dp[i][j] = aT[i] === bT[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0, html = ""; const esc = s => s.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
  while (i < N && j < M) {
    if (aT[i] === bT[j]) { html += esc(aT[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { html += '<span class="del">' + esc(aT[i]) + "</span>"; i++; }
    else { html += '<span class="add">' + esc(bT[j]) + "</span>"; j++; }
  }
  while (i < N) { html += '<span class="del">' + esc(aT[i++]) + "</span>"; }
  while (j < M) { html += '<span class="add">' + esc(bT[j++]) + "</span>"; }
  if (A.length > N || B.length > M) html += "<p><em>…truncated for display</em></p>";
  return html;
}

function renderTimeline() {
  const p = cur(); const tl = $("timeline"); tl.innerHTML = "";
  p.snapshots.forEach((s, idx) => {
    const li = document.createElement("li");
    li.textContent = "#" + s.seq + " • " + new Date(s.created_at).toLocaleString() + " • " + s.trigger + " • " + s.word_count + " words • " + s.hash.slice(0, 8);
    li.onclick = () => {
      document.querySelectorAll("#timeline li").forEach(x => x.classList.remove("sel"));
      li.classList.add("sel");
      const prev = idx > 0 ? p.snapshots[idx - 1].text : "";
      $("diff-out").innerHTML = diffWords(prev, s.text) || "<em>(empty)</em>";
    };
    tl.appendChild(li);
  });
  const sl = $("source-list"); sl.innerHTML = "";
  p.sources.forEach((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = "<a href='" + s.url + "' target='_blank' rel='noopener'>" + (s.title || s.url) + "</a> — " + (s.claim || "");
    const b = document.createElement("button"); b.textContent = "Remove"; b.onclick = () => { p.sources.splice(i, 1); save(); renderTimeline(); };
    li.appendChild(b); sl.appendChild(li);
  });
  $("snap-count").textContent = p.snapshots.length;
}
function updateCounts() { $("f-wordcount").value = wc($("f-text").value) + " words"; const p = cur(); const last = p.snapshots[p.snapshots.length - 1]; $("chain-state").textContent = "chain: " + (last ? "#" + last.seq + " " + last.hash.slice(0, 12) : "GENESIS"); }

function receiptSummary(p) {
  const snaps = p.snapshots; const structural = p.milestones.filter(m => m.kind === "structural").length;
  return { snapshots: snaps.length, sources: p.sources.length, structural, words: snaps.length ? snaps[snaps.length - 1].word_count : wc(p.text), ai: p.ai.used ? ("AI used: " + (p.ai.purpose || "yes") + "; accepted/edited: " + (p.ai.accepted || "—") + "; rejected: " + (p.ai.rejected || "—")) : "No AI use disclosed", };
}
function renderReceipt(p) {
  const s = receiptSummary(p); const dur = p.snapshots.length >= 2 ? Math.round((new Date(p.snapshots[p.snapshots.length - 1].created_at) - new Date(p.snapshots[0].created_at)) / 60000) + " min span" : "single session"; $("receipt-preview").innerHTML = "<h3>" + escHtml(p.title || "Untitled") + "</h3>" + "<p><strong>Code:</strong> " + escHtml(p.code_name || "—") + " • <strong>Prompt:</strong> " + escHtml(p.prompt || "—") + "</p>" + "<ul><li>Outline created + " + s.snapshots + " snapshots over " + dur + "</li>" + "<li>" + s.sources + " sources reviewed</li>" + "<li>" + s.structural + " substantial reorganizations</li>" + "<li>" + escHtml(s.ai) + "</li>" + "<li>Reflection: " + escHtml(p.reflection || "(missing — add before export)") + "“</li></ul>" + "<p><strong>Final:</strong> " + s.words + " words. Hash head: " + (p.snapshots.length ? p.snapshots[p.snapshots.length - 1].hash.slice(0, 16) : "none") + "</p>" + renderSources(p) + renderMilestones(p);
}
function renderSources(p) { if (!p.sources.length) return "<p><em>No sources linked.</em></p>"; return "<h4>Sources</h4><ul>" + p.sources.map(x => "<li><a href='" + x.url + "' target='_blank' rel='noopener'>" + escHtml(x.title || x.url) + "</a> — " + escHtml(x.claim || "") + "</li>").join("") + "</ul>"; }
function renderMilestones(p) { if (!p.milestones.length) return ""; return "<h4>Milestones</h4><ul>" + p.milestones.map(m => "<li>#" + m.seq + " " + escHtml(m.type) + " — " + escHtml(m.note || "") + "</li>").join("") + "</ul>"; }
function escHtml(s) { return (s || "").replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">"); }

const views = { "nav-write": "view-write", "nav-timeline": "view-timeline", "nav-receipt": "view-receipt", "nav-teacher": "view-teacher", "nav-parent": "view-parent", "nav-config": "view-config" };
for (const [b, v] of Object.entries(views)) $(b).onclick = () => {
  for (const [bb, vv] of Object.entries(views)) { $(bb).classList.remove("active"); $(vv).hidden = true; }
  $(b).classList.add("active"); $(v).hidden = false;
  if (v === "view-receipt") renderReceipt(collectForm());
  if (v === "view-timeline") renderTimeline();
  if (v === "view-parent") loadParentConfig();
  if (v === "view-config") loadBgAgentConfig();
};
// initialize UI state
for (const [b, v] of Object.entries(views)) $(v).hidden = true;
$("nav-write").classList.add("active"); $("view-write").hidden = false;

function collectForm() {
  const p = cur(); p.title = $("f-title").value; p.prompt = $("f-prompt").value; p.code_name = $("f-code").value;
  p.outline = $("f-outline").value; p.text = $("f-text").value;
  p.ai = { used: $("ai-used").checked, purpose: $("ai-purpose").value, accepted: $("ai-accepted").value, rejected: $("ai-rejected").value };
  p.reflection = $("f-reflection").value; save(); return p;
}
function fillForm() {
  const p = cur(); $("f-title").value = p.title || ""; $("f-prompt").value = p.prompt || ""; $("f-code").value = p.code_name || "";
  $("f-outline").value = p.outline || ""; $("f-text").value = p.text || "";
  $("ai-used").checked = !!p.ai.used; $("ai-purpose").value = p.ai.purpose || ""; $("ai-accepted").value = p.ai.accepted || ""; $("ai-rejected").value = p.ai.rejected || "";
  $("f-reflection").value = p.reflection || ""; updateCounts(); renderTimeline();
}
// events
$("f-text").addEventListener("input", () => { collectForm(); updateCounts(); });
$("f-text").addEventListener("paste", (e) => { const t = (e.clipboardData || window.clipboardData).getData("text") || ""; if (t.length > 50) setTimeout(() => takeSnapshot("paste>50"), 300); });
["f-title", "f-prompt", "f-code", "f-outline", "ai-used", "ai-purpose", "ai-accepted", "ai-rejected", "f-reflection"].forEach(id => $(id).addEventListener("input", collectForm));
$("btn-snap").onclick = () => { collectForm(); takeSnapshot("manual"); };
$("btn-milestone").onclick = async () => { const note = prompt("Milestone note (e.g. Thesis changed after Source 3):"); if (note === null) return; collectForm(); const s = await takeSnapshot("manual-milestone", note); if (s) { cur().milestones.push({ type: "custom", kind: "custom", note, seq: s.seq }); save(); } };
$("btn-add-source").onclick = async () => { const t = $("s-title").value.trim(), u = $("s-url").value.trim(), c = $("s-claim").value.trim(); if (!u) { alert("URL required"); return; } collectForm(); cur().sources.push({ title: t, url: u, claim: c }); save(); $("s-title").value = $("s-url").value = $("s-claim").value = ""; await takeSnapshot("source_added", "Added source: " + (t || u)); renderTimeline(); };
$("btn-verify").onclick = async () => { let prev = "GENESIS"; for (const s of cur().snapshots) { const h = await sha256hex(prev + "|" + s.created_at + "|" + s.text); if (h !== s.hash) { $("verify-out").textContent = "BROKEN at #" + s.seq; return; } prev = s.hash; } $("verify-out").textContent = "verified ✓ " + cur().snapshots.length + " snapshots"; };
$("btn-generate").onclick = async () => { const p = collectForm(); if (!p.reflection.trim()) { alert("Add final reflection before export."); return; } if (!p.snapshots.length) await takeSnapshot("manual", "initial"); const body = { title: p.title || "Untitled", assignment_prompt: p.prompt, code_name: p.code_name, snapshots: p.snapshots, milestones: p.milestones, sources: p.sources, ai_disclosure: { used: p.ai.used, purpose: p.ai.purpose, accepted: p.ai.accepted, rejected: p.ai.rejected }, reflection: p.reflection }; const res = await fetch("/api/receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await res.json(); if (!res.ok) { alert("Error: " + (j.detail || JSON.stringify(j))); return; } const link = location.origin + "/?view=receipt&id=" + j.receipt_id; $("share-box").innerHTML = "Shareable teacher link: <a href='" + link + "'>" + link + "</a> (id: " + j.receipt_id + ")<br>Verification: " + (j.verification.ok ? "verified ✓" : "BROKEN") + " • " + j.summary.snapshots + " snapshots, " + j.summary.structural_changes + " structural"; $("t-id").value = j.receipt_id;
};

// parent view
let p0 = Date.now();
$("btn-load-parent").onclick = async () => { p0 = Date.now(); const code = $("parent-code").value.trim(); if (!code) { alert("Enter student code"); return; } const res = await fetch("/api/reports/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ student_code: code, period_start: "2026-10-12T00:00:00Z", period_end: "2026-10-19T00:00:00Z" }) }); const j = await res.json(); if (!res.ok) { alert("Error: " + (j.detail || JSON.stringify(j))); return; } const r = j.report; $("#parent-student-code").textContent = r.student_code; $("#parent-alert").hidden = true; $("#parent-alarms").innerHTML = ""; if (r.early_alarms && r.early_alarms.length) { $("#parent-alert").hidden = false; $("#parent-alert").className = "alert-banner"; r.early_alarms.forEach(a => { const li = document.createElement("li"); li.textContent = a; $("#parent-alarms").appendChild(li); }); } else { $("#parent-alarms").innerHTML = "<em>No alarms.</em>"; } $("#parent-subject").value = "all"; refreshParentReport(); $("#parent-card-loading").hidden = true; $("#parent-card-report").hidden = false; };
function refreshParentReport() { const sub = $("parent-subject").value; // simple static display using report data already loaded // in production would re-fetch or use cached report; for demo just show alarms + basics } $("#parent-subject").addEventListener("change", () => { /* could re-filter */ });
$("parent-on-time-threshold").addEventListener("change", () => { refreshParentReport(); });
$("parent-session-threshold").addEventListener("change", () => { refreshParentReport(); });

// bg agent config
function loadParentConfig() {
  fetch("/api/config").then(r => r.json()).then(d => {
    $("config-student-code").value = d.student_code || "";
    $("config-parent-email").value = d.parent_email || "";
    $("config-cadence").value = d.cadence || "weekly";
    $("config-schoology").checked = d.lms_schoology_connected;
    $("config-classroom").checked = d.lms_classroom_connected;
    updateConnectStatus();
  });
}
function updateConnectStatus() { const sc = $("config-schoology"); const cc = $("config-classroom"); const si_sc = $(".status-indicator.status-disconnected"); const si_cc = $(".status-indicator.status-disconnected"); // simple toggle logic document.querySelectorAll(".status-indicator").forEach(el => el.classList.remove("status-connected","status-disconnected")); if (sc.checked) { const el = document.querySelector('.status-indicator.status-disconnected'); if(el) el.classList.add("status-connected"); } if (cc.checked) { const el = document.querySelector('.status-indicator.status-disconnected'); if(el) el.classList.add("status-connected"); } }
function saveBgConfig() { const student = $("config-student-code").value.trim(); const email = $("config-parent-email").value.trim(); const cadence = $("config-cadence").value; const body = JSON.stringify({ student_code: student || "English-3B-07", parent_email: email || "parent@example.com", cadence }); fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body }).then(r => r.json()).then(d => { $("config-status").textContent = "Config saved (" + cadence + ")"; $("config-start-btn").textContent = "Saved"; // Update status indicators if (d.config.lms_schoology_connected) { $("#schoology-status-dot").removeClass("status-disconnected").addClass("status-connected"); $("#schoology-status-text").text("Connected"); } if (d.config.lms_classroom_connected) { $("#classroom-status-dot").removeClass("status-disconnected").addClass("status-connected"); $("#classroom-status-text").text("Connected"); } }); }

// deep link ?view=receipt&id=xxx
fillForm();


/* ===== Schoology OAuth Flow ===== */
function connectSchoology() {
  var clientId = $("#schoology-client-id").val();
  var redirectUri = $("#schoology-redirect-uri").val();
  var scope = $("#schoology-scope").val();
  
  if (!clientId || !redirectUri) {
    alert("Enter Schoology Client ID and Redirect URI");
    return;
  }
  
  // For demo purposes, just show the auth URL that would be used
  var authUrl = "https://login.schoology.com/oauth/authorize?" +
    "client_id=" + encodeURIComponent(clientId) +
    "&redirect_uri=" + encodeURIComponent(redirectUri) +
    "&scope=" + encodeURIComponent(scope) +
    "&state=proofprocess_demo" +
    "&response_type=code";
  
  // Show the auth URL and provide instructions
  var message = "Schoology OAuth Configuration:\n\n" + authUrl + "\n\n" +
    "1. Open this URL in your browser\n" +
    "2. Authorize the application\n" +
    "3. The system will redirect back with a code\n\n" +
    "For full integration, register a Schoology API app at developers.schoology.com.\n" +
    "Using the test credentials above will enable demo mode.";
  
  alert(message);
}

/* ===== Google Classroom Connection ===== */
function connectClassroom() {
  var clientId = $("#classroom-client-id").value.trim();
  var clientSecret = $("#classroom-client-secret").value.trim();
  
  if (!clientId || !clientSecret) {
    alert("Enter Google Classroom Client ID and Client Secret");
    return;
  }
  
  // Google OAuth would follow similar pattern
  // For v1, we'll show a simplified approach
  alert("Google Classroom OAuth flow requires backend setup. Use Schoology connection for demo, or configure full OAuth for both LMS platforms.");
  
  // Similar pattern to Schoology could be implemented:
  // 1. Build Google OAuth URL with client_id, redirect_uri, scope=classroom.readonly
  // 2. Open in new window
  // 3. Listen for redirect with authorization code
  // 4. Exchange code for token
}

/* Initialize OAuth connections on page load */
$(document).ready(function() {
  // Auto-check saved config status
  checkSavedConfig();
});

function checkSavedConfig() {
  // Read config from server to update status indicators
  $.get("/api/config", function(d) {
    if (d.config && d.config.lms_schoology_connected) {
      $("#schoology-status-dot").removeClass("status-disconnected").addClass("status-connected");
      $("#schoology-status-text").text("Connected");
    }
    if (d.config && d.config.lms_classroom_connected) {
      $("#classroom-status-dot").removeClass("status-disconnected").addClass("status-connected");
      $("#classroom-status-text").text("Connected");
    }
  }).fail(function() {
    // If API call fails, leave status as-is
  });
});

function startDaemon() {
  // The background agent is a local Python process
  // This function provides the command and instructions
  var command = "python -m bg_agent.scheduler --cadence weekly";
  var message = "To start the background agent, run the following command in your terminal or command prompt:

" + command + "

This will begin collecting homework data and sending weekly reports to parents.";
  if (confirm(message)) {
    // In a full deployment, this could trigger a backend endpoint
    // to start the daemon process on the student's machine
    alert("Please run the command above in a terminal/command prompt on the student's laptop.");
  }
}


function showTab(tabId) {
  // Hide all sections
  var sections = ['view-write','view-timeline','view-receipt','view-teacher','view-parent','view-config'];
  for (var i = 0; i < sections.length; i++) {
    document.getElementById(sections[i]).style.display = 'none';
  }
  // Remove active class from all buttons
  var buttons = ['nav-write','nav-timeline','nav-receipt','nav-teacher','nav-parent','nav-config'];
  for (var i = 0; i < buttons.length; i++) {
    document.getElementById(buttons[i]).classList.remove('active');
  }
  // Show the selected section and add active class
  document.getElementById(tabId).style.display = 'block';
  event.target.classList.add('active');
}

(function () { const q = new URLSearchParams(location.search); if (q.get("view") === "receipt" && q.get("id")) { $("t-id").value = q.get("id"); document.getElementById("nav-teacher").click(); $("btn-load").click(); } if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {}); })();