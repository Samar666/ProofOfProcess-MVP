/* ProofOfProcess — frontend (no build step).
   Local-first snapshots + hash chain, receipts for teachers, read-only parent digests. */
"use strict";

const el = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const LS_KEY = "pop_project_v3";
const nowISO = () => new Date().toISOString();

/* ---------------- little helpers ---------------- */
function h(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}
function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }
function words(text) { return (text || "").trim().match(/\S+/g) || []; }
function countWords(text) { return words(text).length; }
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function toast(message, kind = "") {
  const box = el("toasts");
  if (!box) return;
  const t = h("div", { class: "toast " + kind, text: message });
  box.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 220); }, 3400);
}
function safeHref(url) {
  try {
    const u = new URL(url, location.origin);
    return (u.protocol === "http:" || u.protocol === "https:") ? u.href : "#";
  } catch (_) { return "#"; }
}
function debounce(fn, ms) {
  let handle;
  return (...args) => { clearTimeout(handle); handle = setTimeout(() => fn(...args), ms); };
}

/* ---------------- state ---------------- */
function blankProject() {
  return {
    title: "", prompt: "", code: "English-3B-07", assignment_id: "",
    outline: "", text: "",
    sources: [],
    ai: { used: false, purpose: "", accepted: "", rejected: "" },
    reflection: "",
    snapshots: [], milestones: [],
  };
}
function loadProject() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...blankProject(), ...parsed, ai: { ...blankProject().ai, ...(parsed.ai || {}) } };
    }
  } catch (_) { /* ignore corrupt local state */ }
  return blankProject();
}
let project = loadProject();
const persist = debounce(() => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(project)); } catch (_) { /* storage full/blocked */ }
}, 250);

let lmsConnected = { schoology: false };
let authState = { authenticated: false, user: null, providers: {} };
let feedbackId = "";

