"use client";

import dynamic from "next/dynamic";
import type { DashboardData } from "@/lib/dashboard-data";
import { Auth } from "./auth";

const Dashboard = dynamic(() =>
  import("./dashboard").then((module) => module.Dashboard),
);

export function VaultEntry({ initial }: { initial: DashboardData }) {
  if (!initial.session) return <Auth />;
  return <Dashboard key={initial.session.user.id} initial={initial} />;
}
