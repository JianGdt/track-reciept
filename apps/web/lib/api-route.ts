import { randomUUID, createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { IdSchema } from "@receipt-vault/shared";
import { requireUser, readBytes, ApiError } from "./api";
import { ServiceError } from "./service-error";
import { rateLimit } from "./receipt-repository";

export type RouteContext = { params: Promise<Record<string, string>> };
type Context = { uid: string; requestId: string; id: string };
const codes: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "VALIDATION_FAILED",
  429: "RATE_LIMITED",
  500: "INTERNAL_ERROR",
  502: "UPSTREAM_ERROR",
  503: "SERVICE_UNAVAILABLE",
  504: "UPSTREAM_TIMEOUT",
};
export function withAuth(
  handler: (request: NextRequest, context: Context) => Promise<Response>,
) {
  return async (request: NextRequest, context?: RouteContext) => {
    const requestId = randomUUID();
    const start = Date.now();
    let uid: string | undefined;
    let response: Response;
    let code: string | undefined;
    try {
      uid = await requireUser(request);
      await rateLimit(
        uid,
        request.method === "GET" ? "reads" : "writes",
        request.method === "GET" ? 300 : 60,
        60_000,
      );
      const params = (await context?.params) ?? {};
      const id = params.id === undefined ? "" : IdSchema.parse(params.id);
      response = await handler(request, { uid, requestId, id });
    } catch (error) {
      const validation = error instanceof z.ZodError;
      const expected =
        error instanceof ServiceError || error instanceof ApiError;
      const status = validation ? 422 : expected ? error.status : 500;
      code =
        error instanceof ServiceError && error.code
          ? error.code
          : (codes[status] ?? "REQUEST_FAILED");
      response = NextResponse.json(
        {
          error: {
            code,
            message: validation
              ? "Check the request fields and try again."
              : expected
                ? error.message
                : "Could not complete the request. Please try again.",
            ...(validation
              ? {
                  details: error.issues.map((issue) => ({
                    field: issue.path.join("."),
                    issue: issue.code,
                  })),
                }
              : {}),
            requestId,
          },
        },
        { status },
      );
      if (error instanceof ServiceError && error.retryAfter)
        response.headers.set("Retry-After", String(error.retryAfter));
      if (status === 429 && !response.headers.has("Retry-After"))
        response.headers.set("Retry-After", "60");
    }
    response.headers.set("X-Request-Id", requestId);
    response.headers.set("Vary", "Cookie, Origin");
    if (!response.headers.has("Cache-Control"))
      response.headers.set("Cache-Control", "no-store");
    // Do not log exception messages/stacks: SDK errors can contain keys or URLs.
    console.info(
      JSON.stringify({
        level: response.status >= 500 ? "error" : "info",
        requestId,
        uid: uid
          ? createHash("sha256").update(uid).digest("hex").slice(0, 16)
          : undefined,
        route: request.nextUrl.pathname.replace(
          /[0-9a-f]{8}-[0-9a-f-]{27}/gi,
          ":id",
        ),
        method: request.method,
        status: response.status,
        durationMs: Date.now() - start,
        code,
      }),
    );
    return response;
  };
}
export async function withValidation<T extends z.ZodType>(
  request: NextRequest,
  schema: T,
): Promise<z.output<T>> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new ServiceError(415, "Use application/json.");
  let input: unknown;
  try {
    input = JSON.parse((await readBytes(request, 100 * 1024)).toString("utf8"));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ServiceError(400, "Invalid JSON.");
  }
  return schema.parse(input);
}
export function query<T extends z.ZodType>(
  request: NextRequest,
  schema: T,
): z.output<T> {
  const params = request.nextUrl.searchParams;
  if ([...params.keys()].some((key) => params.getAll(key).length !== 1))
    throw new ServiceError(400, "Duplicate query parameters are not allowed.");
  return schema.parse(Object.fromEntries(params));
}
export function idempotencyKey(request: NextRequest, expected: string) {
  const key = IdSchema.parse(request.headers.get("Idempotency-Key"));
  if (key !== expected)
    throw new ServiceError(409, "Use the resource ID as the Idempotency-Key.");
}
export function cachedJson(
  request: NextRequest,
  value: unknown,
  policy = "private, no-cache",
) {
  const body = JSON.stringify(value);
  const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
  const headers = { "Cache-Control": policy, ETag: etag };
  return request.headers.get("if-none-match") === etag
    ? new Response(null, { status: 304, headers })
    : NextResponse.json(value, { headers });
}
