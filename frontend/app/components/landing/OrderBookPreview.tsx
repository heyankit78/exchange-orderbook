const asks = [
  ["77,496.35", "20", 92],
  ["77,480.88", "12", 76],
  ["77,465.42", "11", 64],
  ["77,449.96", "5", 49],
  ["77,434.49", "14", 37],
];

const bids = [
  ["77,279.85", "4", 34],
  ["77,264.38", "5", 43],
  ["77,261.43", "2", 58],
  ["77,248.92", "9", 71],
  ["77,233.45", "11", 88],
];

export function OrderBookPreview() {
  return (
    <div className="overflow-hidden rounded-xl border border-baseBorderMed bg-baseBackgroundL1 shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between border-b border-baseBorderLight px-4 py-3">
        <div>
          <div className="text-xs font-semibold text-baseTextHighEmphasis">
            BTC / USDC
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-baseTextMedEmphasis">
            <span className="h-1.5 w-1.5 rounded-full bg-greenText" />
            Live order book
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-baseTextMedEmphasis">
            Spread
          </div>
          <div className="text-xs font-medium text-baseTextHighEmphasis">
            0.04%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 px-4 py-2 text-[10px] uppercase tracking-wider text-baseTextMedEmphasis">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      <div>
        {asks.map(([price, size, width], index) => (
          <BookRow
            key={String(price)}
            price={String(price)}
            size={String(size)}
            total={String(95 - index * 12)}
            width={Number(width)}
            side="ask"
          />
        ))}
      </div>

      <div className="flex items-center justify-between border-y border-baseBorderLight bg-baseBackgroundL2 px-4 py-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-greenText">
            77,357.17
          </span>
          <span className="text-xs text-greenText">▲</span>
        </div>
        <span className="text-[10px] uppercase tracking-[0.15em] text-baseTextMedEmphasis">
          Last price
        </span>
      </div>

      <div>
        {bids.map(([price, size, width], index) => (
          <BookRow
            key={String(price)}
            price={String(price)}
            size={String(size)}
            total={String(4 + index * 9)}
            width={Number(width)}
            side="bid"
          />
        ))}
      </div>

      <div className="grid grid-cols-2 border-t border-baseBorderLight">
        <div className="border-r border-baseBorderLight px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-baseTextMedEmphasis">
            Bid depth
          </div>
          <div className="mt-1 text-sm font-semibold text-greenText">47%</div>
        </div>
        <div className="px-4 py-3 text-right">
          <div className="text-[10px] uppercase tracking-wider text-baseTextMedEmphasis">
            Ask depth
          </div>
          <div className="mt-1 text-sm font-semibold text-redText">53%</div>
        </div>
      </div>
    </div>
  );
}

function BookRow({
  price,
  size,
  total,
  width,
  side,
}: {
  price: string;
  size: string;
  total: string;
  width: number;
  side: "bid" | "ask";
}) {
  return (
    <div className="relative grid h-8 grid-cols-3 items-center px-4 text-xs">
      <div
        className={`absolute inset-y-0 right-0 ${
          side === "ask" ? "bg-redText/10" : "bg-greenText/10"
        }`}
        style={{ width: `${width}%` }}
      />

      <span
        className={`relative font-medium ${
          side === "ask" ? "text-redText" : "text-greenText"
        }`}
      >
        {price}
      </span>
      <span className="relative text-right text-baseTextHighEmphasis">
        {size}
      </span>
      <span className="relative text-right text-baseTextMedEmphasis">
        {total}
      </span>
    </div>
  );
}
