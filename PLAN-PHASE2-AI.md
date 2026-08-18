# Phase 2: AI Integration Implementation Plan

## Overview

Integrate OpenCode as an AI agent to perform job research. The architecture uses:
- **OpenCode SDK** to spawn/manage the AI agent
- **SSE (Server-Sent Events)** for chunk-based streaming to the client
- **Next.js App Router** with API route for SSE endpoint

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React Client                                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │  useResearchStream hook                         │    │
│  │  - EventSource to /api/research/stream          │    │
│  │  - Handles: chunk, status, error, done events   │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Next.js API Route: /api/research/stream (SSE)          │
│  - GET endpoint with EventSource                        │
│  - Reads from OpenCode event stream                     │
│  - Forwards chunks to client                            │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  OpenCode Server (spawned via SDK)                      │
│  - createOpencode() starts server + client              │
│  - session.create() → session.prompt()                  │
│  - event.subscribe() → SSE stream                       │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  LLM Provider (Anthropic, OpenAI, etc.)                 │
│  - Actual AI inference                                  │
└─────────────────────────────────────────────────────────┘
```

## File Structure

```
app/
├── api/
│   └── research/
│       └── stream/
│           └── route.ts          # SSE endpoint
├── research/
│   ├── page.tsx                  # Client component
│   └── components/
│       ├── ResearchForm.tsx      # Form to start research
│       └── ResearchProgress.tsx  # Streaming progress display
├── actions/
│   └── research.ts               # Server actions for research
lib/
├── opencode/
│   ├── client.ts                 # OpenCode SDK wrapper
│   ├── server.ts                 # OpenCode server management
│   ├── prompts.ts                # Prompt templates (user fills this)
│   ├── parser.ts                 # Parse AI output to structured data
│   └── types.ts                  # AI-related types
hooks/
└── useResearchStream.ts          # SSE streaming hook
```

## Implementation Steps

### Step 1: Install Dependencies

```bash
bun add @opencode-ai/sdk
```

### Step 2: Create OpenCode Client Wrapper

**File: `lib/opencode/client.ts`**

```typescript
import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk"

// Singleton OpenCode server instance
let serverInstance: Awaited<ReturnType<typeof createOpencode>> | null = null

export async function getOpenCodeServer() {
  if (serverInstance) return serverInstance
  
  serverInstance = await createOpencode({
    hostname: "127.0.0.1",
    port: 4096, // or random port
    config: {
      // Model configuration will be set per-session
    }
  })
  
  return serverInstance
}

export async function getOpenCodeClient() {
  const server = await getOpenCodeServer()
  return server.client
}
```

### Step 3: Create OpenCode Server Management

**File: `lib/opencode/server.ts`**

```typescript
import { getOpenCodeClient } from "./client"

export async function createResearchSession() {
  const client = await getOpenCodeClient()
  
  // Create a new session for this research task
  const session = await client.session.create({
    body: {
      title: "Job Research"
    }
  })
  
  return session.data
}

export async function sendResearchPrompt(
  sessionId: string,
  prompt: string,
  model?: { providerID: string; modelID: string }
) {
  const client = await getOpenCodeClient()
  
  // Send prompt and wait for response
  const result = await client.session.prompt({
    path: { id: sessionId },
    body: {
      model,
      parts: [{ type: "text", text: prompt }]
    }
  })
  
  return result.data
}

export async function subscribeToEvents() {
  const client = await getOpenCodeClient()
  
  // Subscribe to server-sent events
  const events = await client.event.subscribe()
  return events.stream
}
```

### Step 4: Create Prompt Templates

**File: `lib/opencode/prompts.ts`**

```typescript
export interface ResearchPreferences {
  jobTypes: string[]      // ["remote", "hybrid", "onsite"]
  countries: string[]     // ["USA", "UK", "Canada"]
  skills: string[]        // ["React", "Node.js", "Python"]
  notes?: string          // Additional notes
  resumeContent?: string  // Extracted resume text
}

