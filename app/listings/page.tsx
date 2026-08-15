import { ListingsClient } from "@/components/listings/listings-client";
import { getJobListings } from "@/app/actions/jobs";
import type { JobListing } from "@/lib/types/jobs";

function serializeListings(listings: JobListing[]) {
  return listings.map((listing) => ({
    ...listing,
    appliedAt: listing.appliedAt ? listing.appliedAt.toISOString() : null,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
  }));
}

export default async function ListingsPage() {
  const userId = "demo-user";
  const listings = await getJobListings(userId);
  const serializedListings = serializeListings(listings);

  return (
    <main className="min-h-screen bg-surface-900 px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto max-w-5xl">
        <ListingsClient initialListings={serializedListings} />
      </div>
    </main>
  );
}