/* ---------------- hashing ---------------- */
async function sha256hex(str) {
  if (globalThis.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Non-secure-context fallback. The server will reject this chain, by design.
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  return "FALLBACK-" + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

/* ---------------- snapshots ---------------- */
function classify(prevText, nextText) {
  const a = words(prevText), b = words(nextText);
  const seen = new Set(a);
  let novel = 0;
  for (const w of b) if (!seen.has(w)) novel++;
  const delta = Math.abs(b.length - a.length) + novel;
  const headingChanged = /^#|^[A-Z].*:$/.test((nextText || "").slice(0, 160)) &&
    (nextText || "").slice(0, 160) !== (prevText || "").slice(0, 160);
  if (novel > 150 || delta > 220 || headingChanged) return "structural";
  if (delta >= 20) return "revision";
  return "surface";
}

async function takeSnapshot(trigger, note = "") {
  const text = el("draft").value;
  const last = project.snapshots[project.snapshots.length - 1];
  if (last && last.text === text) return null;
  const prev = last ? last.hash : "GENESIS";
  const createdAt = nowISO();
  const hash = await sha256hex(`${prev}|${createdAt}|${text}`);
  const snap = {
    seq: project.snapshots.length, created_at: createdAt, trigger,
    text, word_count: countWords(text), prev_hash: prev, hash, note,
  };
  project.snapshots.push(snap);
  if (last) {
    const kind = classify(last.text, text);
    if (kind === "structural") {
      project.milestones.push({ type: "substantial_revision", kind: "structural", note: "Substantial reorganization detected", seq: snap.seq });
    } else if (kind === "revision") {
      project.milestones.push({ type: "draft_revised", kind: "sentence_revision", note: "Draft revised", seq: snap.seq });
    }
  } else {
    project.milestones.push({ type: "outline_created", kind: "outline", note: "First checkpoint", seq: snap.seq });
  }
  persist();
  renderAll();
  setSaveState(`Saved checkpoint #${snap.seq} • ${trigger}`);
  if (hash.startsWith("FALLBACK")) toast("Secure hashing unavailable. Use localhost or HTTPS.", "bad");
  return snap;
}

function setSaveState(text) {
  const node = el("save-state");
  if (node) node.textContent = text;
}

function flashButton(button, label, good = false) {
  if (!button) return;
  if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
  clearTimeout(button._flashTimer);
  button.textContent = label;
  button.classList.toggle("is-saved", good);
  button._flashTimer = setTimeout(() => {
    button.textContent = button.dataset.originalLabel;
    button.classList.remove("is-saved");
  }, 1700);
}

async function handleSnapshot() {
  const button = el("snapshot");
  const text = el("draft").value;
  const last = project.snapshots[project.snapshots.length - 1];
  if (last && last.text === text) {
    setSaveState("No changes since the last checkpoint.");
    flashButton(button, "No changes");
    return;
  }
  if (!text.trim()) {
    setSaveState("Write something first.");
    flashButton(button, "Nothing to save");
    return;
  }
  const snap = await takeSnapshot("manual");
  if (snap) flashButton(button, "Saved", true);
}

/* ---------------- form sync ---------------- */
function syncForm() {
  project.title = el("title").value;
  project.prompt = el("prompt").value;
  project.code = el("code").value;
  project.assignment_id = el("assignment") ? el("assignment").value : "";
  project.outline = el("outline").value;
  project.text = el("draft").value;
  project.ai = {
    used: el("ai-used").checked,
    purpose: el("ai-purpose").value,
    accepted: el("ai-accepted").value,
    rejected: el("ai-rejected").value,
  };
  project.reflection = el("reflection").value;
  persist();
  updateStatus();
}
function renderAiFields() {
  const box = el("ai-fields");
  if (box) box.hidden = !el("ai-used").checked;
}

function fillForm() {
  el("title").value = project.title || "";
  el("prompt").value = project.prompt || "";
  el("code").value = project.code || "";
  el("outline").value = project.outline || "";
  el("draft").value = project.text || "";
  el("ai-used").checked = !!project.ai.used;
  renderAiFields();
  el("ai-purpose").value = project.ai.purpose || "";
  el("ai-accepted").value = project.ai.accepted || "";
  el("ai-rejected").value = project.ai.rejected || "";
  el("reflection").value = project.reflection || "";
  renderAll();
  loadAssignments();
}

/* ---------------- assignment context ---------------- */
let assignmentsCache = [];

async function loadAssignments() {
  const code = (el("code").value || "").trim();
  if (!code) {
    assignmentsCache = [];
    renderAssignmentOptions();
    return;
  }
  try {
    const res = await fetch("/api/assignments?code=" + encodeURIComponent(code), { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    assignmentsCache = data.assignments || [];
  } catch (_) { return; }
  renderAssignmentOptions();
}

function renderAssignmentOptions() {
  const select = el("assignment");
  if (!select) return;
  const current = project.assignment_id || select.value || "";
  clear(select);
  select.appendChild(h("option", { value: "", text: "No linked assignment" }));
  for (const item of assignmentsCache) {
    const label = item.course ? item.title + " — " + item.course : item.title;
    const opt = h("option", { value: item.id, text: label });
    opt.dataset.title = item.title || "";
    select.appendChild(opt);
  }
  if (current && !assignmentsCache.some((item) => item.id === current)) {
    select.appendChild(h("option", { value: current, text: "Linked assignment (not in current sync)" }));
  }
  select.value = current;
  const picker = el("assignment-picker");
  if (picker) picker.hidden = !(assignmentsCache.length || project.assignment_id);
}

function chooseAssignment() {
  const select = el("assignment");
  if (!select) return;
  project.assignment_id = select.value;
  const match = assignmentsCache.find((item) => item.id === select.value);
  if (match && !el("title").value.trim()) {
    el("title").value = match.title;
    project.title = match.title;
  }
  persist();
  renderReceiptPreview();
}

/* ---------------- rendering ---------------- */
function updateStatus() {
  if (el("wordcount")) el("wordcount").textContent = countWords(el("draft").value) + " words";
  const last = project.snapshots[project.snapshots.length - 1];
  if (el("chain")) el("chain").textContent = "chain: " + (last ? "#" + last.seq + " " + last.hash.slice(0, 10) : "GENESIS");
  if (el("snap-count")) el("snap-count").textContent = project.snapshots.length + (project.snapshots.length === 1 ? " checkpoint" : " checkpoints");
}

function renderSources() {
  const list = el("source-list");
  if (!list) return;
  clear(list);
  if (!project.sources.length) {
    list.appendChild(h("li", { class: "muted", text: "No sources yet." }));
    return;
  }
  project.sources.forEach((src, index) => {
    const link = h("a", { href: safeHref(src.url), target: "_blank", rel: "noopener noreferrer", text: src.title || src.url || "Source" });
    list.appendChild(h("li", {},
      link,
      h("span", { class: "muted", text: src.claim ? "— " + src.claim : "" }),
      h("button", { class: "remove", type: "button", text: "Remove", onclick: () => {
        project.sources.splice(index, 1);
        persist(); renderSources(); renderReceiptPreview();
      } })
    ));
  });
}

function renderTimeline() {
  const list = el("timeline");
  if (!list) return;
  clear(list);
  if (!project.snapshots.length) {
    list.appendChild(h("li", { class: "muted", text: "No checkpoints yet. Start writing or click “Save checkpoint”." }));
    return;
  }
  project.snapshots.forEach((snap, index) => {
    const li = h("li", {},
      `#${snap.seq} · ${fmtDate(snap.created_at)} · ${snap.trigger} · ${snap.word_count} words · ${snap.hash.slice(0, 8)}`
    );
    li.addEventListener("click", () => {
      $$("#timeline li").forEach((n) => n.classList.remove("sel"));
      li.classList.add("sel");
      renderDiff(index > 0 ? project.snapshots[index - 1].text : "", snap.text);
    });
    list.appendChild(li);
  });
}

function renderDiff(oldText, newText) {
  const out = el("diff");
  if (!out) return;
  const a = oldText.split(/(\s+)/);
  const b = newText.split(/(\s+)/);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1, endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) { endA--; endB--; }

  const frag = document.createDocumentFragment();
  const prefix = a.slice(0, start).join("");
  if (prefix) frag.appendChild(document.createTextNode(prefix));
  const removed = a.slice(start, endA + 1).join("");
  if (removed) frag.appendChild(h("span", { class: "del", text: removed }));
  const added = b.slice(start, endB + 1).join("");
  if (added) frag.appendChild(h("span", { class: "add", text: added }));
  const suffix = a.slice(endA + 1).join("");
  if (suffix) frag.appendChild(document.createTextNode(suffix));

  clear(out);
  if (!frag.childNodes.length) out.textContent = "(no textual change)";
  else out.appendChild(frag);
}

function summaryOf(p) {
  const snaps = p.snapshots;
  const last = snaps[snaps.length - 1];
  const structural = p.milestones.filter((m) => m.kind === "structural").length;
  return {
    snapshots: snaps.length,
    sources: p.sources.length,
    structural,
    words: last ? last.word_count : countWords(el("draft").value),
    head: last ? last.hash.slice(0, 16) : "none",
  };
}

function renderReceiptPreview() {
  const box = el("receipt-preview");
  if (!box) return;
  const p = project;
  const s = summaryOf(p);
  const first = p.snapshots[0], last = p.snapshots[p.snapshots.length - 1];
  const span = first && last && p.snapshots.length >= 2
    ? Math.max(1, Math.round((new Date(last.created_at) - new Date(first.created_at)) / 60000)) + " min span"
    : "single session";
  const aiText = p.ai.used
    ? `AI used: ${p.ai.purpose || "yes"}; kept/edited: ${p.ai.accepted || "—"}; rejected: ${p.ai.rejected || "—"}`
    : "No AI use disclosed";

  clear(box);
  box.appendChild(h("h3", { text: p.title || "Untitled" }));
  box.appendChild(h("p", { class: "receipt-meta", text: `Code: ${p.code || "—"} • Prompt: ${p.prompt || "—"}` }));
  box.appendChild(h("ul", {},
    h("li", { text: `Outline created + ${s.snapshots} checkpoints over ${span}` }),
    h("li", { text: `${s.sources} sources reviewed` }),
    h("li", { text: `${s.structural} substantial reorganizations` }),
    h("li", { text: aiText }),
    h("li", { text: `Reflection: ${p.reflection || "(missing — add before export)"}` })
  ));
  box.appendChild(h("p", { text: `Final: ${s.words} words. Hash head: ${s.head}` }));

  if (p.sources.length) {
    box.appendChild(h("h4", { text: "Sources" }));
    box.appendChild(h("ul", {}, ...p.sources.map((src) =>
      h("li", {}, h("a", { href: safeHref(src.url), target: "_blank", rel: "noopener noreferrer", text: src.title || src.url }), src.claim ? " — " + src.claim : "")
    )));
  }
  if (p.milestones.length) {
    box.appendChild(h("h4", { text: "Milestones" }));
    box.appendChild(h("ul", {}, ...p.milestones.map((m) =>
      h("li", { text: `#${m.seq} ${m.type}${m.note ? " — " + m.note : ""}` })
    )));
  }
}

function renderAll() {
  updateStatus();
  renderSources();
  renderTimeline();
  renderReceiptPreview();
}

/* ---------------- receipt record renderer (teacher + share) ---------------- */
function renderReceiptRecord(rec) {
  const frag = document.createDocumentFragment();
  frag.appendChild(h("h3", { text: rec.title || "Untitled" }));
  frag.appendChild(h("p", { class: "receipt-meta", text: `Code: ${rec.code_name || "—"}` }));
  const verified = rec.verification && rec.verification.ok;
  frag.appendChild(h("span", { class: "verified", text: verified ? "Chain verified" : "Chain could not be verified" }));

  const snaps = rec.snapshots || [];
  const sources = rec.sources || [];
  const milestones = rec.milestones || [];
  const ai = rec.ai_disclosure || {};
  const structural = milestones.filter((m) => ["structural", "paragraph_reorganized", "claim_revised"].includes(m.kind)).length;
  const head = snaps.length ? snaps[snaps.length - 1].hash.slice(0, 16) : "none";

  frag.appendChild(h("ul", {},
    h("li", { text: `${snaps.length} meaningful checkpoints` }),
    h("li", { text: `${sources.length} sources reviewed` }),
    h("li", { text: `${structural} substantial reorganizations` }),
    h("li", { text: ai.used ? `AI disclosed: ${ai.purpose || "yes"}` : "No AI use disclosed" }),
    h("li", { text: `Reflection: ${rec.reflection || "(none)"}` })
  ));
  frag.appendChild(h("p", { text: `Hash head: ${head}` }));

  if (sources.length) {
    frag.appendChild(h("h4", { text: "Sources" }));
    frag.appendChild(h("ul", {}, ...sources.map((src) =>
      h("li", {}, h("a", { href: safeHref(src.url), target: "_blank", rel: "noopener noreferrer", text: src.title || src.url }), src.claim ? " — " + src.claim : "")
    )));
  }
  return frag;
}

/* ---------------- share box ---------------- */
function renderShare(items) {
  const box = el("share-box");
  if (!box) return;
  clear(box);
  for (const item of items) {
    if (item.href) {
      const row = h("div", {},
        h("div", { class: "muted small", text: item.label }),
        h("a", { href: item.href, text: item.text })
      );
      const copy = h("button", { class: "btn btn-ghost copy-btn", type: "button", text: "Copy", onclick: async () => {
        try { await navigator.clipboard.writeText(item.href); toast("Link copied.", "good"); }
        catch (_) { toast("Copy failed. Select the link manually.", "bad"); }
      } });
      row.appendChild(copy);
      box.appendChild(row);
    } else {
      box.appendChild(h("div", {},
        h("div", { class: "muted small", text: item.label }),
        h("code", { text: item.text })
      ));
    }
  }
}

/* ---------------- actions ---------------- */
async function generateReceipt() {
  syncForm();
  if (!project.reflection.trim()) {
    toast("Add a reflection before exporting.", "bad");
    show("write");
    el("reflection").focus();
    return;
  }
  if (!project.snapshots.length) await takeSnapshot("manual", "initial");
  const payload = {
    title: project.title || "Untitled",
    assignment_prompt: project.prompt,
    assignment_id: project.assignment_id || "",
    code_name: project.code,
    snapshots: project.snapshots,
    milestones: project.milestones,
    sources: project.sources,
    ai_disclosure: project.ai,
    reflection: project.reflection,
  };
  try {
    const res = await fetch("/api/receipts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const j = await res.json();
    if (!res.ok) { toast("Could not generate: " + (j.detail || "server error"), "bad"); return; }
    const link = `${location.origin}/?view=teacher&id=${j.receipt_id}`;
    if (el("receipt-id")) el("receipt-id").value = j.receipt_id;
    renderShare([
      { label: "Teacher link", href: link, text: link },
      { label: "Receipt id", text: j.receipt_id },
    ]);
    toast("Receipt generated and chain verified.", "good");
  } catch (_) { toast("Server unreachable.", "bad"); }
}

async function createParentDigest() {
  syncForm();
  const student = (project.code || "").trim() || (el("setting-code") ? el("setting-code").value.trim() : "");
  if (!student) { toast("Add an anonymous code first.", "bad"); show("write"); el("code").focus(); return; }
  try {
    const res = await fetch("/api/digests", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_code: student, period_days: 30 }),
    });
    const j = await res.json();
    if (!res.ok) { toast("Could not create parent link: " + (j.detail || "server error"), "bad"); return; }
    const link = location.origin + j.url;
    renderShare([
      { label: "Parent link (read-only, expires in 30 days)", href: link, text: link },
    ]);
    toast("Parent link created.", "good");
  } catch (_) { toast("Server unreachable.", "bad"); }
}

function parseReceiptId(raw) {
  const text = (raw || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text, location.origin);
    const id = url.searchParams.get("id");
    if (id) return id;
  } catch (_) { /* not a URL */ }
  const match = text.match(/[?&]id=([^&]+)/);
  if (match) return decodeURIComponent(match[1]);
  return text.split("/").pop().split("?")[0];
}

