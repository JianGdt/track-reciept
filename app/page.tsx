import { VaultEntry } from "@/components/vault-entry";
import { dashboardData } from "@/lib/dashboard-data";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initial = await dashboardData(await searchParams);
  return <VaultEntry initial={initial} />;
}
