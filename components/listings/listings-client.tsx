"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { updateStatus } from "@/app/actions/status";
import { JobListingCard } from "@/components/cards/listings";
import { type FilterGroup, Filters } from "@/components/filters";
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
    () => getLocationTypeFilterOptions(initialListings),
    [initialListings],
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

  const filteredListings = initialListings.filter((listing) => {
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
    await updateStatus(id, status);
    router.refresh();
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

      <section className="mt-3 space-y-4" aria-label="Job listings">
        {filteredListings.map((listing) => (
          <JobListingCard
            key={listing.id}
            listing={listing}
            onStatusChange={updateListingStatus}
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
