# Job Listing Validation Protocol (Corrected)

## Condensed Protocol — For System Prompt / Subagents (Hard Gates)

> Copy this verbatim into the agent system prompt. Each **subagent** must run it independently per listing; the **main agent** only orchestrates and dedupes, it does NOT validate.

For **EVERY** listing — **EXCLUDE** if any hard gate fails. Only `VERIFIED` listings may be emitted as `JOB_JSON:`.

**0. Age (HARD GATE):** >1 week old + no explicit deadline → EXCLUDE. `jaabz.com`/`shine.com` >1 week → EXCLUDE even if deadline missing. LinkedIn Promoted with no date → require active Apply button.

**1. Platform:** Must be LinkedIn / Indeed / company career page / known board. Unknown board → trace to verified source or EXCLUDE.

**2. Company:** Must have real website + LinkedIn with employees + same role on official careers page (or verifiable mirror). Else EXCLUDE.

**3. Status — CRITICAL (webfetch required):** Fetch the live URL and read body. If you see `No longer accepting applications` / `Position filled` / `Application closed` / `This job has expired` / `No longer accepting` or Apply button missing/greyed → EXCLUDE. If status cannot be determined → mark UNVERIFIED (do NOT emit).

**4. Scam:** EXCLUDE if: upfront/training fees, vague generic JD, gmail/yahoo contact, requests financial info, unrealistic salary, no web presence.

**5. Experience (user-driven, default Fresher):** Compare the listing's required experience against the user's level — explicit in the request (`Additional Notes` / `Skills` / `Job Types`) or inferred from the uploaded resume (`Resume Content`). If **no experience is specified and no resume is provided, DEFAULT to Fresher/Junior (0-2y)** — prefer `0-2 years` / `0-1 years` / `fresher` / `entry-level` / `junior` / `no experience required` listings and EXCLUDE `5+ years` / `Senior` / `Lead` / `Staff` unless the listing explicitly says `freshers welcome` / `open to all levels` / `strong projects accepted`. Otherwise EXCLUDE only if the gap is irreconcilable (e.g., user ~1-2y but listing demands 7+ years senior-only). If the listing's range overlaps the user's level, states `open to all levels`, or is flexible, INCLUDE. When resume is provided, infer level (projects/internships → Junior, 2-5y pro → Mid, 5+ y → Senior/Lead) and use it.

**6. Deadline:** Deadline passed → EXCLUDE. No deadline → `rolling applications`.

**Output rule:** Only emit `JOB_JSON:` for `VERIFIED`. Never emit EXCLUDED/UNVERIFIED as jobs; you may mention counts in your text.

---

## Mistakes Made

### Mistake 1: Scam Verification Was Too Shallow
**What I did:** Only asked agents to check for "upfront fees" as the sole scam indicator.

**What I should have done:**
1. **Platform trust check first:**
   - Is the listing on a trusted platform? (LinkedIn, Indeed, company career page = trustworthy)
   - Or is it on an unknown/suspicious job board? (jaabz.com, careerport.is-great.net, etc. = verify further)
   - If on an aggregator, can you trace it back to the original company career page?

2. **Listing genuineness check:**
   - Does the company's career page list this exact same role?
   - Is the company name, role title, and location consistent across platforms?
   - Does the company have a real website, real employees on LinkedIn, real office?
   - Are there multiple people from the company posting about this role (signals legitimacy)?

3. **Other scam indicators (beyond fees):**
   - Vague/generic job description with no specific tech stack
   - Gmail/Yahoo/Hotmail email instead of corporate domain
   - Role asks for personal financial information upfront
   - Salary is unrealistically high with no clear business model
   - Company has no web presence beyond the job listing
   - Job posted on platforms known for scams

### Mistake 2: Application Status Not Properly Checked
**What I did:** Told agents to "visit the URL" but they didn't actually read the page content for application status indicators.

**What I should have done:**
1. **Fetch the actual page content** using webfetch
2. **Look for explicit status indicators on the page:**
   - "No longer accepting applications" (like the1Password screenshot)
   - "Position filled"
   - "Application closed"
   - "This job has expired"
   - "No longer accepting applications"
   - Apply button is missing or greyed out
   - Application form is no longer available
3. **If the page says it's closed, EXCLUDE it immediately** - no exceptions

