import { z } from "zod";
import { ReceiptFiltersSchema } from "@/lib/shared";
import { withAuth, query } from "@/lib/api-route";
import { exportReceipts } from "@/lib/receipt-service";
export const runtime = "nodejs";
export const GET = withAuth(async (request, { uid }) => {
  const { format, ...filters } = query(
    request,
    ReceiptFiltersSchema.extend({
      format: z.literal("csv").default("csv"),
    }).strict(),
  );
  return new Response(await exportReceipts(uid, filters), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="receipts.csv"',
    },
  });
});
