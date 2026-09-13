export const BidTable = ({ bids }: { bids: [string, string][] }) => {
  let currentTotal = 0;

  const relevantBids = bids.slice(0, 15);

  const bidsWithTotal: [string, string, number][] = relevantBids.map(
    ([price, quantity]) => [
      price,
      quantity,
      (currentTotal += Number(quantity)),
    ],
  );

  const maxTotal = relevantBids.reduce(
    (acc, [_, quantity]) => acc + Number(quantity),
    0,
  );

  return (
    <div>
      {bidsWithTotal.map(([price, quantity, total]) => (
        <Bid
          maxTotal={maxTotal}
          total={total}
          key={price}
          price={price}
          quantity={quantity}
        />
      ))}
    </div>
  );
};

function Bid({
  price,
  quantity,
  total,
  maxTotal,
}: {
  price: string;
  quantity: string;
  total: number;
  maxTotal: number;
}) {
  return (
    <div className="relative w-full overflow-hidden">
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: maxTotal > 0 ? `${(100 * total) / maxTotal}%` : "0%",
          height: "100%",
          background: "rgba(1, 167, 129, 0.325)",
          transition: "width 0.3s ease-in-out",
        }}
      />

      <div className="relative z-10 grid w-full grid-cols-3 items-center px-3 py-[4px] text-xs tabular-nums">
        <span className="text-left text-greenText">
          {Number(price).toFixed(2)}
        </span>

        <span className="text-right text-baseTextHighEmphasis">
          {Number(quantity).toFixed(4)}
        </span>

        <span className="text-right text-baseTextHighEmphasis">
          {(Number(price) * Number(quantity)).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