export function buildResearchPrompt(preferences: ResearchPreferences): string {
  // USER FILLS THIS IN with their specific prompt
  // This is a template - customize for your use case
  
  const { jobTypes, countries, skills, notes, resumeContent } = preferences
  
  let prompt = `Research and find relevant job listings based on these criteria:
  
Job Types: ${jobTypes.join(", ")}
Countries: ${countries.join(", ")}
Skills: ${skills.join(", ")}
`
  
  if (notes) {
    prompt += `\nAdditional Notes: ${notes}`
  }
  
  if (resumeContent) {
    prompt += `\n\nResume Context:\n${resumeContent}`
  }
  
  prompt += `
  
Please search for job listings and return them in this JSON format:
{
  "jobs": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "location": "City, Country",
      "url": "https://...",
      "description": "Brief description",
      "salary": "Salary range or null",
      "type": "remote|hybrid|onsite",
      "country": "Country"
    }
  ]
}
`
  
  return prompt
}
```

### Step 5: Create SSE API Route

**File: `app/api/research/stream/route.ts`**

```typescript
import { NextRequest } from "next/server"
import { subscribeToEvents } from "@/lib/opencode/server"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const sessionId = searchParams.get("sessionId")
  
  if (!sessionId) {
    return new Response("Missing sessionId", { status: 400 })
  }
  
  // Create SSE response
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Subscribe to OpenCode events
        const eventStream = await subscribeToEvents()
        
        let chunkBuffer = ""
        const CHUNK_INTERVAL = 100 // Send chunks every 100ms
        
        // Buffer for chunk-based streaming
        const intervalId = setInterval(() => {
          if (chunkBuffer.length > 0) {
            const event = `event: chunk\ndata: ${JSON.stringify({ text: chunkBuffer })}\n\n`
            controller.enqueue(encoder.encode(event))
            chunkBuffer = ""
          }
        }, CHUNK_INTERVAL)
        
        // Process events from OpenCode
        for await (const event of eventStream) {
          // Filter events for this session
          if (event.properties?.sessionID !== sessionId) continue
          
          // Handle different event types
          switch (event.type) {
            case "message.updated":
              // Text delta from assistant
              const delta = event.properties?.delta
              if (delta) {
                chunkBuffer += delta
              }
              break
              
            case "message.completed":
              // Message finished
              const completedEvent = `event: message.completed\ndata: ${JSON.stringify({
                messageId: event.properties?.messageID
              })}\n\n`
              controller.enqueue(encoder.encode(completedEvent))
              break
              
            case "session.status":
              // Session status update
              const statusEvent = `event: status\ndata: ${JSON.stringify({
                status: event.properties?.status
              })}\n\n`
              controller.enqueue(encoder.encode(statusEvent))
              break
              
            case "error":
              // Error occurred
              const errorEvent = `event: error\ndata: ${JSON.stringify({
                message: event.properties?.message || "Unknown error"
              })}\n\n`
              controller.enqueue(encoder.encode(errorEvent))
              break
          }
        }
        
        // Send any remaining buffered content
        if (chunkBuffer.length > 0) {
          const finalEvent = `event: chunk\ndata: ${JSON.stringify({ text: chunkBuffer })}\n\n`
          controller.enqueue(encoder.encode(finalEvent))
        }
        
        // Send done event
        const doneEvent = `event: done\ndata: {}\n\n`
        controller.enqueue(encoder.encode(doneEvent))
        
        clearInterval(intervalId)
        controller.close()
      } catch (error) {
        console.error("SSE stream error:", error)
        const errorEvent = `event: error\ndata: ${JSON.stringify({
          message: error instanceof Error ? error.message : "Stream error"
        })}\n\n`
        controller.enqueue(encoder.encode(errorEvent))
        controller.close()
      }
    }
  })
  
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    }
  })
}
```

### Step 6: Create Research Server Actions

**File: `app/actions/research.ts`**

```typescript
"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { createResearchSession, sendResearchPrompt } from "@/lib/opencode/server"
import { buildResearchPrompt, type ResearchPreferences } from "@/lib/opencode/prompts"

const startResearchSchema = z.object({
  jobTypes: z.array(z.string()).min(1),
  countries: z.array(z.string()).min(1),
  skills: z.array(z.string()).min(1),
  notes: z.string().optional(),
  resumeId: z.string().optional(),
})

export async function startResearch(preferences: ResearchPreferences) {
  // Validate input
  const validated = startResearchSchema.parse(preferences)
  
  // Get user (hardcoded for now)
  const user = await db.user.findFirst()
  if (!user) throw new Error("No user found")
  
  // Create search session in DB
  const session = await db.searchSession.create({
    data: {
      userId: user.id,
      query: buildResearchPrompt(validated),
      preferences: validated,
      status: "running"
    }
  })
  
  // Get resume content if provided
  let resumeContent: string | undefined
  if (validated.resumeId) {
    const resume = await db.resume.findUnique({
      where: { id: validated.resumeId }
    })
    resumeContent = resume?.content ?? undefined
  }
  
  // Create OpenCode session
  const openCodeSession = await createResearchSession()
  
  // Build prompt with preferences
  const prompt = buildResearchPrompt({
    ...validated,
    resumeContent
  })
  
  // Send prompt to OpenCode (async - don't wait for response)
  sendResearchPrompt(openCodeSession.id, prompt).catch(async (error) => {
    console.error("Research failed:", error)
    await db.searchSession.update({
      where: { id: session.id },
      data: { 
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error"
      }
    })
  })
  
  return { 
    sessionId: session.id,
    openCodeSessionId: openCodeSession.id 
  }
}

