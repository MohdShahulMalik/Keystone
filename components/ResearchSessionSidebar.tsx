"use client";

import { useState } from "react";

export type ResearchSession = {
  id: string;
  title: string;
  detail?: string;
  updatedAt: string;
};

type ResearchSessionSidebarProps = {
  sessions: ResearchSession[];
  activeSessionId?: string;
  onNewSession?: () => void;
  onSelectSession?: (sessionId: string) => void;
  title?: string;
};

export function ResearchSessionSidebar({
  sessions,
  activeSessionId,
  onNewSession,
  onSelectSession,
  title = "Research",
}: ResearchSessionSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed left-4 top-4 z-30 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-stroke bg-surface-800 text-foreground-600 shadow-lg transition-colors hover:border-accent hover:text-foreground-900 lg:hidden"
        aria-label="Open research sessions"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-30 bg-surface-900/70 lg:hidden"
          aria-label="Close research sessions"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-stroke bg-surface-700 p-3 shadow-2xl transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-none ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-5 flex items-center justify-between px-2 pt-1">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-accent">
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 3v18m9-9H3"
                />
              </svg>
            </span>
            Keystone {title}
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-md p-1.5 text-foreground-600 transition-colors hover:bg-surface-800 hover:text-foreground-900 lg:hidden"
            aria-label="Close research sessions"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <button
          type="button"
          onClick={onNewSession}
          className="mb-4 flex items-center gap-2 rounded-xl border border-stroke bg-surface-800 px-3 py-2.5 text-sm font-medium text-foreground-900 transition-colors hover:border-accent hover:bg-secondary"
        >
          <svg
            className="h-4 w-4 text-accent"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          New research
        </button>

        <div className="mb-2 flex items-center justify-between px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground-600-subtle">
          <span>Previous sessions</span>
          <span>{sessions.length}</span>
        </div>
        <nav
          className="min-h-0 flex-1 space-y-1 overflow-y-auto"
          aria-label="Previous research sessions"
        >
          {sessions.length > 0 ? (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => {
                    onSelectSession?.(session.id);
                    setIsOpen(false);
                  }}
                  className={`group flex w-full flex-col rounded-lg px-3 py-2.5 text-left transition-colors ${
                    isActive
                      ? "bg-secondary text-foreground-900"
                      : "text-foreground-600 hover:bg-surface-800 hover:text-foreground-900"
                  }`}
                >
                  <span className="truncate text-sm font-medium">
                    {session.title}
                  </span>
                  <span className="mt-1 flex items-center justify-between gap-3 text-xs text-foreground-600-subtle">
                    <span className="truncate">{session.detail}</span>
                    <span className="shrink-0">{session.updatedAt}</span>
                  </span>
                </button>
              );
            })
          ) : (
            <p className="px-3 py-5 text-sm leading-relaxed text-foreground-600-subtle">
              Your completed research sessions will appear here.
            </p>
          )}
        </nav>

        <div className="mt-3 border-t border-stroke px-2 pt-3 text-xs text-foreground-600-subtle">
          Your research stays organized by topic.
        </div>
      </aside>
    </>
  );
}
