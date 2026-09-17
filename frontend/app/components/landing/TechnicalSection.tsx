const features = [
  {
    number: "01",
    title: "In-memory matching engine",
    description:
      "Orders are processed against an in-memory order book so matching stays fast and deterministic.",
  },
  {
    number: "02",
    title: "Redis messaging",
    description:
      "API commands and engine events move through Redis streams and pub/sub between independent services.",
  },
  {
    number: "03",
    title: "Persistent market state",
    description:
      "Orders, balances, trades and historical market data are persisted in PostgreSQL and TimescaleDB.",
  },
  {
    number: "04",
    title: "Real-time WebSockets",
    description:
      "Depth, trades and private order updates are pushed to the browser without polling the server.",
  },
];

export function TechnicalSection() {
  return (
    <section
      id="architecture"
      className="border-b border-baseBorderLight py-24"
    >
      <div className="mx-auto w-full max-w-7xl px-5 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-greenText">
              System architecture
            </div>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold tracking-[-0.03em] text-baseTextHighEmphasis sm:text-4xl">
              Built beyond the interface.
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-7 text-baseTextMedEmphasis sm:text-base">
              The trading screen is backed by separate API, engine, WebSocket,
              database-worker and market-maker services. The UI is only one
              layer of the system.
            </p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-xl border border-baseBorderLight bg-baseBorderLight sm:grid-cols-2">
            {features.map((feature) => (
              <article
                key={feature.number}
                className="bg-baseBackgroundL1 p-6 transition hover:bg-baseBackgroundL2"
              >
                <div className="text-[11px] font-semibold tabular-nums text-greenText">
                  {feature.number}
                </div>
                <h3 className="mt-5 text-base font-semibold text-baseTextHighEmphasis">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-baseTextMedEmphasis">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </div>

        {/* ============================================
              REQUEST FLOW
           ============================================ */}
        <div className="mt-16 overflow-hidden rounded-2xl border border-baseBorderLight bg-baseBackgroundL2">
          <div className="border-b border-baseBorderLight px-5 py-4 sm:px-6">
            <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-baseTextMedEmphasis">
              Request flow
            </span>
          </div>

          <div className="p-5 sm:p-6 lg:p-8">
            {/* UPSTREAM ROW: Browser → API → Matching engine */}
            <div className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-3">
              <FlowCard
                icon="monitor"
                label="Browser"
                detail="REST + WebSocket"
              />
              <FlowArrow />
              <FlowCard icon="server" label="API" detail="Redis stream" />
              <FlowArrow />
              <FlowCard
                icon="bolt"
                label="Matching engine"
                detail="Single logical writer"
                isCore
              />
            </div>

            {/* Divider — signals fan-out to the parallel row below */}
            <div className="flex items-center justify-center gap-3 py-5 sm:py-6">
              <div className="h-px w-10 bg-baseBorderLight sm:w-16" />
              <svg
                className="h-4 w-4 text-baseTextMedEmphasis"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M6 13l6 6 6-6" />
              </svg>
              <div className="h-px w-10 bg-baseBorderLight sm:w-16" />
            </div>

            {/* DOWNSTREAM ROW: WebSocket server | DB worker (parallel) */}
            <div className="grid gap-3 md:grid-cols-2 md:gap-3">
              <FlowCard
                icon="broadcast"
                label="WebSocket server"
                detail="Depth, trades, private updates"
              />
              <FlowCard
                icon="database"
                label="DB worker"
                detail="PostgreSQL + TimescaleDB persistence"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================
   FLOW CARD  —  icon + label + subtitle
========================================= */

function FlowCard({
  icon,
  label,
  detail,
  isCore,
}: {
  icon: string;
  label: string;
  detail: string;
  isCore?: boolean;
}) {
  return (
    <div
      className={`
        group relative flex-1 min-w-0 rounded-xl border p-4 transition
        hover:border-baseBorderFocus sm:p-5
        ${
          isCore
            ? "border-greenText/25 bg-baseBackgroundL1"
            : "border-baseBorderLight bg-baseBackgroundL1"
        }
      `}
    >
      <div className="flex items-center gap-3.5">
        <div
          className={`
            flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition
            ${
              isCore
                ? "border-greenText/30 bg-greenText/10 text-greenText"
                : "border-baseBorderLight bg-baseBackgroundL2 text-baseTextHighEmphasis"
            }
          `}
        >
          <FlowIcon name={icon} className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-tight text-baseTextHighEmphasis">
            {label}
          </div>
          <div className="mt-1 text-[12.5px] leading-tight text-baseTextMedEmphasis">
            {detail}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================
   ARROW  —  horizontal on desktop, vertical on mobile
========================================= */

function FlowArrow() {
  return (
    <div className="flex shrink-0 items-center justify-center py-1 md:py-0 md:px-1">
      <svg
        className="h-4 w-4 rotate-90 text-baseTextMedEmphasis md:rotate-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </div>
  );
}

/* =========================================
   ICONS  —  inline SVG, no deps
========================================= */

function FlowIcon({ name, className }: { name: string; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "monitor":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    case "server":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="7" rx="1.5" />
          <rect x="3" y="13" width="18" height="7" rx="1.5" />
          <path d="M7 7.5h.01M7 16.5h.01" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" strokeLinejoin="round" />
        </svg>
      );
    case "broadcast":
      return (
        <svg {...common}>
          <path d="M12 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
          <path d="M7.5 7.5a6.5 6.5 0 0 0 0 9M16.5 7.5a6.5 6.5 0 0 1 0 9" />
        </svg>
      );
    case "database":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="5.5" rx="8" ry="3" />
          <path d="M4 5.5V18c0 1.66 3.58 3 8 3s8-1.34 8-3V5.5" />
          <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
        </svg>
      );
    default:
      return null;
  }
}
