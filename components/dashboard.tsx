"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { SpendingChart } from "./spending-chart";
import { MonthPicker } from "./month-picker";
import { formatReceiptDate } from "@/lib/receipt-date";
import { receiptFilters } from "@/lib/receipt-filters";
import type { DashboardData } from "@/lib/dashboard-data";
import { flushSync } from "react-dom";
import { revealTheme } from "@/lib/theme-reveal";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  useQuery,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ReceiptText,
  LayoutDashboard,
  ChartNoAxesCombined,
  Settings,
  Search,
  Plus,
  ArrowUpRight,
  Camera,
  Download,
  ChevronRight,
  Leaf,
  ShoppingBasket,
  Utensils,
  Car,
  Zap,
  Ellipsis,
  X,
  LoaderCircle,
  Check,
  FolderOpen,
} from "lucide-react";
import { qk, queryDefaults, fromMinor, CurrencySchema } from "@/lib/shared";
import type { Session } from "@/lib/vault-client";
import {
  categories,
  formatMoney,
  today,
  tokens,
  type Receipt,
  type Category,
} from "@/lib/shared";
import { vault } from "@/lib/client";
import { selectReceipts, summarizeSpending } from "@/lib/spending-summary";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { SummaryCard } from "./summary-card";
import { VaultSelect } from "./vault-select";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";
import { Brand } from "./brand";
import { toast } from "sonner";
import { Auth } from "./auth";
import { ThemeToggle } from "./theme-toggle";
import { Input } from "./ui/input";
const SettingsPanel = dynamic(() => import("./settings-panel"), {
  loading: () => <p role="status">Opening preferences…</p>,
});
const ReceiptForm = dynamic(() => import("./receipt-form"), {
  loading: () => <p role="status">Opening receipt editor…</p>,
});
const Dialog = dynamic(() =>
  import("./receipt-dialog").then((module) => module.ReceiptDialog),
);
const demoCategories: Category[] = categories.map((name, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  name,
  color: Object.values(tokens.colors).slice(2)[i] ?? null,
  user_id: "demo",
  created_at: "",
}));
const Icons = {
  Food: Utensils,
  Groceries: ShoppingBasket,
  Transport: Car,
  Bills: Zap,
  Other: Ellipsis,
};
function CategoryIcon({ name }: { name: string }) {
  const Icon = Icons[name as keyof typeof Icons] ?? Ellipsis;
  return (
    <span className={`category-icon ${name.toLowerCase()}`}>
      <Icon size={19} />
    </span>
  );
}
export function Dashboard({ initial }: { initial: DashboardData }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: { queries: queryDefaults },
      queryCache: new QueryCache({
        onError: (error, query) => {
          toast.error("Could not load your data", {
            id: `query-${query.queryHash}`,
            description: error.message,
            action: {
              label: "Retry",
              onClick: () => {
                void client.invalidateQueries({ queryKey: query.queryKey });
              },
            },
          });
        },
        onSuccess: (_data, query) => {
          toast.dismiss(`query-${query.queryHash}`);
        },
      }),
    });
    if (initial.session && initial.receipts) {
      client.setQueryData(qk.list(initial.session.user.id, initial.filters), {
        pages: [initial.receipts],
        pageParams: [undefined],
      });
      client.setQueryData(
        qk.categories(initial.session.user.id),
        initial.categories,
      );
    }
    return client;
  });
  return (
    <QueryClientProvider client={queryClient}>
      <App initial={initial} />
    </QueryClientProvider>
  );
}
function App({ initial }: { initial: DashboardData }) {
  const cache = useQueryClient();
  const [session, setSession] = useState<Session | null>(initial.session);
  const [ready, setReady] = useState(true);
  const [view, setView] = useState(initial.view);
  const [search, setSearch] = useState(initial.filters.q ?? "");
  const [month, setMonth] = useState(initial.filters.month ?? "");
  const [category, setCategory] = useState(initial.filters.categoryId ?? "");
  const [currency, setCurrency] = useState("PHP");
  const [currentDate, setCurrentDate] = useState(initial.renderDate);
  const [dark, setDark] = useState(false);
  const themeTransition = useRef<ViewTransition | null>(null);
  function toggleTheme(origin?: HTMLElement | null) {
    if (themeTransition.current) return;
    const next = !dark;
    const transition = revealTheme(() => {
      document.documentElement.dataset.theme = next ? "dark" : "light";
      flushSync(() => setDark(next));
    }, origin);
    themeTransition.current = transition;
    if (transition)
      void transition.finished
        .finally(() => {
          if (themeTransition.current === transition)
            themeTransition.current = null;
        })
        .catch(() => undefined);
  }
  useEffect(() => () => themeTransition.current?.skipTransition(), []);
  const [editing, setEditing] = useState<Receipt | null | undefined>(undefined);
  const [detail, setDetail] = useState<Receipt | null>(null);
  const activeUid = useRef<string | null>(initial.session?.user.id ?? null);
  const [debouncedSearch, setDebouncedSearch] = useState(
    initial.filters.q ?? "",
  );
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      setSearch(params.get("q") ?? "");
      setMonth(params.get("month") ?? "");
      setCategory(params.get("categoryId") ?? "");
      setView(
        ["Reports", "Settings"].includes(params.get("view") ?? "")
          ? params.get("view")!
          : "Receipts",
      );
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    for (const [name, value] of Object.entries({
      q: debouncedSearch,
      month,
      categoryId: category,
      view: view === "Receipts" ? "" : view,
    })) {
      if (value) url.searchParams.set(name, value);
      else url.searchParams.delete(name);
    }
    window.history.replaceState(null, "", url);
  }, [debouncedSearch, month, category, view]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [local, setLocal] = useState<Receipt[]>([]);
  const [demoReady, setDemoReady] = useState(false);
  useEffect(() => {
    setCurrentDate(today());
    try {
      const stored = localStorage.getItem("receipt-vault-demo");
      const saved: Receipt[] = stored ? JSON.parse(stored) : [];
      // Remove only the seven sample records shipped in the initial preview.
      const receipts = Array.isArray(saved)
        ? saved.filter((receipt) => !/^demo-[0-6]$/.test(receipt.id))
        : [];
      setLocal(receipts);
      if (stored && receipts.length !== saved.length) {
        localStorage.setItem("receipt-vault-demo", JSON.stringify(receipts));
      }
      setCurrency(localStorage.getItem("receipt-vault-currency") || "PHP");
      setDark(localStorage.getItem("receipt-vault-dark") === "true");
    } catch {
      setLocal([]);
    }
    setDemoReady(true);
    if (!vault) return;
    vault.auth.primeSession(initial.session);
    return vault.auth.watch((next) => {
      setSession(next);
      setReady(true);
      if (activeUid.current !== (next?.user.id ?? null)) {
        cache.clear();
        setDetail(null);
        setEditing(undefined);
        activeUid.current = next?.user.id ?? null;
      }
    });
  }, [cache]);
  useEffect(() => {
    if (!demoReady) return;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("receipt-vault-dark", String(dark));
    } catch {
      /* Theme switching also works when browser storage is disabled. */
    }
  }, [dark, demoReady]);
  const uid = session?.user.id ?? "";
  const selectedMonth = month || currentDate.slice(0, 7);
  const filters = receiptFilters({
    q: debouncedSearch || undefined,
    month: month || undefined,
    categoryId: category || undefined,
  });
  const reportFilters = {
    ...filters,
    currency: CurrencySchema.catch("PHP").parse(currency),
  };
  const receiptsQuery = useInfiniteQuery({
    queryKey: qk.list(uid, filters),
    enabled: !!session && !!vault,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => vault!.listReceipts(filters, pageParam),
    getNextPageParam: (last) => last.page.nextCursor ?? undefined,
  });
  const catsQuery = useQuery({
    queryKey: qk.categories(uid),
    enabled: !!session && !!vault,
    queryFn: () => vault!.listCategories(),
    staleTime: 3_600_000,
  });
  const reportQuery = useQuery({
    queryKey: qk.report(uid, reportFilters),
    enabled: !!session && !!vault,
    queryFn: () => vault!.report(reportFilters),
  });
  const trendFilters = { ...reportFilters, month: undefined };
  const trendQuery = useQuery({
    queryKey: qk.report(uid, trendFilters),
    enabled: !!session && !!vault && view === "Reports",
    queryFn: () => vault!.report(trendFilters),
  });
  const trend = vault
    ? trendQuery.data
    : summarizeSpending(selectReceipts(local, trendFilters), currency);
  const cats = vault ? (catsQuery.data ?? []) : demoCategories;
  const receipts = vault
    ? (receiptsQuery.data?.pages.flatMap((page) => page.data) ?? [])
    : local;
  const names = Object.fromEntries(cats.map((c) => [c.id, c.name]));
  const filtered = vault ? receipts : selectReceipts(receipts, filters);
  const report = vault
    ? reportQuery.data
    : summarizeSpending(filtered, currency);
  const receiptCount = report?.count ?? filtered.length;
  const total = fromMinor(report?.totalMinor ?? 0, currency);
  const spendingPeriod = month
    ? new Date(`${month}-01T12:00:00`).toLocaleDateString("en", {
        month: "long",
        year: "numeric",
      })
    : "All months";
  const breakdown = cats
    .map((c) => ({
      ...c,
      total: fromMinor(
        (report?.categories ?? [])
          .filter(
            (row) =>
              row.categoryId === c.id ||
              (row.categoryId === null && c.name === "Other"),
          )
          .reduce((sum, row) => sum + row.totalMinor, 0),
        currency,
      ),
    }))
    .sort((a, b) => b.total - a.total);
  const grouped = filtered.reduce<Record<string, Receipt[]>>((groups, r) => {
    (groups[r.purchase_date] ??= []).push(r);
    return groups;
  }, {});
  const persist = (next: Receipt[]) => {
    localStorage.setItem("receipt-vault-demo", JSON.stringify(next));
    setLocal(next);
  };
  const refresh = () => cache.invalidateQueries({ queryKey: qk.receipts(uid) });
  const photoQuery = useQuery({
    queryKey: qk.photo(uid, detail?.id ?? ""),
    enabled: !!session && !!detail?.image_path,
    queryFn: () => vault!.photoUrl(detail!.id),
    staleTime: 240_000,
    gcTime: 240_000,
  });
  const photo = photoQuery.data ?? null;
  const photoError = photoQuery.error
    ? "Could not load the photo. Close and reopen this receipt to retry."
    : "";
  async function remove(r: Receipt) {
    if (!window.confirm(`Delete the receipt from ${r.merchant}?`)) return;
    try {
      if (vault) {
        await vault.deleteReceipt(r.id);
        await refresh();
      } else persist(local.filter((x) => x.id !== r.id));
      setDetail(null);
      toast.success("Receipt deleted.");
    } catch {
      toast.error("Could not delete this receipt. Please try again.");
    }
  }
  async function download() {
    try {
      const csv = await vault!.exportReceipts(filters);
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8;" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipts-${today()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Receipts exported.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not export receipts.",
      );
    }
  }
  // Account pages already have server data; only local mode waits for storage.
  if (!ready || (!vault && !demoReady))
    return (
      <div className="loading">
        <LoaderCircle className="spin" /> Opening your vault…
      </div>
    );
  if (vault && !session) return <Auth />;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>
          {[
            { name: "Receipts", icon: LayoutDashboard },
            { name: "Reports", icon: ChartNoAxesCombined },
            { name: "Settings", icon: Settings },
          ].map(({ name, icon: Icon }) => (
            <button
              key={name}
              onClick={() => setView(name)}
              className={view === name ? "nav-item active" : "nav-item"}
            >
              <Icon size={19} />
              {name}
              {name === "Receipts" && (
                <span className="nav-count">{receiptCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="paper-note">
            <span className="leaf-mark">
              <Leaf size={22} />
            </span>
            <strong>
              A little less paper.
              <br />A little more clarity.
            </strong>
            <p>Your receipts have a better home here.</p>
          </div>
          <button className="profile" onClick={() => setView("Settings")}>
            <span className="avatar">
              {session?.user.email?.[0]?.toUpperCase() ?? "D"}
            </span>
            <span>
              <strong>
                {session?.user.email?.split("@")[0] ?? "Local workspace"}
              </strong>
              <small>
                {vault ? "Personal account" : "Stored on this browser"}
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="mobile-header">
          <Brand />
          <ThemeToggle dark={dark} onToggle={toggleTheme} size={21} />
        </header>
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <strong>{view}</strong>
          </div>
          <div className="top-actions">
            {!vault && (
              <span className="demo-badge">
                <span /> Local mode
              </span>
            )}
            <ThemeToggle dark={dark} onToggle={toggleTheme} />
          </div>
        </header>
        <main key={view} className="view-content">
          <div className="mobile-heading">
            <p>Your everyday, organized.</p>
            <h1>
              {view === "Receipts"
                ? "My receipts"
                : view === "Reports"
                  ? "My spending"
                  : "My settings"}
            </h1>
          </div>
          {view !== "Settings" && (
            <section
              className="mobile-summary"
              aria-label="Spending summary for current selection"
            >
              <div>
                <span>
                  {month ? "Monthly spending" : "Total spending"} · {currency}
                </span>
                <ReceiptText size={22} />
              </div>
              <strong>
                {reportQuery.error
                  ? "—"
                  : reportQuery.isLoading
                    ? "…"
                    : formatMoney(total, currency)}
              </strong>
              <p>
                {receiptCount} saved{" "}
                {receipts.length === 1 ? "receipt" : "receipts"}
                <span>{spendingPeriod}</span>
              </p>
            </section>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">LESS PAPER. MORE PEACE OF MIND.</div>
              <h1>
                {view === "Receipts"
                  ? "Your receipts, all together."
                  : view === "Reports"
                    ? "Make sense of your spending."
                    : "Make yourself at home."}
              </h1>
              <p>
                {view === "Receipts"
                  ? "A tidy little home for everything you spend."
                  : view === "Reports"
                    ? "A clearer picture, one receipt at a time."
                    : "Manage your preferences and your receipt archive."}
              </p>
            </div>
            {view !== "Settings" && (
              <Button onClick={() => setEditing(null)}>
                <Plus size={18} /> Add receipt
              </Button>
            )}
          </div>
          {!vault && (
            <div className="demo-info">
              Receipts you add stay in this browser. Connect an account to
              enable cloud sync and AI scanning.
            </div>
          )}
          {view === "Settings" ? (
            <SettingsPanel
              dark={dark}
              toggleTheme={toggleTheme}
              currency={currency}
              setCurrency={setCurrency}
              download={download}
              cats={cats}
              session={session}
            />
          ) : (
            <>
              <div className="stats">
                <SummaryCard
                  featured
                  loading={receiptsQuery.isLoading || reportQuery.isLoading}
                  label={month ? "Monthly spending" : "Total spending"}
                  icon={<ChartNoAxesCombined size={19} />}
                  value={
                    reportQuery.error
                      ? "—"
                      : reportQuery.isLoading
                        ? "…"
                        : formatMoney(total, currency)
                  }
                  description={
                    <>
                      {spendingPeriod} · {currency} only · Current selection
                    </>
                  }
                />
                <SummaryCard
                  loading={receiptsQuery.isLoading || reportQuery.isLoading}
                  label="Receipts saved"
                  icon={<ReceiptText size={19} />}
                  value={
                    <>
                      {receiptCount}
                      <span className="stat-unit">receipts</span>
                    </>
                  }
                  description="Receipts in current selection"
                />
                <SummaryCard
                  loading={receiptsQuery.isLoading || reportQuery.isLoading}
                  label="Top category"
                  icon={<ShoppingBasket size={19} />}
                  value={breakdown[0]?.total ? breakdown[0].name : "—"}
                  description={
                    breakdown[0]?.total
                      ? `${formatMoney(breakdown[0].total, currency)} in current selection`
                      : "Your spending story starts here"
                  }
                />
              </div>
              {view === "Reports" && (
                <SpendingChart
                  months={trend?.months ?? []}
                  selectedMonth={selectedMonth}
                  onSelectMonth={setMonth}
                  currency={currency}
                  loading={trendQuery.isLoading}
                  updating={trendQuery.isFetching && !trendQuery.isLoading}
                  error={!!trendQuery.error}
                  onRetry={() => void trendQuery.refetch()}
                />
              )}
              <div className="content-grid">
                <section className="receipt-section">
                  <div className="section-heading">
                    <h2>
                      {view === "Reports"
                        ? "Spending overview"
                        : "Receipt collection"}
                      <span>{receiptCount}</span>
                    </h2>
                    <Button variant="ghost" size="sm" onClick={download}>
                      <Download size={15} /> Export CSV
                    </Button>
                  </div>
                  <div className="filters">
                    <label className="search">
                      <Search size={17} />
                      <Input
                        aria-label="Search by store"
                        maxLength={120}
                        placeholder="Search by store name…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <VaultSelect
                      className="category-filter"
                      label="Filter by category"
                      value={category}
                      onValueChange={setCategory}
                      options={[
                        { value: "", label: "All categories" },
                        ...cats.map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                    <MonthPicker value={month} onChange={setMonth} />
                    {(search || month || category) && (
                      <button
                        className="icon-button"
                        aria-label="Clear filters"
                        onClick={() => {
                          setSearch("");
                          setDebouncedSearch("");
                          setMonth("");
                          setCategory("");
                        }}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <div
                    className="mobile-categories"
                    aria-label="Filter receipts by category"
                  >
                    {[{ id: "", name: "All" }, ...cats].map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        aria-pressed={category === c.id}
                        onClick={() => setCategory(c.id)}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                  {receiptsQuery.isLoading ? (
                    <div
                      className="receipt-loading"
                      role="status"
                      aria-label="Loading receipts"
                    >
                      <span className="sr-only">Loading receipts…</span>
                      {[0, 1, 2].map((i) => (
                        <div className="receipt-skeleton-row" key={i}>
                          <Skeleton className="receipt-skeleton-icon" />
                          <div>
                            <Skeleton className="receipt-skeleton-title" />
                            <Skeleton className="receipt-skeleton-subtitle" />
                          </div>
                          <Skeleton className="receipt-skeleton-amount" />
                        </div>
                      ))}
                    </div>
                  ) : !filtered.length ? (
                    <div className="empty">
                      <FolderOpen size={38} />
                      <h3>
                        {search || month || category
                          ? "No matching receipts"
                          : "No saved receipts yet"}
                      </h3>
                      <p>
                        {search || month || category
                          ? "Try another store, category, or month."
                          : "Upload a photo or enter the details to save your first receipt."}
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => setEditing(null)}
                      >
                        <Plus size={16} /> Add receipt
                      </Button>
                    </div>
                  ) : (
                    <>
                      {view === "Reports" && (
                        <div className="report-main">
                          <h3>
                            {formatMoney(total, currency)}{" "}
                            <small>in your selection · {currency}</small>
                          </h3>
                          {breakdown.map((c) => (
                            <div className="report-row" key={c.id}>
                              <div>
                                <CategoryIcon name={c.name} />
                                <strong>{c.name}</strong>
                                <span>{formatMoney(c.total, currency)}</span>
                              </div>
                              <div className="bar-track">
                                <div
                                  style={{
                                    width: `${total ? (c.total / total) * 100 : 0}%`,
                                    background: c.color ?? "#85918a",
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="receipt-groups">
                        {Object.entries(grouped).map(([date, rows]) => (
                          <div key={date}>
                            <div className="date-heading">
                              <span>
                                {date === currentDate
                                  ? "Today"
                                  : formatReceiptDate(date)}
                              </span>
                              <span>
                                {rows?.length} receipt
                                {rows?.length === 1 ? "" : "s"}
                              </span>
                            </div>
                            {rows?.map((r) => (
                              <button
                                className="receipt-row"
                                key={r.id}
                                onClick={() => setDetail(r)}
                              >
                                <CategoryIcon
                                  name={names[r.category_id ?? ""] ?? "Other"}
                                />
                                <span className="receipt-store">
                                  <strong>{r.merchant}</strong>
                                  <small>
                                    {r.payment_method || "Receipt"}
                                    <span>·</span>
                                    {r.scan_status === "scanned"
                                      ? "Scanned receipt"
                                      : "Manual entry"}
                                  </small>
                                </span>
                                <Badge
                                  variant="secondary"
                                  className={`badge ${names[r.category_id ?? ""]?.toLowerCase() ?? "other"}`}
                                >
                                  {names[r.category_id ?? ""] ?? "Other"}
                                </Badge>
                                <strong className="receipt-price">
                                  {formatMoney(
                                    Number(r.total_amount),
                                    r.currency,
                                  )}
                                </strong>
                                <ChevronRight
                                  size={16}
                                  className="row-chevron"
                                />
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {receiptsQuery.hasNextPage && (
                    <Button
                      variant="outline"
                      disabled={receiptsQuery.isFetchingNextPage}
                      onClick={() => void receiptsQuery.fetchNextPage()}
                    >
                      {receiptsQuery.isFetchingNextPage
                        ? "Loading…"
                        : "Load more receipts"}
                    </Button>
                  )}
                  {reportQuery.error && (
                    <p role="alert">
                      Could not load complete totals.{" "}
                      <button type="button" onClick={() => void refresh()}>
                        Retry
                      </button>
                    </p>
                  )}
                </section>
                <aside className="right-column">
                  <Card className="scan-card">
                    <div className="scan-illustration">
                      <div className="receipt-paper">
                        <ReceiptText size={30} />
                        <span />
                        <span />
                        <div>₱ 285.00</div>
                        <span />
                      </div>
                      <span className="scan-check">
                        <Check size={17} />
                      </span>
                      <div className="scan-corner tl" />
                      <div className="scan-corner tr" />
                      <div className="scan-corner bl" />
                      <div className="scan-corner br" />
                    </div>
                    <span className="mini-eyebrow">PAPER TO PEACE OF MIND</span>
                    <h2>Snap. Save. Sorted.</h2>
                    <p>
                      Upload a receipt and let AI handle the little details.
                    </p>
                    <Button variant="outline" onClick={() => setEditing(null)}>
                      <Camera size={17} /> Scan a receipt{" "}
                      <ArrowUpRight size={16} />
                    </Button>
                    <small>Always yours to review before saving.</small>
                  </Card>
                  <Card className="breakdown-card">
                    <div className="section-heading">
                      <h3>By category</h3>
                      <span className="muted">{currency}</span>
                    </div>
                    <div className="stacked-bar">
                      {breakdown
                        .filter((c) => c.total > 0)
                        .map((c) => (
                          <span
                            key={c.id}
                            style={{
                              width: `${total ? (c.total / total) * 100 : 0}%`,
                              background: c.color ?? "#85918a",
                            }}
                          />
                        ))}
                    </div>
                    {breakdown.map((c) => (
                      <div className="legend-row" key={c.id}>
                        <span
                          className="legend-dot"
                          style={{ background: c.color ?? "#85918a" }}
                        />
                        <span>{c.name}</span>
                        <strong>
                          {total ? Math.round((c.total / total) * 100) : 0}%
                        </strong>
                      </div>
                    ))}
                    <button
                      className="text-link"
                      onClick={() => setView("Reports")}
                    >
                      View spending report <ArrowUpRight size={15} />
                    </button>
                  </Card>
                  <div className="privacy-note">
                    <span>✧</span> Your receipts. Your eyes only.
                    <br />
                    <small>
                      {vault
                        ? "Photos are stored privately."
                        : "Demo data stays on this device."}
                    </small>
                  </div>
                </aside>
              </div>
            </>
          )}
          <footer>
            Less clutter. More clarity.<span>Made for the everyday.</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Main navigation">
        {[
          { name: "Receipts", icon: ReceiptText },
          { name: "Reports", icon: ChartNoAxesCombined },
          { name: "Scan", icon: Camera },
          { name: "Settings", icon: Settings },
        ].map(({ name, icon: Icon }) => (
          <button
            type="button"
            key={name}
            className={name === "Scan" ? "mobile-scan" : ""}
            aria-current={view === name ? "page" : undefined}
            onClick={() => (name === "Scan" ? setEditing(null) : setView(name))}
          >
            <Icon size={22} />
            <span>{name}</span>
          </button>
        ))}
      </nav>
      {editing !== undefined && (
        <Dialog
          open={editing !== undefined}
          onOpenChange={(open) => {
            if (!open) setEditing(undefined);
          }}
          title={editing ? "Edit receipt" : "Add a receipt"}
          description="Upload a photo or enter the details. Review everything before saving."
        >
          {editing !== undefined && (
            <ReceiptForm
              key={editing?.id ?? "new"}
              receipt={editing}
              cats={cats}
              currency={currency}
              userId={session?.user.id ?? "demo"}
              onSaved={async (r) => {
                if (!vault) persist([r, ...local.filter((x) => x.id !== r.id)]);
                else await refresh();
                // Show the complete archive so receipts from other months
                // do not appear to disappear after saving a new receipt.
                setMonth("");
                setSearch("");
                setDebouncedSearch("");
                setCategory("");
                setView("Receipts");
                setEditing(undefined);
                toast.success("Receipt saved. Showing all saved receipts.");
              }}
            />
          )}
        </Dialog>
      )}
      {detail && (
        <Dialog
          open={!!detail}
          onOpenChange={(open) => {
            if (!open) setDetail(null);
          }}
          title={detail?.merchant ?? "Receipt"}
          description="Your original receipt and saved details."
        >
          {detail && (
            <div className="detail">
              {photo ? (
                <img
                  src={photo}
                  alt={`Receipt from ${detail.merchant}`}
                  className="receipt-photo"
                />
              ) : (
                <div className="photo-placeholder">
                  <ReceiptText size={32} />
                  {photoError ||
                    (detail.image_path
                      ? "Loading photo…"
                      : "No photo attached")}
                </div>
              )}
              <div className="detail-amount">
                {formatMoney(Number(detail.total_amount), detail.currency)}
              </div>
              <dl>
                <dt>Purchased</dt>
                <dd>{formatReceiptDate(detail.purchase_date)}</dd>
                {detail.printed_date && (
                  <>
                    <dt>Printed date</dt>
                    <dd>{detail.printed_date}</dd>
                  </>
                )}
                <dt>Category</dt>
                <dd>{names[detail.category_id ?? ""] ?? "Other"}</dd>
                <dt>Payment</dt>
                <dd>{detail.payment_method || "Not specified"}</dd>
                <dt>Notes</dt>
                <dd>{detail.notes || "—"}</dd>
              </dl>
              <div className="form-actions">
                <Button variant="destructive" onClick={() => remove(detail)}>
                  Delete receipt
                </Button>
                <Button
                  onClick={() => {
                    setEditing(detail);
                    setDetail(null);
                  }}
                >
                  Edit receipt
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