export async function getResearchStatus(sessionId: string) {
  const session = await db.searchSession.findUnique({
    where: { id: sessionId },
    include: { results: true }
  })
  
  if (!session) throw new Error("Session not found")
  
  return {
    id: session.id,
    status: session.status,
    resultCount: session.resultCount,
    error: session.error,
    createdAt: session.createdAt,
    completedAt: session.completedAt
  }
}
```

### Step 7: Create SSE Streaming Hook

**File: `hooks/useResearchStream.ts`**

```typescript
"use client"

import { useState, useEffect, useCallback } from "react"

export interface ResearchState {
  status: "idle" | "connecting" | "running" | "completed" | "error"
  mainText: string
  error?: string
  messageId?: string
}

export function useResearchStream(sessionId: string | null) {
  const [state, setState] = useState<ResearchState>({
    status: "idle",
    mainText: ""
  })
  
  useEffect(() => {
    if (!sessionId) return
    
    setState(prev => ({ ...prev, status: "connecting" }))
    
    const eventSource = new EventSource(
      `/api/research/stream?sessionId=${sessionId}`
    )
    
    eventSource.addEventListener("chunk", (e) => {
      const { text } = JSON.parse(e.data)
      setState(prev => ({ 
        ...prev, 
        status: "running",
        mainText: prev.mainText + text 
      }))
    })
    
    eventSource.addEventListener("status", (e) => {
      const { status } = JSON.parse(e.data)
      setState(prev => ({ ...prev, status: "running" }))
    })
    
    eventSource.addEventListener("message.completed", (e) => {
      const { messageId } = JSON.parse(e.data)
      setState(prev => ({ ...prev, messageId }))
    })
    
    eventSource.addEventListener("error", (e) => {
      const data = e.data ? JSON.parse(e.data) : { message: "Connection error" }
      setState(prev => ({ 
        ...prev, 
        status: "error", 
        error: data.message 
      }))
      eventSource.close()
    })
    
    eventSource.addEventListener("done", () => {
      setState(prev => ({ ...prev, status: "completed" }))
      eventSource.close()
    })
    
    eventSource.onerror = () => {
      setState(prev => ({ 
        ...prev, 
        status: "error", 
        error: "Failed to connect" 
      }))
      eventSource.close()
    }
    
    return () => eventSource.close()
  }, [sessionId])
  
  const reset = useCallback(() => {
    setState({ status: "idle", mainText: "" })
  }, [])
  
  return { state, reset }
}
```

### Step 8: Create Research Form Component

**File: `app/research/components/ResearchForm.tsx`**

```typescript
"use client"

import { useState } from "react"
import { startResearch } from "@/app/actions/research"

interface ResearchFormProps {
  onResearchStarted: (sessionId: string) => void
}

export function ResearchForm({ onResearchStarted }: ResearchFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [preferences, setPreferences] = useState({
    jobTypes: ["remote"],
    countries: ["USA"],
    skills: [""],
    notes: ""
  })
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    
    try {
      const result = await startResearch(preferences)
      onResearchStarted(result.sessionId)
    } catch (error) {
      console.error("Failed to start research:", error)
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Job Types */}
      <div>
        <label className="block text-sm font-medium mb-2">Job Types</label>
        <div className="flex gap-2">
          {["remote", "hybrid", "onsite"].map(type => (
            <label key={type} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={preferences.jobTypes.includes(type)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setPreferences(prev => ({
                      ...prev,
                      jobTypes: [...prev.jobTypes, type]
                    }))
                  } else {
                    setPreferences(prev => ({
                      ...prev,
                      jobTypes: prev.jobTypes.filter(t => t !== type)
                    }))
                  }
                }}
              />
              <span className="capitalize">{type}</span>
            </label>
          ))}
        </div>
      </div>
      
      {/* Countries */}
      <div>
        <label className="block text-sm font-medium mb-2">Countries</label>
        <input
          type="text"
          value={preferences.countries.join(", ")}
          onChange={(e) => setPreferences(prev => ({
            ...prev,
            countries: e.target.value.split(",").map(s => s.trim())
          }))}
          placeholder="USA, UK, Canada"
          className="w-full p-2 border rounded"
        />
      </div>
      
      {/* Skills */}
      <div>
        <label className="block text-sm font-medium mb-2">Skills</label>
        <input
          type="text"
          value={preferences.skills.join(", ")}
          onChange={(e) => setPreferences(prev => ({
            ...prev,
            skills: e.target.value.split(",").map(s => s.trim())
          }))}
          placeholder="React, Node.js, Python"
          className="w-full p-2 border rounded"
        />
      </div>
      
      {/* Notes */}
      <div>
        <label className="block text-sm font-medium mb-2">Notes</label>
        <textarea
          value={preferences.notes}
          onChange={(e) => setPreferences(prev => ({
            ...prev,
            notes: e.target.value
          }))}
          placeholder="Additional notes for the AI..."
          className="w-full p-2 border rounded"
          rows={3}
        />
      </div>
      
      <button
        type="submit"
        disabled={isLoading}
        className="w-full p-2 bg-blue-500 text-white rounded disabled:opacity-50"
      >
        {isLoading ? "Starting Research..." : "Start Research"}
      </button>
    </form>
  )
}
```

### Step 9: Create Research Progress Component

**File: `app/research/components/ResearchProgress.tsx`**

```typescript
"use client"

