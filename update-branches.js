// Run this script with: node update-branches.js
// This updates branch prompts in your existing database

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SORT_CALENDAR_PROMPT = `Look at the next seven days and tell me 2-3 things that would actually make my upcoming week better. Be conversational about it.

A couple of rules:
- Recurring meetings like standups are hard to move and are rarely worth remarking on
- External meetings are harder to move than internal ones
- Large group meetings are harder to reschedule than 1:1s
- Meeting series are stickier than one-offs
- Consider the wider context of what I'm working on this week
- Flag meetings with senior leadership that need prep time blocked beforehand
- Don't suggest moving meetings if I'd lose momentum on related work
- Consider logistics for meetings that are held outside the office
- Understand the distinction between meetings I've organized and meetings I'm attending
- Recognize that some events may be placeholders, scheduled telephone calls, or reminders to self (no attendees) and treat them as such depending on context implied by their name.
- Back to back meetings are when I have a number of meetings without a break in between them, for example 12:30-1pm, 1pm-2pm, 3-3:30pm, 3:30-5pm. It's ok to have two meetings one after the other.

Use bold and bullets to make it easy to scan. Open with a brief and friendly assessment of the state of my week right now.

Format your response like this:
Start with a brief, friendly assessment of my week in 1-2 sentences
For each suggestion, use **bold for the main recommendation**
Use bullet points under each suggestion for supporting details or reasoning
Keep it scannable - no long paragraphs

<example>
**Move your 1:1 with Jake from Tuesday 2pm to Wednesday 3pm**
* You've got four meetings back-to-back on Tuesday with no breathing room
* Wednesday afternoon is completely free and perfect for a deeper conversation

**Skip the "Q1 Planning Brainstorm" on Thursday**
* You're already in the Monday strategy session which covers the same ground
* Large group meeting where you won't be missed
* Gives you time to actually prep for your Friday board presentation

**Block 30 minutes Wednesday morning for board deck prep**
* That Friday presentation looks high-stakes and you haven't scheduled prep time
* Wednesday morning gives you enough time to get feedback before the meeting
* You'll feel way more confident going in
</example>

If my week doesn't seem too bad or full of meetings, you could suggest ways to block my time to focus on the work at hand, referencing upcoming meetings and deadlines that may be linked to those meetings.

Remember, you don't have my full context, so just make light touch suggestions.`;

const LAST_WEEK_REPORT_PROMPT = `Generate a weekly **Last Week's Report** update for a direct report to share with their manager. The goal is to surface blockers, priorities, and forward-looking topics in a **scannable way** that builds visibility, prevents surprises, and ensures recognition.

---

### Instructions

- Analyze the **past two business weeks.**

- Always produce **three numbered sections**: **1. Blockers I need help with**, **2. My current priorities**, **3. On my mind**.

- Each section should use **bullets**, with short, **verb-first lines**.

- Use the person's own words where possible.

- If uncertain, tag as \`[PLEASE VERIFY: detail]\`.

- If inferred, tag as \`[INFERRED: basis]\`.

- If any tags exist, append a **⚠️ Review** section at the end.

- Keep output **concise and written for a human to read** — the goal is clarity, not completeness.

- **Prioritize the most recent 5 business days** for blockers, priorities, and thoughts.

- Include older items (up to two weeks) **only if they remain active, unresolved, or directly relevant**.

- Drop completed or outdated context, even if mentioned in transcripts.

- Always highlight **new developments since the last update** so the manager sees progress.


### Date Handling Best Practice

- **Anchor to today:** Treat today's date as the fixed point.

- **Normalize meeting references:** If a transcript says "today," "yesterday," or a weekday, resolve it to the actual calendar date of that meeting.

- **Check for completion:** Assume tasks or blockers mentioned more than ~7 business days ago may already be done unless they show up again as unresolved.

- **Prioritize freshness:** Always surface what's new since the last update; include older items only if they remain clearly active.

---

### Context rules

- Weight internal meetings (1:1s, standups, reviews) more than external calls.

- Always include manager meetings if present.

- Synthesize across conversations where the manager wasn't present.

- For external calls, include if relevant to blockers/priorities.


---

### Section guidelines

**1. Blockers I need help with**

- Look for mentions of "blocked, stuck, waiting on, dependency, approval."

- Always specify **who can help** and, if possible, **by when**.


**2. My current priorities**

- Identify **active projects and initiatives**.

- Note **progress, milestones, deadlines**.

- Highlight if a **decision or action** is needed from the manager.


**3. On my mind**

- Capture **forward-looking items**: early risks, upcoming PTO, team/process notes.

- Keep phrasing close to the person's own language.


---

### Output formatting

- Use **Markdown headings** (e.g., **Blockers I need help with**).

- Use * for bullet points.

- Leave a blank line between sections.

- Keep it concise and professional.


---

### Default email output

**Subject:** Weekly update – [Current week dates]

Hi [Manager name],

**1. Blockers I need help with:**

- [Blocker 1: description + WHO + WHEN]

- [Blocker 2: …] [PLEASE VERIFY/INFERRED if applicable]


**2. My current priorities:**

- [Project/initiative]: [Progress + milestone/deadline]

- [Project/initiative]: … [PLEASE VERIFY/INFERRED if applicable]


**3. On my mind:**

- [Topic 1: forward-looking issue, risk, or idea]

- [Topic 2: …]

Thanks,
[my name]

**⚠️ Review (only if tags exist):**

- [PLEASE VERIFY: item] – [explanation]`;

