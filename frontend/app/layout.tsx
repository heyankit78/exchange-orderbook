import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Appbar } from "./components/Appbar";
import { SessionProviderWrapper } from "./components/SessionProviderWrapper";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Exchange",
    description: "Crypto trading platform",
};

export default function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en">
            <body className={inter.className}>
                <SessionProviderWrapper>
                    <Appbar />
                    {children}
                </SessionProviderWrapper>
            </body>
        </html>
    );
}