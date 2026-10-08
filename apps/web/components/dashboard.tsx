"use client";
import { useEffect, useRef, useState } from "react";
import { MonthPicker } from "./month-picker";
import { flushSync } from "react-dom";
import { revealTheme } from "@/lib/theme-reveal";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  LogOut,
  Sun,
  Moon,
  Leaf,
  ShoppingBasket,
  Utensils,
  Car,
  Zap,
  Ellipsis,
  X,
  LoaderCircle,
  Upload,
  Check,
  FolderOpen,
} from "lucide-react";
import {
  qk,
  queryDefaults,
  fromMinor,
  CurrencySchema,
} from "@receipt-vault/shared";
import type { Session } from "@receipt-vault/firebase";
import {
  categories,
  formatMoney,
  receiptSchema,
  scanSchema,
  today,
  tokens,
  type Receipt,
  type ReceiptInput,
  type Category,
  type ScanResult,
} from "@receipt-vault/shared";
import { vault, compressPhoto } from "@/lib/client";
import { Button } from "./ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
import { SummaryCard } from "./summary-card";
import { VaultSelect } from "./vault-select";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";
import { Alert, AlertDescription } from "./ui/alert";
import { ReceiptDialog as Dialog } from "./receipt-dialog";
import { Brand } from "./brand";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
const demoCategories: Category[] = categories.map((name, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  name,
  color: Object.values(tokens.colors).slice(2)[i],
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
export function Dashboard() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: queryDefaults } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  );
}
function App() {
  const cache = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!vault);
  const [view, setView] = useState("Receipts");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [category, setCategory] = useState("");
  const [currency, setCurrency] = useState("PHP");
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
  const [notice, setNotice] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [editing, setEditing] = useState<Receipt | null | undefined>(undefined);
  const [detail, setDetail] = useState<Receipt | null>(null);
  const activeUid = useRef<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [local, setLocal] = useState<Receipt[]>([]);
  const [demoReady, setDemoReady] = useState(false);
  useEffect(() => {
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
  const filters = {
    q: debouncedSearch || undefined,
    month: month || undefined,
    categoryId: category || undefined,
  };
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
  const monthlyFilters = {
    month: today().slice(0, 7),
    currency: reportFilters.currency,
  };
  const monthlyQuery = useQuery({
    queryKey: qk.report(uid, monthlyFilters),
    enabled: !!session && !!vault,
    queryFn: () => vault!.report(monthlyFilters),
  });
  const cats = vault ? (catsQuery.data ?? []) : demoCategories;
  const receipts = vault
    ? (receiptsQuery.data?.pages.flatMap((page) => page.data) ?? [])
    : local;
  const names = Object.fromEntries(cats.map((c) => [c.id, c.name]));
  const filtered = receipts;
  const receiptCount = reportQuery.data?.count ?? receipts.length;
  const total = fromMinor(reportQuery.data?.totalMinor ?? 0, currency);
  const monthlyTotal = fromMinor(monthlyQuery.data?.totalMinor ?? 0, currency);
  const breakdown = cats
    .map((c) => ({
      ...c,
      total: fromMinor(
        (reportQuery.data?.categories ?? [])
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
    } catch {
      setNotice("Could not delete this receipt. Please try again.");
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
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not export receipts.",
      );
    }
  }
  if (!ready || !demoReady)
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
          <button
            className="icon-button"
            onClick={(event) => toggleTheme(event.currentTarget)}
            aria-label={dark ? "Use light theme" : "Use dark theme"}
          >
            <span className="theme-switch-icon" key={String(dark)}>
              {dark ? <Sun size={21} /> : <Moon size={21} />}
            </span>
          </button>
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
            <button
              className="icon-button"
              onClick={(event) => toggleTheme(event.currentTarget)}
              aria-label={dark ? "Use light theme" : "Use dark theme"}
            >
              <span className="theme-switch-icon" key={String(dark)}>
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </span>
            </button>
          </div>
        </header>
        <main>
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
              aria-label="Monthly spending summary"
            >
              <div>
                <span>Spent this month · {currency}</span>
                <ReceiptText size={22} />
              </div>
              <strong>{formatMoney(monthlyTotal, currency)}</strong>
              <p>
                {receiptCount} saved{" "}
                {receipts.length === 1 ? "receipt" : "receipts"}
                <span>All in one place</span>
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
          {(notice || receiptsQuery.error || catsQuery.error) && (
            <div role="alert" className="alert">
              {notice ||
                "Could not load your vault. Check your connection and try again."}
              <button
                aria-label="Dismiss message"
                onClick={() => {
                  setNotice("");
                  void refresh();
                  void catsQuery.refetch();
                }}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {view === "Settings" ? (
            <Card className="settings-card">
              <CardHeader>
                <CardTitle>Preferences</CardTitle>
                <CardDescription>
                  A workspace that feels like yours.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="settings-row">
                  <div>
                    <label htmlFor="dark-mode">Dark appearance</label>
                    <p>Switch between light and dark.</p>
                  </div>
                  <Switch
                    id="dark-mode"
                    checked={dark}
                    onCheckedChange={() =>
                      toggleTheme(document.getElementById("dark-mode"))
                    }
                  />
                </div>
                <Separator />
                <div className="settings-row">
                  <div>
                    <strong>Summary currency</strong>
                    <p>Each currency is totaled separately.</p>
                  </div>
                  <VaultSelect
                    label="Summary currency"
                    value={currency}
                    onValueChange={(next) => {
                      setCurrency(next);
                      localStorage.setItem("receipt-vault-currency", next);
                    }}
                    options={["PHP", "USD", "EUR", "GBP", "JPY", "SGD"].map(
                      (value) => ({ value, label: value }),
                    )}
                  />
                </div>
                <Separator />
                <div className="settings-row">
                  <div>
                    <strong>Your archive</strong>
                    <p>Download receipts in your current selection.</p>
                  </div>
                  <Button variant="outline" onClick={download}>
                    <Download size={16} /> Export CSV
                  </Button>
                </div>
                <Separator />
                <div className="settings-categories">
                  <strong>Categories</strong>
                  <div className="category-chips">
                    {cats.map((c) => (
                      <Badge
                        variant="secondary"
                        className={c.name.toLowerCase()}
                        key={c.id}
                      >
                        {c.name}
                      </Badge>
                    ))}
                  </div>
                </div>
                {vault && (
                  <>
                    <Separator />
                    <div className="settings-row">
                      <div>
                        <strong>Account</strong>
                        <p>{session?.user.email}</p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          const { error } = await vault!.auth.signOut();
                          if (error)
                            setNotice("Could not sign out. Try again.");
                        }}
                      >
                        <LogOut size={16} /> Sign out
                      </Button>
                    </div>
                  </>
                )}
                <Separator />
                <div className="settings-row">
                  <div>
                    <strong>Privacy</strong>
                    <p>
                      Your receipt photos are sent to Google Gemini when you
                      scan. <a href="/privacy">Read our privacy notice</a>.
                    </p>
                  </div>
                </div>
                <Separator />
                <div className="settings-row">
                  <div>
                    <strong>Delete account</strong>
                    <p>
                      Permanently remove your account, receipts, and photos.
                    </p>
                    <label>
                      Confirm your password
                      <Input
                        type="password"
                        autoComplete="current-password"
                        value={deletePassword}
                        onChange={(event) =>
                          setDeletePassword(event.target.value)
                        }
                      />
                    </label>
                  </div>
                  <Button
                    variant="destructive"
                    disabled={!deletePassword || deletingAccount}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          "Permanently delete your account, all receipts, and all photos? This cannot be undone.",
                        )
                      )
                        return;
                      setDeletingAccount(true);
                      const { error } =
                        await vault!.auth.deleteAccount(deletePassword);
                      setDeletePassword("");
                      setDeletingAccount(false);
                      if (error) setNotice(error.message);
                    }}
                  >
                    {deletingAccount ? "Deleting…" : "Delete account"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="stats">
                <SummaryCard
                  featured
                  loading={
                    receiptsQuery.isLoading ||
                    reportQuery.isLoading ||
                    monthlyQuery.isLoading
                  }
                  label="Spent this month"
                  icon={<ChartNoAxesCombined size={19} />}
                  value={formatMoney(monthlyTotal, currency)}
                  description={
                    <>
                      {new Date().toLocaleDateString("en", {
                        month: "long",
                        year: "numeric",
                      })}{" "}
                      · {currency} only
                    </>
                  }
                />
                <SummaryCard
                  loading={
                    receiptsQuery.isLoading ||
                    reportQuery.isLoading ||
                    monthlyQuery.isLoading
                  }
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
                  loading={
                    receiptsQuery.isLoading ||
                    reportQuery.isLoading ||
                    monthlyQuery.isLoading
                  }
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
                        {receipts.length
                          ? "No matching receipts"
                          : "Your fresh start begins here"}
                      </h3>
                      <p>
                        {receipts.length
                          ? "Try another store, category, or month."
                          : "Add your first receipt and leave the paper behind."}
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => setEditing(null)}
                      >
                        <Plus size={16} /> Add receipt
                      </Button>
                    </div>
                  ) : view === "Reports" ? (
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
                  ) : (
                    <div className="receipt-groups">
                      {Object.entries(grouped).map(([date, rows]) => (
                        <div key={date}>
                          <div className="date-heading">
                            <span>
                              {date === today()
                                ? "Today"
                                : new Date(
                                    date + "T12:00:00",
                                  ).toLocaleDateString("en-PH", {
                                    weekday: "long",
                                    month: "short",
                                    day: "numeric",
                                  })}
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
                              <ChevronRight size={16} className="row-chevron" />
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
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
                  {(reportQuery.error || monthlyQuery.error) && (
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
              setEditing(undefined);
              setNotice("Receipt saved. Everything in its place.");
            }}
          />
        )}
      </Dialog>
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
                  (detail.image_path ? "Loading photo…" : "No photo attached")}
              </div>
            )}
            <div className="detail-amount">
              {formatMoney(Number(detail.total_amount), detail.currency)}
            </div>
            <dl>
              <dt>Purchased</dt>
              <dd>{detail.purchase_date}</dd>
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
    </div>
  );
}
function ReceiptForm({
  receipt,
  cats,
  currency,
  userId,
  onSaved,
}: {
  receipt: Receipt | null;
  cats: Category[];
  currency: string;
  userId: string;
  onSaved: (r: Receipt) => Promise<void>;
}) {
  const [id] = useState(() => receipt?.id ?? crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const [imagePath, setImagePath] = useState(receipt?.image_path ?? null);
  const [scan, setScan] = useState<ScanResult | null>(
    receipt?.scan_raw ?? null,
  );
  const [status, setStatus] = useState<Receipt["scan_status"]>(
    receipt?.scan_status ?? "manual",
  );
  const [pending, setPending] = useState<Blob | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const picking = useRef(false);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ReceiptInput>({
    resolver: zodResolver(receiptSchema),
    defaultValues: receipt
      ? {
          merchant: receipt.merchant,
          purchase_date: receipt.purchase_date,
          total_amount: receipt.total_amount,
          currency: receipt.currency,
          category_id: receipt.category_id,
          payment_method: receipt.payment_method,
          notes: receipt.notes,
        }
      : {
          merchant: "",
          purchase_date: today(),
          total_amount: undefined,
          currency: CurrencySchema.catch("PHP").parse(currency),
          category_id: null,
          payment_method: "",
          notes: "",
        },
  });
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const uploading = useRef(false);
  async function upload(blob: Blob) {
    if (!vault || uploading.current) return;
    uploading.current = true;
    setBusy(true);
    setError("");
    try {
      const path = `${userId}/${id}.jpg`;
      if (!imagePath) {
        await vault.uploadPhoto(path, blob);
        setImagePath(path);
      }
      try {
        const result = scanSchema.parse(await vault.scan(id, path));
        setScan(result);
        setStatus("scanned");
        setValue("merchant", result.merchant);
        setValue("purchase_date", result.purchaseDate ?? today());
        if (result.total !== null) setValue("total_amount", result.total);
        else
          setError(
            "We filled in the readable details, but could not read the total. Enter the amount from your receipt before saving.",
          );
        setValue("currency", result.currency);
        setValue(
          "category_id",
          cats.find((c) => c.name.toLowerCase() === result.category)?.id ??
            null,
        );
      } catch (e) {
        setStatus("failed");
        setError(
          e instanceof Error
            ? e.message
            : "Could not scan. Enter details manually.",
        );
      }
    } catch (error) {
      setError(
        `${error instanceof Error ? error.message : "Could not upload the photo."} Your photo is still here; retry the upload after resolving the issue.`,
      );
    } finally {
      uploading.current = false;
      setBusy(false);
    }
  }
  async function pick(file?: File) {
    if (!file || busy || imagePath || isSubmitting || picking.current) return;
    picking.current = true;
    setBusy(true);
    setError("");
    try {
      const blob = await compressPhoto(file);
      setPending(blob);
      setPreview(URL.createObjectURL(blob));
      if (vault) await upload(blob);
      else
        setError(
          "Photo scanning needs a connected account. You can enter and save the details locally; photos are not stored in local mode.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this image.");
    } finally {
      picking.current = false;
      setBusy(false);
    }
  }
  const save = handleSubmit(async (values) => {
    setError("");
    const r: Receipt = {
      ...values,
      id,
      user_id: userId,
      image_path: imagePath,
      scan_raw: scan,
      scan_status: status,
      created_at: receipt?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      if (vault) {
        await vault.saveReceipt(r, !!receipt);
      }
      await onSaved(r);
    } catch {
      setError(
        "Could not save this receipt. Check your connection and try again.",
      );
    }
  });
  return (
    <form
      onSubmit={save}
      noValidate
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "none";
      }}
      onDrop={(event) => event.preventDefault()}
    >
      <input
        hidden
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {!receipt && (
        <p className="scan-privacy">
          Scanning sends this photo to Google Gemini.{" "}
          <a href="/privacy" target="_blank" rel="noreferrer">
            Privacy details
          </a>
          . Review the extracted fields before saving.
        </p>
      )}
      {!receipt && (
        <div className="mobile-camera-action">
          <Button
            type="button"
            disabled={busy || !!imagePath}
            onClick={() => camera.current?.click()}
          >
            <Camera size={20} /> Take a photo
          </Button>
          <span>Or choose a photo below</span>
        </div>
      )}
      <input
        hidden
        ref={input}
        type="file"
        accept="image/*"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {!receipt && (
        <div
          className={
            dragging ? "upload-dropzone is-dragging" : "upload-dropzone"
          }
          onDragEnter={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (
              !event.dataTransfer.types.includes("Files") ||
              busy ||
              imagePath ||
              isSubmitting
            )
              return;
            dragDepth.current += 1;
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect =
              busy || imagePath || isSubmitting ? "none" : "copy";
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            event.stopPropagation();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (!dragDepth.current) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            dragDepth.current = 0;
            setDragging(false);
            if (busy || imagePath || isSubmitting || picking.current) return;
            const files = event.dataTransfer.files;
            if (files.length !== 1) {
              setError("Drop one receipt photo at a time.");
              return;
            }
            void pick(files[0]);
          }}
        >
          <button
            type="button"
            className="upload-area"
            onClick={() => input.current?.click()}
            disabled={busy || !!imagePath || isSubmitting}
          >
            {preview ? (
              <img src={preview} alt="Selected receipt" />
            ) : (
              <Upload size={26} />
            )}
            <strong>
              {busy
                ? "Reading your receipt…"
                : imagePath
                  ? "Photo uploaded"
                  : dragging
                    ? "Drop your receipt here"
                    : "Click to upload or drag a receipt here"}
            </strong>
            <span>
              {imagePath
                ? "Review the extracted details below"
                : "One photo · JPG, PNG, or WebP · up to 20 MB"}
            </span>
          </button>
        </div>
      )}
      {error && (
        <Alert className="form-error">
          <AlertDescription>
            {error}
            {pending && vault && !busy && (
              <button
                type="button"
                className="text-link"
                onClick={() => upload(pending)}
              >
                Retry {imagePath ? "scan" : "upload"}
              </button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {scan && (
        <div className="scan-status">
          <Badge variant="secondary">
            <Check size={13} /> AI extracted
          </Badge>
          <span>Review the details before saving.</span>
        </div>
      )}
      {scan && scan.confidence < 0.8 && (
        <p className="uncertain">
          Some details may be uncertain. Please double-check the highlighted
          fields.
        </p>
      )}
      <div
        className={`form-grid ${scan && scan.confidence < 0.8 ? "low-confidence" : ""}`}
      >
        {[
          { name: "merchant", label: "Store name", type: "text" },
          { name: "purchase_date", label: "Purchase date", type: "date" },
          { name: "total_amount", label: "Total", type: "number" },
          { name: "currency", label: "Currency", type: "text" },
        ].map(({ name, label, type }) => (
          <label key={name}>
            {label}
            <Input
              type={type}
              step={type === "number" ? "0.01" : undefined}
              {...register(name as keyof ReceiptInput, {
                setValueAs:
                  type === "number"
                    ? (v) => (v === "" ? NaN : Number(v))
                    : undefined,
              })}
            />
            {errors[name as keyof ReceiptInput] && (
              <small className="field-error">
                {errors[name as keyof ReceiptInput]?.message}
              </small>
            )}
          </label>
        ))}
        <label>
          Category
          <Controller
            control={control}
            name="category_id"
            render={({ field }) => (
              <VaultSelect
                label="Receipt category"
                value={field.value ?? ""}
                onValueChange={(value) => field.onChange(value || null)}
                onBlur={field.onBlur}
                triggerRef={field.ref}
                options={[
                  { value: "", label: "Other / uncategorized" },
                  ...cats.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            )}
          />
        </label>
        <label>
          Payment method
          <Controller
            control={control}
            name="payment_method"
            render={({ field }) => (
              <VaultSelect
                label="Payment method"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                triggerRef={field.ref}
                options={[
                  { value: "", label: "Not specified" },
                  ...["Cash", "Card", "GCash", "Bank transfer"].map(
                    (value) => ({ value, label: value }),
                  ),
                ]}
              />
            )}
          />
        </label>
        <label className="full-width">
          Notes
          <Textarea rows={2} {...register("notes")} />
          {errors.notes && (
            <small className="field-error">{errors.notes.message}</small>
          )}
        </label>
      </div>
      <div className="form-actions">
        <span className="muted">A little more organized.</span>
        <Button type="submit" disabled={isSubmitting || busy}>
          {isSubmitting ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Check size={16} />
          )}{" "}
          Save receipt
        </Button>
      </div>
    </form>
  );
}
function Auth() {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="auth-page">
      <Card>
        <Brand />
        <h1>{signup ? "A fresh start." : "Welcome back."}</h1>
        <p>Your receipts, all together.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              const { error } = signup
                ? await vault!.auth.signUp({ email, password })
                : await vault!.auth.signInWithPassword({ email, password });
              if (error) setMessage(error.message);
              else if (signup)
                setMessage("Your account is ready. Welcome to Resibo’ko.");
            } catch {
              setMessage("Could not connect. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Email
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <Input
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {message && <p role="status">{message}</p>}
          <Button disabled={busy}>
            {busy ? "One moment…" : signup ? "Create account" : "Log in"}
          </Button>
        </form>
        <button
          className="text-link"
          onClick={() => {
            setSignup(!signup);
            setMessage("");
          }}
        >
          {signup
            ? "Already have an account? Log in"
            : "New here? Create an account"}
        </button>
      </Card>
    </div>
  );
}
