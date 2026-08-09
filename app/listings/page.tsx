"use client";

import { useState } from "react";
import { type JobListing, JobListingCard } from "@/components/cards/listings";
import { Filters } from "@/components/filters";

const statuses = [
  "Saved",
  "Applied",
  "Interview",
  "Offer",
  "Rejected",
  "Declined",
] as const;

const initialListings: JobListing[] = [
  {
    id: 1,
    company: "Google",
    title: "Senior React Developer",
    location: "Remote worldwide",
    visa: "Global EOR",
    salary: "$150k - $200k",
    experience: "5+ years",
    status: "Applied",
    description:
      "Build and maintain large-scale web applications with React, TypeScript, and modern frontend tooling.",
  },
  {
    id: 2,
    company: "Meta",
    title: "Frontend Lead",
    location: "New York, hybrid",
    visa: "Sponsored",
    salary: "$180k - $220k",
    experience: "7+ years",
    status: "Saved",
    description:
      "Lead a frontend team, set technical direction, and create high-quality social experiences.",
  },
  {
    id: 3,
    company: "Startup Inc.",
    title: "Full Stack Developer",
    location: "London, onsite",
    visa: "Required",
    salary: "GBP80k - GBP100k",
    experience: "3-7 years",
    status: "Interview",
    description:
      "Join a small team building fintech products from the ground up across a modern application stack.",
  },
  {
    id: 4,
    company: "Amazon",
    title: "UI Engineer",
    location: "Remote worldwide",
    visa: "Global EOR",
    salary: "$160k - $190k",
    experience: "5+ years",
    status: "Offer",
    description:
      "Create accessible, performant interfaces that serve customers at a global scale.",
  },
];

export default function ListingsPage() {
  const [listings, setListings] = useState(initialListings);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(["All"]);

  const filteredListings = listings.filter((listing) => {
    const searchable =
      `${listing.company} ${listing.title} ${listing.location}`.toLowerCase();
    const matchesSearch = searchable.includes(searchQuery.toLowerCase());
    const matchesStatus =
      selectedStatuses.includes("All") ||
      selectedStatuses.includes(listing.status);
    return matchesSearch && matchesStatus;
  });

  function toggleStatus(status: string) {
    setSelectedStatuses((current) => {
      if (status === "All") return ["All"];
      const next = current.includes(status)
        ? current.filter((item) => item !== status && item !== "All")
        : [...current.filter((item) => item !== "All"), status];
      return next.length ? next : ["All"];
    });
  }

  function updateStatus(id: number, status: string) {
    setListings((current) =>
      current.map((listing) =>
        listing.id === id ? { ...listing, status } : listing,
      ),
    );
  }

  return (
    <main className="min-h-screen bg-surface-900 px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
            Opportunity tracker
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground-900 sm:text-4xl">
            Job listings
          </h1>
          <p className="mt-2 text-foreground-600">
            Keep every promising role and its next step in one place.
          </p>
        </header>
        <Filters
          cardName="Job"
          onAdd={() => {}}
          onSearchChange={setSearchQuery}
          searchValue={searchQuery}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 text-sm font-semibold text-foreground-600">
              Status
            </span>
            {["All", ...statuses].map((status) => {
              const selected = selectedStatuses.includes(status);
              return (
                <button
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${selected ? "border-primary bg-primary text-surface-700" : "border-stroke-muted bg-surface-800 text-foreground-600 hover:border-primary"}`}
                  key={status}
                  onClick={() => toggleStatus(status)}
                  type="button"
                >
                  {status}
                </button>
              );
            })}
          </div>
        </Filters>
        <div className="mt-8 flex items-center justify-between">
          <p className="text-sm text-foreground-600">
            {filteredListings.length}{" "}
            {filteredListings.length === 1 ? "listing" : "listings"}
          </p>
        </div>
        <section className="mt-3 space-y-4" aria-label="Job listings">
          {filteredListings.map((listing) => (
            <JobListingCard
              key={listing.id}
              listing={listing}
              onStatusChange={updateStatus}
              statuses={statuses}
            />
          ))}
          {filteredListings.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stroke-muted bg-surface-700 p-10 text-center text-foreground-600">
              No listings match these filters.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
