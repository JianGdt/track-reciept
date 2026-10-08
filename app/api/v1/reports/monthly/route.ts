import { NextResponse } from "next/server";
import { ReceiptFiltersSchema, ReportSchema } from "@/lib/shared";
import { withAuth, query } from "@/lib/api-route";
import { report } from "@/lib/receipt-service";
export const runtime = "nodejs";
export const GET = withAuth(async (request, { uid }) => {
  const filters = query(request, ReceiptFiltersSchema);
  return NextResponse.json(
    ReportSchema.parse(
      await report(uid, { ...filters, currency: filters.currency ?? "PHP" }),
    ),
  );
});
