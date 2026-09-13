"use client";

import { SessionProvider } from "next-auth/react";

export function SessionProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider refetchInterval={10 * 60} refetchOnWindowFocus>
      {children}
    </SessionProvider>
  );
}
