import type { Metadata } from "next";
import { PatientsView } from "./PatientsView";

export const metadata: Metadata = { title: "المرضى" };

export default function PatientsPage() {
  return <PatientsView />;
}
