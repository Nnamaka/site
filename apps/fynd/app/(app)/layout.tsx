import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";

// cacheComponents: request-time data (pathname, params, search params) must sit under a Suspense boundary.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
