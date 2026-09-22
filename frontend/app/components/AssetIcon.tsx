type AssetIconProps = {
  asset: string;
  size?: number;
  className?: string;
};

export function AssetIcon({
  asset,
  size = 32,
  className = "",
}: AssetIconProps) {
  const symbol = asset.toUpperCase();
  const sharedClass = `flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`;

  if (symbol === "BTC") {
    return (
      <div
        aria-label="Bitcoin"
        className={`${sharedClass} bg-[#f7931a] font-bold text-white`}
        style={{ width: size, height: size, fontSize: size * 0.6 }}
      >
        ₿
      </div>
    );
  }

  if (symbol === "ETH") {
    return (
      <div
        aria-label="Ethereum"
        className={`${sharedClass} bg-[#252a44]`}
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 32 32" className="h-[72%] w-[72%]" aria-hidden="true">
          <path d="M16 3 8.5 16 16 20.3 23.5 16 16 3Z" fill="#8c8cdb" />
          <path d="m16 21.8-7.5-4.3L16 29l7.5-11.5L16 21.8Z" fill="#b8b8ef" />
          <path d="M16 3v17.3l7.5-4.3L16 3Z" fill="#6262a7" />
        </svg>
      </div>
    );
  }

  if (symbol === "SOL") {
    return (
      <div
        aria-label="Solana"
        className={`${sharedClass} flex-col gap-[2px] bg-[#090a0f]`}
        style={{ width: size, height: size }}
      >
        {["translate-x-[2px]", "-translate-x-[2px]", "translate-x-[2px]"].map(
          (offset, index) => (
            <span
              key={index}
              className={`h-[3px] w-[60%] -skew-x-[24deg] rounded-sm bg-gradient-to-r from-[#9945ff] to-[#14f195] ${offset}`}
            />
          ),
        )}
      </div>
    );
  }

  if (symbol === "USDC") {
    return (
      <div
        aria-label="USD Coin"
        className={`${sharedClass} border-2 border-[#6ba7e8] bg-[#2775ca] font-semibold text-white`}
        style={{ width: size, height: size, fontSize: size * 0.48 }}
      >
        $
      </div>
    );
  }

  return (
    <div
      aria-label={symbol}
      className={`${sharedClass} bg-baseBackgroundL3 text-xs font-bold text-white`}
      style={{ width: size, height: size }}
    >
      {symbol.slice(0, 2)}
    </div>
  );
}
