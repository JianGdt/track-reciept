"use client";

import { useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, ChartNoAxesCombined } from "lucide-react";
import { formatMoney, fromMinor } from "@/lib/shared";
import { spendingYear, type MonthlySpending } from "@/lib/spending-summary";
import { Button } from "./ui/button";
import { MonthPicker } from "./month-picker";

const labels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function SpendingChart({
  months,
  selectedMonth,
  onSelectMonth,
  currency,
  loading,
  updating,
  error,
  onRetry,
}: {
  months: MonthlySpending[];
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
  currency: string;
  loading: boolean;
  updating: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const year = Number(selectedMonth.slice(0, 4));
  const rows = spendingYear(months, year);
  const [hovered, setHovered] = useState<string | null>(null);
  const active =
    rows.find((row) => row.month === hovered) ??
    rows.find((row) => row.month === selectedMonth)!;
  const maximum = Math.max(...rows.map((row) => row.totalMinor), 1);
  const yearTotal = rows.reduce((sum, row) => sum + row.totalMinor, 0);
  const amount = (minor: number) =>
    formatMoney(fromMinor(minor, currency), currency);
  const changeYear = (offset: number) =>
    onSelectMonth(`${year + offset}${selectedMonth.slice(4)}`);

  return (
    <section
      className="spending-chart"
      aria-labelledby="spending-chart-title"
      aria-busy={loading || updating}
    >
      <div className="spending-chart-heading">
        <div>
          <div className="spending-chart-kicker">
            <ChartNoAxesCombined size={15} /> YOUR SPENDING AT A GLANCE
          </div>
          <h2 id="spending-chart-title">Month by month</h2>
          <p>Choose a month to explore its receipts.</p>
        </div>
        <MonthPicker
          value={selectedMonth}
          onChange={onSelectMonth}
          allowAll={false}
        />
      </div>
      <div className="spending-chart-summary">
        <div aria-live="polite" aria-atomic="true">
          <span>
            {labels[Number(active.month.slice(5)) - 1]} {year}
          </span>
          <strong
            key={`${active.month}-${active.totalMinor}-${currency}`}
            className="spending-value"
          >
            {error ? "—" : loading ? "…" : amount(active.totalMinor)}
          </strong>
          <small>
            {loading
              ? "Loading spending…"
              : error
                ? "Spending unavailable"
                : `${active.count} ${active.count === 1 ? "receipt" : "receipts"} · ${currency} only`}
          </small>
        </div>
        <div className="spending-year-control">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous spending year"
            disabled={year <= 1900}
            onClick={() => changeYear(-1)}
          >
            <ChevronLeft size={17} />
          </Button>
          <strong>{year}</strong>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next spending year"
            disabled={year >= 2100}
            onClick={() => changeYear(1)}
          >
            <ChevronRight size={17} />
          </Button>
        </div>
      </div>
      {error ? (
        <div className="spending-chart-message" role="alert">
          Could not load monthly spending.{" "}
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : loading ? (
        <div className="spending-chart-loading" role="status">
          Loading your monthly spending…
        </div>
      ) : (
        <div
          className="spending-chart-scroll"
          tabIndex={0}
          aria-label="Monthly spending chart; scroll horizontally on smaller screens"
        >
          <div className="spending-chart-axis" aria-hidden="true">
            <span>{amount(maximum === 1 && !yearTotal ? 0 : maximum)}</span>
            <span>0</span>
          </div>
          <div
            className="spending-bars"
            role="group"
            aria-label={`Monthly spending in ${year}, ${currency}`}
            onMouseLeave={() => setHovered(null)}
          >
            {rows.map((row, index) => (
              <button
                key={index}
                type="button"
                className="spending-month"
                aria-pressed={row.month === selectedMonth}
                aria-label={`${labels[index]} ${year}: ${amount(row.totalMinor)}, ${row.count} receipts. Show this month.`}
                title={`${labels[index]} ${year}: ${amount(row.totalMinor)}`}
                onClick={() => onSelectMonth(row.month)}
                onMouseEnter={() => setHovered(row.month)}
                onFocus={() => setHovered(row.month)}
                onBlur={() => setHovered(null)}
              >
                <span className="spending-bar-track" aria-hidden="true">
                  <span
                    className="spending-bar"
                    data-empty={row.totalMinor === 0}
                    style={
                      {
                        height: `${row.totalMinor ? Math.max(2, (row.totalMinor / maximum) * 100) : 1}%`,
                        "--bar-delay": `${index * 25}ms`,
                      } as CSSProperties
                    }
                  />
                </span>
                <span className="spending-month-label">{labels[index]}</span>
                <span className="spending-month-value">
                  {new Intl.NumberFormat("en", {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(fromMinor(row.totalMinor, currency))}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="spending-chart-footer">
        <span>
          <i /> Selected month{" "}
          <span className="spending-updating" role="status">
            {updating ? " · Updating…" : ""}
          </span>
        </span>
        <span>
          {error
            ? ""
            : loading
              ? ""
              : !yearTotal
                ? `No ${currency} spending recorded in ${year}.`
                : `${year} total · ${amount(yearTotal)}`}
        </span>
      </div>
      <p className="spending-chart-note">
        Based on purchase dates and your store and category filters. Manual and
        scanned receipts included.
      </p>
    </section>
  );
}
