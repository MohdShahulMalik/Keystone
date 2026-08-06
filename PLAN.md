# Job Application Tracker with AI Integration

A smart job application tracker that uses OpenCode CLI as an AI agent to automatically research and discover relevant job listings based on user preferences and resumes.

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

- [x] Initialize Next.js project with TypeScript
- [x] Set up Prisma + Postgres (Neon)
- [x] Create data models
- [ ] Build job CRUD with Server Actions + UI
- [ ] Basic dashboard with stats

### Phase 2: AI Integration (Week 3-4)

- [ ] OpenCode CLI wrapper
- [ ] Research prompt templates
- [ ] Output parser with Zod validation
- [ ] Background job execution with status tracking
- [ ] Basic research form UI

### Phase 3: Resume Support (Week 5)

- [ ] File upload handling
- [ ] PDF text extraction
- [ ] AI-powered skill/experience parsing
- [ ] Resume-based auto-research

### Phase 4: Polish (Week 6)

- [ ] Deduplication logic
- [ ] Status management UI
- [ ] Search/filter jobs
- [ ] Export functionality

### Phase 5: Future Enhancements

- [ ] DSA tracker integration
- [ ] System design tracker
- [ ] Multi-user auth (if deploying)
- [ ] Browser extension for job scraping


## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js App (App Router)             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │  Web UI      │   │Server Actions│   │  Auth (later)│ │
│  │  (React)     │   │  (CRUD)      │   │              │ │
│  │  ┌──────────┐│   │  ┌────────┐  │   │              │ │
│  │  │ SSE Hook │◄──────┤ /api/  │  │   │              │ │
│  │  └──────────┘│   │  │research│  │   │              │ │
│  └──────┬───────┘   │  │/stream │  │   └──────────────┘ │
│         │           │  └────────┘  │                    │
│         │           └──────┬───────┘                    │
│  ┌──────┴──────────────────┴─────────────────────────┐  │
│  │              Service Layer                        │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌───────────────┐│  │
│  │  │ Job Service │ │  AI Service │ │ Resume Service││  │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬────────┘│  │
│  └─────────┼───────────────┼───────────────┼─────────┘  │
│            │               │               │            │
│  ┌─────────┴───────┐ ┌─────┴───┐  ┌────────┴───────┐    │
│  │   Postgres DB   │ │OpenCode │  │  File Storage  │    │
│  │   (Prisma)      │ │  SDK    │  │  (uploads/)    │    │
│  └─────────────────┘ └─────────┘  └────────────────┘    │
└─────────────────────────────────────────────────────────┘

Server Actions: form submissions, CRUD, settings (no fetch/URL needed)
API Routes: only SSE streaming endpoint (needs real HTTP for EventSource)
```

## Server vs Client Components

### Rules

- **Default**: Every component is a Server Component unless marked `'use client'`
- **Server Components**: Fetch data, render UI, zero JavaScript to browser
- **Client Components**: `useState`, `useEffect`, `onClick`, browser APIs
- **Boundary**: Push `'use client'` as deep as possible — only leaf components that need interactivity

### Page Breakdown

| Page | Type | Why |
|---|---|---|
| `/` (Dashboard) | **Server** | Fetches stats from DB, no interactivity |
| `/jobs` | **Server** | Fetches job list, displays table |
| `/jobs/[id]` | **Server** | Fetches single job, shows details |
| `/research` | **Client** | Form handling, SSE streaming, real-time updates |
| `/resumes` | **Server** | Lists resumes from DB |
| `layout.tsx` | **Server** | Navigation, shell — no hooks needed |

### Component Breakdown

```
app/
├── layout.tsx                    # Server (nav, shell)
├── page.tsx                      # Server (fetch stats, render)
├── jobs/
│   ├── page.tsx                  # Server (fetch jobs, render table)
│   ├── [id]/
│   │   └── page.tsx              # Server (fetch job, render details)
│   └── components/
│       ├── JobTable.tsx          # Server (receives jobs as props)
│       ├── JobRow.tsx            # Server (renders single row)
│       └── JobStatusButton.tsx   # Client (onClick to update status)
├── research/
│   ├── page.tsx                  # Client (form, SSE, real-time)
│   └── components/
│       ├── ResearchForm.tsx      # Client (form state, onSubmit)
│       ├── ResearchProgress.tsx  # Client (SSE streaming)
│       └── SubAgentCard.tsx      # Client (onClick, real-time updates)
├── resumes/
│   ├── page.tsx                  # Server (fetch resumes, render list)
│   └── components/
│       ├── ResumeList.tsx        # Server (receives resumes as props)
│       └── ResumeUploadForm.tsx  # Client (file input, upload progress)
└── actions/
    ├── jobs.ts                   # Server Action
    └── resumes.ts                # Server Action
