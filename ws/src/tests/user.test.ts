import { describe, it, expect, vi, beforeEach } from "vitest";
import { User } from "../User";
import { SubscriptionManager } from "../SubscriptionManager";
import jwt from "jsonwebtoken";

describe("User WebSocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows user to subscribe to own private channel", () => {
    const subscribeMock = vi.fn();

    vi.spyOn(SubscriptionManager, "getInstance").mockReturnValue({
      subscribe: subscribeMock,
      unsubscribe: vi.fn(),
    } as any);

    vi.spyOn(jwt, "verify").mockReturnValue({
      userId: "28",
    } as any);

    let messageHandler: ((message: string) => void) | undefined;

    const mockWs = {
      on: vi.fn((event, callback) => {
        if (event === "message") {
          messageHandler = callback;
        }
      }),
      send: vi.fn(),
    } as any;

    new User("connection-1", mockWs);

    messageHandler?.(
      JSON.stringify({
        method: "AUTH",
        token: "fake-token",
      }),
    );

    messageHandler?.(
      JSON.stringify({
        method: "SUBSCRIBE",
        params: ["user_trades@28"],
      }),
    );

    expect(subscribeMock).toHaveBeenCalledWith(
      "connection-1",
      "user_trades@28",
    );
  });
  it("rejects user subscribing to another user's private channel", () => {
    const subscribeMock = vi.fn();

    vi.spyOn(SubscriptionManager, "getInstance").mockReturnValue({
      subscribe: subscribeMock,
      unsubscribe: vi.fn(),
    } as any);

    vi.spyOn(jwt, "verify").mockReturnValue({
      userId: "28",
    } as any);

    let messageHandler: ((message: string) => void) | undefined;

    const mockWs = {
      on: vi.fn((event, callback) => {
        if (event === "message") {
          messageHandler = callback;
        }
      }),
      send: vi.fn(),
    } as any;

    new User("connection-1", mockWs);

    messageHandler?.(
      JSON.stringify({
        method: "AUTH",
        token: "fake-token",
      }),
    );

    messageHandler?.(
      JSON.stringify({
        method: "SUBSCRIBE",
        params: ["user_trades@999"],
      }),
    );

    expect(subscribeMock).not.toHaveBeenCalled();
  });
  it("ignores malformed SUBSCRIBE params", () => {
    const subscribeMock = vi.fn();

    vi.spyOn(SubscriptionManager, "getInstance").mockReturnValue({
      subscribe: subscribeMock,
      unsubscribe: vi.fn(),
    } as any);

    let messageHandler: ((message: string) => void) | undefined;

    const mockWs = {
      on: vi.fn((event, callback) => {
        if (event === "message") {
          messageHandler = callback;
        }
      }),
      send: vi.fn(),
    } as any;

    new User("connection-1", mockWs);

    expect(() => {
      messageHandler?.(
        JSON.stringify({
          method: "SUBSCRIBE",
          params: 123,
        }),
      );
    }).not.toThrow();

    expect(subscribeMock).not.toHaveBeenCalled();
  });
  it("ignores invalid JSON without throwing", () => {
    const subscribeMock = vi.fn();

    vi.spyOn(SubscriptionManager, "getInstance").mockReturnValue({
      subscribe: subscribeMock,
      unsubscribe: vi.fn(),
    } as any);

    let messageHandler: ((message: string) => void) | undefined;

    const mockWs = {
      on: vi.fn((event, callback) => {
        if (event === "message") {
          messageHandler = callback;
        }
      }),
      send: vi.fn(),
    } as any;

    new User("connection-1", mockWs);

    expect(() => {
      messageHandler?.("{ invalid json");
    }).not.toThrow();

    expect(subscribeMock).not.toHaveBeenCalled();
  });
});
