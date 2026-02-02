# Meeting Prep Summary Revamp - Implementation Plan

## Overview
Complete overhaul of the meeting prep summary feature to provide more actionable, source-attributed intelligence instead of generic filler content.

---

## Phase 1: Extend CRM Services for Data Fetching

### 1.1 HubSpotService Enhancements
**File:** `src/main/services/HubSpotService.ts`

Add new methods:
- `getDealsForContact(contactId, accessToken)` - Fetch associated deals with stage, amount, close date
- `getEngagementsForContact(contactId, accessToken)` - Fetch email subjects/snippets, notes, calls
- `getContactProperties(contactId, accessToken)` - Fetch extended properties (job title, last activity date)

**API Endpoints to use:**
- `GET /crm/v3/objects/deals/search` with contact association
- `GET /crm/v3/objects/contacts/{id}/associations/engagements`
- `GET /crm/v3/objects/engagements/{id}` for email/note content

### 1.2 SalesforceService Enhancements
**File:** `src/main/services/SalesforceService.ts`

Add new methods:
- `getEmailsForContact(contactId, accessToken, instanceUrl)` - Query EmailMessage or Task records
- `getNotesForContact(contactId, accessToken, instanceUrl)` - Query ContentNote or Note records
- `getActivitiesForContact(contactId, accessToken, instanceUrl)` - Query Task/Event records

**SOQL Queries needed:**
- `SELECT Subject, TextBody, CreatedDate FROM EmailMessage WHERE RelatedToId = :contactId`
- `SELECT Subject, Description, ActivityDate FROM Task WHERE WhoId = :contactId`

---

## Phase 2: Create New Data Types

### 2.1 New TypeScript Interfaces
**File:** `src/shared/types.ts`

```typescript
interface ParticipantIntel {
  persona: 'Technical' | 'Executive' | 'Skeptic' | 'Champion' | 'Unknown';
  personalFacts: string[];  // From past small talk or LinkedIn
  recentActivity: string[]; // Support tickets, contract requests, etc.
  crmRole?: string;         // Decision Maker, Influencer, etc. from CRM
  missedMeetings?: number;  // Count of recent meetings they didn't join
}

interface ActionItemStatus {
  id: string;
  description: string;
  assignedTo: 'them' | 'us';
  meetingDate: string;
  completed: boolean;
  source: string;
}

interface TimelineEvent {
  date: string;
  type: 'meeting' | 'email' | 'note' | 'deal_update' | 'support_ticket';
  source: 'Meeting Notes' | 'HubSpot' | 'Salesforce' | 'Email';
  summary: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

interface CRMSnapshot {
  dealName?: string;
  dealValue?: number;
  dealStage?: string;
  blockers?: string[];
  lastActivityDate?: string;
}

interface ConfidenceMetrics {
  score: number;  // 0-100
  sources: {
    meetings: number;
    emails: number;
    crmNotes: number;
  };
}

interface NewPrepParticipant {
  name: string;
  email: string | null;

  // Block A: "The Who"
  intel: ParticipantIntel;

  // Block B: "The History"
  actionItems: ActionItemStatus[];

  // Block C: Timeline
  timeline: TimelineEvent[];

  // CRM Snapshot
  crmSnapshot?: CRMSnapshot;

  // Last Seen Context
  lastSeen?: {
    daysAgo: number;
    topic: string;
    sentiment: 'Positive' | 'Neutral' | 'Tense';
  };

  // Unresolved Threads
  unresolvedThreads: string[];

  // Confidence with attribution
  confidence: ConfidenceMetrics;
}
```

---

## Phase 3: Revamp PrepService

### 3.1 New Data Collection Pipeline
**File:** `src/main/services/PrepService.ts`

New methods to add:
1. `fetchCRMData(email, crmType)` - Get deals, emails, notes from HubSpot/Salesforce
2. `analyzeSentiment(transcripts)` - Use AI to determine meeting mood
3. `extractUnresolvedThreads(meetings)` - Find promises not kept
4. `buildTimeline(meetings, crmData)` - Aggregate events chronologically
5. `derivePersona(transcripts, crmData)` - Classify participant type
6. `extractPersonalFacts(transcripts)` - Find small talk mentions

### 3.2 New AI Prompt
Remove from current prompt:
- `agenda` object
- `success_metrics` array
- `risk_mitigation` array
- `talking_points` (unless from actual past data)
- `questions_to_ask` (unless from unresolved items)

New prompt output format:
```json
{
  "meeting": { "type": "string" },
  "generated_at": "ISO8601",
  "participants": [
    {
      "name": "string",
      "email": "string",
      "last_seen": {
        "days_ago": 14,
        "topic": "Q4 roadmap review",
        "sentiment": "Positive"
      },
      "intel": {
        "persona": "Technical",
        "personal_facts": ["Based in Bengaluru", "Avid trekker"],
        "recent_activity": ["Opened 3 support tickets this week"],
        "crm_role": "Decision Maker"
      },
      "unresolved_threads": [
        "In meeting on Jan 15th, they promised to send technical doc - not received"
      ],
      "confidence": {
        "score": 60,
        "sources": { "meetings": 2, "emails": 1, "crm_notes": 0 }
      }
    }
  ]
}
```

### 3.3 Sentiment Analysis
Add new method to analyze transcript sentiment:
```typescript
async analyzeMeetingSentiment(transcript: TranscriptSegment[]): Promise<'Positive' | 'Neutral' | 'Tense'>
```

Uses AI to evaluate:
- Tone of conversation
- Keywords indicating frustration or satisfaction
- Resolution of issues discussed