```

### The Pattern

```
Server Component (page)
├── Fetches data from DB
├── Renders structure/layout
└── Passes data as props to:
    └── Client Component (leaf)
        ├── Handles interaction (onClick, onChange)
        ├── Manages local state (useState)
        └── Calls Server Actions on submit
```

**Example:**
```typescript
// app/jobs/page.tsx (Server)
import { db } from '@/lib/db'
import { JobTable } from './components/JobTable'

export default async function JobsPage() {
  const jobs = await db.job.findMany()  // server fetch
  return <JobTable jobs={jobs} />       // pass data down
}

// app/jobs/components/JobTable.tsx (Server)
export function JobTable({ jobs }) {
  return (
    <table>
      {jobs.map(job => <JobRow key={job.id} job={job} />)}
    </table>
  )
}

// app/jobs/components/JobStatusButton.tsx (Client)
'use client'

export function JobStatusButton({ jobId, currentStatus }) {
  const [status, setStatus] = useState(currentStatus)
  // onClick calls Server Action to update
}
```

## Data Model (Prisma Schema)

```prisma
model User {
  id            String   @id @default(cuid())
  createdAt     DateTime @default(now())

  resumes       Resume[]
  jobs          Job[]
  searchSessions SearchSession[]
}

model Resume {
  id        String   @id @default(cuid())
  userId    String
  fileName  String
  filePath  String       // stored locally in /uploads/resumes/
  content   String?      // extracted text for AI parsing
  parsedAt  DateTime?
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id])
  skills    ResumeSkill[]
}

model ResumeSkill {
  id       String @id @default(cuid())
  resumeId String
  skill    String   // e.g. "React", "Python", "System Design"
  
  resume   Resume @relation(fields: [resumeId], references: [id])
}

model Job {
  id          String   @id @default(cuid())
  userId      String
  title       String
  company     String
  location    String?
  url         String?    // original posting URL
  description String?
  salary      String?
  type        String     // remote, hybrid, onsite
  country     String?
  status      JobStatus @default(SAVED)
  source      String?    // "ai_research", "manual", "linkedin"
  notes       String?
  appliedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user        User   @relation(fields: [userId], references: [id])
  tags        JobTag[]
}

model JobTag {
  id    String @id @default(cuid())
  jobId String
  tag   String

  job   Job  @relation(fields: [jobId], references: [id])
}

enum JobStatus {
  DISCOVERED    // AI found it, not yet reviewed
  SAVED         // User saved/wants to apply
  APPLIED       // Application sent
  INTERVIEWING  // In interview process
  OFFER         // Got offer
  REJECTED      // Rejected
  DECLINED      // User declined offer
}

model SearchSession {
  id          String   @id @default(cuid())
  userId      String
  query       String   // natural language query sent to AI
  preferences Json?    // structured preferences used
  resultCount Int      @default(0)
  status      String   @default("pending") // pending, running, completed, failed
  error       String?
  createdAt   DateTime @default(now())
  completedAt DateTime?

  user        User   @relation(fields: [userId], references: [id])
  results     SearchResult[]
}

