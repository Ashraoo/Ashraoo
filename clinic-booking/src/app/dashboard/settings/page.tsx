import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsView } from "./SettingsView";

export const metadata: Metadata = { title: "الإعدادات" };

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsView />
    </Suspense>
  );
}