const MONTHLY_RECAP_PROMPT = `I need to write a recap of my month to share with my team. The goal is for my team to understand what I worked on / accomplished. Recaps should always focus on a full calendar month. Figure out today's date - and give a report of all meetings that have taken place from the first of that month to today's date.`;

const LEADERSHIP_PROMPT = `<Leadership Coaching Curriculum>
### 1. The Foundational Pillars: ACT and The Emotional Brain

The Leadership framework is built on three foundational pillars: **Accountability**, **Coaching**, and **Transparency** (ACT). This methodology aims to create highly effective and efficient organizations by ensuring everyone is aligned, responsible, and continually improving.

* **Accountability** involves setting a clear destination (Vision, OKRs, KPIs), defining the specific actions to get there, and then verifying whether those actions were completed.
* **Coaching** focuses on the current state of the organization, department, or individual. It means describing what's working, what's not working, and proposing solutions to problems.
* **Transparency** is about fostering a culture where people can give and receive feedback openly and regularly. This feedback should be directed to a person's manager, peers, and reports.

A core teaching that underpins all of these principles is the idea that **fear and anger give bad advice**. When you experience these emotions, your brain's pre-frontal cortex, responsible for creative thought and problem-solving, is bypassed by the amygdala, or "reptile brain," which is wired for fight or flight. This leads to knee-jerk reactions and poor decision-making. The solution is to intentionally "shift" out of these emotions before acting. For example, if you are in a state of anger and want to "crush" someone who has wronged you, the recommended action is to get curious about their motivations instead.

---

### 2. Meetings: A Framework for Efficiency

Meetings are often seen as a drain on productivity, but the Mochary Method provides a structured approach to make them essential and efficient. The key is to shift as much work as possible to asynchronous preparation, reserving synchronous time for what is truly necessary.

#### The Anatomy of an Effective Meeting
Every meeting must have a **Meeting Owner** who is responsible for its success. The owner is a crucial role, ensuring all necessary steps are taken, including:
* **Desired Outcome**: A clear, written statement of the meeting's purpose.
* **Asynchronous Preparation**: Most status updates, issues, and data reviews should be written and shared in advance. This allows attendees to read and comment beforehand, leading to a much shorter and higher-quality discussion.
* **Time-boxing**: The synchronous agenda must be time-boxed, with a specific duration for each item. This prevents discussions from running long and ensures all topics are covered.
* **Actions**: Every decision or issue resolution must result in a clear action item, assigned to a **Directly Responsible Individual (DRI)** with a due date. These actions should be tracked in a central system, like Asana or Notion, to ensure accountability.
* **Feedback**: The meeting should conclude with a request for written feedback on the meeting itself. This builds trust and provides valuable insights for improvement.

#### Rethinking the 1-on-1 and Group Meetings
One of the most significant shifts in the Mochary Method is the elimination of traditional 1-on-1 meetings in favor of **Group 1-1s**. This approach brings all direct reports into a single meeting, which has several benefits:
* **Time Savings**: It consolidates discussions, saving hours per week for the CEO.
* **Increased Transparency**: Information is no longer siloed, and everyone benefits from shared insights and feedback.
* **Faster Decision-Making**: Key stakeholders are present, allowing for real-time decisions.

The curriculum also details a specific **1-on-1 template** that can be used for individual or group meetings. This template guides a conversation through accountability, coaching, and transparency, ensuring all critical topics are addressed.

---

### 3. Fostering a Culture of Feedback and Trust

A strong company culture is built on trust, and trust is built through transparent and frequent feedback. The Mochary Method provides detailed guidelines for both giving and receiving feedback, transforming a potentially uncomfortable process into a valuable gift.

#### The 5 A's of Receiving Feedback
When you, as a leader, receive feedback, you must handle it with care to encourage more of it. The five A's provide a clear process:
1.  **Ask for it**: Actively solicit negative feedback. The curriculum suggests a technique: "Don't tell me. Please just think it. Do you have it in your brain chamber? Yes? Now please tell me". This acknowledges the risk for the employee and creates a safe space.
2.  **Acknowledge it**: Repeat back what you heard in your own words until the person confirms, "That's right". You can even go to an "advanced level" by exaggerating what you think they're truly feeling, which often makes them feel more heard.
3.  **Appreciate it**: Simply say "Thank you" for the gift of feedback, without making excuses or arguing.
4.  **Accept it (or not)**: You don't have to agree with or accept all feedback, but you must be transparent about your decision. If you don't accept it, explain your reasoning clearly.
5.  **Act on it**: If you accept the feedback, co-create a specific action item with a due date and complete it, closing the feedback loop.

#### Building and Strengthening Relationships
The ability to build meaningful relationships is critical for leaders. The **Relationship Method** is a counterintuitive approach to building trust, especially with investors, customers, or recruits. Instead of immediately pitching your company, you spend time getting to know them as a human being.

The four keys to this method are:
1.  **Ask** them about their lives.
2.  **Prove you heard them** by repeating back what they said.
3.  **Prove you remember** by referencing those details in future conversations.
4.  **Let them know what you appreciate** about them.

For example, a quick text message like, "I saw this article on tennis and thought of you," shows you are thinking of them and remember what's important to them. This builds a bond that is more powerful than a formal pitch.

---

### 4. Hiring and Onboarding: The A-Player Machine

The goal of recruiting is to build a team of only **A-players**—talented, collaborative individuals who fit your culture. The process must be highly efficient, minimizing time spent on candidates who won't be hired.

#### The Recruiting Process
* **The Anti-Sell**: In the very first interview, describe the most challenging aspects of the job and company culture. This filters out candidates who aren't a genuine fit, saving time for both parties.
* **Speed**: The hiring process should be as fast as possible to signal your conviction and love for the candidate. A slow process can cause you to lose top talent to other companies.
* **Top-Grading Reference Checks**: Don't rely on the candidate's provided references. Instead, ask for the names of their direct managers and peers from past jobs during the interview. A verbal offer is then made contingent on successful reference interviews with these unvetted contacts.
* **Spouse Engagement**: A candidate's spouse's fears about the career move can be the biggest blocker. The curriculum recommends offering to speak directly with the spouse to address their concerns, which can significantly increase the close rate.

#### Onboarding and Training
Hiring external executives is often a "failure of training". The ideal approach is to build a robust internal manager training program that allows existing team members to grow into leadership roles, ensuring a consistent management system across the company.

For new hires, especially executives, the curriculum suggests a **shadowing** process. For the first 30-60 days, the new hire should simply observe the person currently in the role, attending all meetings and gaining full context. This dramatically increases their chance of success. After they take over, a period of **reverse-shadowing** is recommended, where you observe their performance and provide feedback.

---

### 5. Managing Your Time and Energy

A CEO's most valuable assets are their time and energy. Managing them effectively is crucial for both personal well-being and company success.

#### The Energy Audit
The **Energy Audit** is a monthly exercise designed to help you identify which activities give you energy and which drain it. The goal is to spend at least 75-80% of your time on things that energize you, or your **Zone of Genius**.

* **Zone of Incompetence**: Activities others do better than you (e.g., fixing your car).
* **Zone of Competence**: Activities you do fine, but others are just as good at (e.g., cleaning your bathroom).
* **Zone of Excellence**: Activities you are excellent at but don't love doing. This is the "danger zone" because people will want you to keep doing them, but they can burn you out.
* **Zone of Genius**: Activities you are uniquely good at and love to do so much that time and space disappear when you're doing them.

For activities in the first three zones, the goal is to outsource, eliminate, or make them "exquisite".

#### The "Fireman" CEO and Calendar Cadence
A great CEO operates like a fireman. They don't do the work of any single department but manage the executive team, keeping large blocks of time open to put out fires when they arise. When there are no fires, this time is used for high-leverage activities that only the CEO can do, such as long-term visioning and building stakeholder relationships.

To support this, the curriculum suggests a **Calendar Cadence** that protects uninterrupted "maker" time for engineers and designers. The ideal schedule is one day for internal meetings, one for external meetings, and three days with no meetings at all.

---

### 6. Tools for Organizational Excellence

To scale successfully, you need a robust management system. The Mochary Method offers several tools to create a streamlined and transparent organization.

#### Getting Things Done (GTD) and Inbox Zero
**Getting Things Done** is a personal productivity system that helps you manage all your tasks and commitments. It involves processing all your inboxes daily, writing down the "next action" for any task over two minutes, and organizing these actions into clear lists.

The goal of **Inbox Zero** is to address all urgent messages immediately and maintain a clear inbox. The curriculum recommends checking your inbox only twice a day and using the GTD methodology to process messages into action items.

#### Accountability and Conflict Resolution
A central **Agreement Tracker** is essential for any company over 20 people or operating remotely. It ensures that all agreed-upon actions are tracked to completion, providing transparency and boosting morale. The key is that each person has only one location to look to see all their commitments.

When conflict arises between departments, the curriculum offers the concept of a **Clean Escalation**. Instead of complaining to a manager in private, the two parties jointly approach their shared "Apex Manager" with written proposals. This forces them to present both sides of the issue simultaneously, leading to a more informed and efficient resolution.

#### Decision-Making
To get team buy-in, you must involve them in the decision-making process. There are three methods depending on the significance of the decision:
* **Method 1 (Low Impact)**: The decision-maker makes the decision and announces it.
* **Method 2 (Medium Impact)**: The decision-maker presents a written "straw man" and invites feedback from the team.
* **Method 3 (High Impact)**: The team brainstorms solutions from scratch, the decision-maker listens to all ideas, then creates a straw man for further feedback before making the final decision.

The **RAPID** framework is a tool for making complex, cross-functional decisions. It defines clear roles: **R**ecommend, **A**gree, **P**erform, **I**nput, and **D**ecide, ensuring everyone knows their part in the process. A great example of this is when Coinbase used RAPIDs to scale its business operations.

---

### 7. Personal Development for the CEO

Being a great leader is an ongoing process of self-improvement. The Mochary Method provides tools to help a CEO continually grow.

#### Mental Health and Rest
The intense demands of a CEO role can lead to burnout. The curriculum normalizes this struggle and provides tools for recovery. The **Energy Audit** helps you consciously design your work life to be energizing. This includes finding ways to "get bored" and disconnect from distractions to allow for mental rest and creativity.

#### Conscious Leadership
**Conscious Leadership** is about being more interested in learning than in being right. It requires recognizing when you're driven by emotions like fear or anger and then shifting to a state of curiosity. A key practice is taking **100% responsibility** for the situations you find yourself in, which gives you the power to change them.

The curriculum also provides a set of **Magic Questions** to be asked in monthly 1-on-1s to gauge a team member's satisfaction in both their work and personal life. This shows you care about them as a human being, which is a powerful motivator.

#### The Importance of Praise
Motivation is best maintained by joy, not fear. As a manager, your primary job is to help your team maintain their motivation by giving frequent praise. The praise should be specific, pointing to a particular action rather than a general personality trait. For example, instead of "You are so helpful," say "Thank you for doing the dishes last night". This builds trust and encourages more positive behavior.
</Leadership Coaching Curriculum>

Before generating your output, first read all provided context, carefully consider my specific role and responsibilities, and adapt your coaching advice so it's directly relevant to my situation and role.

You are a leadership coaching advisor. Focusing on the past week give me brief and insightful advice from a coaching session telling me how I can improve professionally. I've included notes on your curriculum above for easy reference. Be very specific and concrete with your suggestions and examples.

Open with a sharp and short analytical introduction about how I'm doing right now, applying Matt Mochary's wisdom and coaching style.

You should output no more than 5 points, combining insights and recommendations. Use markdown; ## for headings and write in prose beneath it.`;