async function openReceipt() {
  const id = parseReceiptId(el("receipt-id").value);
  if (!id) { toast("Enter a receipt id or link.", "bad"); return; }
  try {
    const res = await fetch("/api/receipts/" + encodeURIComponent(id));
    if (!res.ok) { toast("Receipt not found.", "bad"); return; }
    const rec = await res.json();
    feedbackId = id;
    const out = el("teacher-out");
    clear(out);
    out.appendChild(renderReceiptRecord(rec));
    if (el("fb-out")) el("fb-out").textContent = "";
    if (el("note-card")) el("note-card").hidden = false;
    openNoteCard(id);
    toast("Receipt loaded.", "good");
  } catch (_) { toast("Server unreachable.", "bad"); }
}

async function sendFeedback(useful) {
  if (!feedbackId) { toast("Open a receipt first.", "bad"); return; }
  try {
    const res = await fetch("/api/receipts/" + encodeURIComponent(feedbackId) + "/feedback", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ useful }),
    });
    if (!res.ok) { toast("Could not save feedback.", "bad"); return; }
    if (el("fb-out")) el("fb-out").textContent = "Thanks — recorded.";
  } catch (_) { toast("Server unreachable.", "bad"); }
}

function noteAuthState() {
  const authed = !!authState.authenticated;
  if (el("note-body")) el("note-body").disabled = !authed;
  if (el("save-note")) el("save-note").disabled = !authed;
  if (!authed && el("note-status")) el("note-status").textContent = "Sign in as a teacher to add notes.";
}

