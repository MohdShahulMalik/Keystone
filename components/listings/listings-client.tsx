"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { deleteJobListing } from "@/app/actions/jobs";
import { updateStatus } from "@/app/actions/status";
import { JobListingCard } from "@/components/cards/listings";
import { type FilterGroup, Filters } from "@/components/Filters";
import type { JobListing } from "@/lib/types/jobs";
import type { JobStatus } from "@/lib/types/status";

const statuses: JobStatus[] = [
  "OPEN",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "DECLINED",
];

interface ListingsClientProps {
  initialListings: JobListing[];
}

function formatFilterLabel(value: string) {
  if (value === "All") return value;

  return value
    .toLowerCase()
    .split(/[\s_-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getLocationTypeLocation(listing: JobListing) {
  return listing.country ?? listing.location;
}

function getLocationTypeValue(listing: JobListing) {
  return `${getLocationTypeLocation(listing)}__${listing.type}`;
}

function getLocationTypeLabel(listing: JobListing) {
  return `${getLocationTypeLocation(listing)} - ${formatFilterLabel(listing.type)}`;
}

function getLocationTypeFilterOptions(listings: JobListing[]) {
  const options = new Map<string, { label: string; value: string }>();

  for (const listing of listings) {
    const value = getLocationTypeValue(listing);

    options.set(value, {
      label: getLocationTypeLabel(listing),
      value,
    });
  }

  return [
    { label: "All", value: "All" },
    ...Array.from(options.values()).sort((a, b) =>
      a.label.localeCompare(b.label),
    ),
  ];
}

function getNextSelectedValues(current: string[], value: string) {
  if (value === "All") return ["All"];

  const selectedWithoutAll = current.filter((item) => item !== "All");
  const next = selectedWithoutAll.includes(value)
    ? selectedWithoutAll.filter((item) => item !== value)
    : [...selectedWithoutAll, value];

  return next.length ? next : ["All"];
}

function matchesSelectedValues(selectedValues: string[], value: string) {
  return selectedValues.includes("All") || selectedValues.includes(value);
}

export function ListingsClient({ initialListings }: ListingsClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(["All"]);
  const [selectedLocationTypes, setSelectedLocationTypes] = useState<string[]>([
    "All",
  ]);

  // Optimistic store: applied instantly, reconciled with the server value on
  // success (`router.refresh()`) and rolled back on failure, so slow Neon
  // roundtrips never block the UI.
  const [listings, setListings] = useState(initialListings);
  const [actionError, setActionError] = useState<string | null>(null);
  const listingsRef = useRef(listings);
  listingsRef.current = listings;
  // In-flight optimistic intents, re-applied when the post-refresh server
  // snapshot arrives so `router.refresh()` can't flash stale rows.
  const pendingStatusRef = useRef(new Map<string, JobStatus>());
  const pendingDeleteRef = useRef(new Set<string>());
  const removedRef = useRef(
    new Map<string, { item: JobListing; index: number }>(),
  );

  useEffect(() => {
    const deleted = pendingDeleteRef.current;
    const pendingById = pendingStatusRef.current;
    setListings(
      initialListings
        .filter((listing) => !deleted.has(listing.id))
        .map((listing) => {
          const pending = pendingById.get(listing.id);
          return pending && pending !== listing.status
            ? { ...listing, status: pending }
            : listing;
        }),
    );
  }, [initialListings]);

  const statusFilterOptions = useMemo(
    () => [
      { label: "All", value: "All" },
      ...statuses.map((status) => ({
        label: formatFilterLabel(status),
        value: status,
      })),
    ],
    [],
  );

  const locationTypeFilterOptions = useMemo(
    () => getLocationTypeFilterOptions(listings),
    [listings],
  );

  const filterGroups: FilterGroup[] = [
    {
      label: "Status",
      options: statusFilterOptions,
      selectedValues: selectedStatuses,
      onToggle: (status) =>
        setSelectedStatuses((current) =>
          getNextSelectedValues(current, status),
        ),
      multiSelect: true,
    },
    {
      label: "Location & Setup",
      options: locationTypeFilterOptions,
      selectedValues: selectedLocationTypes,
      onToggle: (locationType) =>
        setSelectedLocationTypes((current) =>
          getNextSelectedValues(current, locationType),
        ),
      multiSelect: true,
    },
  ];

  const filteredListings = listings.filter((listing) => {
    const searchable =
      `${listing.company} ${listing.title} ${listing.location} ${listing.country ?? ""} ${listing.type}`.toLowerCase();
    const matchesSearch = searchable.includes(searchQuery.toLowerCase());
    const matchesStatus = matchesSelectedValues(
      selectedStatuses,
      listing.status,
    );
    const matchesLocationType = matchesSelectedValues(
      selectedLocationTypes,
      getLocationTypeValue(listing),
    );

    return matchesSearch && matchesStatus && matchesLocationType;
  });

  async function updateListingStatus(id: string, status: JobStatus) {
    const previous = listingsRef.current.find((listing) => listing.id === id);
    if (!previous || previous.status === status) return { success: true };
    // Optimistic: paint the new status now, confirm with Neon in background.
    pendingStatusRef.current.set(id, status);
    setListings((current) =>
      current.map((listing) =>
        listing.id === id ? { ...listing, status } : listing,
      ),
    );
    setActionError(null);
    const result = await updateStatus(id, status);
    pendingStatusRef.current.delete(id);
    if (!result.success) {
      // Connectivity failures now carry a serializable `cause`/`code`
      // ("db_unreachable" | "timeout") so this is distinguishable from
      // validation errors without scraping server logs.
      console.error("[listings] updateStatus failed:", result);
      setListings((current) =>
        current.map((listing) =>
          listing.id === id ? { ...listing, status: previous.status } : listing,
        ),
      );
      setActionError(
        "Couldn't save the status change — the previous status was restored.",
      );
      return { success: false };
    }
    router.refresh();
    return { success: true };
  }

  async function removeListing(id: string) {
    const current = listingsRef.current;
    const index = current.findIndex((listing) => listing.id === id);
    const item = index >= 0 ? current[index] : undefined;
    // Optimistic: drop the row now, confirm with Neon in background.
    if (item) removedRef.current.set(id, { item, index });
    pendingDeleteRef.current.add(id);
    setListings((list) => list.filter((listing) => listing.id !== id));
    setActionError(null);
    const result = await deleteJobListing(id);
    pendingDeleteRef.current.delete(id);
    if (!result.success) {
      console.error("[listings] deleteJobListing failed:", result);
      const cached = removedRef.current.get(id);
      removedRef.current.delete(id);
      if (cached) {
        setListings((list) => {
          const next = [...list];
          next.splice(Math.min(cached.index, next.length), 0, cached.item);
          return next;
        });
      }
      const message =
        typeof result.error === "string"
          ? result.error
          : "Failed to delete the job listing";
      setActionError(`${message} — the listing was restored.`);
      return { success: false as const, error: message };
    }
    removedRef.current.delete(id);
    router.refresh();
    return { success: true as const, data: result.data };
  }

  return (
    <>
      <Filters
        cardName="Job"
        onAdd={() => {}}
        onSearchChange={setSearchQuery}
        searchValue={searchQuery}
        filterGroups={filterGroups}
      />

      <div className="mt-8 flex items-center justify-between">
        <p className="text-sm text-foreground-600">
          {filteredListings.length}{" "}
          {filteredListings.length === 1 ? "listing" : "listings"}
        </p>
      </div>

      {actionError ? (
        <div
          className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/15 px-4 py-3 text-sm text-rose-400"
          role="alert"
        >
          <p>{actionError}</p>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="shrink-0 rounded-md px-2 py-0.5 font-semibold transition hover:bg-rose-500/20"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <section className="mt-3 space-y-4" aria-label="Job listings">
        {filteredListings.map((listing) => (
          <JobListingCard
            key={listing.id}
            listing={listing}
            onStatusChange={updateListingStatus}
            onDelete={removeListing}
            statuses={statuses}
          />
        ))}

        {filteredListings.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stroke-muted bg-surface-700 p-10 text-center text-foreground-600">
            No listings match these filters.
          </p>
        ) : null}
      </section>
    </>
  );
}
