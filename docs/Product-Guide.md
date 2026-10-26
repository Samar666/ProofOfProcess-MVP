# ProofOfProcess — Plain-English Product Guide

**One-line pitch:** ProofOfProcess shows *how* a piece of schoolwork was made, so students can prove their effort, teachers can give better feedback, and parents can see real progress.

---

## 1. What it is

ProofOfProcess is a simple web app for writing assignments. While a student writes, the app saves small **checkpoints** — not every keystroke, just meaningful moments: when an outline appears, when a source is added, when a draft changes a lot, when the student reflects on their work.

At the end, the app turns those checkpoints into a short **receipt**. The receipt is a one-minute summary of the process: how many checkpoints, how many sources, how many big revisions, whether AI was used and how, and what the student learned.

A student can share the receipt with a teacher as a link. They can also create a separate, read-only **parent link** that shows a simple progress summary.

The key idea: **we show evidence of process, not proof of who wrote it.** We never claim to detect AI. We never log keystrokes. We never watch the screen.

---

## 2. The problem

Schools are in a difficult spot.

1. **It is hard to tell process from product.** A final essay looks the same whether it took five hours of real work or five minutes with a chatbot.
2. **Teachers are asked to police AI, but they do not have time or evidence.** Accusations feel unfair. Students feel anxious. Trust goes down.
3. **Parents mostly see grades, not effort.** A grade tells them *what* happened, not *how*. They want to help, but they do not know what to ask.
4. **Honest students get punished by suspicion.** When everyone is a suspect, the students who did the work do not get credit for it.

Most tools try to solve this by guessing. They give an "AI score." These scores are unreliable, easy to argue with, and can be wrong in ways that hurt students. ProofOfProcess takes a different path: it records real process, and it lets the student decide what to share.

---

## 3. How it works (in plain steps)

1. A student opens an assignment and writes normally.
2. The app saves a checkpoint on a timer, on a big paste, after a large change, when a source is added, or when the student clicks **Save checkpoint**.
3. Each checkpoint is chained to the one before it using a **hash** — a short digital fingerprint. If anything is changed later, the chain breaks and the app says so.
4. The student writes a short reflection: what changed, and why.
5. With one click, the app creates a **receipt** and a teacher link.
6. The teacher opens the link, sees the process in under a minute, and can leave a quick "was this useful?" response.
7. If the student chooses, they can create a **parent link** — a read-only digest with counts, milestones, and a gentle "worth a conversation" note. No raw drafts. No personal names.

---

## 4. For students

**What is in it for them**

- **Credit for effort.** The receipt shows the outline, the sources, the revisions, and the reflection. Real work becomes visible.
- **Less anxiety.** They are not defending themselves against a score. They are showing a story they already lived.
- **Better learning.** Seeing their own process helps them notice how they work: where they got stuck, what they changed, what helped.
- **Honest AI use.** The app asks what AI was used for, what was kept, and what was rejected. That is a skill employers and colleges now expect.
- **Control.** The student chooses what to share. Parent links are created by the student, not taken from them.

**What it does not do**

- It does not record keystrokes.
- It does not record screens or browsing.
- It does not give an AI-detection score.
- It does not use real names by default — anonymous codes are enough.

---

## 5. For teachers

**What is in it for them**

- **No new password.** Teachers sign in with their school Google account. Students join with a class code; parents only need a link.
- **Understand a submission in under a minute.** The receipt shows the shape of the work: how it started, how it changed, and what the student says they learned.
- **Better conversations.** Instead of "did you write this?", a teacher can say, "I see you changed your thesis after Source 3 — tell me about that."
- **Less policing, more teaching.** The tool supports feedback and trust. It is not a surveillance system.
- **Fast feedback loop.** One click: useful or not useful. That is enough to improve the tool over time.
- **Works with normal teaching.** No new grading rubric is required. The receipt sits next to the assignment.

**What teachers should not use it for**

- It is not proof of authorship.
- It should not be used to punish students.
- It should not replace professional judgement.

---

## 6. For parents

**What is in it for them**

- **A simple picture of effort.** How many checkpoints, how many sources, how many revisions, and whether the child reflected on their work.
- **Assignment context, not just totals.** When the student connects Schoology, the digest shows each upcoming assignment and whether there is process evidence: complete, in progress, not started, or missing.
- **A conversation starter, not a verdict.** The digest says things like "few checkpoints this week" and offers specific prompts — "Ask which idea changed the most, and why."
- **The teacher's voice.** A teacher can add a short note to one receipt; that note appears in the parent digest without exposing grades.
- **Privacy by design.** Parents see a summary, not the child's raw draft. The link is read-only and expires.
- **No account needed.** A link opens in a browser. That is it.
- **Respect for the student.** The student creates the parent link. The child is not being monitored behind their back.

---

## 7. What ProofOfProcess does *not* claim

This matters for trust.

- **It does not detect AI.** No tool can do this reliably. We do not pretend otherwise.
- **It does not prove who wrote the work.** A hash chain proves that a record was not changed after the fact. It does not prove authorship.
- **It is not a surveillance product.** No keystrokes, no screenshots, no web history.
- **It is not a grade.** It is evidence for a conversation between people.

The promise is narrow and honest: **here is the process, as it happened, shared with consent.**

---

## 8. The impact we are aiming for

We should measure impact, not assume it. Here is what success would look like.

