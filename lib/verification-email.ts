import "server-only";
import { APIError } from "better-auth/api";
import { rateLimit } from "./receipt-repository";
import { ServiceError } from "./service-error";
import { deliverVerificationEmail } from "./verification-mailer";

export async function sendVerificationEmail({
  user,
  url,
}: {
  user: { id: string; email: string };
  url: string;
}) {
  try {
    // Shared database limits apply across IPs, instances, and sending endpoints.
    await rateLimit(user.id, "verification-minute", 1, 60_000);
    await rateLimit(user.id, "verification-day", 10, 86_400_000);
    await deliverVerificationEmail(user.email, url);
  } catch (error) {
    // Keep resend responses generic, including when this address is throttled.
    if (error instanceof ServiceError && error.status === 429) return;
    throw new APIError("SERVICE_UNAVAILABLE", {
      message:
        "Could not send the verification email. Please try resending it later.",
    });
  }
}
