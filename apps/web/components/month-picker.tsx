"use client";
import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { today } from "@receipt-vault/shared";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
const months = [
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

export function MonthPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(2026);
  function select(month: string) {
    onChange(month);
    setOpen(false);
  }
  const label = value
    ? `${months[Number(value.slice(5)) - 1]} ${value.slice(0, 4)}`
    : "All months";
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setYear(Number((value || today()).slice(0, 4)));
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="month-input month-picker-trigger"
          aria-label={`Filter by month: ${label}`}
        >
          <CalendarDays size={16} aria-hidden="true" />
          <span>{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="month-picker"
        aria-label="Choose a month"
      >
        <div className="month-picker-heading">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Previous year"
            disabled={year <= 1900}
            onClick={() => setYear(year - 1)}
          >
            <ChevronLeft size={17} />
          </Button>
          <strong aria-live="polite">{year}</strong>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Next year"
            disabled={year >= 2100}
            onClick={() => setYear(year + 1)}
          >
            <ChevronRight size={17} />
          </Button>
        </div>
        <div
          className="month-picker-grid"
          role="group"
          aria-label={`Months of ${year}`}
        >
          {months.map((month, index) => {
            const key = `${year}-${String(index + 1).padStart(2, "0")}`;
            return (
              <Button
                key={month}
                type="button"
                variant={value === key ? "default" : "ghost"}
                aria-label={`${month} ${year}`}
                aria-pressed={value === key}
                onClick={() => select(key)}
              >
                {month}
              </Button>
            );
          })}
        </div>
        <div className="month-picker-footer">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => select("")}
          >
            Clear
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => select(today().slice(0, 7))}
          >
            This month
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
