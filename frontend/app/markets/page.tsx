"use client";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Markets } from "../components/Markets";

export default function Page() {
    const { data: session, status } = useSession();
    const router = useRouter();

    useEffect(() => {
        if (status === "unauthenticated") router.replace("/login");
    }, [status]);

    if (status === "loading" || !session) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-8 h-8 border-2 border-greenText border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return <Markets />;
}