**For students**
- More students can explain how they worked.
- Fewer students feel accused without cause.
- More honest AI disclosure.

**For teachers**
- Less time spent investigating suspicion.
- Faster, more specific feedback.
- Higher confidence that feedback matches the student's real process.

**For parents**
- More specific conversations at home.
- Less "how was school?" and more "what changed in your essay this week?"

**Signals to track (examples)**
- Time for a teacher to understand a receipt (target: under 60 seconds).
- Percentage of shared receipts that teachers open.
- Percentage of receipts with a completed reflection.
- Teacher "useful" rate.
- Parent link opens and repeat visits.
- Student and teacher satisfaction.
- Renewal rate for paid schools.

**Honest framing:** these are hypotheses to test in pilots. We should not publish invented statistics. A small pilot with 3–5 teachers and a few classes is enough to learn whether the idea holds.

---

## 9. How this can make money

The product should never sell student data, show ads, or charge parents for access to their own child's information. With that limit, there are several realistic paths.

### Option A — Free for teachers, paid for schools (recommended)
- Individual teachers use it free with a monthly cap (for example, 30 receipts per month).
- Schools pay for unlimited use, admin controls, and support.
- Possible pricing (to validate, not final):
  - **Teacher plan:** free.
  - **School plan:** roughly $500–$2,000 per school per year, depending on size.
  - **District plan:** custom, with SSO, rostering, and LMS integration.

Why it works: teachers adopt tools bottom-up; schools pay when the tool is already loved.

### Option B — District licences with LMS integration
- Add official integrations (Google Classroom, Schoology API, Canvas).
- Add admin dashboards, data retention controls, and compliance documents.
- Price per student per year (for example, $3–$8), with a district minimum.
- This is the strongest long-term revenue, but it needs partnerships and a longer sales cycle.

### Option C — Curriculum and professional development add-on
- Sell short workshops or lesson packs on "process, not policing" and honest AI use.
- Schools already buy professional development. This is a natural add-on and builds trust.

### Option D — Grants and education foundations
- Not revenue, but useful runway for a privacy-first product in schools.
- Fits the mission and can fund pilots in under-resourced districts.

### What *not* to do
- Do not charge parents for basic access to their child's progress.
- Do not sell or broker student data.
- Do not sell an "AI detector."
- Do not lock a student's own work behind a paywall.

---

## 10. One product, two surfaces (hosted architecture)

We recommend **one product with two surfaces**, not two separate apps.

- **Student and teacher surface:** writing, checkpoints, receipts, share links.
- **Parent surface:** a read-only digest opened from a private link. No parent account in the MVP.
- **Background collector:** a server-side worker that can later sync assignments from official LMS APIs.

Why one product:
- The parent digest is a *summary of the same receipts*. One data model, one story.
- The narrative is simple: students show process, teachers give feedback, parents see progress.
- Splitting too early adds cost, complexity, and two brands to explain.

Why the collector is separate from the public web app:
- It runs on a schedule.
- It holds integrations and credentials.
- It can be scaled and deployed on its own.

**Important technical note for hosting:** the Schoology experiment uses a third-party MCP server that reads cookies from the student's local Chrome browser. Those cookies must never be sent to a hosted server. The compromise is a **student-laptop bridge**: the MCP server runs locally, then posts only assignment metadata (title, course, due date, status, URL) to the hosted app using a per-student bearer token. That is safe enough for a pilot, but it requires the student to run a command.

For automatic, school-wide syncing, hosted integrations must use official APIs with proper consent:
- **Google Classroom:** OAuth 2.0 with the `classroom.readonly` scope.
- **Schoology:** the official Schoology API with a district-approved app.

Until those are in place, the hosted MVP can generate useful parent digests from receipts alone. LMS sync is an upgrade, not a requirement for the first story. The bridge currently gets only upcoming assignments — no submission status, assignment IDs, or grades — so parent-facing process status is computed from local receipts.

---

## 11. Safety and compliance checklist

Before a real school pilot:

- Clear consent flow for students and guardians.
- Data processing agreement (DPA) with each school or district.
- Data retention policy (receipts expire after 90 days by default; parent links after 30 days).
- Encryption in transit and at rest.
- Role-based access; no shared logins.
- Review against FERPA (US), COPPA (under-13), and GDPR/UK GDPR where relevant.
- A plain-English privacy page for students and parents.
- A way for students to delete their data.
- An incident response plan.

---

## 12. What to build next (suggested order)

1. **Pilot-ready MVP (mostly done):** writing, checkpoints, receipts, teacher feedback, parent digest links, settings.
2. **Accounts and tenancy:** teacher login, school spaces, per-school data isolation.
3. **Parent delivery:** email the digest link on a weekly cadence, with a clear opt-out.
4. **Official LMS sync:** Google Classroom first, then Schoology API via district app.
5. **Admin controls:** retention, export, delete, audit log.
6. **Impact measurement:** built-in metrics for the pilot.
7. **Paid tiers:** school and district plans.

---

## 13. The story in one paragraph

Students do real work every day, but schools mostly see the finished product. That makes it hard to reward effort, hard to teach process, and easy to suspect the wrong people. ProofOfProcess records meaningful checkpoints while a student writes, turns them into a short, honest receipt, and lets the student share it with a teacher and — if they choose — a parent. It does not detect AI. It does not log keystrokes. It does not claim to know who wrote the work. It simply makes the process visible, with consent, so the people around the student can help.
