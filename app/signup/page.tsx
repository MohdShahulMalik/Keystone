"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type SubmitEvent, useState } from "react";
import logo from "@/app/logo.png";
import { authClient } from "@/lib/auth-client";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-acc-cyan focus-visible:outline-offset-2";

const FIELD =
  "w-full rounded-xl border border-edge bg-ink/60 px-3.5 py-2.5 text-sm text-ice placeholder:text-body/50 focus:border-acc-cyan focus:outline-none";

export default function SignupPage() {
  const router = useRouter();
  const [authError, setAuthError] = useState("");
  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  async function onGoogleSignIn() {
    setIsGoogleLoading(true);
    setAuthError("");
    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/dashboard",
      });

      if (error) {
        setAuthError(
          error.message ?? "We could not create your account with Google.",
        );
        setIsGoogleLoading(false);
      }
    } catch {
      setAuthError(
        "We could not create your account with Google. Please try again.",
      );
      setIsGoogleLoading(false);
    }
  }

  const onSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError("");
    setNameError("");
    setEmailError("");
    setPasswordError("");

    const formData = new FormData(e.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    let hasValidationError = false;
    if (!name) {
      setNameError("Name is required");
      hasValidationError = true;
    }
    if (!email) {
      setEmailError("Email is required");
      hasValidationError = true;
    }
    if (!password) {
      setPasswordError("Password is required");
      hasValidationError = true;
    } else if (password.length < 8) {
      setPasswordError("Password must contain at least 8 characters");
      hasValidationError = true;
    }
    if (hasValidationError) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await authClient.signUp.email({
        name,
        email,
        password,
        callbackURL: "/dashboard",
      });

      if (error) {
        setAuthError(error.message ?? "We could not create your account.");
        return;
      }
      if (data) {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setAuthError("We could not create your account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <section aria-labelledby="signup-title">
            <h1
              id="signup-title"
              className="mt-3 text-2xl font-bold tracking-tight text-ice"
            >
              Create your account
            </h1>

            <form className="mt-7 space-y-4" noValidate onSubmit={onSubmit}>
              {authError ? (
                <p
                  className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
                  role="alert"
                >
                  {authError}
                </p>
              ) : null}
              <div>
                <label
                  htmlFor="signup-name"
                  className="mb-2 block text-sm font-semibold text-ice"
                >
                  Full name
                </label>
                <input
                  id="signup-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  placeholder="Ada Lovelace"
                  className={FIELD}
                  aria-describedby={nameError ? "signup-name-error" : undefined}
                  aria-invalid={Boolean(nameError)}
                />
                {nameError ? (
                  <p
                    id="signup-name-error"
                    className="mt-2 text-sm text-danger"
                  >
                    {nameError}
                  </p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="signup-email"
                  className="mb-2 block text-sm font-semibold text-ice"
                >
                  Email
                </label>
                <input
                  id="signup-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@company.com"
                  className={FIELD}
                  aria-describedby={
                    emailError ? "signup-email-error" : undefined
                  }
                  aria-invalid={Boolean(emailError)}
                />
                {emailError ? (
                  <p
                    id="signup-email-error"
                    className="mt-2 text-sm text-danger"
                  >
                    {emailError}
                  </p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="signup-password"
                  className="mb-2 block text-sm font-semibold text-ice"
                >
                  Password
                </label>
                <input
                  id="signup-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  className={FIELD}
                  aria-describedby={
                    passwordError ? "signup-password-error" : undefined
                  }
                  aria-invalid={Boolean(passwordError)}
                />
                {passwordError ? (
                  <p
                    id="signup-password-error"
                    className="mt-2 text-sm text-danger"
                  >
                    {passwordError}
                  </p>
                ) : null}
                <p className="mt-2 font-mono text-[11px] text-body/60">
                  8+ characters, one number recommended.
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full rounded-xl border border-acc-cyan bg-acc-cyan px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:border-[#33C7DE] hover:bg-[#33C7DE] ${FOCUS}`}
              >
                {isSubmitting ? "Creating account..." : "Create account"}
              </button>
            </form>

            <div className="mt-6 flex items-center gap-4">
              <span className="h-px flex-1 bg-edge" aria-hidden="true" />
              <span className="font-mono text-[11px] uppercase leading-[1.4] tracking-[0.14em] text-body/60">
                or
              </span>
              <span className="h-px flex-1 bg-edge" aria-hidden="true" />
            </div>

            <button
              type="button"
              onClick={onGoogleSignIn}
              disabled={isGoogleLoading}
              aria-disabled={isGoogleLoading}
              className={`flex w-full items-center justify-center gap-2.5 rounded-xl border border-[#00394C] bg-[rgba(3,16,25,0.6)] px-5 py-3 text-sm font-semibold text-ice transition-colors duration-200 hover:border-acc-cyan hover:bg-[rgba(0,184,214,0.08)] ${FOCUS}`}
            >
              {isGoogleLoading ? (
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
                  />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.73-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.04c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.36 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.67 6.73-4.67z"
                  />
                </svg>
              )}
              {isGoogleLoading
                ? "Redirecting to Google..."
                : "Continue with Google"}
            </button>

            <p className="mt-7 text-center text-sm text-body">
              Already signed up?{" "}
              <Link
                href="/login"
                className={`font-semibold text-acc-cyan underline decoration-acc-cyan/40 underline-offset-4 hover:decoration-acc-cyan ${FOCUS}`}
              >
                Log in
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
