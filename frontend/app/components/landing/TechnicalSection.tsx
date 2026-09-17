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
              <article key={feature.number} className="bg-baseBackgroundL1 p-6">
                <div className="text-[11px] font-semibold text-greenText">
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

        <div className="mt-16 overflow-hidden rounded-xl border border-baseBorderMed bg-baseBackgroundL2">
          <div className="border-b border-baseBorderLight px-5 py-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-baseTextMedEmphasis">
              Request flow
            </div>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center md:gap-4">
            <FlowNode label="Browser" detail="REST + WebSocket" />
            <Arrow />
            <FlowNode label="API" detail="Redis stream" />
            <Arrow />
            <FlowNode label="Matching Engine" detail="Single logical writer" />
          </div>

          <div className="grid gap-3 border-t border-baseBorderLight p-5 md:grid-cols-2">
            <FlowNode
              label="WebSocket Server"
              detail="Depth, trades, private updates"
            />
            <FlowNode
              label="DB Worker"
              detail="PostgreSQL + TimescaleDB persistence"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function FlowNode({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-lg border border-baseBorderLight bg-baseBackgroundL1 px-4 py-4">
      <div className="text-sm font-semibold text-baseTextHighEmphasis">
        {label}
      </div>
      <div className="mt-1 text-xs text-baseTextMedEmphasis">{detail}</div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="hidden text-center text-baseTextMedEmphasis md:block">
      →
    </div>
  );
}