model SearchResult {
  id             String @id @default(cuid())
  sessionId      String
  jobListingJson Json     // raw AI output before dedup
  matched        Boolean @default(false) // did we add this to jobs?
  jobId          String? // if matched, which job

  session        SearchSession @relation(fields: [sessionId], references: [id])
}
```

## Project Structure

```
jobtracker/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Dashboard
│   │   ├── jobs/
│   │   │   ├── page.tsx          # Job listings table
│   │   │   └── [id]/page.tsx     # Job detail
│   │   ├── research/
│   │   │   └── page.tsx          # AI research form + history
│   │   ├── resumes/
│   │   │   └── page.tsx          # Resume upload + management
│   │   ├── actions/              # Server Actions (no API routes for CRUD)
│   │   │   ├── jobs.ts           # addJob, updateJob, deleteJob
│   │   │   └── resumes.ts        # uploadResume, deleteResume
│   │   └── api/
│   │       └── research/
│   │           └── stream/
│   │               └── route.ts  # SSE endpoint (only HTTP route)
│   ├── lib/
│   │   ├── db.ts                 # Prisma client
│   │   ├── opencode/
│   │   │   ├── client.ts         # OpenCode CLI wrapper
│   │   │   ├── prompts.ts        # Prompt templates
│   │   │   ├── parser.ts         # Parse AI output → structured data
│   │   │   └── types.ts          # AI-related types
│   │   ├── resume/
│   │   │   └── parser.ts         # Extract text from resume
│   │   └── utils.ts
│   ├── hooks/
│   │   └── useResearchStream.ts  # SSE streaming hook
│   ├── components/
│   │   ├── ui/                   # shadcn components
│   │   ├── JobTable.tsx
│   │   ├── JobCard.tsx
│   │   ├── ResearchForm.tsx
│   │   ├── ResumeUpload.tsx
│   │   └── StatusBadge.tsx
│   └── types/
│       └── index.ts
├── uploads/
│   └── resumes/                  # Local file storage
├── .env.local
├── package.json
└── next.config.js
```


## Server Actions (CRUD Operations)

### `app/actions/jobs.ts` - Job Operations

```typescript
'use server'

// addJob(data) - Create new job
// updateJob(id, data) - Update job status/notes
// deleteJob(id) - Remove job
// Each action: validates input, calls service, revalidates page
```

### `app/actions/resumes.ts` - Resume Operations

```typescript
'use server'

