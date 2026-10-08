"use client";
import type { Ref } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const emptyValue = "__vault_empty__";
export function VaultSelect({
  value,
  onValueChange,
  options,
  label,
  className,
  onBlur,
  triggerRef,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  label: string;
  className?: string;
  onBlur?: () => void;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <Select
      value={value || emptyValue}
      onValueChange={(next) => onValueChange(next === emptyValue ? "" : next)}
    >
      <SelectTrigger
        aria-label={label}
        className={className}
        onBlur={onBlur}
        ref={triggerRef}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map((option) => (
          <SelectItem
            key={option.value || emptyValue}
            value={option.value || emptyValue}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
