# Keystone

A smart job application tracker with AI integration. Uses OpenCode CLI as an AI agent to automatically research and discover relevant job listings based on user preferences and resumes.

## Features (Work in Progress)

- Job application tracking with status management
- AI-powered job research using OpenCode CLI
- Real-time streaming UI with sub-agent activity tracking
- Resume upload and skill extraction
- Deduplication of job listings

## Tech Stack

- **Frontend**: Next.js (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: PostgreSQL (Neon)
- **AI**: OpenCode CLI, @opencode-ai/sdk

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Status

This project is **work in progress**. Core features are being built out.
