import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Auth } from "@/components/auth";
import { currentSession } from "@/lib/dashboard-data";

export const metadata: Metadata = { title: "Create account — ResiVault" };

export default async function RegisterPage() {
  if (await currentSession()) redirect("/");
  return <Auth initialSignup />;
}
