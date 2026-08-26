export type Side = "buy" | "sell";

export type CreateOrderMessage = {
  type: "CREATE_ORDER";
  data: {
    market: string;
    price: string;
    quantity: string;
    side: Side;
    userId: string;
  };
};

export type CancelOrderMessage = {
  type: "CANCEL_ORDER";
  data: {
    orderId: string;
    market: string;
    userId: string;
  };
};

export type OnRampMessage = {
  type: "ON_RAMP";
  data: {
    amount: string;
    userId: string;
    txnId: string;
  };
};

export type GetDepthMessage = {
  type: "GET_DEPTH";
  data: {
    market: string;
  };
};

export type GetOpenOrdersMessage = {
  type: "GET_OPEN_ORDERS";
  data: {
    userId: string;
    market: string;
  };
};

export type MessageToEngine =
  | CreateOrderMessage
  | CancelOrderMessage
  | OnRampMessage
  | GetDepthMessage
  | GetOpenOrdersMessage;
