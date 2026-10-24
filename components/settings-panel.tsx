"use client";
import { toast } from "sonner";
import { useState } from "react";
import { Download, LogOut } from "lucide-react";
import type { Category } from "@/lib/shared";
import type { Session } from "@/lib/vault-client";
import { vault } from "@/lib/client";
import { InstallApp } from "./pwa";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { Switch } from "./ui/switch";
import { VaultSelect } from "./vault-select";
import { Badge } from "./ui/badge";
import { PasswordInput } from "./ui/password-input";

export default function SettingsPanel({
  dark,
  toggleTheme,
  currency,
  setCurrency,
  download,
  cats,
  session,
}: {
  dark: boolean;
  toggleTheme: (origin?: HTMLElement | null) => void;
  currency: string;
  setCurrency: (currency: string) => void;
  download: () => Promise<void>;
  cats: Category[];
  session: Session | null;
}) {
  const [deletePassword, setDeletePassword] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  return (
    <Card className="settings-card">
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>A workspace that feels like yours.</CardDescription>
      </CardHeader>
      <CardContent>
        <InstallApp />
        <Separator />
        <div className="settings-row">
          <div>
            <label htmlFor="dark-mode">Dark appearance</label>
            <p>Switch between light and dark.</p>
          </div>
          <Switch
            id="dark-mode"
            checked={dark}
            onCheckedChange={() =>
              toggleTheme(document.getElementById("dark-mode"))
            }
          />
        </div>
        <Separator />
        <div className="settings-row">
          <div>
            <strong>Summary currency</strong>
            <p>Each currency is totaled separately.</p>
          </div>
          <VaultSelect
            label="Summary currency"
            value={currency}
            onValueChange={(next) => {
              setCurrency(next);
              localStorage.setItem("receipt-vault-currency", next);
            }}
            options={["PHP", "USD", "EUR", "GBP", "JPY", "SGD"].map(
              (value) => ({ value, label: value }),
            )}
          />
        </div>
        <Separator />
        <div className="settings-row">
          <div>
            <strong>Your archive</strong>
            <p>Download receipts in your current selection.</p>
          </div>
          <Button variant="outline" onClick={download}>
            <Download size={16} /> Export CSV
          </Button>
        </div>
        <Separator />
        <div className="settings-categories">
          <strong>Categories</strong>
          <div className="category-chips">
            {cats.map((c) => (
              <Badge
                variant="secondary"
                className={c.name.toLowerCase()}
                key={c.id}
              >
                {c.name}
              </Badge>
            ))}
          </div>
        </div>
        {vault && (
          <>
            <Separator />
            <div className="settings-row">
              <div>
                <strong>Account</strong>
                <p>{session?.user.email}</p>
              </div>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const { error } = await vault!.auth.signOut();
                    if (error) toast.error("Could not sign out. Try again.");
                    else toast.success("Signed out.");
                  } catch {
                    toast.error("Could not sign out. Try again.");
                  }
                }}
              >
                <LogOut size={16} /> Sign out
              </Button>
            </div>
          </>
        )}
        <Separator />
        <div className="settings-row">
          <div>
            <strong>Privacy</strong>
            <p>
              Your receipt photos are sent to Google Gemini when you scan.{" "}
              <a href="/privacy">Read our privacy notice</a>.
            </p>
          </div>
        </div>
        <Separator />
        <div className="settings-row">
          <div>
            <strong>Delete account</strong>
            <p>Permanently remove your account, receipts, and photos.</p>
            <label>
              Confirm your password
              <PasswordInput
                autoComplete="current-password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
            </label>
          </div>
          <Button
            variant="destructive"
            disabled={!deletePassword || deletingAccount}
            onClick={async () => {
              if (
                !window.confirm(
                  "Permanently delete your account, all receipts, and all photos? This cannot be undone.",
                )
              )
                return;
              setDeletingAccount(true);
              try {
                const { error } =
                  await vault!.auth.deleteAccount(deletePassword);
                if (error) toast.error(error.message);
                else toast.success("Account deleted.");
              } catch {
                toast.error("Could not delete your account. Please try again.");
              } finally {
                setDeletePassword("");
                setDeletingAccount(false);
              }
            }}
          >
            {deletingAccount ? "Deleting…" : "Delete account"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
