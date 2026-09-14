import axios from "axios";

const BASE_URL = process.env.API_URL;

if (!BASE_URL) {
  throw new Error("API_URL is missing");
}

const TARGET_BALANCES = {
  USDC: 10_000_000,
  BTC: 100,
  ETH: 1_000,
  SOL: 10_000,
} as const;

type Asset = keyof typeof TARGET_BALANCES;

type Balance = {
  available: number;
  locked: number;
};

type Balances = Partial<Record<Asset, Balance>>;

export async function seedBotBalances(mmToken: string, takerToken: string) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seedBotBalances cannot run in production");
  }

  console.log("🤖 Checking bot balances...");

  await ensureBotBalances("Market Maker", mmToken);

  await ensureBotBalances("Taker", takerToken);

  console.log("✅ Bot balances ready");
}

async function ensureBotBalances(name: string, token: string) {
  // ----------------------------------
  // 1. GET CURRENT ENGINE BALANCES
  // ----------------------------------

  const response = await axios.get<Balances>(`${BASE_URL}/api/v1/balance`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const balances = response.data;

  console.log(`🤖 Checking ${name}`);

  // ----------------------------------
  // 2. CHECK EACH ASSET
  // ----------------------------------

  for (const [asset, targetAmount] of Object.entries(TARGET_BALANCES) as [
    Asset,
    number,
  ][]) {
    const currentAvailable = Number(balances[asset]?.available ?? 0);

    const currentLocked = Number(balances[asset]?.locked ?? 0);

    const total = currentAvailable + currentLocked;

    // ----------------------------------
    // ALREADY FUNDED
    // ----------------------------------

    if (total >= targetAmount) {
      console.log(`ℹ️ ${name}: ${asset} already funded (${total})`);

      continue;
    }

    // ----------------------------------
    // CALCULATE ONLY MISSING AMOUNT
    // ----------------------------------

    const missing = targetAmount - total;

    console.log(`💰 ${name}: topping up ${missing} ${asset}`);

    // ----------------------------------
    // 3. FUND THROUGH ENGINE
    // ----------------------------------

    await axios.post(
      `${BASE_URL}/api/v1/dev/on-ramp`,

      {
        asset,
        amount: missing,
      },

      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    console.log(`✅ ${name}: ${asset} → ${targetAmount}`);
  }
}
