import test from "node:test";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import assert from "node:assert/strict";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import {
  emailAndPasswordPolicy,
  emailVerificationPolicy,
} from "../lib/email-verification-policy";
import { deliverVerificationEmail } from "../lib/verification-mailer";

test("sign-up requires verification, invalid links fail, and verified users can log in", async () => {
  const messages: string[] = [];
  const auth = betterAuth({
    baseURL: "http://localhost:3100",
    secret: "test-only-secret-at-least-32-characters-long",
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
    }),
    emailAndPassword: emailAndPasswordPolicy,
    emailVerification: {
      ...emailVerificationPolicy,
      sendVerificationEmail: async ({ url }) => {
        messages.push(url);
      },
    },
    rateLimit: { enabled: false },
  });
  const post = (path: string, body: unknown) =>
    auth.handler(
      new Request(`http://localhost:3100/api/auth/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3100",
        },
        body: JSON.stringify(body),
      }),
    );
  const credentials = {
    email: "test@example.com",
    password: "test-password-123",
  };
  const signup = await post("sign-up/email", {
    ...credentials,
    name: "Test",
    callbackURL: "/verify-email",
  });
  assert.equal(signup.status, 200);
  assert.equal((await signup.json()).token, null);
  assert.equal(signup.headers.get("set-cookie"), null);
  assert.equal(messages.length, 1);
  const denied = await post("sign-in/email", credentials);
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, "EMAIL_NOT_VERIFIED");
  assert.equal(messages.length, 1, "login must not send more emails");
  const invalid = new URL(messages[0]!);
  invalid.searchParams.set("token", "invalid");
  const rejected = await auth.handler(new Request(invalid));
  assert.match(rejected.headers.get("location") ?? "", /error=/);
  assert.equal((await post("sign-in/email", credentials)).status, 403);
  const verified = await auth.handler(new Request(messages[0]!));
  assert.equal(verified.status, 302);
  assert.equal(verified.headers.get("set-cookie"), null);
  assert.equal((await post("sign-in/email", credentials)).status, 200);
});

test("Gmail delivery uses authenticated sender and hides SMTP errors", async (t) => {
  const keys = ["GMAIL_USER", "GMAIL_APP_PASSWORD"] as const;
  const previous = keys.map((key) => process.env[key]);
  t.after(() => {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  });
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  await assert.rejects(
    deliverVerificationEmail("test@example.com", "https://app.example/verify"),
    /not configured/,
  );
  process.env.GMAIL_USER = "sender@gmail.com";
  await assert.rejects(
    deliverVerificationEmail("test@example.com", "https://app.example/verify"),
    /not configured/,
  );
  process.env.GMAIL_APP_PASSWORD = "abcd efgh ijkl mnop";
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const close = t.mock.method(transport, "close", () => {});
  t.mock.method(
    nodemailer,
    "createTransport",
    (options: SMTPTransport.Options) => {
      assert.equal(options.host, "smtp.gmail.com");
      assert.equal(options.port, 465);
      assert.equal(options.secure, true);
      assert.deepEqual(options.auth, {
        user: "sender@gmail.com",
        pass: "abcdefghijklmnop",
      });
      return transport;
    },
  );
  const send = t.mock.method(transport, "sendMail");
  await deliverVerificationEmail(
    "test@example.com",
    "https://app.example/verify",
  );
  const result = await send.mock.calls[0]!.result;
  const message = JSON.parse(result.message);
  assert.deepEqual(message.from, {
    name: "Resivault",
    address: "sender@gmail.com",
  });
  assert.equal(message.to[0].address, "test@example.com");
  assert.match(message.text, /https:\/\/app.example\/verify/);
  assert.equal(close.mock.callCount(), 1);
  send.mock.mockImplementation(async () => {
    throw new Error("sensitive SMTP credentials and verification URL");
  });
  await assert.rejects(
    deliverVerificationEmail("test@example.com", "https://app.example/verify"),
    { message: "Verification email delivery failed." },
  );
  assert.equal(close.mock.callCount(), 2);
});
