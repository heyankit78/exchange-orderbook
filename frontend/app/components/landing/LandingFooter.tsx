import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="bg-baseBackgroundL1">
      <div className="mx-auto w-full max-w-7xl px-5 py-10 lg:px-8">
        <div className="flex flex-col justify-between gap-8 border-b border-baseBorderLight pb-8 md:flex-row md:items-center">
          <div>
            <div className="text-sm font-semibold text-baseTextHighEmphasis">
              EXCHANGE
            </div>
            <p className="mt-2 max-w-md text-xs leading-5 text-baseTextMedEmphasis">
              A real-time order-book exchange project built around a matching
              engine, Redis, PostgreSQL/TimescaleDB and WebSockets.
            </p>
          </div>

          <div className="flex flex-wrap gap-5 text-sm text-baseTextMedEmphasis">
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
              href="/trade/BTC_USDC"
              className="transition hover:text-baseTextHighEmphasis"
            >
              Trade
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-6 text-[11px] leading-5 text-baseTextMedEmphasis md:flex-row md:items-center md:justify-between">
          <span>© 2026 Exchange. Built for learning and demonstration.</span>
          <span>
            Trading interfaces involve financial risk. This project is not
            financial advice.
          </span>
        </div>
      </div>
    </footer>
  );
}