function renderNotes(notes) {
  const list = el("note-list");
  if (!list) return;
  clear(list);
  if (!notes.length) {
    list.appendChild(h("li", { class: "muted", text: "No notes yet." }));
    return;
  }
  for (const note of notes) {
    list.appendChild(h("li", {},
      h("p", { text: note.body || "" }),
      h("div", { class: "muted small", text: `${note.teacher_name || "Teacher"} · ${fmtDate(note.created_at)}` })
    ));
  }
}

async function openNoteCard(id) {
  if (el("note-body")) el("note-body").value = "";
  if (el("note-status")) el("note-status").textContent = "";
  noteAuthState();
  await loadNotes(id);
}

async function loadNotes(id) {
  if (!id || !authState.authenticated) return;
  try {
    const res = await fetch("/api/receipts/" + encodeURIComponent(id) + "/notes");
    if (res.status === 401) { authState.authenticated = false; renderAuth(); return; }
    if (!res.ok) return;
    const data = await res.json();
    renderNotes(data.notes || []);
    if (el("note-status")) el("note-status").textContent = (data.notes || []).length ? "" : "No notes yet.";
  } catch (_) { /* keep existing notes */ }
}

async function saveNote() {
  if (!feedbackId) { toast("Open a receipt first.", "bad"); return; }
  if (!authState.authenticated) { toast("Sign in as a teacher first.", "bad"); return; }
  const body = (el("note-body").value || "").trim();
  if (!body) { toast("Write a note first.", "bad"); return; }
  try {
    const res = await fetch("/api/receipts/" + encodeURIComponent(feedbackId) + "/notes", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }),
    });
    if (res.status === 401) { toast("Please sign in first.", "bad"); loadAuth(); return; }
    if (!res.ok) { toast("Could not save the note.", "bad"); return; }
    el("note-body").value = "";
    if (el("note-status")) el("note-status").textContent = "Saved.";
    await loadNotes(feedbackId);
    toast("Note saved for the parent view.", "good");
  } catch (_) { toast("Server unreachable.", "bad"); }
}

function parseDigestToken(raw) {
  const text = (raw || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text, location.origin);
    const token = url.searchParams.get("token");
    if (token) return token;
  } catch (_) { /* not a URL */ }
  const match = text.match(/[?&]token=([^&]+)/);
  if (match) return decodeURIComponent(match[1]);
  return text;
}

const PROCESS_STATUS = {
  complete: { label: "Reflected", cls: "is-good" },
  in_progress: { label: "In progress", cls: "is-warn" },
  not_started: { label: "No receipt yet", cls: "" },
  missing: { label: "No receipt · past due", cls: "is-bad" },
};

