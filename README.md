# Keystone

AI-powered career companion. Track applications, discover opportunities, and ace your interviews, all in one place.

## Features

- Job application tracking with status management
- AI-powered job research using OpenCode CLI
- Real-time streaming UI with sub-agent activity tracking
- Resume upload and skill extraction
- Deduplication of job listings
- Browser extension for quick job saving

## Tech Stack

- **Frontend**: Next.js (App Router), React, TypeScript, Tailwind CSS
- **Backend**: Server Actions, Prisma ORM
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

## Future Scope

### DSA Problem Tracker

- Track solved DSA problems with topics, difficulty, and revisit dates
- AI finds problems based on your current level and weak areas
- Company-specific preparation: AI provides questions that specific companies actually ask
- Spaced repetition to remind when to revisit problems
- Progress dashboard with topic-wise breakdown
