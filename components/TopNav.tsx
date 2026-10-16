"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import logo from "@/app/logo.png";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/listings", label: "Listings" },
  { href: "/research/job", label: "Job research" },
  { href: "/research/dsa", label: "DSA research" },
];

export function TopNav() {
  const pathname = usePathname();

  // The landing page ships its own marketing nav, and the auth pages ship
  // their own centered brand — avoid a double header.
  if (pathname === "/" || pathname === "/login" || pathname === "/signup")
    return null;

  // Research pages render a floating "open sessions" button over the nav's
  // left edge on mobile — reserve room for it only there so other pages
  // (listings, dashboard) keep the full width for their links.
  const needsSidebarOffset = pathname.startsWith("/research");

  return (
    <header className="sticky top-0 z-20 border-b-2 border-stroke bg-surface-900/90 backdrop-blur">
      <nav
        className={`scrollbar-hidden mx-auto flex h-16 max-w-6xl items-center gap-2 overflow-x-auto px-4 sm:px-8 ${
          needsSidebarOffset ? "pl-16 sm:pl-8" : ""
        }`}
        aria-label="Primary"
      >
        <Link
          href="/"
          className="mr-3 flex shrink-0 items-center gap-2.5 text-base font-semibold tracking-tight text-foreground-900 sm:mr-5"
        >
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden">
            <Image
              src={logo}
              alt="Keystone"
              className="h-full w-full object-contain"
            />
          </span>
          Keystone
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {links.map((link) => {
            const isActive =
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-4 sm:text-[0.95rem] ${
                  isActive
                    ? "bg-secondary text-foreground-900 ring-1 ring-inset ring-accent/30"
                    : "text-foreground-600 hover:bg-surface-800 hover:text-foreground-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