function fmtDue(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value || "—";
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderDigest(body) {
  const digest = body.digest || {};
  const out = el("parent-out");
  clear(out);

  const card = h("article", { class: "card receipt" });
  card.appendChild(h("h3", { text: `Progress for ${digest.student_code || "student"}` }));
  card.appendChild(h("p", { class: "receipt-meta", text: `${fmtDate(digest.period_start)} → ${fmtDate(digest.period_end)} · generated ${fmtDate(digest.generated_at)}` }));
  card.appendChild(h("span", { class: "chip is-good", text: body.expires_at ? "Read-only · link expires " + fmtDate(body.expires_at) : "Read-only" }));

  if (digest.early_alarms && digest.early_alarms.length) {
    const banner = h("div", { class: "alarm-banner" }, h("strong", { text: "Worth a conversation" }));
    const list = h("ul", { class: "alarm-list" });
    for (const alarm of digest.early_alarms) list.appendChild(h("li", { text: alarm.replace(/_/g, " ") }));
    banner.appendChild(list);
    card.appendChild(banner);
  }

  const metrics = h("div", { class: "metrics" },
    h("div", { class: "metric" }, h("div", { class: "value", text: String(digest.total_receipts || 0) }), h("div", { class: "label", text: "Receipts" })),
    h("div", { class: "metric" }, h("div", { class: "value", text: String(digest.snapshots || 0) }), h("div", { class: "label", text: "Checkpoints" })),
    h("div", { class: "metric" }, h("div", { class: "value", text: String(digest.sources_reviewed || 0) }), h("div", { class: "label", text: "Sources" })),
    h("div", { class: "metric" }, h("div", { class: "value", text: String(digest.structural_changes || 0) }), h("div", { class: "label", text: "Revisions" }))
  );
  card.appendChild(metrics);

  const assignments = digest.assignments || [];
  const total = Number(digest.assignments_total || 0);
  const withReceipt = Number(digest.assignments_with_receipt || 0);
  const pct = Number(digest.coverage_percent || 0);

  if (total) {
    const coverage = h("section", { class: "coverage" },
      h("div", { class: "coverage-head" },
        h("strong", { text: `${withReceipt} of ${total} assignments` }),
        h("span", { class: "muted", text: " have a process receipt" })
      ),
      h("div", { class: "progress" }, h("span", { style: `width:${pct}%` })),
      h("div", { class: "muted small", text: `${digest.assignments_verified || 0} verified · ${total - withReceipt} without a receipt` })
    );
    if (digest.assignments_synced_at) {
      coverage.appendChild(h("div", { class: "muted small", text: "Assignment list last synced " + fmtDate(digest.assignments_synced_at) }));
    }
    card.appendChild(coverage);

    card.appendChild(h("h4", { text: "Assignments" }));
    const table = h("table", { class: "works" },
      h("thead", {}, h("tr", {},
        h("th", { text: "Assignment" }), h("th", { text: "Due" }),
        h("th", { text: "Process" }), h("th", { text: "Evidence" })
      ))
    );
    const tbody = h("tbody");
    for (const item of assignments) {
      const titleCell = h("td");
      if (item.url) {
        titleCell.appendChild(h("a", { href: safeHref(item.url), target: "_blank", rel: "noopener noreferrer", text: item.title || "Untitled" }));
      } else {
        titleCell.appendChild(document.createTextNode(item.title || "Untitled"));
      }
      if (item.course) titleCell.appendChild(h("div", { class: "muted small", text: item.course }));
      const state = PROCESS_STATUS[item.process_status] || PROCESS_STATUS.not_started;
      const evidence = item.has_receipt
        ? `${item.checkpoints} checkpoints · ${item.sources} sources${item.verified ? " · verified" : ""}`
        : "—";
      tbody.appendChild(h("tr", {},
        titleCell,
        h("td", { text: fmtDue(item.due_date) }),
        h("td", {}, h("span", { class: "chip " + state.cls, text: state.label })),
        h("td", { text: evidence })
      ));
    }
    table.appendChild(tbody);
    card.appendChild(h("div", { class: "table-scroll" }, table));
  } else {
    card.appendChild(h("p", { class: "muted", text: "No class assignments are linked yet. Shared receipts still appear below." }));
  }

  if (digest.teacher_notes && digest.teacher_notes.length) {
    card.appendChild(h("h4", { text: "Teacher notes" }));
    const list = h("ul", { class: "note-list" });
    for (const note of digest.teacher_notes) {
      list.appendChild(h("li", {},
        h("p", { text: note.body || "" }),
        h("div", { class: "muted small", text: `${note.teacher_name || "Teacher"} · ${fmtDate(note.created_at)}` })
      ));
    }
    card.appendChild(list);
  }

  if (digest.prompts && digest.prompts.length) {
    card.appendChild(h("h4", { text: "What to ask your child" }));
    const list = h("ul", { class: "prompt-list" });
    for (const prompt of digest.prompts) list.appendChild(h("li", { text: prompt }));
    card.appendChild(list);
  }

  const works = digest.works || [];
  const showWorks = !total || Number(digest.unmatched_receipts || 0) > 0;
  if (showWorks && works.length) {
    if (total) card.appendChild(h("h4", { text: "Other receipts" }));
    const table = h("table", { class: "works" },
      h("thead", {}, h("tr", {},
        h("th", { text: "Work" }), h("th", { text: "Checkpoints" }), h("th", { text: "Sources" }), h("th", { text: "Chain" })
      ))
    );
    const tbody = h("tbody");
    for (const work of works) {
      tbody.appendChild(h("tr", {},
        h("td", { text: work.title || "Untitled" }),
        h("td", { text: String(work.snapshots || 0) }),
        h("td", { text: String(work.sources || 0) }),
        h("td", { text: work.verified ? "verified" : "—" })
      ));
    }
    table.appendChild(tbody);
    card.appendChild(h("div", { class: "table-scroll" }, table));
  }

  card.appendChild(h("p", { class: "muted", text: digest.note || "" }));
  out.appendChild(card);

  const privacy = h("article", { class: "card" },
    h("h3", { text: "What this is" }),
    h("p", { class: "muted", text: "A summary of the process: checkpoints, sourced evidence, revisions, reflection, and teacher notes written for this view. It is not a judgement of who wrote the work, and it never includes raw drafts or keystrokes." })
  );
  out.appendChild(privacy);
}
async function openParent() {
  const token = parseDigestToken(el("parent-token").value);
  if (!token) { toast("Paste a parent link or token.", "bad"); return; }
  try {
    const res = await fetch("/api/digests/" + encodeURIComponent(token));
    if (!res.ok) { toast("This parent link is invalid or expired.", "bad"); return; }
    renderDigest(await res.json());
    if (el("parent-load")) el("parent-load").style.display = "none";
  } catch (_) { toast("Server unreachable.", "bad"); }
}

/* ---------------- auth ---------------- */
function authButton(label, cls, handler) {
  return h("button", { class: cls, text: label, onclick: handler });
}

async function loadAuth() {
  try {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (res.ok) authState = await res.json();
  } catch (_) { /* server down; keep signed-out state */ }
  renderAuth();
}

function renderAuth() {
  const note = el("auth-note");
  const actions = el("auth-actions");
  const body = el("settings-body");
  const pill = el("auth-pill");
  if (!note || !actions) return;
  clear(actions);

  if (authState.authenticated) {
    const user = authState.user || {};
    note.textContent = "Signed in as " + (user.email || "teacher") + ".";
    actions.appendChild(authButton("Sign out", "btn btn-ghost", signOut));
    if (body) body.hidden = false;
    if (pill) { pill.textContent = "Signed in"; pill.className = "chip is-good"; }
    noteAuthState();
    if (feedbackId) loadNotes(feedbackId);
    loadSettings();
    loadSyncTokens();
    return;
  }

  if (body) body.hidden = true;
  if (pill) { pill.textContent = "Signed out"; pill.className = "chip"; }
  noteAuthState();
  const providers = authState.providers || {};
  if (providers.google) {
    note.textContent = "Sign in with your school Google account to manage settings.";
    actions.appendChild(h("a", { class: "btn", href: "/auth/google/start", text: "Sign in with Google" }));
  } else {
    note.textContent = "Google login is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env, then restart.";
  }
  if (providers.dev) {
    actions.appendChild(authButton("Local dev sign-in", "btn btn-ghost", devLogin));
  }
  if (!providers.google && !providers.dev) {
    note.textContent += " No sign-in method is enabled.";
  }
}

async function devLogin() {
  try {
    const res = await fetch("/auth/dev", { method: "POST" });
    if (!res.ok) { toast("Dev sign-in is disabled.", "bad"); return; }
    await loadAuth();
    toast("Signed in locally.", "good");
  } catch (_) { toast("Server unreachable.", "bad"); }
}

async function signOut() {
  try { await fetch("/auth/logout", { method: "POST" }); } catch (_) { /* ignore */ }
  authState = { authenticated: false, user: null, providers: authState.providers || {} };
  renderAuth();
  toast("Signed out.", "good");
}

/* ---------------- settings ---------------- */
async function loadSettings() {
  if (!authState.authenticated) return;
  try {
    const res = await fetch("/api/config");
    if (res.status === 401) { authState.authenticated = false; renderAuth(); return; }
    const d = await res.json();
    const cfg = d.config || d;
    if (el("setting-code")) el("setting-code").value = cfg.student_code || "";
    if (el("sync-code") && !el("sync-code").value) el("sync-code").value = cfg.student_code || "";
    if (el("setting-email")) el("setting-email").value = cfg.parent_email || "";
    if (el("setting-cadence")) el("setting-cadence").value = cfg.cadence || "weekly";
    if (el("setting-schoology-base")) el("setting-schoology-base").value = cfg.schoology_base_url || "";
    if (el("setting-schoology-dir")) el("setting-schoology-dir").value = cfg.schoology_mcp_dir || "";
    lmsConnected.schoology = !!cfg.lms_schoology_connected;
    updateLmsPill();
  } catch (_) { /* server not reachable yet */ }
}

function updateLmsPill() {
  const pill = el("schoology-pill");
  if (!pill) return;
  pill.textContent = lmsConnected.schoology ? "Connected" : "Not connected";
  pill.className = "chip " + (lmsConnected.schoology ? "is-good" : "");
}

async function saveSettings() {
  const body = {
    student_code: el("setting-code").value.trim() || project.code || "English-3B-07",
    parent_email: el("setting-email").value.trim() || "parent@example.com",
    cadence: el("setting-cadence").value,
    lms_schoology_connected: !!lmsConnected.schoology,
    lms_classroom_connected: false,
    schoology_base_url: el("setting-schoology-base").value.trim(),
    schoology_mcp_dir: el("setting-schoology-dir").value.trim(),
  };
  try {
    const res = await fetch("/api/config", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.status === 401) { toast("Please sign in first.", "bad"); loadAuth(); return; }
    if (!res.ok) { toast("Could not save settings.", "bad"); return; }
    if (el("settings-status")) el("settings-status").textContent = "Saved.";
    toast("Settings saved.", "good");
  } catch (_) { toast("Server unreachable.", "bad"); }
}

async function testSchoology() {
  const base = el("setting-schoology-base").value.trim();
  const dir = el("setting-schoology-dir").value.trim();
  if (!base) { toast("Enter the school subdomain first.", "bad"); return; }
  if (el("schoology-status")) el("schoology-status").textContent = "Testing…";
  try {
    const res = await fetch("/api/lms/schoology/test", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_url: base, mcp_dir: dir }),
    });
    if (res.status === 401) { toast("Please sign in first.", "bad"); loadAuth(); return; }
    const j = await res.json();
    if (j.ok) {
      const n = (j.assignments || []).length;
      if (el("schoology-status")) el("schoology-status").textContent = `Connected. ${n} upcoming assignments found.`;
      lmsConnected.schoology = true;
      updateLmsPill();
      saveSettings();
      toast("Schoology connected.", "good");
    } else {
      if (el("schoology-status")) el("schoology-status").textContent = j.error || "Connection failed.";
      toast(j.error || "Connection failed.", "bad");
    }
  } catch (_) {
    if (el("schoology-status")) el("schoology-status").textContent = "Server unreachable.";
  }
}

