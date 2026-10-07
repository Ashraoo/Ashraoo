import type { Metadata } from "next";
import { ReceptionBoard } from "./ReceptionBoard";

export const metadata: Metadata = { title: "المواعيد" };

export default function DashboardPage() {
  return <ReceptionBoard />;
}
