import React, { useEffect } from "react";
import { SplashScreen } from "@/components/splash-screen";
import { useRouter } from "expo-router";
import { authClient } from "@/lib/auth-client";

export default function SplashRoute() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    // Wait for splash animation and session check
    const timer = setTimeout(() => {
      if (isPending) return; // Keep showing splash if session is still loading

      if (session?.user) {
        // User is already logged in, go to main app
        router.replace("/");
      } else {
        // User not logged in, go to landing/login
        router.replace("/landing");
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [session, isPending, router]);

  return <SplashScreen />;
}
