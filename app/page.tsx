import { VaultEntry } from "@/components/vault-entry";
import { dashboardData } from "@/lib/dashboard-data";
import { Homepage } from "@/components/homepage";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initial = await dashboardData(await searchParams);
  if (!initial.session) return <Homepage />;
  return <VaultEntry initial={initial} />;
}
