import { Dashboard } from "@/components/dashboard";
import { dashboardData } from "@/lib/dashboard-data";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <Dashboard initial={await dashboardData(await searchParams)} />;
}
