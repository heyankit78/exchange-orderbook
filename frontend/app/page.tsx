"use client";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
    const { data: session, status } = useSession();
    const router = useRouter();

    useEffect(() => {
        if (status === "loading") return;
        if (session) router.replace("/markets");
        else router.replace("/login");
    }, [session, status]);

    return (
        <div className="flex items-center justify-center min-h-screen">
            <div className="w-8 h-8 border-2 border-greenText border-t-transparent rounded-full animate-spin" />
        </div>
    );
}