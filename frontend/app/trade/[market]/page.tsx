"use client";

import { MarketBar } from "@/app/components/MarketBar";
import { SwapUI } from "@/app/components/SwapUI";
// import { TradeView } from "@/app/components/TradeView";

const TradeView = dynamic(
  () => import("@/app/components/TradeView").then((mod) => mod.TradeView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-baseTextMedEmphasis">
        Loading chart...
      </div>
    ),
  },
);
import { Depth } from "@/app/components/depth/Depth";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

export default function Page() {
  const { market } = useParams();

  return (
    <div
      className="
        flex w-full flex-col bg-baseBackgroundL1 text-white
        lg:h-[calc(100vh-56px)] lg:overflow-hidden
      "
    >
      {/* MARKET HEADER */}
      <MarketBar market={market as string} />

      {/*
        Mobile / tablet -> flex column, ordered via `order-*`
        Desktop (lg+)   -> 2-col grid, chart+book (row1 col1), form (col2 spans 2 rows),
                           tables (row2 col1). Same DOM, different visual order.
      */}
      <div
        className="
          flex flex-1 flex-col
          lg:grid lg:h-[calc(100%-61px)] lg:min-h-0
          lg:grid-cols-[minmax(0,1fr)_340px]
          lg:grid-rows-[minmax(0,1fr)_220px]
          lg:overflow-hidden
        "
      >
        {/* ─── 1) CHART + ORDER BOOK ─── */}
        <div
          className="
            order-1 flex flex-col
            md:grid md:grid-cols-[minmax(0,1fr)_300px]
            lg:order-none lg:col-start-1 lg:row-start-1
            lg:min-h-0 lg:overflow-hidden lg:border-r lg:border-baseBorderLight
          "
        >
          {/* CHART */}
          <section
            className="
              min-w-0 border-b border-baseBorderLight
              md:border-b-0 md:border-r
              lg:overflow-hidden lg:border-b-0
            "
          >
            <div className="h-[380px] sm:h-[460px] md:h-[520px] lg:h-full">
              <TradeView market={market as string} />
            </div>
          </section>

          {/* ORDER BOOK */}
          <section
            className="
              min-w-0
              lg:overflow-hidden
            "
          >
            <div className="h-[440px] lg:h-full">
              <Depth market={market as string} />
            </div>
          </section>
        </div>

        {/* ─── 2) BUY / SELL FORM (SwapUI) ─── */}
        <aside
          className="
            order-2
            w-full min-w-0
            border-t border-baseBorderLight bg-baseBackgroundL1
            lg:order-none lg:col-start-2 lg:row-start-1 lg:row-span-2
            lg:h-full lg:overflow-hidden lg:border-t-0
          "
        >
          <SwapUI
            market={market as string}
            ordersPortalId="user-orders-panel"
          />
        </aside>

        {/* ─── 3) OPEN ORDERS / HISTORY / MY TRADES (portal target) ─── */}
        <section
          id="user-orders-panel"
          className="
            order-3
            h-[300px]
            border-t border-baseBorderLight bg-baseBackgroundL1
            lg:order-none lg:col-start-1 lg:row-start-2
            lg:h-auto lg:min-h-0 lg:overflow-hidden
            lg:border-t lg:border-r
          "
        />
      </div>
    </div>
  );
}