import { useResearchStream } from "@/hooks/useResearchStream"

interface ResearchProgressProps {
  sessionId: string
}

export function ResearchProgress({ sessionId }: ResearchProgressProps) {
  const { state } = useResearchStream(sessionId)
  
  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${
          state.status === "running" ? "bg-green-500 animate-pulse" :
          state.status === "completed" ? "bg-green-500" :
          state.status === "error" ? "bg-red-500" :
          "bg-gray-300"
        }`} />
        <span className="font-medium capitalize">{state.status}</span>
      </div>
      
      {/* Error */}
      {state.error && (
        <div className="p-3 bg-red-100 border border-red-300 rounded text-red-700">
          {state.error}
        </div>
      )}
      
      {/* Streaming Text */}
      {state.mainText && (
        <div className="p-4 bg-gray-50 border rounded">
          <div className="text-sm text-gray-500 mb-2">AI Response:</div>
          <div className="whitespace-pre-wrap">{state.mainText}</div>
        </div>
      )}
      
      {/* Loading indicator */}
      {state.status === "connecting" && (
        <div className="text-gray-500">Connecting to AI...</div>
      )}
      
      {state.status === "running" && !state.mainText && (
        <div className="text-gray-500">Thinking...</div>
      )}
    </div>
  )
}
```

### Step 10: Create Research Page

**File: `app/research/page.tsx`**

```typescript
"use client"

import { useState } from "react"
import { ResearchForm } from "./components/ResearchForm"
import { ResearchProgress } from "./components/ResearchProgress"

export default function ResearchPage() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">AI Job Research</h1>
      
      {!sessionId ? (
        <ResearchForm onResearchStarted={setSessionId} />
      ) : (
        <div className="space-y-6">
          <ResearchProgress sessionId={sessionId} />
          
          <button
            onClick={() => setSessionId(null)}
            className="text-blue-500 hover:underline"
          >
            Start New Research
          </button>
        </div>
      )}
    </div>
  )
}
```

## Key Decisions

1. **Chunk-Based Streaming**: Events are buffered for 100ms before sending to reduce overhead
2. **Singleton OpenCode Server**: One server instance shared across requests
3. **Session-Based**: Each research task gets its own OpenCode session
4. **Server Actions**: Research initiation uses server actions for simplicity
5. **Event Filtering**: SSE route filters events by session ID

## Environment Variables

Add to `.env`:

```bash
# OpenCode configuration (optional - uses defaults if not set)
OPENCODE_PORT=4096
OPENCODE_HOSTNAME=127.0.0.1
```

## Testing

1. Start the Next.js dev server: `bun run dev`
2. Navigate to `/research`
3. Fill in the form and click "Start Research"
4. Watch the streaming progress
5. Check that results are parsed and stored in the database

## Reference: t3code Integration Approach

For reference, t3code (https://github.com/pingdotgg/t3code) uses a similar approach but with WebSocket RPC instead of SSE:

- They use `@opencode-ai/sdk/v2` to create an OpenCode client
- They spawn OpenCode server with `opencode serve --hostname=127.0.0.1 --port={port}`
- They subscribe to events via `client.event.subscribe()`
- They use `thread.message.assistant.delta` events for streaming text deltas
- They use Effect's Stream module for handling streaming data

Our approach is simpler and better suited for a Next.js app because:
- SSE is HTTP-based (no WebSocket infrastructure needed)
- Simpler to implement with Next.js API routes
- Sufficient for our use case (streaming research results)
