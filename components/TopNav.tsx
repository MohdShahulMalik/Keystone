"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/listings", label: "Listings" },
  { href: "/research/job", label: "Job research" },
  { href: "/research/dsa", label: "DSA research" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b-2 border-stroke bg-surface-900/90 backdrop-blur">
      <nav
        className="mx-auto flex h-16 max-w-6xl items-center gap-2 overflow-x-auto px-6 pl-16 sm:px-8 lg:pl-8"
        aria-label="Primary"
      >
        <Link
          href="/"
          className="mr-5 flex shrink-0 items-center gap-2.5 text-base font-semibold tracking-tight text-foreground-900"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-accent">
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
                strokeWidth={2}
                d="M12 3v18m9-9H3"
              />
            </svg>
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
                className={`shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-[0.95rem] font-medium transition-colors ${
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
