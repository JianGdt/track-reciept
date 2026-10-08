import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Skeleton } from "./ui/skeleton";

export function SummaryCard({
  label,
  value,
  description,
  icon,
  featured = false,
  loading = false,
}: {
  label: string;
  value: ReactNode;
  description: ReactNode;
  icon: ReactNode;
  featured?: boolean;
  loading?: boolean;
}) {
  return (
    <Card
      className={`stat summary-card${featured ? " summary-featured" : ""}`}
      aria-busy={loading}
    >
      <CardHeader>
        <CardDescription className="stat-label">{label}</CardDescription>
        <span className="stat-icon" aria-hidden="true">
          {icon}
        </span>
      </CardHeader>
      <CardContent>
        <CardTitle className="stat-value">
          {loading ? <Skeleton className="stat-skeleton" /> : value}
        </CardTitle>
        <p className="stat-foot">{description}</p>
      </CardContent>
    </Card>
  );
}
