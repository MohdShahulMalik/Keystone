import Image from "next/image";
import Link from "next/link";
import logo from "@/app/logo.png";

export const metadata = {
  title: "Keystone · Sign up",
  description:
    "Create a Keystone account to start tracking applications, discovering jobs with AI agents, and prepping for interviews.",
};

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-acc-cyan focus-visible:outline-offset-2";

const FIELD =
  "w-full rounded-xl border border-edge bg-ink/60 px-3.5 py-2.5 text-sm text-ice placeholder:text-body/50 focus:border-acc-cyan focus:outline-none";

export default function SignupPage() {
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
            <p className="font-mono text-[11px] uppercase leading-[1.4] tracking-[0.14em] text-acc-cyan">
              Free while self-hosted
            </p>
            <h1
              id="signup-title"
              className="mt-3 text-2xl font-bold tracking-tight text-ice"
            >
              Create your account
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-body">
              Upload a resume, start research, track every role.
            </p>

            <form className="mt-7 space-y-4">
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
                />
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
                />
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
                />
                <p className="mt-2 font-mono text-[11px] text-body/60">
                  8+ characters, one number recommended.
                </p>
              </div>

              <button
                type="submit"
                className={`w-full rounded-xl border border-acc-cyan bg-acc-cyan px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:border-[#33C7DE] hover:bg-[#33C7DE] ${FOCUS}`}
              >
                Create account
              </button>
            </form>

            <p className="mt-5 text-center font-mono text-[11px] uppercase leading-[1.4] tracking-[0.14em] text-body/60">
              No credit card required
            </p>

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
