export const MARKETS = {
  BTC_USDC: {
    symbol: "BTC_USDC",
    baseAsset: "BTC",
    quoteAsset: "USDC",

    startPrice: 60000,

    priceDecimals: 2,
    quantityDecimals: 6,

    spread: 10,
    mmQuantity: 0.01,

    minuteVolatility: 50,
    tickVolatility: 20,

    minPrice: 50000,
    maxPrice: 70000,

    minVolume: 0.001,
    maxVolume: 0.05,
  },

  ETH_USDC: {
    symbol: "ETH_USDC",
    baseAsset: "ETH",
    quoteAsset: "USDC",

    startPrice: 3000,

    priceDecimals: 2,
    quantityDecimals: 5,

    spread: 1,
    mmQuantity: 0.1,

    minuteVolatility: 5,
    tickVolatility: 2,

    minPrice: 2500,
    maxPrice: 3500,

    minVolume: 0.01,
    maxVolume: 1,
  },

  SOL_USDC: {
    symbol: "SOL_USDC",
    baseAsset: "SOL",
    quoteAsset: "USDC",

    startPrice: 150,

    priceDecimals: 2,
    quantityDecimals: 4,

    spread: 0.1,
    mmQuantity: 1,

    minuteVolatility: 1,
    tickVolatility: 0.5,

    minPrice: 100,
    maxPrice: 220,

    minVolume: 0.1,
    maxVolume: 10,
  },
} as const;
