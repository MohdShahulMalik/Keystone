import { ListingsClient } from "@/components/listings/listings-client";
import { getJobListings } from "@/app/actions/jobs";

export default async function ListingsPage() {
  const userId = "maxum";
  const listings = await getJobListings(userId);

  return (
    <main className="min-h-screen bg-surface-900 px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto max-w-5xl">
        <ListingsClient initialListings={listings} />
      </div>
    </main>
  );
}
