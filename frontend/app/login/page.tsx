"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      // Register first if needed
      if (tab === "register") {
        const res = await fetch("http://localhost:3000/api/v1/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Registration failed");
        }
      }
      // Then sign in via NextAuth
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError("Invalid email or password");
      } else {
        router.replace("/markets");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0e0f14]">
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3 text-greenText">◈</div>
          <h1 className="text-2xl font-bold text-white">Exchange</h1>
          <p className="text-baseTextMedEmphasis mt-1 text-sm">
            Trade with confidence
          </p>
        </div>

        <div className="bg-baseBackgroundL1 rounded-2xl p-8 border border-baseBorderLight">
          <div className="flex mb-6 bg-baseBackgroundL2 rounded-xl p-1">
            {(["login", "register"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setError("");
                }}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${tab === t ? "bg-[#0e0f14] text-white shadow" : "text-baseTextMedEmphasis hover:text-white"}`}
              >
                {t === "login" ? "Log In" : "Register"}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs text-baseTextMedEmphasis mb-1">
                Email
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="w-full h-11 rounded-lg border border-baseBorderLight bg-baseBackgroundL2 px-4 text-sm text-white placeholder-baseTextMedEmphasis focus:outline-none focus:border-accentBlue transition"
              />
            </div>
            <div>
              <label className="block text-xs text-baseTextMedEmphasis mb-1">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="w-full h-11 rounded-lg border border-baseBorderLight bg-baseBackgroundL2 px-4 text-sm text-white placeholder-baseTextMedEmphasis focus:outline-none focus:border-accentBlue transition"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full h-11 mt-1 rounded-xl bg-greenPrimaryButtonBackground text-greenPrimaryButtonText font-semibold text-sm hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? "Please wait..."
                : tab === "login"
                  ? "Log In"
                  : "Create Account"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
