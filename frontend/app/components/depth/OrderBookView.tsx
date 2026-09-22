import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AskTable } from "./AskTable";
import { BidTable } from "./BidTable";

export function OrderBookView({
  bids,
  asks,
  price,
}: {
  bids: [string, string][];
  asks: [string, string][];
  price?: string;
}) {
  const [filter, setFilter] = useState<"all" | "bids" | "asks">("all");

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const middlePriceRef = useRef<HTMLDivElement>(null);

  const middleAnchorTopRef = useRef<number | null>(null);
  const hasCenteredRef = useRef(false);
  const userScrollingRef = useRef(false);

  // Reset when switching filter
  useEffect(() => {
    hasCenteredRef.current = false;
    middleAnchorTopRef.current = null;
  }, [filter]);

  // Initial centering
  useEffect(() => {
    if (filter !== "all") return;
    if (!price) return;
    if (hasCenteredRef.current) return;
    if (!middlePriceRef.current) return;

    hasCenteredRef.current = true;

    requestAnimationFrame(() => {
      middlePriceRef.current?.scrollIntoView({
        block: "center",
      });

      requestAnimationFrame(() => {
        middleAnchorTopRef.current =
          middlePriceRef.current?.getBoundingClientRect().top ?? null;
      });
    });
  }, [price, filter, asks.length, bids.length]);

  // Keep middle price at same visual position after orderbook updates
  useLayoutEffect(() => {
    if (filter !== "all") return;
    if (userScrollingRef.current) return;

    const scrollContainer = scrollContainerRef.current;
    const middlePrice = middlePriceRef.current;

    if (!scrollContainer || !middlePrice) return;

    const currentTop = middlePrice.getBoundingClientRect().top;

    if (middleAnchorTopRef.current === null) {
      middleAnchorTopRef.current = currentTop;
      return;
    }

    const delta = currentTop - middleAnchorTopRef.current;

    if (Math.abs(delta) > 0.5) {
      scrollContainer.scrollTop += delta;
    }
  }, [asks, bids, price, filter]);

  const handleUserScrollStart = () => {
    userScrollingRef.current = true;
  };

  const handleUserScrollEnd = () => {
    window.setTimeout(() => {
      userScrollingRef.current = false;

      if (middlePriceRef.current) {
        middleAnchorTopRef.current =
          middlePriceRef.current.getBoundingClientRect().top;
      }
    }, 150);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-baseBackgroundL1">
      {/* Filter Tabs */}
      <div className="flex shrink-0 items-center gap-5 border-b border-baseBorderLight px-3 pb-2 pt-3">
        <button
          onClick={() => setFilter("all")}
          className={`pb-1 text-sm font-medium transition ${
            filter === "all"
              ? "border-b-2 border-white text-white"
              : "text-baseTextMedEmphasis hover:text-white"
          }`}
        >
          All
        </button>

        <button
          onClick={() => setFilter("bids")}
          className={`pb-1 text-sm font-medium transition ${
            filter === "bids"
              ? "border-b-2 border-greenText text-greenText"
              : "text-greenText/70 hover:text-greenText"
          }`}
        >
          Bids
        </button>

        <button
          onClick={() => setFilter("asks")}
          className={`pb-1 text-sm font-medium transition ${
            filter === "asks"
              ? "border-b-2 border-redText text-redText"
              : "text-redText/70 hover:text-redText"
          }`}
        >
          Asks
        </button>
      </div>

      {/* Header */}
      <div className="shrink-0">
        <TableHeader />
      </div>

      {/* ONE shared scroll container */}
      <div
        ref={scrollContainerRef}
        onWheel={() => {
          handleUserScrollStart();
          handleUserScrollEnd();
        }}
        onTouchStart={handleUserScrollStart}
        onTouchEnd={handleUserScrollEnd}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        style={{
          overflowAnchor: "none",
          scrollbarWidth: "thin",
        }}
      >
        {/* Asks */}
        {(filter === "all" || filter === "asks") && (
          <div className="flex flex-col justify-end">
            <AskTable asks={asks} />
          </div>
        )}

        {/* Middle Price */}
        {filter === "all" && price && (
          <div
            ref={middlePriceRef}
            className="flex items-center gap-2 border-y border-baseBorderLight bg-baseBackgroundL2 px-3 py-3 sm:py-3"
          >
            <span className="text-2xl sm:text-xl font-bold sm:font-semibold text-greenText tabular-nums">
              {Number(price).toFixed(2)}
            </span>

            <span className="text-sm sm:text-xs text-greenText">▲</span>

            <span className="ml-1 text-[11px] sm:text-xs uppercase tracking-wider text-baseTextMedEmphasis">
              Last Price
            </span>
          </div>
        )}

        {/* Bids */}
        {(filter === "all" || filter === "bids") && (
          <div className="flex flex-col">
            <BidTable bids={bids} />
          </div>
        )}
      </div>
    </div>
  );
}

function TableHeader() {
  return (
    <div className="grid grid-cols-3 px-3 py-2 text-xs text-baseTextMedEmphasis">
      <span className="text-left">Price</span>
      <span className="text-right">Size</span>
      <span className="text-right">Value</span>
    </div>
  );
}
