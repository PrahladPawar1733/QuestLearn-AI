import { publicStatus } from "@/lib/config";
import { AppNav } from "./app-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const status = publicStatus();
  return (
    <>
      <AppNav aiAvailable={status.aiAvailable} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">{children}</main>
    </>
  );
}