/* ---------------- sync tokens ---------------- */
async function copyText(text, label = "Copied.") {
  try {
    await navigator.clipboard.writeText(text);
    toast(label, "good");
  } catch (_) {
    toast("Copy failed. Select the text manually.", "bad");
  }
}

function renderSyncTokenOutput(data) {
  const box = el("sync-token-out");
  if (!box) return;
  clear(box);
  const base = (el("setting-schoology-base").value || "").trim() || "your-school";
  const command = [
    "cd ~/proofofprocess_app",
    `POP_SERVER_URL=${location.origin} POP_SYNC_TOKEN=${data.token} SCHOOLOGY_BASE_URL=${base} python3 -m bg_agent.sync`,
  ].join("\n");
  box.appendChild(h("div", { class: "token-box" },
    h("p", { class: "muted small", text: "Copy this token now. It is not shown again." }),
    h("code", { text: data.token }),
    h("p", { class: "muted small", text: "Run this on the student's laptop while signed in to Schoology in Chrome:" }),
    h("pre", { text: command }),
    h("button", { class: "btn btn-ghost", type: "button", text: "Copy command", onclick: () => copyText(command, "Command copied.") })
  ));
}

function renderSyncTokens(tokens) {
  const list = el("sync-token-list");
  if (!list) return;
  clear(list);
  if (!tokens.length) {
    list.appendChild(h("li", { class: "muted", text: "No sync tokens yet." }));
    return;
  }
  for (const token of tokens) {
    list.appendChild(h("li", {},
      h("div", {},
        h("strong", { text: token.student_code }),
        h("div", { class: "muted small", text: "Created " + fmtDate(token.created_at) + " · Last sync " + (token.last_sync_at ? fmtDate(token.last_sync_at) : "never") })
      ),
      h("button", { class: "remove", type: "button", text: "Revoke", onclick: async () => {
        if (!confirm("Revoke this sync token? The student laptop will stop syncing until a new token is created.")) return;
        try {
          const res = await fetch("/api/sync-tokens/" + encodeURIComponent(token.id), { method: "DELETE" });
          if (res.status === 401) { toast("Please sign in first.", "bad"); loadAuth(); return; }
          if (!res.ok) { toast("Could not revoke the token.", "bad"); return; }
          if (el("sync-token-out")) clear(el("sync-token-out"));
          if (el("sync-status")) el("sync-status").textContent = "Token revoked.";
          await loadSyncTokens();
        } catch (_) { toast("Server unreachable.", "bad"); }
      } })
    ));
  }
}

