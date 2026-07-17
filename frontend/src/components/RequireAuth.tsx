"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfile } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

/**
 * Every call the advisor and dashboard make is Bearer-guarded, so an unauthenticated visitor
 * would otherwise walk into a wall of 401s. This checks the session once (which also spends the
 * refresh cookie if the 15-minute access token has expired) and sends them to /login if it's gone.
 */
export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ok" | "denied">("checking");

  useEffect(() => {
    const controller = new AbortController();

    getProfile(controller.signal)
      .then(() => setState("ok"))
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        // A network failure is not a rejected session — don't bounce the user to /login
        // just because the API is down; let the page show its own error state.
        if (e instanceof ApiError && e.code === "network_error") {
          setState("ok");
          return;
        }
        setState("denied");
        router.replace("/login");
      });

    return () => controller.abort();
  }, [router]);

  if (state === "checking") {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <p className="text-sm text-text-secondary animate-pulse-gentle">جارٍ التحقق من جلستك…</p>
      </div>
    );
  }

  if (state === "denied") return null;

  return <>{children}</>;
}
