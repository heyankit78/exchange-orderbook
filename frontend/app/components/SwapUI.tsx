"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import {
  cancelOrder,
  getBalance,
  getMyTrades,
  getOpenOrders,
  getOrderHistory,
  placeOrder,
} from "../utils/httpClient";

import { Balances, MyTrade, OpenOrder, OrderHistoryItem } from "../utils/types";
import { SignalingManager } from "../utils/SignalingManager";

type UserOrdersTab = "open" | "history" | "trades";

export function SwapUI({ market }: { market: string }) {
  const { data: session } = useSession();

  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");

  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");

  const [type, setType] = useState("limit");

  const [loading, setLoading] = useState(false);
  const [balances, setBalances] = useState<Balances | null>(null);

  const [balanceLoading, setBalanceLoading] = useState(true);

  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);

  const [ordersLoading, setOrdersLoading] = useState(false);

  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);

  // NEW
  const [ordersTab, setOrdersTab] = useState<UserOrdersTab>("open");

  // NEW
  const [orderHistory, setOrderHistory] = useState<OrderHistoryItem[]>([]);

  // NEW
  const [historyLoading, setHistoryLoading] = useState(false);

  const total = Number(price) * Number(quantity) || 0;

  const [baseAsset, quoteAsset] = market.split("_");

  const [myTrades, setMyTrades] = useState<MyTrade[]>([]);
  const [myTradesLoading, setMyTradesLoading] = useState(false);

  // ----------------------------------------
  // FETCH BALANCE
  // ----------------------------------------

  const fetchBalance = async () => {
    if (!session?.accessToken) {
      console.log("❌ BALANCE: no access token");
      return;
    }
    if (!session?.accessToken) return;

    try {
      setBalanceLoading(true);

      console.log("1️⃣ FETCHING BALANCE");

      const data = await getBalance(session.accessToken);

      console.log("2️⃣ BALANCE API RESPONSE:", data);

      setBalances(data);
    } catch (error) {
      console.error("❌ Failed to fetch balance:", error);
    } finally {
      setBalanceLoading(false);
    }
  };

  const fetchMyTrades = async () => {
    if (!session?.accessToken) return;

    try {
      setMyTradesLoading(true);

      const data = await getMyTrades(market, session.accessToken);

      setMyTrades(data);
    } catch (error) {
      console.error("Failed to fetch my trades:", error);
    } finally {
      setMyTradesLoading(false);
    }
  };

  // ----------------------------------------
  // FETCH OPEN ORDERS
  // ----------------------------------------

  const fetchOpenOrders = async () => {
    if (!session?.accessToken) return;

    try {
      setOrdersLoading(true);

      const data = await getOpenOrders(market, session.accessToken);

      setOpenOrders(data);
    } catch (error) {
      console.error("Failed to fetch open orders:", error);
    } finally {
      setOrdersLoading(false);
    }
  };

  // ----------------------------------------
  // FETCH ORDER HISTORY
  // ----------------------------------------

  const fetchOrderHistory = async () => {
    if (!session?.accessToken) return;

    try {
      setHistoryLoading(true);

      const data = await getOrderHistory(market, session.accessToken);

      setOrderHistory(data);
    } catch (error) {
      console.error("Failed to fetch order history:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  // ----------------------------------------
  // PLACE ORDER
  // ----------------------------------------

  const handleSubmit = async () => {
    if (!price || !quantity || Number(price) <= 0 || Number(quantity) <= 0) {
      return;
    }

    if (!session?.accessToken) {
      console.error("No token found in session:", session);

      return;
    }

    try {
      setLoading(true);

      await placeOrder(market, price, quantity, activeTab, session.accessToken);

      await Promise.all([
        fetchBalance(),
        fetchOpenOrders(),
        fetchOrderHistory(),
        // fetchMyTrades(),
      ]);

      setPrice("");
      setQuantity("");
    } catch (error) {
      console.error("Order failed:", error);
    } finally {
      setLoading(false);
    }
  };
  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;

    const signaling = SignalingManager.getInstance();

    signaling.authenticate(session.accessToken);

    signaling.sendMessage({
      method: "SUBSCRIBE",
      params: [`user_trades@${userId}`],
    });

    signaling.sendMessage({
      method: "SUBSCRIBE",
      params: ["user_trades@999"],
    });

    const callbackId = `MY-TRADES-${userId}-${market}`;

    const handleMyTrade = (trade: MyTrade) => {
      console.log("LIVE MY TRADE:", trade);

      if (trade.market !== market) return;

      setMyTrades((prev) => {
        const alreadyExists = prev.some(
          (item) => item.tradeId === trade.tradeId,
        );

        if (alreadyExists) {
          return prev;
        }

        return [trade, ...prev].slice(0, 50);
      });
    };

    signaling.registerCallback("my_trade", handleMyTrade, callbackId);

    console.log("SUBSCRIBING PRIVATE TRADE:", userId, `user_trades@${userId}`);
    signaling.sendMessage({
      method: "SUBSCRIBE",
      params: [`user_trades@${userId}`],
    });
    signaling.registerCallback(
      "order_update",
      (update: { orderId: string; filled: number; status: string }) => {
        console.log("🔥 SWAP UI ORDER UPDATE:", update);
        setOpenOrders((prev) => {
          if (update.status === "FILLED") {
            return prev.filter((order) => order.orderId !== update.orderId);
          }

          return prev.map((order) =>
            order.orderId === update.orderId
              ? {
                  ...order,
                  filled: update.filled,
                }
              : order,
          );
        });
      },
      `OPEN-ORDER-${userId}`,
    );
    return () => {
      signaling.deRegisterCallback("my_trade", callbackId);
      signaling.deRegisterCallback("order_update", `OPEN-ORDER-${userId}`);

      signaling.sendMessage({
        method: "UNSUBSCRIBE",
        params: [`user_trades@${userId}`],
      });
    };
  }, [userId, market]);
  // ----------------------------------------
  // CANCEL ORDER
  // ----------------------------------------

  const handleCancelOrder = async (orderId: string) => {
    if (!session?.accessToken) return;

    try {
      setCancelingOrderId(orderId);

      await cancelOrder(orderId, market, session.accessToken);

      await Promise.all([
        fetchBalance(),
        fetchOpenOrders(),

        // IMPORTANT:
        // refresh history so OPEN becomes CANCELLED
        fetchOrderHistory(),
      ]);
    } catch (error) {
      console.error("Cancel order failed:", error);
    } finally {
      setCancelingOrderId(null);
    }
  };

  // ----------------------------------------
  // INITIAL LOAD
  // ----------------------------------------

  useEffect(() => {
    if (!session?.accessToken) return;

    fetchBalance();
    fetchOpenOrders();
    fetchOrderHistory();
  }, [session?.accessToken, market]);

  // ----------------------------------------
  // BALANCE CALCULATIONS
  // ----------------------------------------

  const balanceAsset = activeTab === "buy" ? quoteAsset : baseAsset;

  const assetBalance = balances?.[balanceAsset];

  const availableBalance = assetBalance?.available;

  const requiredBalance =
    activeTab === "buy" ? Number(price) * Number(quantity) : Number(quantity);

  const insufficientBalance = requiredBalance > availableBalance;

  return (
    <div className="h-[calc(100vh-60px)] flex flex-col overflow-hidden">
      {/* ======================================
          BUY / SELL FORM
      ====================================== */}

      <div className="flex flex-col  shrink-0">
        <div className="flex flex-row h-[60px]">
          <BuyButton activeTab={activeTab} setActiveTab={setActiveTab} />

          <SellButton activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>

        <div className="flex flex-col gap-1">
          <div className="px-3">
            <div className="flex flex-row flex-0 gap-5">
              <LimitButton type={type} setType={setType} />

              <MarketButton type={type} setType={setType} />
            </div>
          </div>

          <div className="flex flex-col px-3">
            {/* AVAILABLE BALANCE */}

            <div className="flex flex-col flex-1 gap-3 text-baseTextHighEmphasis">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between flex-row">
                  <p className="text-xs font-normal text-baseTextMedEmphasis">
                    Available Balance
                  </p>

                  <p className="font-medium text-xs text-baseTextHighEmphasis">
                    {balanceLoading || availableBalance === undefined
                      ? "Loading..."
                      : `${availableBalance.toFixed(2)} ${balanceAsset}`}
                  </p>
                </div>
              </div>

              {/* PRICE */}

              <div className="flex flex-col gap-2">
                <p className="text-xs font-normal text-baseTextMedEmphasis">
                  Price
                </p>

                <div className="flex flex-col relative">
                  <input
                    step="0.01"
                    placeholder="0"
                    className="h-12 rounded-lg border-2 border-solid border-baseBorderLight bg-baseBackgroundL1 pr-12 text-right text-2xl leading-9 text-baseTextHighEmphasis placeholder-baseTextMedEmphasis ring-0 transition focus:border-accentBlue focus:ring-0"
                    type="text"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />

                  <div className="flex flex-row absolute right-1 top-1 p-2">
                    <div className="relative">
                      <span className="text-xs font-medium">{quoteAsset}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* QUANTITY */}

            <div className="flex flex-col gap-2 mt-3">
              <p className="text-xs font-normal text-baseTextMedEmphasis">
                Quantity
              </p>

              <div className="flex flex-col relative">
                <input
                  step="0.01"
                  placeholder="0"
                  className="h-12 rounded-lg border-2 border-solid border-baseBorderLight bg-baseBackgroundL1 pr-12 text-right text-2xl leading-9 text-baseTextHighEmphasis placeholder-baseTextMedEmphasis ring-0 transition focus:border-accentBlue focus:ring-0"
                  type="text"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />

                <div className="flex flex-row absolute right-1 top-1 p-2">
                  <span className="text-xs font-medium">{baseAsset}</span>
                </div>
              </div>

              {/* TOTAL */}

              <div className="flex justify-end flex-row">
                <p className="font-medium pr-2 text-xs text-baseTextMedEmphasis">
                  ≈ {total.toFixed(2)} {quoteAsset}
                </p>
              </div>

              {/* PERCENTAGE BUTTONS */}

              <div className="flex justify-center flex-row mt-2 gap-3">
                {["25%", "50%", "75%", "Max"].map((item) => (
                  <div
                    key={item}
                    className="flex items-center justify-center flex-row rounded-full px-[16px] py-[6px] text-xs cursor-pointer bg-baseBackgroundL2 hover:bg-baseBackgroundL3 text-baseTextMedEmphasis"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* SUBMIT */}

            <button
              type="button"
              disabled={
                loading ||
                balanceLoading ||
                !price ||
                !quantity ||
                insufficientBalance
              }
              onClick={handleSubmit}
              className={`font-semibold focus:outline-none text-center h-12 rounded-xl text-base px-4 py-2 my-4 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed ${
                activeTab === "buy"
                  ? "bg-greenPrimaryButtonBackground text-greenPrimaryButtonText"
                  : "bg-redText text-white"
              }`}
            >
              {loading
                ? "Placing order..."
                : insufficientBalance
                  ? "Insufficient Balance"
                  : activeTab === "buy"
                    ? "Buy"
                    : "Sell"}
            </button>

            {/* FLAGS */}

            <div className="flex justify-between flex-row mt-1">
              <div className="flex flex-row gap-2">
                <div className="flex items-center">
                  <input
                    className="form-checkbox rounded border border-solid border-baseBorderMed bg-baseBackgroundL1 h-5 w-5"
                    id="postOnly"
                    type="checkbox"
                  />

                  <label className="ml-2 text-xs text-baseTextMedEmphasis">
                    Post Only
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    className="form-checkbox rounded border border-solid border-baseBorderMed bg-baseBackgroundL1 h-5 w-5"
                    id="ioc"
                    type="checkbox"
                  />

                  <label className="ml-2 text-xs text-baseTextMedEmphasis">
                    IOC
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================
          USER ORDER TABS
      ====================================== */}

      <div className="mt-6 border-t border-baseBorderLight">
        {/* TAB HEADER */}

        <div className="flex items-center gap-4 px-3 border-b border-baseBorderLight overflow-x-auto">
          <OrderTabButton
            active={ordersTab === "open"}
            onClick={() => setOrdersTab("open")}
          >
            Open Orders
            {openOrders.length > 0 && (
              <span className="ml-1 text-[10px] bg-baseBackgroundL3 px-1.5 py-0.5 rounded">
                {openOrders.length}
              </span>
            )}
          </OrderTabButton>

          <OrderTabButton
            active={ordersTab === "history"}
            onClick={() => {
              setOrdersTab("history");
              fetchOrderHistory();
            }}
          >
            Order History
          </OrderTabButton>

          <OrderTabButton
            active={ordersTab === "trades"}
            onClick={() => {
              setOrdersTab("trades");
              fetchMyTrades();
            }}
          >
            My Trades
          </OrderTabButton>
        </div>

        {/* ======================================
            OPEN ORDERS
        ====================================== */}

        {ordersTab === "open" && (
          <div className="px-3 py-3">
            {ordersLoading ? (
              <p className="text-xs text-baseTextMedEmphasis">
                Loading orders...
              </p>
            ) : openOrders.length === 0 ? (
              <EmptyState text="No open orders" />
            ) : (
              <>
                <div className="grid grid-cols-6 gap-2 text-[11px] text-baseTextMedEmphasis pb-2">
                  <span>Side</span>
                  <span>Price</span>
                  <span>Quantity</span>
                  <span>Filled</span>
                  <span>Remaining</span>
                  <span className="text-right">Action</span>
                </div>

                <div>
                  {openOrders.map((order) => {
                    const remaining =
                      Number(order.quantity) - Number(order.filled);

                    return (
                      <div
                        key={order.orderId}
                        className="grid grid-cols-6 gap-2 items-center border-t border-baseBorderLight py-2 text-xs"
                      >
                        <span
                          className={
                            order.side === "buy"
                              ? "text-greenText"
                              : "text-redText"
                          }
                        >
                          {order.side.toUpperCase()}
                        </span>

                        <span>{order.price}</span>

                        <span>{order.quantity}</span>

                        <span>{order.filled}</span>

                        <span>{remaining}</span>

                        <div className="flex justify-end">
                          <button
                            disabled={cancelingOrderId === order.orderId}
                            onClick={() => handleCancelOrder(order.orderId)}
                            className="px-3 py-1 rounded bg-baseBackgroundL2 hover:bg-baseBackgroundL3 text-xs disabled:opacity-50"
                          >
                            {cancelingOrderId === order.orderId
                              ? "Cancelling..."
                              : "Cancel"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ======================================
            ORDER HISTORY
        ====================================== */}
        {ordersTab === "history" && (
          <div className="px-3 py-3">
            {historyLoading ? (
              <p className="text-xs text-baseTextMedEmphasis">
                Loading history...
              </p>
            ) : orderHistory.length === 0 ? (
              <EmptyState text="No order history" />
            ) : (
              <>
                {/* FIXED HEADER */}
                <div className="grid grid-cols-[55px_1fr_70px_90px] items-center gap-2 px-1 pb-2 text-[11px] text-baseTextMedEmphasis">
                  <span>Side</span>
                  <span>Price</span>
                  <span>Filled</span>
                  <span>Status</span>
                </div>

                {/* ONLY ROWS SCROLL */}
                <div
                  className="
            h-[240px]
            overflow-y-auto
            overflow-x-hidden
            pr-2
            [scrollbar-width:thin]
            [scrollbar-color:#4b5563_transparent]
          "
                >
                  <div className="pb-4">
                    {orderHistory.map((order) => (
                      <div
                        key={order.orderId}
                        className="
                  grid
                  grid-cols-[55px_1fr_70px_90px]
                  items-center
                  gap-2
                  border-t
                  border-baseBorderLight
                  px-1
                  py-2.5
                  text-xs
                "
                      >
                        <span
                          className={
                            order.side === "buy"
                              ? "text-greenText font-medium"
                              : "text-redText font-medium"
                          }
                        >
                          {order.side.toUpperCase()}
                        </span>

                        <span className="font-medium">
                          {Number(order.price).toFixed(2)}
                        </span>

                        <span className="text-center">
                          {Number(order.filled)}/{Number(order.quantity)}
                        </span>

                        <OrderStatusBadge status={order.status} />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ======================================
            MY TRADES
        ====================================== */}
        {ordersTab === "trades" && (
          <div className="px-3 py-3">
            {myTradesLoading ? (
              <p className="text-xs text-baseTextMedEmphasis">
                Loading trades...
              </p>
            ) : myTrades.length === 0 ? (
              <EmptyState text="No trades yet" />
            ) : (
              <>
                {/* HEADER */}
                <div className="grid grid-cols-[48px_70px_55px_70px_1fr] items-center gap-2 px-1 pb-2 text-[11px] text-baseTextMedEmphasis">
                  <span>Side</span>
                  <span>Price</span>
                  <span>Qty</span>
                  <span>Value</span>
                  <span>Time</span>
                </div>

                {/* SCROLLABLE ROWS */}
                <div
                  className="
            h-[240px]
            overflow-y-auto
            overflow-x-hidden
            pr-2
            [scrollbar-width:thin]
            [scrollbar-color:#4b5563_transparent]
          "
                >
                  <div className="pb-4">
                    {myTrades.map((trade) => {
                      const value =
                        Number(trade.price) * Number(trade.quantity);

                      return (
                        <div
                          key={trade.tradeId}
                          className="
                    grid
                    grid-cols-[48px_70px_55px_70px_1fr]
                    items-center
                    gap-2
                    border-t
                    border-baseBorderLight
                    px-1
                    py-2.5
                    text-xs
                    hover:bg-baseBackgroundL2
                  "
                        >
                          {/* SIDE */}
                          <span
                            className={
                              trade.side === "buy"
                                ? "text-greenText font-semibold"
                                : "text-redText font-semibold"
                            }
                          >
                            {trade.side.toUpperCase()}
                          </span>

                          {/* PRICE */}
                          <span className="font-medium">
                            {Number(trade.price).toFixed(2)}
                          </span>

                          {/* QUANTITY */}
                          <span>{Number(trade.quantity)}</span>

                          {/* VALUE */}
                          <span className="text-baseTextMedEmphasis">
                            {value.toFixed(2)}
                          </span>

                          {/* TIME */}
                          <span className="text-right text-[11px] text-baseTextMedEmphasis whitespace-nowrap">
                            {trade.createdAt
                              ? new Date(trade.createdAt).toLocaleTimeString(
                                  [],
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  },
                                )
                              : "-"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================
   ORDER TAB BUTTON
========================================= */

function OrderTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`py-3 text-xs font-medium border-b-2 whitespace-nowrap transition flex items-center ${
        active
          ? "border-accentBlue text-baseTextHighEmphasis"
          : "border-transparent text-baseTextMedEmphasis hover:text-baseTextHighEmphasis"
      }`}
    >
      {children}
    </button>
  );
}

/* =========================================
   STATUS BADGE
========================================= */

function OrderStatusBadge({ status }: { status: string }) {
  const style =
    status === "FILLED"
      ? "text-greenText bg-greenBackgroundTransparent"
      : status === "CANCELLED"
        ? "text-redText bg-redBackgroundTransparent"
        : status === "PARTIALLY_FILLED"
          ? "text-yellow-400 bg-yellow-400/10"
          : "text-accentBlue bg-blue-500/10";

  return (
    <span
      className={`inline-flex items-center justify-center whitespace-nowrap px-2 py-1 rounded text-[10px] font-semibold ${style}`}
    >
      {status === "PARTIALLY_FILLED" ? "PARTIAL" : status}
    </span>
  );
}

/* =========================================
   EMPTY STATE
========================================= */

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex justify-center items-center py-8">
      <p className="text-xs text-baseTextMedEmphasis">{text}</p>
    </div>
  );
}

/* =========================================
   LIMIT / MARKET
========================================= */

function LimitButton({ type, setType }: { type: string; setType: any }) {
  return (
    <div
      className="flex flex-col cursor-pointer justify-center py-2"
      onClick={() => setType("limit")}
    >
      <div
        className={`text-sm font-medium py-1 border-b-2 ${
          type === "limit"
            ? "border-accentBlue text-baseTextHighEmphasis"
            : "border-transparent text-baseTextMedEmphasis hover:border-baseBorderFocus hover:text-baseTextHighEmphasis"
        }`}
      >
        Limit
      </div>
    </div>
  );
}

function MarketButton({ type, setType }: { type: string; setType: any }) {
  return (
    <div
      className="flex flex-col cursor-pointer justify-center py-2"
      onClick={() => setType("market")}
    >
      <div
        className={`text-sm font-medium py-1 border-b-2 ${
          type === "market"
            ? "border-accentBlue text-baseTextHighEmphasis"
            : "border-transparent text-baseTextMedEmphasis hover:border-baseBorderFocus hover:text-baseTextHighEmphasis"
        }`}
      >
        Market
      </div>
    </div>
  );
}

/* =========================================
   BUY / SELL BUTTON
========================================= */

function BuyButton({
  activeTab,
  setActiveTab,
}: {
  activeTab: string;
  setActiveTab: any;
}) {
  return (
    <div
      className={`flex flex-col mb-[-2px] flex-1 cursor-pointer justify-center border-b-2 p-4 ${
        activeTab === "buy"
          ? "border-b-greenBorder bg-greenBackgroundTransparent"
          : "border-b-baseBorderMed hover:border-b-baseBorderFocus"
      }`}
      onClick={() => setActiveTab("buy")}
    >
      <p className="text-center text-sm font-semibold text-greenText">Buy</p>
    </div>
  );
}

function SellButton({
  activeTab,
  setActiveTab,
}: {
  activeTab: string;
  setActiveTab: any;
}) {
  return (
    <div
      className={`flex flex-col mb-[-2px] flex-1 cursor-pointer justify-center border-b-2 p-4 ${
        activeTab === "sell"
          ? "border-b-redBorder bg-redBackgroundTransparent"
          : "border-b-baseBorderMed hover:border-b-baseBorderFocus"
      }`}
      onClick={() => setActiveTab("sell")}
    >
      <p className="text-center text-sm font-semibold text-redText">Sell</p>
    </div>
  );
}
