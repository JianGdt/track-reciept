import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, query } from "@/lib/api-route";
import { readBytes } from "@/lib/api";
import { ServiceError } from "@/lib/service-error";
import { photoUrl, uploadPhoto } from "@/lib/receipt-service";
export const runtime = "nodejs";
export const GET = withAuth(async (request, { uid, id }) => {
  const { format, variant } = query(
    request,
    z
      .object({
        format: z.literal("json").optional(),
        variant: z.enum(["full", "thumbnail"]).default("full"),
      })
      .strict(),
  );
  const url = await photoUrl(uid, id, variant === "thumbnail");
  // JSON supports native image components; direct navigation redirects.
  return format === "json"
    ? NextResponse.json(
        { url, expiresIn: 300 },
        { headers: { "Cache-Control": "private, max-age=240" } },
      )
    : new Response(null, {
        status: 302,
        headers: { Location: url, "Cache-Control": "private, max-age=240" },
      });
});
export const PUT = withAuth(async (request, { uid, id }) => {
  if (request.headers.get("content-type") !== "image/jpeg")
    throw new ServiceError(415, "Please upload a JPEG photo.");
  await uploadPhoto(uid, id, await readBytes(request, 5 * 1024 * 1024));
  return new Response(null, { status: 204 });
});
