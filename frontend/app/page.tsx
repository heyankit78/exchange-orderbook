// "use client";
// import { useSession } from "next-auth/react";
// import { useEffect } from "react";
// import { useRouter } from "next/navigation";

import { Hero } from "./components/landing/Hero";
import { LandingFooter } from "./components/landing/LandingFooter";
import { LandingHeader } from "./components/landing/LandingHeader";
import { TechnicalSection } from "./components/landing/TechnicalSection";

// export default function Home() {
//     const { data: session, status } = useSession();
//     const router = useRouter();

//     useEffect(() => {
//         if (status === "loading") return;
//         if (session) router.replace("/markets");
//         else router.replace("/login");
//     }, [session, status]);

//     return (
//         <div className="flex items-center justify-center min-h-screen">
//             <div className="w-8 h-8 border-2 border-greenText border-t-transparent rounded-full animate-spin" />
//         </div>
//     );
// }

// import { Hero } from "./components/landing/Hero";
// import { LandingFooter } from "./components/landing/LandingFooter";
// import { LandingHeader } from "./components/landing/LandingHeader";
// import { TechnicalSection } from "./components/landing/TechnicalSection";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-baseBackgroundL1 text-baseTextHighEmphasis">
      <LandingHeader />
      <Hero />
      <TechnicalSection />
      <LandingFooter />
    </main>
  );
}
