"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import logo from "@/app/logo.png";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-acc-cyan focus-visible:outline-offset-2";

const FIELD =
  "w-full rounded-xl border border-edge bg-ink/60 px-3.5 py-2.5 text-sm text-ice placeholder:text-body/50 focus:border-acc-cyan focus:outline-none";

export default function LoginPage() {
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailError("");
    setPasswordError("");

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    let hasValidationError = false;
    if (!email) {
      setEmailError("Email is required");
      hasValidationError = true;
    }
    if (!password) {
      setPasswordError("Password is required");
      hasValidationError = true;
    }
    if (hasValidationError) return;
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-ink font-display text-body antialiased selection:bg-[rgba(0,184,214,0.3)] selection:text-[#EAFBFF]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_50%_0%,rgba(0,184,214,0.1)_0%,transparent_70%)]"
        aria-hidden="true"
      />

      <main className="relative mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-5 py-12 sm:px-6 max-[450px]:max-w-none max-[450px]:flex-1 max-[450px]:px-0 max-[450px]:py-0">
        <Link href="/" className={`mx-auto flex items-center gap-3 ${FOCUS}`}>
          <span className="flex h-10 w-10 items-center justify-center overflow-hidden">
            <Image
              src={logo}
              alt="Keystone logo"
              className="h-full w-full object-contain"
            />
          </span>
          <span className="text-lg font-semibold tracking-tight text-ice">
            Keystone
          </span>
        </Link>

        <div className="mt-8 rounded-[20px] border border-edge bg-card p-6 sm:p-8 max-[450px]:mt-0 max-[450px]:flex max-[450px]:flex-1 max-[450px]:flex-col max-[450px]:justify-center max-[450px]:rounded-none max-[450px]:border-x-0">
          <section aria-labelledby="login-title">
            <p className="font-mono text-[11px] uppercase leading-[1.4] tracking-[0.14em] text-acc-cyan">
              Welcome back
            </p>
            <h1
              id="login-title"
              className="mt-3 text-2xl font-bold tracking-tight text-ice"
            >
              Sign in to your pipeline
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-body">
              Pick up where you left off — Open to Offer.
            </p>

            <form className="mt-7 space-y-4" noValidate onSubmit={onSubmit}>
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-2 block text-sm font-semibold text-ice"
                >
                  Email
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@company.com"
                  className={FIELD}
                  aria-describedby={
                    emailError ? "login-email-error" : undefined
                  }
                  aria-invalid={Boolean(emailError)}
                />
                {emailError ? (
                  <p
                    id="login-email-error"
                    className="mt-2 text-sm text-danger"
                  >
                    {emailError}
                  </p>
                ) : null}
              </div>

              <div>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <label
                    htmlFor="login-password"
                    className="text-sm font-semibold text-ice"
                  >
                    Password
                  </label>
                  <Link
                    href="#"
                    className={`font-mono text-[11px] text-acc-cyan underline-offset-4 hover:underline ${FOCUS}`}
                  >
                    Forgot?
                  </Link>
                </div>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  className={FIELD}
                  aria-describedby={
                    passwordError ? "login-password-error" : undefined
                  }
                  aria-invalid={Boolean(passwordError)}
                />
                {passwordError ? (
                  <p
                    id="login-password-error"
                    className="mt-2 text-sm text-danger"
                  >
                    {passwordError}
                  </p>
                ) : null}
              </div>

              <label className="flex items-center gap-2.5 text-sm text-body">
                <input
                  type="checkbox"
                  name="remember"
                  className="h-4 w-4 rounded border-edge bg-ink accent-acc-cyan"
                />
                Keep me signed in
              </label>

              <button
                type="submit"
                className={`w-full rounded-xl border border-acc-cyan bg-acc-cyan px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:border-[#33C7DE] hover:bg-[#33C7DE] ${FOCUS}`}
              >
                Sign in
              </button>
            </form>

            <div className="my-6 flex items-center gap-4">
              <span className="h-px flex-1 bg-edge" aria-hidden="true" />
              <span className="font-mono text-[11px] uppercase leading-[1.4] tracking-[0.14em] text-body/60">
                or
              </span>
              <span className="h-px flex-1 bg-edge" aria-hidden="true" />
            </div>

            <button
              type="button"
              className={`flex w-full items-center justify-center gap-2.5 rounded-xl border border-[#00394C] bg-[rgba(3,16,25,0.6)] px-5 py-3 text-sm font-semibold text-ice transition-colors duration-200 hover:border-acc-cyan hover:bg-[rgba(0,184,214,0.08)] ${FOCUS}`}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.73-1.56-2.55-.3-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.3-.52-1.47.11-3.07 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.6.23 2.78.11 3.07.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.4-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
              </svg>
              Continue with GitHub
            </button>

            <p className="mt-7 text-center text-sm text-body">
              Don&rsquo;t have an account?{" "}
              <Link
                href="/signup"
                className={`font-semibold text-acc-cyan underline decoration-acc-cyan/40 underline-offset-4 hover:decoration-acc-cyan ${FOCUS}`}
              >
                Sign up
              </Link>
            </p>
          </section>
        </div>

        <p className="mt-8 text-center font-mono text-[11px] uppercase leading-[1.4] tracking-[0.14em] text-body/50">
          Track. Discover. Ace.
        </p>
      </main>
    </div>
  );
}