async function loadSyncTokens() {
  if (!authState.authenticated) return;
  try {
    const res = await fetch("/api/sync-tokens", { cache: "no-store" });
    if (res.status === 401) { authState.authenticated = false; renderAuth(); return; }
    if (!res.ok) return;
    const data = await res.json();
    renderSyncTokens(data.tokens || []);
  } catch (_) { /* server not reachable */ }
}

async function createSyncToken() {
  const code = (el("sync-code").value || "").trim() || (el("setting-code").value || "").trim() || project.code;
  if (!code) { toast("Enter an anonymous code first.", "bad"); return; }
  if (el("sync-status")) el("sync-status").textContent = "Creating…";
  try {
    const res = await fetch("/api/sync-tokens", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ student_code: code }),
    });
    if (res.status === 401) { toast("Please sign in first.", "bad"); loadAuth(); return; }
    const data = await res.json();
    if (!res.ok) { toast(data.detail || "Could not create a token.", "bad"); return; }
    if (el("sync-status")) el("sync-status").textContent = "Token created. Copy it now.";
    renderSyncTokenOutput(data);
    await loadSyncTokens();
    toast("Sync token created.", "good");
  } catch (_) { toast("Server unreachable.", "bad"); }
}

/* ---------------- navigation ---------------- */
const VIEWS = ["write", "receipt", "teacher", "parent", "settings"];
function show(view, opts = {}) {
  const updateUrl = opts.updateUrl !== false;
  if (!VIEWS.includes(view)) view = "write";
  $$(".view").forEach((node) => node.classList.toggle("is-active", node.id === "view-" + view));
  $$(".tab").forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle("is-active", active);
    if (active) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
  if (view === "receipt") renderReceiptPreview();
  if (view === "settings") loadAuth();
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set("view", view);
    if (view !== "parent") url.searchParams.delete("token");
    if (view !== "teacher") url.searchParams.delete("id");
    history.replaceState(null, "", url);
  }
}

