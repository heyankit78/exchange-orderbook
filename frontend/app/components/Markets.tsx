"use client";
import { useEffect, useState } from "react";
import { Ticker } from "../utils/types";
import { getTickers } from "../utils/httpClient";
import { useRouter } from "next/navigation";

const MOCK_TICKERS: Ticker[] = [
    { symbol: "TATA_INR", lastPrice: "3420.50", high: "3510.00", low: "3380.00", volume: "124500", quoteVolume: "425000000", firstPrice: "3300.00", priceChange: "120.50", priceChangePercent: "3.65", trades: "8420" },
    { symbol: "RELIANCE_INR", lastPrice: "2875.00", high: "2920.00", low: "2845.00", volume: "98200", quoteVolume: "282000000", firstPrice: "2900.00", priceChange: "-25.00", priceChangePercent: "-0.86", trades: "6100" },
    { symbol: "INFY_INR", lastPrice: "1542.30", high: "1580.00", low: "1530.00", volume: "210000", quoteVolume: "324000000", firstPrice: "1520.00", priceChange: "22.30", priceChangePercent: "1.47", trades: "11300" },
];

export const Markets = () => {
    const [tickers, setTickers] = useState<Ticker[]>([]);
    const [search, setSearch] = useState("");
    const router = useRouter();

    useEffect(() => {
        getTickers()
            .then(data => {
                if (Array.isArray(data) && data.length > 0) setTickers(data);
                else setTickers(MOCK_TICKERS);
            })
            .catch(() => setTickers(MOCK_TICKERS));
    }, []);

    const filtered = tickers.filter(t =>
        t.symbol.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-[#0e0f14] px-4 py-6">
            <div className="max-w-5xl mx-auto">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-white mb-1">Markets</h1>
                    <p className="text-sm text-baseTextMedEmphasis">Trade your favourite assets</p>
                </div>

                <div className="mb-4 relative max-w-sm">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-baseTextMedEmphasis" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search market..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full h-9 pl-9 pr-4 rounded-lg bg-baseBackgroundL1 border border-baseBorderLight text-sm text-white placeholder-baseTextMedEmphasis focus:outline-none focus:border-accentBlue transition"
                    />
                </div>

                <div className="bg-baseBackgroundL1 rounded-xl border border-baseBorderLight overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-baseBorderLight">
                                <th className="text-left px-6 py-3 text-xs font-medium text-baseTextMedEmphasis">#</th>
                                <th className="text-left px-4 py-3 text-xs font-medium text-baseTextMedEmphasis">Name</th>
                                <th className="text-right px-4 py-3 text-xs font-medium text-baseTextMedEmphasis">Price</th>
                                <th className="text-right px-4 py-3 text-xs font-medium text-baseTextMedEmphasis">24h Change</th>
                                <th className="text-right px-4 py-3 text-xs font-medium text-baseTextMedEmphasis">24h High</th>
                                <th className="text-right px-4 py-3 text-xs font-medium text-baseTextMedEmphasis">24h Low</th>
                                <th className="text-right px-6 py-3 text-xs font-medium text-baseTextMedEmphasis">Volume</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr><td colSpan={7} className="text-center py-16 text-baseTextMedEmphasis text-sm">No markets found</td></tr>
                            )}
                            {filtered.map((m, idx) => {
                                const change = Number(m.priceChangePercent);
                                const isPositive = change >= 0;
                                const base = m.symbol.split("_")[0];
                                const quote = m.symbol.split("_")[1];
                                return (
                                    <tr
                                        key={m.symbol}
                                        onClick={() => router.push(`/trade/${m.symbol}`)}
                                        className="border-b border-baseBorderLight last:border-0 hover:bg-baseBackgroundL2 cursor-pointer transition-colors"
                                    >
                                        <td className="px-6 py-4 text-sm text-baseTextMedEmphasis">{idx + 1}</td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-baseBackgroundL2 flex items-center justify-center text-sm font-bold text-white">
                                                    {base[0]}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-white">{base}</p>
                                                    <p className="text-xs text-baseTextMedEmphasis">{m.symbol.replace("_", "/")}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <p className="text-sm font-medium text-white tabular-nums">{Number(m.lastPrice).toLocaleString()}</p>
                                            <p className="text-xs text-baseTextMedEmphasis">{quote}</p>
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <span className={`inline-block text-sm font-medium tabular-nums px-2 py-0.5 rounded ${isPositive ? "text-greenText bg-greenBackgroundTransparent" : "text-redText bg-redBackgroundTransparent"}`}>
                                                {isPositive ? "+" : ""}{change.toFixed(2)}%
                                            </span>
                                        </td>
                                        <td className="px-4 py-4 text-right text-sm text-baseTextMedEmphasis tabular-nums">{Number(m.high).toLocaleString()}</td>
                                        <td className="px-4 py-4 text-right text-sm text-baseTextMedEmphasis tabular-nums">{Number(m.low).toLocaleString()}</td>
                                        <td className="px-6 py-4 text-right text-sm text-baseTextMedEmphasis tabular-nums">{Number(m.volume).toLocaleString()}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};