// uploadResume(formData) - Save PDF, extract text, store in DB
// deleteResume(id) - Remove resume and file
```

## API Route (SSE Streaming Only)

### `GET /api/research/stream` - Real-Time AI Events

```typescript
// Only API route - needed for EventSource connection
// Streams: content.delta, task.started/progress/completed, done
```

## Real-Time UI with Sub-Agent Tracking

### How It Works

OpenCode SDK provides real-time event streaming via SSE. We subscribe to events and get live updates about:
- Main agent text generation (streaming response)
- Sub-agent lifecycle (started, progress, completed)
- Tool calls within sub-agents
- Errors and completions

### Event Flow

```
User clicks "Start Research"
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  POST /api/research                                     │
│  1. Create SearchSession record                         │
│  2. Spawn OpenCode CLI + connect SDK                    │
│  3. Create session, send prompt                         │
│  4. Return SSE endpoint URL to client                   │
└─────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  GET /api/research/stream?sessionId=xxx (SSE)           │
│                                                         │
│  event: content.delta    → streaming text tokens        │
│  event: task.started     → sub-agent spawned            │
│  event: task.progress    → sub-agent working            │
│  event: task.completed   → sub-agent finished           │
│  event: item.started     → tool call started            │
│  event: item.completed   → tool call finished           │
│  event: done             → research complete            │
└─────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│  React State (useResearchStream hook)                   │
│                                                         │
│  {                                                      │
│    status: "running",                                   │
│    mainText: "I found 12 React jobs...",                │
│    subAgents: Map {                                     │
│      "task_abc123" → {                                  │
│        title: "Checking Glassdoor ratings",             │
│        status: "running",                               │
│        lastTool: "web_search",                          │
│        events: [...]                                    │
│      },                                                 │
│      "task_def456" → {                                  │
│        title: "Verifying remote policies",              │
│        status: "completed",                             │
│        output: "..."                                    │
│      }                                                  │
│    },                                                   │
│    selectedSubAgentId: null                             │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
```

### Sub-Agent Events Available

| Event | When | Data |
|---|---|---|
| `task.started` | Sub-agent begins | `taskId`, `description`, `taskType` |
| `task.progress` | Sub-agent working | `taskId`, `description`, `summary`, `lastToolName` |
| `task.completed` | Sub-agent finishes | `taskId`, `status`, `summary`, `usage` |
| `item.started` | Tool call started | `itemType: "collab_agent_tool_call"`, `title` |
| `item.updated` | Tool call update | `status`, `detail`, `data.state` |
| `item.completed` | Tool call done | `output`, `data.state.time` |

### React Hook

```typescript
// src/hooks/useResearchStream.ts
export function useResearchStream(sessionId: string) {
  const [state, setState] = useState<ResearchState>({
    status: 'idle',
    mainText: '',
    subAgents: new Map(),
    selectedSubAgentId: null,
  });

  useEffect(() => {
    const eventSource = new EventSource(`/api/research/stream?sessionId=${sessionId}`);

    eventSource.addEventListener('content.delta', (e) => {
      const { delta } = JSON.parse(e.data);
      setState(prev => ({ ...prev, mainText: prev.mainText + delta }));
    });

    eventSource.addEventListener('task.started', (e) => {
      const { taskId, description } = JSON.parse(e.data);
      setState(prev => {
        const agents = new Map(prev.subAgents);
        agents.set(taskId, {
          taskId, title: description, status: 'running',
          startedAt: new Date(), events: []
        });
        return { ...prev, subAgents: agents };
      });
    });

    eventSource.addEventListener('task.progress', (e) => {
      const { taskId, description, lastToolName } = JSON.parse(e.data);
      setState(prev => {
        const agents = new Map(prev.subAgents);
        const agent = agents.get(taskId);
        if (agent) {
          agent.description = description;
          agent.lastTool = lastToolName;
          agent.events.push({ type: 'progress', data: e.data });
        }
        return { ...prev, subAgents: agents };
      });
    });

    eventSource.addEventListener('task.completed', (e) => {
      const { taskId, status, summary } = JSON.parse(e.data);
      setState(prev => {
        const agents = new Map(prev.subAgents);
        const agent = agents.get(taskId);
        if (agent) {
          agent.status = status;
          agent.output = summary;
          agent.completedAt = new Date();
        }
        return { ...prev, subAgents: agents };
      });
    });

    eventSource.addEventListener('done', () => {
      setState(prev => ({ ...prev, status: 'completed' }));
      eventSource.close();
    });

    return () => eventSource.close();
  }, [sessionId]);

  const selectSubAgent = (taskId: string | null) => {
    setState(prev => ({ ...prev, selectedSubAgentId: taskId }));
  };

  return { state, selectSubAgent };
}
```

### UI Components

```
┌─────────────────────────────────────────────────────────┐
│  AI Job Research - Running...                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Main Agent: Researching React jobs in USA              │
│  ├─ 🔄 Web Search: "senior remote React jobs 2026"      │
│  ├─ ✅ Found 15 listings from LinkedIn                  │
│  ├─ 🔄 Analyzing company details...                     │
│  │   ├─ 🔄 [Sub-agent 1] Checking Glassdoor ratings     │
│  │   └─ 🔄 [Sub-agent 2] Verifying remote policy        │
│  ├─ ✅ Deduplication complete (3 duplicates removed)    │
│  └─ 🔄 Compiling final list...                          │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Click a sub-agent to see its activity...        │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

Click into sub-agent:
```
┌─────────────────────────────────────────────────────────┐
│  ← Back to Overview                                     │
├─────────────────────────────────────────────────────────┤
│  Sub-agent: Checking Glassdoor ratings                  │
│  Status: 🔄 Running                                     │
│  Started: 2 minutes ago                                 │
├─────────────────────────────────────────────────────────┤
│  Activity Log:                                          │
│  12:30:01  Started researching company ratings          │
│  12:30:03  🔍 Web Search: "Company X glassdoor"         │
│  12:30:05  Found rating: 4.2/5 (2,345 reviews)          │
│  12:30:07  🔍 Web Search: "Company Y glassdoor"         │
│  12:30:09  Found rating: 3.8/5 (890 reviews)            │
│  12:30:11  ✅ Completed - Checked 5 companies           │
│                                                         │
│  Output:                                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Company X: 4.2/5 ⭐ (2,345 reviews)             │    │
│  │ Company Y: 3.8/5 ⭐ (890 reviews)               │    │
│  │ Company Z: 4.5/5 ⭐ (5,123 reviews)             │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## UI Flow

```
┌─────────────────────────────────────────────────────────┐
│  Dashboard                                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │ Total Jobs   │ │ Applied     │ │ Interviews  │       │
│  │ 142         │ │ 23          │ │ 5           │       │
│  └─────────────┘ └─────────────┘ └─────────────┘       │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ [Research] [Resumes] [All Jobs] [Settings]        │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

Research Page:
┌─────────────────────────────────────────────────────────┐
│  AI Job Research                                        │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Job Types:  [Remote ✓] [Hybrid] [Onsite]         │  │
│  │ Countries:  [USA] [UK] [Canada] [+ Add]          │  │
│  │ Skills:     [React] [Node.js] [Python] [+ Add]   │  │
│  │ Notes:      [Looking for senior roles only...]    │  │
│  │ Resume:     [Upload Resume.pdf] (optional)        │  │
│  │                                                   │  │
│  │              [🔍 Start Research]                  │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  Recent Sessions:                                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │ ✅ "Remote React jobs in USA" - 15 found - 2m ago│  │
│  │ 🔄 "Python roles in UK" - Running...             │  │
│  │ ✅ "Senior frontend" - 8 found - 1h ago          │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Output Parser

```typescript
// src/lib/opencode/parser.ts
import { z } from 'zod';

const RawJobSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string().nullable(),
  url: z.string().url().nullable(),
  description: z.string(),
  salary: z.string().nullable(),
  type: z.enum(['remote', 'hybrid', 'onsite']),
  country: z.string().nullable(),
});

export const JobListingsSchema = z.array(RawJobSchema);

export function parseAIOutput(raw: string): RawJobListing[] {
  // Extract JSON from possible markdown code blocks
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
  const jsonStr = jsonMatch[1]!.trim();
  
  return JobListingsSchema.parse(JSON.parse(jsonStr));
}

export function deduplicateJobs(
  existing: Job[],
  newJobs: RawJobListing[]
): RawJobListing[] {
  // Dedupe by title + company similarity
  return newJobs.filter(newJob => 
    !existing.some(existing => 
      normalize(existing.title) === normalize(newJob.title) &&
      normalize(existing.company) === normalize(newJob.company)
    )
  );
}
```

## Key Decisions

1. **No auth for now** - Local-first, single user. Prisma schema has `User` model for future expansion.

2. **Real-time streaming via SSE** - OpenCode SDK provides event.subscribe() for real-time updates. We get:
   - Streaming text from main agent
   - Sub-agent lifecycle events (task.started, task.progress, task.completed)
   - Tool call status (item.started, item.updated, item.completed)
   - Client-side filtering by taskId for sub-agent detail views

3. **Sub-agent UI like OpenCode TUI** - Users can see all active sub-agents, click into any one to view its activity log, tool calls, and output in real-time.

4. **Deduplication** - Normalize title+company strings and compare. Keep a `source` field to track where jobs came from.

5. **File storage** - Local `/uploads/resumes/` directory. Path stored in DB, not the file itself.

6. **Error handling** - AI output might be malformed. Zod validation catches this, user sees "AI returned invalid data, please try again."

## Tech Stack

- **Frontend**: Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js Server Actions (CRUD), API Routes (SSE streaming only)
- **Database**: PostgreSQL (Neon), Prisma ORM
- **AI**: OpenCode CLI, @opencode-ai/sdk (SSE event streaming)
- **Validation**: Zod
- **File Processing**: pdf-parse (for resume text extraction)
