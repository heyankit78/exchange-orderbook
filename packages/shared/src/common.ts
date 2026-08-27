export type Side = "buy" | "sell";

export type Order = {
  price: number;
  quantity: number;
  orderId: string;
  filled: number;
  side: Side;
  userId: string;
};

export type Fill = {
  price: string;
  quantity: number;
  tradeId: string;
  makerUserId: string;
  makerOrderId: string;
  makerFilledQuantity: number;
  makerOrderQuantity: number;
};

export type Balance = {
  available: number;
  locked: number;
};

export type UserBalance = Record<string, Balance>;
