"use client";

import { MarketBar } from "@/app/components/MarketBar";
import { SwapUI } from "@/app/components/SwapUI";
// import { TradeView } from "@/app/components/TradeView";

const TradeView = dynamic(
  () => import("@/app/components/TradeView").then((mod) => mod.TradeView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
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
    <div className="h-[calc(100vh-56px)] w-full overflow-hidden bg-baseBackgroundL1 text-white">
      {/* MARKET HEADER */}
      <MarketBar market={market as string} />

      {/* MAIN WORKSPACE */}
      <div className="grid h-[calc(100%-61px)] grid-cols-[minmax(0,1fr)_330px]">
        {/* LEFT SIDE */}
        <main className="grid min-w-0 grid-rows-[minmax(0,1fr)_280px] overflow-hidden border-r border-baseBorderLight">
          {/* CHART + ORDER BOOK */}
          <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_290px]">
            {/* CHART */}
            <section className="min-w-0 overflow-hidden border-r border-baseBorderLight">
              <TradeView market={market as string} />
            </section>

            {/* ORDER BOOK */}
            <section className="min-w-0 overflow-hidden">
              <Depth market={market as string} />
            </section>
          </div>

          {/* USER ORDERS WILL BE PORTALED HERE */}
          <section
            id="user-orders-panel"
            className="min-h-0 overflow-hidden border-t border-baseBorderLight bg-baseBackgroundL1"
          />
        </main>

        {/* RIGHT SIDE — ONLY ORDER ENTRY */}
        <aside className="h-full min-w-0 overflow-hidden bg-baseBackgroundL1">
          <SwapUI
            market={market as string}
            ordersPortalId="user-orders-panel"
          />
        </aside>
      </div>
    </div>
  );
}
