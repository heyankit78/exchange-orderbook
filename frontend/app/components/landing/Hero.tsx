"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { OrderBookPreview } from "./OrderBookPreview";

export function Hero() {
  const { data: session } = useSession();

  const startTradingHref = session?.accessToken
    ? "/trade/BTC_USDC"
    : "/login?callbackUrl=/trade/BTC_USDC";

  return (
    <section id="about" className="relative border-b border-baseBorderLight">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_30%,rgba(16,185,129,0.08),transparent_32%)]" />

      <div className="relative mx-auto grid min-h-[720px] w-full max-w-7xl items-center gap-14 px-5 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-baseBorderMed bg-baseBackgroundL2 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-baseTextMedEmphasis">
            <span className="h-1.5 w-1.5 rounded-full bg-greenText" />
            Real-time matching engine
          </div>

          <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-baseTextHighEmphasis sm:text-6xl lg:text-7xl">
            Trade on a real
            <span className="block text-greenText">order book.</span>
          </h1>

          <p className="mt-7 max-w-2xl text-base leading-7 text-baseTextMedEmphasis sm:text-lg">
            Place limit orders, watch bids and asks update live, track fills in
            real time, and explore market history through a full exchange-style
            interface backed by a real matching engine.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href={startTradingHref}
              className="inline-flex h-12 items-center justify-center rounded-md bg-greenText px-6 text-sm font-semibold text-black transition hover:opacity-90"
            >
              Start Trading
              <span className="ml-2">→</span>
            </Link>

            <a
              href="#architecture"
              className="inline-flex h-12 items-center justify-center rounded-md border border-baseBorderMed bg-baseBackgroundL2 px-6 text-sm font-semibold text-baseTextHighEmphasis transition hover:border-baseBorderFocus hover:bg-baseBackgroundL3"
            >
              How it works
            </a>
          </div>

          <div className="mt-12 grid max-w-2xl grid-cols-2 gap-px overflow-hidden rounded-lg border border-baseBorderLight bg-baseBorderLight sm:grid-cols-4">
            <Metric label="Transport" value="WebSocket" />
            <Metric label="Matching" value="In-memory" />
            <Metric label="Messaging" value="Redis" />
            <Metric label="Storage" value="TimescaleDB" />
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[560px] lg:mx-0 lg:ml-auto">
          <div className="absolute -inset-8 -z-10 rounded-full bg-greenText/5 blur-3xl" />
          <OrderBookPreview />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-baseBackgroundL1 px-4 py-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-baseTextMedEmphasis">
        {label}
      </div>

      <div className="mt-1 text-sm font-medium text-baseTextHighEmphasis">
        {value}
      </div>
    </div>
  );
}
