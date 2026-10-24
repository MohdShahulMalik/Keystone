import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";

export default async function LoginPageLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/dashboard");

  // Hide the Google button when OAuth credentials are not configured —
  // leaving it visible turns a click into an opaque server error.
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );

  return (
    <>
      {googleEnabled ? null : (
        <style>{".keystone-google-signin { display: none !important; }"}</style>
      )}
      {children}
    </>
  );
}
