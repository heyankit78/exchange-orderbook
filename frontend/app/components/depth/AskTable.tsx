export const AskTable = ({ asks }: { asks: [string, string][] }) => {
  let currentTotal = 0;

  const relevantAsks = asks.slice(0, 15);

  relevantAsks.reverse();

  const asksWithTotal: [string, string, number][] = relevantAsks.map(
    ([price, quantity]) => [
      price,
      quantity,
      (currentTotal += Number(quantity)),
    ],
  );

  const maxTotal = relevantAsks.reduce(
    (acc, [_, quantity]) => acc + Number(quantity),
    0,
  );

  asksWithTotal.reverse();

  return (
    <div>
      {asksWithTotal.map(([price, quantity, total]) => (
        <Ask
          maxTotal={maxTotal}
          key={price}
          price={price}
          quantity={quantity}
          total={total}
        />
      ))}
    </div>
  );
};

function Ask({
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
          background: "rgba(228, 75, 68, 0.325)",
          transition: "width 0.3s ease-in-out",
        }}
      />

      <div className="relative z-10 grid w-full grid-cols-3 items-center px-3 py-[4px] text-xs tabular-nums">
        <span className="text-left text-redText">
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