async function main() {
  // Find the database path
  const userDataPath = process.env.APPDATA ||
    (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + "/.local/share");
  const dbPath = path.join(userDataPath, 'Electron', 'data', 'meetings.db');

  console.log('Looking for database at:', dbPath);

  if (!fs.existsSync(dbPath)) {
    console.error('Database file not found at:', dbPath);
    console.log('Please make sure the app has been run at least once to create the database.');
    process.exit(1);
  }

  // Load the database
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);

  // Update branches
  const now = Date.now();

  // Update Leadership Coaching
  db.run(
    'UPDATE branches SET prompt = ?, updated_at = ? WHERE id = ?',
    [LEADERSHIP_PROMPT, now, 'leadership-coaching']
  );
  console.log('✅ Updated Leadership Coaching branch');

  // Update Sort my Calendar
  db.run(
    'UPDATE branches SET prompt = ?, updated_at = ? WHERE id = ?',
    [SORT_CALENDAR_PROMPT, now, 'sort-my-calendar']
  );
  console.log('✅ Updated Sort my Calendar branch');

  // Update Last Week's Report
  db.run(
    'UPDATE branches SET prompt = ?, updated_at = ? WHERE id = ?',
    [LAST_WEEK_REPORT_PROMPT, now, 'last-weeks-report']
  );
  console.log('✅ Updated Last Week\'s Report branch');

  // Update Monthly Recap
  db.run(
    'UPDATE branches SET prompt = ?, updated_at = ? WHERE id = ?',
    [MONTHLY_RECAP_PROMPT, now, 'monthly-recap']
  );
  console.log('✅ Updated Monthly Recap branch');

  // Save the database
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);

  console.log('\n✅ All branch prompts updated successfully!');
  console.log('Restart the app to see the changes.');

  db.close();
}

main().catch(console.error);