### Mistake 3: Agent Instructions Were Ambiguous
**What I did:** Gave agents "validation requirements" as a checklist but didn't make it a strict gate.

**What I should have done:**
- Made validation a **hard gate**: "If you cannot verify X, DO NOT include the listing"
- Provided specific instructions for HOW to check each item
- Required agents to quote the page content showing the listing is active

## Corrected Validation Protocol

For EVERY listing, the agent MUST:

### Step 0: Listing Age Rules (HARD GATE)
- [ ] **General rule:** If the posted date is more than 1 week old AND no explicit deadline is mentioned, EXCLUDE. Assume the listing has expired.
- [ ] **Exception:** If the listing has a stated deadline (e.g., "closes Dec 31, 2026"), keep it even if posted long ago.
- [ ] **jaabz.com listings:** If posted more than 1 week old, EXCLUDE immediately. jaabz.com listings expire/go stale fast.
- [ ] **Shine.com listings:** If posted more than 1 week old and no deadline, EXCLUDE.
- [ ] **LinkedIn "Promoted" listings:** These rotate frequently. If no date visible, check if Apply button is active.


### Step 1: Platform Trust Check
- [ ] Is the listing on LinkedIn, Indeed, company career page, or well-known job board?
- [ ] If on an unknown platform, can you trace it to a verified source?
- [ ] If the platform is suspicious, EXCLUDE the listing

### Step 2: Company Verification
- [ ] Does the company have a real website?
- [ ] Does the company have a LinkedIn page with real employees?
- [ ] Can you find the same role on the company's official career page?
- [ ] If company cannot be verified, EXCLUDE the listing

### Step 3: Application Status Check (CRITICAL)
- [ ] Fetch the actual listing page using webfetch
- [ ] Read the page content for these EXACT phrases:
  - "No longer accepting applications"
  - "Position filled"
  - "Application closed"
  - "This job has expired"
  - "No longer accepting applications"
- [ ] Check if the Apply button is present and active
- [ ] If ANY closed/expired indicator is found, EXCLUDE the listing
- [ ] If you cannot determine status, mark as "UNVERIFIED - check manually"

### Step 4: Scam Check (Beyond Fees)
- [ ] No upfront payment or "training fees" required
- [ ] Job description is specific (not generic/vague)
- [ ] Company email is corporate domain (not gmail/yahoo)
- [ ] No personal financial information requested upfront
- [ ] Salary is reasonable for the role level
- [ ] If scam indicators found, EXCLUDE the listing

### Step 5: Experience Check (User-Driven, Default Fresher)
- [ ] What is the user's experience level? Check in order: (1) explicit level in the request (`notes` / `skills` / `Job Types`), (2) infer from the uploaded resume (`resumeContent`): internships/projects only → Junior (0-2y), 2-5y professional → Mid, 5-8y → Senior, 8y+ / lead roles → Lead/Staff. **If neither is provided, DEFAULT to Fresher/Junior (0-2y).**
- [ ] What does the listing require? Parse JD for `X+ years`, `Junior/Mid/Senior/Lead` labels.
- [ ] If defaulting to Fresher/Junior (no user level + no resume): prefer `0-2 years` / `fresher` / `entry-level` / `junior` / `no experience required` listings; EXCLUDE `5+ years` / `Senior` / `Lead` / `Staff` unless the listing explicitly says `freshers welcome` / `open to all levels` / `strong projects accepted`.
- [ ] Otherwise: if the listing requires substantially more experience than the user has and shows no flexibility (`7+ years senior-only`, `10 years required`), EXCLUDE. If the range overlaps, is flexible, or says `open to all levels`, INCLUDE.
- [ ] If no experience is stated on the listing, INCLUDE and infer level for the output field.

### Step 6: Deadline Check
- [ ] Is there a listed application deadline?
- [ ] If deadline has passed, EXCLUDE
- [ ] If no deadline, note "rolling applications"

## Output Requirements

For each listing, agents MUST include:
1. **Verification status:** VERIFIED / UNVERIFIED / EXCLUDED
2. **Platform:** Where the listing was found
3. **Application status evidence:** Quote from the page showing it's active
4. **Company verification evidence:** Website, LinkedIn, career page
5. **Scam check result:** Pass/Fail with reason

If a listing cannot be fully verified, it MUST be marked as UNVERIFIED and the user must check manually.
