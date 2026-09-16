"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

export function LandingHeader() {
  const { data: session } = useSession();

  const startTradingHref = session?.accessToken
    ? "/markets"
    : "/login?callbackUrl=/markets";

  return (
    <header className="sticky top-0 z-50 border-b border-baseBorderLight bg-baseBackgroundL1/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-baseBorderMed bg-baseBackgroundL2 text-sm font-bold text-greenText">
            E
          </span>

          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-wide text-baseTextHighEmphasis">
              EXCHANGE
            </div>

            <div className="text-[10px] uppercase tracking-[0.22em] text-baseTextMedEmphasis">
              Matching Engine
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-baseTextMedEmphasis md:flex">
          <a
            href="#about"
            className="transition hover:text-baseTextHighEmphasis"
          >
            About
          </a>

          <a
            href="#architecture"
            className="transition hover:text-baseTextHighEmphasis"
          >
            Architecture
          </a>

          <Link
            href={startTradingHref}
            className="transition hover:text-baseTextHighEmphasis"
          >
            Trade
          </Link>
        </nav>

        <Link
          href={startTradingHref}
          className="rounded-md border border-greenText/40 bg-greenBackgroundTransparent px-4 py-2 text-sm font-semibold text-greenText transition hover:border-greenText hover:bg-greenText/10"
        >
          Start Trading
        </Link>
      </div>
    </header>
  );
}
