"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "./ui/card";
import { Brand } from "./brand";
import { Input } from "./ui/input";
import { PasswordInput } from "./ui/password-input";
import { Button } from "./ui/button";

export function Auth() {
  const router = useRouter();
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
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
            setMessage("");
            try {
              const { vault } = await import("@/lib/client");
              const { error } = signup
                ? await vault!.auth.signUp({ email, password })
                : await vault!.auth.signInWithPassword({ email, password });
              if (error) setMessage(error.message);
              else {
                if (signup)
                  setMessage("Your account is ready. Welcome to Resibo’ko.");
                router.refresh();
              }
            } catch {
              setMessage("Could not connect. Please try again.");
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
          {message && <p role="status">{message}</p>}
          <Button disabled={busy}>
            {busy ? "One moment…" : signup ? "Create account" : "Log in"}
          </Button>
        </form>
        <button
          className="text-link"
          onClick={() => {
            setSignup(!signup);
            setMessage("");
          }}
        >
          {signup
            ? "Already have an account? Log in"
            : "New here? Create an account"}
        </button>
      </Card>
    </main>
  );
}