---

## Phase 4: Revamp PrepView UI

### 4.1 Remove Existing Sections
**File:** `src/renderer/components/PrepView.tsx`

Delete:
- Lines ~858-881: Agenda section (opening, key topics, closing)
- Lines ~883-896: Success Metrics section
- Lines ~898-909: Risk Mitigation section
- Lines ~1083-1095: Talking Points per participant
- Lines ~1097-1109: Questions to Ask per participant

### 4.2 New Component Structure

```
PrepSummary (after generation)
├── Header
│   ├── Meeting type
│   ├── "Last spoke X days ago about [topic]. Mood: [sentiment]"
│   └── Generate Another button
│
└── Per Participant Card
    ├── Block A: "The Who" (Participant Intel)
    │   ├── Key-value pairs:
    │   │   ├── Persona: Technical / Executive / Skeptic
    │   │   ├── Personal Fact: "Based in Bengaluru; avid trekker"
    │   │   ├── Recent Activity: "Opened 3 support tickets this week"
    │   │   └── CRM Role: "Decision Maker (missed last 2 calls)"
    │   └── Confidence badge with source breakdown
    │
    ├── Block B: "The History" (Paper Trail)
    │   ├── Section header: "Action Items"
    │   ├── List of items with:
    │   │   ├── Checkbox (to mark complete)
    │   │   ├── Description
    │   │   ├── Assigned to (Them/Us)
    │   │   └── Date from meeting
    │   └── Empty state: "No pending action items"
    │
    ├── Block C: Timeline
    │   ├── Chronological list:
    │   │   ├── Jan 20 (Note): They loved the UI but hated pricing
    │   │   ├── Jan 22 (HubSpot): Deal moved to 'Negotiation'
    │   │   └── Jan 25 (Email): Asked about SSO integration
    │   └── Source icons for each entry
    │
    ├── CRM Snapshot (if available)
    │   ├── Deal: "Enterprise Pilot"
    │   ├── Value: $50,000
    │   ├── Stage: Negotiation
    │   └── Blockers: "Waiting on legal review"
    │
    └── Unresolved Threads
        └── "Jan 15: They promised to send technical doc - not received"
```

### 4.3 New UI Components to Create

1. **ParticipantIntelCard** - Block A with key-value layout
2. **ActionItemsList** - Block B with checkboxes
3. **ActivityTimeline** - Block C with source icons
4. **CRMSnapshotCard** - Deal info display
5. **ConfidenceBadge** - Score with source attribution tooltip

### 4.4 Styling
Match existing design system:
- Dark theme: `bg-[#0C0C0F]`, `border-[#4ea8dd]/40`
- Cards: `rounded-xl`, `border border-gray-200 dark:border-slate-700`
- Accent color: `#4ea8dd`
- Source badges: Different colors per source type

---

## Phase 5: IPC & Handler Updates

### 5.1 New IPC Channels
**File:** `src/shared/ipcChannels.ts`

```typescript
PREP_FETCH_CRM_SNAPSHOT: 'prep:fetchCRMSnapshot',
PREP_TOGGLE_ACTION_ITEM: 'prep:toggleActionItem',
```

### 5.2 Handler Updates
**File:** `src/main/handlers/prepHandlers.ts`

- Update `PREP_GENERATE_BRIEFING` handler to use new PrepService methods
- Add handler for fetching CRM snapshot on demand
- Update action item toggle to persist to database

---

## Phase 6: Database Schema (if needed)

### 6.1 Action Item Persistence
Consider adding table for action item completion status:
```sql
CREATE TABLE action_item_status (
  id TEXT PRIMARY KEY,
  meeting_id TEXT,
  completed INTEGER DEFAULT 0,
  completed_at TEXT,
  FOREIGN KEY (meeting_id) REFERENCES meetings(id)
);
```

---

## Implementation Order

1. **Phase 2**: Define new TypeScript interfaces (foundation)
2. **Phase 1.1**: HubSpot service enhancements
3. **Phase 1.2**: Salesforce service enhancements
4. **Phase 3**: PrepService revamp with new prompt
5. **Phase 5**: IPC channel updates
6. **Phase 4**: UI component rebuild
7. **Phase 6**: Database updates if needed

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/shared/types.ts` | Add new interfaces |
| `src/main/services/HubSpotService.ts` | Add deal/email/engagement fetching |
| `src/main/services/SalesforceService.ts` | Add email/activity fetching |
| `src/main/services/PrepService.ts` | Complete rewrite of generation logic |
| `src/main/prompts/prepPrompts.ts` | New file for prep-specific prompts |
| `src/main/handlers/prepHandlers.ts` | Update handlers |
| `src/shared/ipcChannels.ts` | Add new channels |
| `src/renderer/components/PrepView.tsx` | Complete UI rebuild |

---

## Risk Mitigation

1. **CRM API Rate Limits**: Implement caching for CRM data with 15-minute TTL
2. **Missing CRM Connection**: Graceful degradation - show only local meeting data
3. **Sentiment Analysis Accuracy**: Mark as "AI-inferred" with low confidence warning
4. **Large Timelines**: Limit to last 10 events, add "Show more" pagination

---

## Testing Plan

1. Test with HubSpot connected, Salesforce disconnected
2. Test with Salesforce connected, HubSpot disconnected
3. Test with neither CRM connected (local data only)
4. Test with participant who has 0 meetings (cold contact)
5. Test with participant who has 5+ meetings (rich history)
6. Verify action item checkbox persistence
7. Verify timeline chronological ordering
