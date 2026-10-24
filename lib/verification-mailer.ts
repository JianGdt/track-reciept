import nodemailer from "nodemailer";

// Imported only by the server-only verification email callback.
export async function deliverVerificationEmail(email: string, url: string) {
  const user = process.env.GMAIL_USER?.trim();
  // Google displays App Passwords in groups separated by spaces.
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !pass) throw new Error("Verification email is not configured.");

  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    await transport.sendMail({
      from: { name: "Resivault", address: user },
      to: [{ address: email, name: "" }],
      subject: "Verify your email for Resivault",
      text: `Welcome to Resivault!\n\nVerify your email to start saving receipts:\n${url}\n\nThis link expires in 1 hour. If you did not request this, you can ignore this email.`,
    });
  } catch {
    // Never expose SMTP responses, credentials, or verification URLs in errors.
    throw new Error("Verification email delivery failed.");
  } finally {
    transport.close();
  }
}
