import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";

export default async function SignupPageLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/dashboard");

  // Keep in sync with app/login/layout.tsx — the Google button must vanish
  // when OAuth credentials are not configured.
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
