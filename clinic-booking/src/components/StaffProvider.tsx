"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Clinic, StaffRole } from "@/lib/types";

interface Value {
  userId: string;
  role: StaffRole;
  clinic: Clinic;
}

const Ctx = createContext<Value | null>(null);

export function StaffProvider({ value, children }: { value: Value; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStaff(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStaff must be used inside StaffProvider");
  return v;
}
