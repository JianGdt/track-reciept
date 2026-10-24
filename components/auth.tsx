"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "./ui/card";
import { Brand } from "./brand";
import { Input } from "./ui/input";
import { PasswordInput } from "./ui/password-input";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

export function Auth({
  initialMessage = "",
  initialSignup = false,
}: {
  initialMessage?: string;
  initialSignup?: boolean;
}) {
  const router = useRouter();
  const signup = initialSignup;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const shownMessage = useRef("");
  useEffect(() => {
    if (initialMessage && shownMessage.current !== initialMessage) {
      toast.info(initialMessage, { id: "email-verification", duration: 10000 });
      shownMessage.current = initialMessage;
    }
  }, [initialMessage]);
  const [busy, setBusy] = useState(false);
  return (
    <main className="auth-page">
      <Card>
        <Brand />
        <h1>{signup ? "A fresh start." : "Welcome back."}</h1>
        <p>Your receipts, all together.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const { error } = signup
                ? await authClient.signUp.email({
                    email,
                    password,
                    name: email.split("@")[0] || "Receipt owner",
                    callbackURL: "/verify-email",
                  })
                : await authClient.signIn.email({ email, password });
              if (error) {
                toast.error(
                  error.code === "EMAIL_NOT_VERIFIED"
                    ? "Verify your email before logging in. Check your inbox or resend the verification email below."
                    : (error.message ?? "Could not sign in. Please try again."),
                );
              } else if (signup) {
                setPassword("");
                toast.success(
                  "Check your inbox and spam folder for a verification link. If you already have an account, log in or resend verification below.",
                );
                router.replace("/sign-in");
              } else {
                router.replace("/");
                router.refresh();
              }
            } catch {
              toast.error("Could not connect. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Email
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <PasswordInput
              key={signup ? "signup" : "login"}
              autoComplete={signup ? "new-password" : "current-password"}
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <Button disabled={busy}>
            {busy ? "One moment…" : signup ? "Create account" : "Log in"}
          </Button>
        </form>
        <button
          type="button"
          className="text-link"
          disabled={busy || !email.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              const { error } = await authClient.sendVerificationEmail({
                email: email.trim(),
                callbackURL: "/verify-email",
              });
              if (error) {
                toast.error(
                  error.message ??
                    "Could not send verification. Please try again later.",
                );
              } else {
                toast.success("Verification email requested", {
                  description:
                    "If this email belongs to an unverified account, check your inbox and spam folder. Wait at least a minute before requesting another.",
                  duration: 10000,
                });
              }
            } catch {
              toast.error("Could not connect. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Resend verification email
        </button>
        <Link
          className="text-link"
          href={signup ? "/sign-in" : "/register"}
          aria-disabled={busy}
          onClick={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          {signup
            ? "Already have an account? Log in"
            : "New here? Create an account"}
        </Link>
      </Card>
    </main>
  );
}
