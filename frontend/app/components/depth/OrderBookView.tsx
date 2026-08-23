import { useState } from "react";
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

  return (
    <div className="flex flex-col h-full bg-baseBackgroundL1">
      {/* Filter Tabs */}
      <div className="flex items-center gap-5 px-3 pt-3 pb-2 border-b border-baseBorderLight">
        <button
          onClick={() => setFilter("all")}
          className={`text-sm font-medium pb-1 transition ${
            filter === "all"
              ? "text-white border-b-2 border-white"
              : "text-baseTextMedEmphasis hover:text-white"
          }`}
        >
          All
        </button>

        <button
          onClick={() => setFilter("bids")}
          className={`text-sm font-medium pb-1 transition ${
            filter === "bids"
              ? "text-greenText border-b-2 border-greenText"
              : "text-greenText/70 hover:text-greenText"
          }`}
        >
          Bids
        </button>

        <button
          onClick={() => setFilter("asks")}
          className={`text-sm font-medium pb-1 transition ${
            filter === "asks"
              ? "text-redText border-b-2 border-redText"
              : "text-redText/70 hover:text-redText"
          }`}
        >
          Asks
        </button>
      </div>

      {/* Header */}
      <TableHeader />

      {/* Orderbook rows */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Asks */}
        {(filter === "all" || filter === "asks") && (
          <div className="flex flex-col justify-end">
            <AskTable asks={asks} />
          </div>
        )}

        {/* Middle price */}
        {filter === "all" && price && (
          <div className="flex items-center gap-2 px-3 py-3 border-y border-baseBorderLight bg-baseBackgroundL2">
            <span className="text-greenText text-xl font-semibold">
              {Number(price).toFixed(2)}
            </span>

            <span className="text-greenText text-xs">▲</span>

            <span className="text-xs text-baseTextMedEmphasis ml-1">
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
    <div className="grid grid-cols-3 px-3 py-2 text-[11px] border-b border-baseBorderLight">
      <div className="text-baseTextMedEmphasis">Price</div>

      <div className="text-baseTextMedEmphasis text-right">Size</div>

      <div className="text-baseTextMedEmphasis text-right">Total</div>
    </div>
  );
}
