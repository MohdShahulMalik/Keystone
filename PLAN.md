# Job Application Tracker with AI Integration

A smart job application tracker that uses OpenCode CLI as an AI agent to automatically research and discover relevant job listings based on user preferences and resumes.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js App (App Router)              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Web UI       │  │  API Routes  │  │  Auth (later) │  │
│  │  (React)      │  │  (tRPC/REST) │  │              │  │
│  │  ┌──────────┐ │  │              │  │              │  │
│  │  │ SSE Hook │◄┼──┤── /api/research/stream ────────┤  │
│  │  └──────────┘ │  │  (EventSource)                 │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘  │
│         │                 │                             │
│  ┌──────┴─────────────────┴──────────────────────────┐  │
│  │              Service Layer                         │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │  │
│  │  │ Job Service  │ │ AI Service  │ │Resume Service│  │  │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘  │  │
│  └─────────┼───────────────┼───────────────┼─────────┘  │
│            │               │               │            │
│  ┌─────────┴───────┐ ┌────┴────┐  ┌───────┴────────┐  │
│  │   Postgres DB   │ │OpenCode │  │  File Storage   │  │
│  │   (Prisma)      │ │  SDK    │  │  (uploads/)     │  │
│  └─────────────────┘ └─────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Data Model (Prisma Schema)

```prisma
model User {
  id            String   @id @default(cuid())
  createdAt     DateTime @default(now())
  // Future: email, password, etc.

  resumes       Resume[]
  jobs          Job[]
  searchSessions SearchSession[]
  preferences   UserPreference[]
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
  status      JobStatus @default(APPLIED)
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

model UserPreference {
  id        String @id @default(cuid())
  userId    String
  key       String   // "job_type", "countries", "skills", "notes"
  value     String
  
  user      User @relation(fields: [userId], references: [id])
  
  @@unique([userId, key])
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
│   │   └── api/
│   │       ├── jobs/
│   │       │   └── route.ts      # CRUD for jobs
│   │       ├── research/
│   │       │   └── route.ts      # Trigger AI research
│   │       ├── resumes/
│   │       │   └── route.ts      # Upload + parse resumes
│   │       └── webhooks/
│   │           └── opencode/
│   │               └── route.ts  # OpenCode callback (if async)
│   ├── lib/
│   │   ├── db.ts                 # Prisma client
│   │   ├── opencode/
│   │   │   ├── client.ts         # OpenCode CLI wrapper
│   │   │   ├── prompts.ts        # Prompt templates
│   │   │   ├── parser.ts         # Parse AI output → structured data
│   │   │   └── types.ts          # AI-related types
│   │   ├── resume/
│   │   │   └── parser.ts         # Extract text/skills from resume
│   │   └── utils.ts
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

## AI Integration Layer

### OpenCode CLI Client

```typescript
// src/lib/opencode/client.ts
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

interface OpenCodeSession {
  id: string;
  url: string;
  cleanup: () => void;
}

export class OpenCodeClient {
  private binaryPath: string;

  constructor(binaryPath = 'opencode') {
    this.binaryPath = binaryPath;
  }

  // Spawn opencode serve, return connection info
  async startServer(): Promise<OpenCodeSession> {
    const port = 4096; // or find available
    const child = spawn(this.binaryPath, [
      'serve',
      '--hostname=127.0.0.1',
      `--port=${port}`
    ], {
      env: { ...process.env, OPENCODE_CONFIG_CONTENT: '{}' }
    });

    // Wait for "opencode server listening on http://..."
    const url = await this.waitForReady(child);
    
    return {
      id: randomUUID(),
      url,
      cleanup: () => child.kill()
    };
  }

  // Send a research prompt and get structured output
  async research(params: {
    query: string;
    preferences: JobPreferences;
    resume?: ResumeData;
  }): Promise<RawJobListing[]> {
    // 1. Start/connect to server
    // 2. Create session
    // 3. Send prompt with structured output schema
    // 4. Parse JSON response
    // 5. Return structured listings
  }
}
```

### Prompt Template

```typescript
// src/lib/opencode/prompts.ts
export function buildResearchPrompt(params: {
  query: string;
  preferences: JobPreferences;
  resume?: ResumeData;
}): string {
  return `
You are a job research assistant. Find relevant job listings based on these criteria.

## User Query
${params.query}

## Preferences
- Job Types: ${params.preferences.jobTypes.join(', ')}
- Countries: ${params.preferences.countries.join(', ')}
${params.preferences.notes ? `- Additional Notes: ${params.preferences.notes}` : ''}

${params.resume ? `
## User Profile (from resume)
Skills: ${params.resume.skills.join(', ')}
Experience: ${params.resume.experience}
Education: ${params.resume.education}
` : ''}

## Task
Search for 10-20 relevant job listings. For each job, return a JSON array with:
- title: Job title
- company: Company name
- location: Job location (city, country or "Remote")
- url: Application URL if found
- description: Brief description (1-2 sentences)
- salary: Salary range if available, null otherwise
- type: "remote" | "hybrid" | "onsite"
- country: Country where job is located

Return ONLY valid JSON array, no other text.
`;
}
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

## Key API Routes

### `POST /api/research` - Trigger AI Research

```typescript
// 1. Receive form data (preferences + optional resume)
// 2. Create SearchSession record
// 3. Spawn OpenCode in background
// 4. Stream results back via SSE or polling
// 5. Auto-add discovered jobs to tracker
```

### `POST /api/resumes` - Upload Resume

```typescript
// 1. Receive file upload
// 2. Save to /uploads/resumes/
// 3. Extract text (pdf-parse or similar)
// 4. Use OpenCode to parse skills/experience
// 5. Store parsed data in ResumeSkill table
```

### `GET/POST/PUT/DELETE /api/jobs` - CRUD

```typescript
// Standard CRUD with filtering, sorting, pagination
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
│  GET /api/research/stream?sessionId=xxx (SSE)          │
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
│  ├─ 🔄 Web Search: "senior remote React jobs 2026"    │
│  ├─ ✅ Found 15 listings from LinkedIn                 │
│  ├─ 🔄 Analyzing company details...                    │
│  │   ├─ 🔄 [Sub-agent 1] Checking Glassdoor ratings   │
│  │   └─ 🔄 [Sub-agent 2] Verifying remote policy      │
│  ├─ ✅ Deduplication complete (3 duplicates removed)   │
│  └─ 🔄 Compiling final list...                        │
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
│  12:30:03  🔍 Web Search: "Company X glassdoor"        │
│  12:30:05  Found rating: 4.2/5 (2,345 reviews)        │
│  12:30:07  🔍 Web Search: "Company Y glassdoor"        │
│  12:30:09  Found rating: 3.8/5 (890 reviews)           │
│  12:30:11  ✅ Completed - Checked 5 companies          │
│                                                         │
│  Output:                                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Company X: 4.2/5 ⭐ (2,345 reviews)            │    │
│  │ Company Y: 3.8/5 ⭐ (890 reviews)              │    │
│  │ Company Z: 4.5/5 ⭐ (5,123 reviews)            │    │
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

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

- [ ] Initialize Next.js project with TypeScript
- [ ] Set up Prisma + Postgres
- [ ] Create basic data models
- [ ] Build job CRUD API + UI
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

- **Frontend**: Next.js 14+ (App Router), React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL (local or Neon)
- **AI**: OpenCode CLI (local), @opencode-ai/sdk (SSE event streaming)
- **Validation**: Zod
- **File Processing**: pdf-parse (for resume text extraction)
- **Real-time**: Server-Sent Events (SSE) for sub-agent tracking