/* ---------------- auto checkpoints ---------------- */
let lastAutoAt = 0;
async function autoTick() {
  const text = el("draft").value;
  const last = project.snapshots[project.snapshots.length - 1];
  if (!text.trim()) return;
  if (last && last.text === text) return;
  if (Date.now() - lastAutoAt < 120000) return;
  lastAutoAt = Date.now();
  await takeSnapshot("auto");
}

/* ---------------- dev-only integrations ---------------- */
function applyDevMode(params) {
  try {
    if (params.has("dev")) {
      if (params.get("dev") === "1") localStorage.setItem("pop.dev", "1");
      else localStorage.removeItem("pop.dev");
      params.delete("dev");
    }
    const dev = localStorage.getItem("pop.dev") === "1";
    $$("[data-dev-only]").forEach((node) => { node.hidden = !dev; });
    return dev;
  } catch (_) {
    return false;
  }
}

/* ---------------- init ---------------- */
function init() {
  fillForm();

  const onEdit = () => { syncForm(); renderReceiptPreview(); };
  ["title", "prompt", "code", "outline", "draft", "ai-purpose", "ai-accepted", "ai-rejected", "reflection"].forEach((id) => {
    const node = el(id);
    if (node) node.addEventListener("input", onEdit);
  });
  el("ai-used").addEventListener("change", () => { onEdit(); renderAiFields(); });

  const reloadAssignments = debounce(loadAssignments, 450);
  el("code").addEventListener("input", reloadAssignments);
  el("assignment").addEventListener("change", chooseAssignment);

  el("draft").addEventListener("paste", (event) => {
    const pasted = (event.clipboardData || window.clipboardData).getData("text") || "";
    if (pasted.length > 50) setTimeout(() => takeSnapshot("paste"), 300);
  });
  let growthQueued = false;
  el("draft").addEventListener("input", () => {
    if (growthQueued) return;
    const last = project.snapshots[project.snapshots.length - 1];
    const baseline = last ? last.text.length : 0;
    if (el("draft").value.length - baseline >= 200) {
      growthQueued = true;
      setTimeout(async () => { await takeSnapshot("growth"); growthQueued = false; }, 800);
    }
  });

  el("snapshot").addEventListener("click", handleSnapshot);
  el("milestone").addEventListener("click", async () => {
    const note = prompt("Milestone note (e.g. Thesis changed after Source 3):");
    if (note === null) return;
    const snap = await takeSnapshot("milestone", note);
    if (snap) {
      project.milestones.push({ type: "custom", kind: "custom", note, seq: snap.seq });
      persist(); renderReceiptPreview();
    }
  });
  el("add-source").addEventListener("click", async () => {
    const title = el("src-title").value.trim();
    const url = el("src-url").value.trim();
    const claim = el("src-claim").value.trim();
    if (!url) { toast("A source URL is required.", "bad"); return; }
    project.sources.push({ title, url, claim });
    el("src-title").value = el("src-url").value = el("src-claim").value = "";
    persist(); renderSources(); renderReceiptPreview();
    await takeSnapshot("source_added", "Added source: " + (title || url));
  });
  el("verify").addEventListener("click", async () => {
    let prev = "GENESIS";
    for (const snap of project.snapshots) {
      const expected = await sha256hex(`${prev}|${snap.created_at}|${snap.text}`);
      if (expected !== snap.hash) { el("verify-out").textContent = "Broken at checkpoint #" + snap.seq; return; }
      prev = snap.hash;
    }
    el("verify-out").textContent = project.snapshots.length ? "Verified " + project.snapshots.length + " checkpoints." : "No checkpoints yet.";
  });

  el("generate").addEventListener("click", generateReceipt);
  el("create-digest").addEventListener("click", createParentDigest);
  el("print").addEventListener("click", () => window.print());
  el("open-receipt").addEventListener("click", openReceipt);
  el("fb-yes").addEventListener("click", () => sendFeedback(true));
  el("fb-no").addEventListener("click", () => sendFeedback(false));
  el("open-parent").addEventListener("click", openParent);
  el("save-settings").addEventListener("click", saveSettings);
  el("test-schoology").addEventListener("click", testSchoology);
  el("save-note").addEventListener("click", saveNote);
  el("create-sync-token").addEventListener("click", createSyncToken);

  $$(".hint").forEach((node) => {
    if (node.dataset.tip) node.setAttribute("aria-label", node.dataset.tip);
  });

  $$(".tab").forEach((tab) => tab.addEventListener("click", () => show(tab.dataset.view)));

  document.addEventListener("click", (event) => {
    const hint = event.target.closest(".hint");
    $$(".hint.show-tip").forEach((node) => { if (node !== hint) node.classList.remove("show-tip"); });
    if (hint) hint.classList.toggle("show-tip");
  });

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      handleSnapshot();
    }
  });

  const params = new URLSearchParams(location.search);
  let cleanedUrl = false;
  if (params.has("dev")) cleanedUrl = true;
  applyDevMode(params);
  if (params.get("login")) {
    toast("Signed in.", "good");
    params.delete("login");
    cleanedUrl = true;
  }
  if (params.get("auth_error")) {
    toast("Sign-in failed. Please try again.", "bad");
    params.delete("auth_error");
    cleanedUrl = true;
  }
  if (cleanedUrl) {
    const clean = new URL(location.href);
    clean.search = params.toString();
    history.replaceState(null, "", clean);
  }
  const requested = params.get("view");
  if (requested === "parent" && params.get("token")) {
    el("parent-token").value = params.get("token");
    show("parent");
    openParent();
  } else if (requested === "teacher" && params.get("id")) {
    el("receipt-id").value = params.get("id");
    show("teacher");
    openReceipt();
  } else {
    show(requested || "write");
  }

  loadAuth();
  setInterval(autoTick, 60000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
