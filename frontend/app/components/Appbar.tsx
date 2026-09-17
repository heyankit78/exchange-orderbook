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
      <div className="flex h-14 items-center justify-between gap-2 px-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-8">
          <div
            className="flex shrink-0 cursor-pointer items-center gap-2 text-base font-bold sm:text-lg"
            onClick={() => router.push("/")}
          >
            <span className="text-greenText">◈</span>
            <span>Exchange</span>
          </div>
          <nav className="flex items-center gap-3 sm:gap-6">
            <button
              onClick={() => router.push("/markets")}
              className={`whitespace-nowrap text-xs font-medium transition-colors sm:text-sm ${route.startsWith("/markets") ? "text-white" : "text-baseTextMedEmphasis hover:text-white"}`}
            >
              Markets
            </button>
            <button
              onClick={() => router.push("/trade/BTC_USDC")}
              className={`whitespace-nowrap text-xs font-medium transition-colors sm:text-sm ${route.startsWith("/trade") ? "text-white" : "text-baseTextMedEmphasis hover:text-white"}`}
            >
              Trade
            </button>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {status === "loading" ? (
            <div className="h-8 w-[70px] rounded-lg bg-baseBackgroundL2 animate-pulse sm:w-[90px]" />
          ) : session ? (
            <>
              <span className="hidden max-w-[160px] truncate text-xs text-baseTextMedEmphasis md:block">
                {session.user.email}
              </span>

              <button
                onClick={handleLogout}
                className="h-8 shrink-0 rounded-lg border border-baseBorderLight px-2.5 text-xs text-baseTextMedEmphasis transition hover:border-baseBorderFocus hover:text-white sm:px-4 sm:text-sm"
              >
                Log Out
              </button>
            </>
          ) : (
            <button
              onClick={() => router.push("/login")}
              className="h-8 shrink-0 rounded-lg bg-greenPrimaryButtonBackground px-2.5 text-xs font-semibold text-greenPrimaryButtonText transition hover:opacity-90 sm:px-4 sm:text-sm"
            >
              Log In
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
