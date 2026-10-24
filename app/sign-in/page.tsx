import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Auth } from "@/components/auth";
import { currentSession } from "@/lib/dashboard-data";

export const metadata: Metadata = { title: "Sign in — ResiVault" };

export default async function SignInPage() {
  if (await currentSession()) redirect("/");
  return <Auth />;
}
