"use client";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

export const Appbar = () => {
    const route = usePathname();
    const router = useRouter();
    const { data: session } = useSession();

    if (route === "/login") return null;

    return (
        <div className="text-white border-b border-baseBorderLight bg-baseBackgroundL1 sticky top-0 z-50">
            <div className="flex justify-between items-center px-6 h-14">
                <div className="flex items-center gap-8">
                    <div
                        className="text-lg font-bold cursor-pointer flex items-center gap-2"
                        onClick={() => router.push("/markets")}
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
                            onClick={() => router.push("/trade/TATA_INR")}
                            className={`text-sm font-medium transition-colors ${route.startsWith("/trade") ? "text-white" : "text-baseTextMedEmphasis hover:text-white"}`}
                        >
                            Trade
                        </button>
                    </nav>
                </div>

                <div className="flex items-center gap-3">
                    {session ? (
                        <>
                            <span className="text-xs text-baseTextMedEmphasis hidden sm:block">{session.user.email}</span>
                            <button
                                onClick={() => signOut({ callbackUrl: "/login" })}
                                className="h-8 px-4 rounded-lg border border-baseBorderLight text-sm text-baseTextMedEmphasis hover:text-white hover:border-baseBorderFocus transition"
                            >
                                Log Out
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => router.push("/login")}
                            className="h-8 px-4 rounded-lg bg-greenPrimaryButtonBackground text-greenPrimaryButtonText text-sm font-semibold hover:opacity-90 transition"
                        >
                            Log In
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};