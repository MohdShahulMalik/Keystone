"use client";

import { useState } from "react";
import { JobListingCard } from "@/components/cards/listings";
import { Filters } from "@/components/filters";
import { JobListing } from "@/lib/types/jobs";

interface Tab {
  location: string;
  type: string;
}

function createTabs(jobListings: JobListing[]): Map<Tab, JobListing[]> {
  const tabsMap = new Map<Tab, JobListing[]>();

  for (const jobListing of jobListings) {
    const tab: Tab = {
      location: jobListing.location as string,
      type: jobListing.type,
    };

    tabsMap.set(tab, [...(tabsMap.get(tab) || []), jobListing]);
  }

  return tabsMap;
}

const statuses = [
  "Saved",
  "Applied",
  "Interview",
  "Offer",
  "Rejected",
  "Declined",
] as const;

const filterStatuses = ["All", ...statuses];

const initialListings: JobListing[] = [
  {
    company: "Google",
    title: "Senior React Developer",
    location: "Remote worldwide",
    visa: "Global EOR",
    salary: "$150k - $200k",
    experience: "5+ years",
    status: "APPLIED",
    description:
      "Build and maintain large-scale web applications with React, TypeScript, and modern frontend tooling.",
  },
  {
    company: "Meta",
    title: "Frontend Lead",
    location: "New York, hybrid",
    visa: "Sponsored",
    salary: "$180k - $220k",
    experience: "7+ years",
    status: "SAVED",
    description:
      "Lead a frontend team, set technical direction, and create high-quality social experiences.",
  },
  {
    company: "Startup Inc.",
    title: "Full Stack Developer",
    location: "London, onsite",
    visa: "Required",
    salary: "GBP80k - GBP100k",
    experience: "3-7 years",
    status: "INTERVIEW",
    description:
      "Join a small team building fintech products from the ground up across a modern application stack.",
  },
  {
    company: "Amazon",
    title: "UI Engineer",
    location: "Remote worldwide",
    visa: "Global EOR",
    salary: "$160k - $190k",
    experience: "5+ years",
    status: "OFFER",
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
        <Filters
          cardName="Job"
          onAdd={() => {}}
          onSearchChange={setSearchQuery}
          searchValue={searchQuery}
          statuses={filterStatuses}
          selectedStatuses={selectedStatuses}
          onToggleStatus={toggleStatus}
        />

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
