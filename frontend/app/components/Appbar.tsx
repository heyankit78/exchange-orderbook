"use client";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { SignalingManager } from "../utils/SignalingManager";

export const Appbar = () => {
  const route = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();

  if (route === "/" || route === "/login") {
    return null;
  }
  const handleLogout = async () => {
    SignalingManager.getInstance().clearAuthentication();

    await signOut({
      callbackUrl: "/login",
    });
  };
  return (
    <div className="text-white border-b border-baseBorderLight bg-baseBackgroundL1 sticky top-0 z-50">
      <div className="flex justify-between items-center px-6 h-14">
        <div className="flex items-center gap-8">
          <div
            className="text-lg font-bold cursor-pointer flex items-center gap-2"
            onClick={() => router.push("/")}
          >
            <span className="text-greenText">◈</span> Exchange
          </div>
          <nav className="flex items-center gap-6">
            <button
              onClick={() => router.push("/markets")}
              className={`text-sm font-medium transition-colors ${route.startsWith("/markets") ? "text-white" : "text-baseTextMedEmphasis hover:text-white"}`}
            >
              Markets
            </button>
            <button
              onClick={() => router.push("/trade/BTC_USDC")}
              className={`text-sm font-medium transition-colors ${route.startsWith("/trade") ? "text-white" : "text-baseTextMedEmphasis hover:text-white"}`}
            >
              Trade
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {status === "loading" ? (
            <div className="h-8 w-[90px] rounded-lg bg-baseBackgroundL2 animate-pulse" />
          ) : session ? (
            <>
              <span className="hidden text-xs text-baseTextMedEmphasis sm:block">
                {session.user.email}
              </span>

              <button
                onClick={handleLogout}
                className="h-8 rounded-lg border border-baseBorderLight px-4 text-sm text-baseTextMedEmphasis transition hover:border-baseBorderFocus hover:text-white"
              >
                Log Out
              </button>
            </>
          ) : (
            <button
              onClick={() => router.push("/login")}
              className="h-8 rounded-lg bg-greenPrimaryButtonBackground px-4 text-sm font-semibold text-greenPrimaryButtonText transition hover:opacity-90"
            >
              Log In
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
