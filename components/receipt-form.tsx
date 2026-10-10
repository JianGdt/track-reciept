"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Upload, Check, LoaderCircle } from "lucide-react";
import {
  CurrencySchema,
  fromMinor,
  receiptSchema,
  scanSchema,
  today,
  type Receipt,
  type ReceiptInput,
  type Category,
  type ScanResult,
} from "@/lib/shared";
import { VaultError } from "@/lib/vault-client";
import { vault, compressPhoto } from "@/lib/client";
import { LIMITS } from "@/lib/limits";
import {
  recoverScan,
  type ScanProgress as ScanProgressState,
} from "@/lib/scan-recovery";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { Alert, AlertDescription } from "./ui/alert";
import { VaultSelect } from "./vault-select";
import { ScanProgress } from "./scan-progress";

export default function ReceiptForm({
  receipt,
  cats,
  currency,
  userId,
  onSaved,
}: {
  receipt: Receipt | null;
  cats: Category[];
  currency: string;
  userId: string;
  onSaved: (r: Receipt) => Promise<void>;
}) {
  const [id] = useState(() => receipt?.id ?? crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [autoScan, setAutoScan] = useState(true);
  const [progress, setProgress] = useState<ScanProgressState>({
    stage: "preparing",
  });
  const scanController = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      scanController.current?.abort();
    };
  }, []);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const [imagePath, setImagePath] = useState(receipt?.image_path ?? null);
  const [scan, setScan] = useState<ScanResult | null>(
    receipt?.scan_raw ?? null,
  );
  const [status, setStatus] = useState<Receipt["scan_status"]>(
    receipt?.scan_status ?? "manual",
  );
  const [pending, setPending] = useState<Blob | null>(null);
  const [retryUntil, setRetryUntil] = useState(0);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const usage = useQuery({
    queryKey: [userId, "scan-usage"],
    queryFn: () => vault.scanUsage(),
    staleTime: 30_000,
    retry: false,
  });
  useEffect(() => {
    const tick = () =>
      setRetrySeconds(Math.max(0, Math.ceil((retryUntil - Date.now()) / 1000)));
    tick();
    if (!retryUntil) return;
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [retryUntil]);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const picking = useRef(false);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<ReceiptInput>({
    resolver: zodResolver(receiptSchema),
    defaultValues: receipt
      ? {
          merchant: receipt.merchant,
          purchase_date: receipt.purchase_date,
          total_amount: receipt.total_amount,
          currency: receipt.currency,
          category_id: receipt.category_id,
          payment_method: receipt.payment_method,
          notes: receipt.notes,
        }
      : {
          merchant: "",
          purchase_date: today(),
          total_amount: undefined,
          currency: CurrencySchema.catch("PHP").parse(currency),
          category_id: null,
          payment_method: "",
          notes: "",
        },
  });
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const uploading = useRef(false);
  async function upload(blob: Blob, shouldScan = autoScan) {
    if (!vault || uploading.current || (shouldScan && Date.now() < retryUntil))
      return;
    uploading.current = true;
    const controller = new AbortController();
    scanController.current = controller;
    setBusy(true);
    setError("");
    try {
      const path = `${userId}/${id}.jpg`;
      if (!imagePath) {
        setProgress({ stage: "uploading" });
        await vault.uploadPhoto(path, blob, controller.signal);
        setImagePath(path);
      }
      if (!shouldScan) {
        setStatus("manual");
        return;
      }
      if (usage.data && usage.data.used >= usage.data.limit) {
        setStatus("manual");
        setError(
          "Your photo is attached. Today's scan allowance is used up, but you can enter the details below and save it.",
        );
        return;
      }
      try {
        const result = scanSchema.parse(
          await recoverScan({
            run: () => vault.scan(id, path, controller.signal),
            readState: () => vault.scanState(id, controller.signal),
            fromResult: ({ totalMinor, ...value }) => ({
              ...value,
              total:
                totalMinor === null
                  ? null
                  : fromMinor(totalMinor, value.currency),
            }),
            signal: controller.signal,
            onProgress: setProgress,
          }),
        );
        setScan(result);
        setStatus("scanned");
        setValue("merchant", result.merchant);
        setValue("purchase_date", result.purchaseDate ?? today());
        if (result.total !== null) setValue("total_amount", result.total);
        else
          setError(
            "We filled in the readable details, but could not read the total. Enter the amount from your receipt before saving.",
          );
        setValue("currency", result.currency);
        setValue(
          "category_id",
          cats.find((c) => c.name.toLowerCase() === result.category)?.id ??
            null,
        );
      } catch (e) {
        if (controller.signal.aborted) return;
        if (e instanceof VaultError && e.retryAfter)
          setRetryUntil(Date.now() + e.retryAfter * 1000);
        setStatus("failed");
        setError(
          e instanceof Error
            ? e.message
            : "Could not scan. Enter details manually.",
        );
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof VaultError && error.retryAfter)
        setRetryUntil(Date.now() + error.retryAfter * 1000);
      setError(
        `${error instanceof Error ? error.message : "Could not upload the photo."} Your photo is still here; retry the upload after resolving the issue.`,
      );
    } finally {
      uploading.current = false;
      if (!controller.signal.aborted) {
        setBusy(false);
        void usage.refetch();
      }
    }
  }
  async function pick(file?: File) {
    if (!file || busy || imagePath || isSubmitting || picking.current) return;
    picking.current = true;
    setBusy(true);
    setProgress({ stage: "preparing" });
    setError("");
    try {
      const blob = await compressPhoto(file);
      if (!mounted.current) return;
      setPending(blob);
      setPreview(URL.createObjectURL(blob));
      if (vault) await upload(blob);
      else
        setError(
          "Photo scanning needs a connected account. You can enter and save the details locally; photos are not stored in local mode.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this image.");
    } finally {
      picking.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const save = handleSubmit(async (values) => {
    setError("");
    const r: Receipt = {
      ...values,
      id,
      user_id: userId,
      image_path: imagePath,
      scan_raw: scan,
      scan_status: status,
      created_at: receipt?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      if (vault) {
        await vault.saveReceipt(r, !!receipt);
      }
      await onSaved(r);
    } catch {
      setError(
        "Could not save this receipt. Check your connection and try again.",
      );
    }
  });
  return (
    <form
      onSubmit={save}
      noValidate
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "none";
      }}
      onDrop={(event) => event.preventDefault()}
    >
      {usage.data && (
        <p className="scan-usage" role="status">
          {usage.data.used} of {usage.data.limit} scans used today · resets at
          midnight UTC
        </p>
      )}
      <input
        hidden
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {!receipt && (
        <div className="receipt-scan-option">
          <div>
            <label htmlFor="auto-scan-receipt">
              Read details automatically
            </label>
            <p>Turn off to attach a photo and enter details yourself.</p>
          </div>
          <Switch
            id="auto-scan-receipt"
            checked={autoScan}
            onCheckedChange={setAutoScan}
            disabled={busy || !!imagePath}
          />
        </div>
      )}
      {!receipt && (
        <p className="scan-privacy">
          {autoScan
            ? "Scanning sends this photo to Google Gemini."
            : "Photo-only uploads are stored without sending them to Gemini."}{" "}
          <a href="/privacy" target="_blank" rel="noreferrer">
            Privacy details
          </a>
          . Up to {LIMITS.uploadsPerDay} photo upload attempts per 24 hours.
        </p>
      )}
      {!receipt && (
        <div className="mobile-camera-action">
          <Button
            type="button"
            disabled={busy || !!imagePath}
            onClick={() => camera.current?.click()}
          >
            <Camera size={20} /> Take a photo
          </Button>
          <span>Or choose a photo below</span>
        </div>
      )}
      <input
        hidden
        ref={input}
        type="file"
        accept="image/*"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {!receipt && (
        <div
          className={
            dragging ? "upload-dropzone is-dragging" : "upload-dropzone"
          }
          onDragEnter={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (
              !event.dataTransfer.types.includes("Files") ||
              busy ||
              imagePath ||
              isSubmitting
            )
              return;
            dragDepth.current += 1;
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect =
              busy || imagePath || isSubmitting ? "none" : "copy";
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            event.stopPropagation();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (!dragDepth.current) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            dragDepth.current = 0;
            setDragging(false);
            if (busy || imagePath || isSubmitting || picking.current) return;
            const files = event.dataTransfer.files;
            if (files.length !== 1) {
              setError("Drop one receipt photo at a time.");
              return;
            }
            void pick(files[0]);
          }}
        >
          {busy ? (
            <ScanProgress progress={progress} preview={preview} />
          ) : (
            <button
              type="button"
              className="upload-area"
              onClick={() => input.current?.click()}
              disabled={busy || !!imagePath || isSubmitting}
            >
              {preview ? (
                <img src={preview} alt="Selected receipt" />
              ) : (
                <Upload size={26} />
              )}
              <strong>
                {busy
                  ? "Reading your receipt…"
                  : imagePath
                    ? "Photo uploaded"
                    : dragging
                      ? "Drop your receipt here"
                      : "Click to upload or drag a receipt here"}
              </strong>
              <span>
                {busy
                  ? "This may take up to a minute. Keep this window open."
                  : imagePath
                    ? scan
                      ? "Review the extracted details below"
                      : "Photo attached · Enter the receipt details below"
                    : "One photo · JPG, PNG, or WebP · up to 20 MB"}
              </span>
            </button>
          )}
        </div>
      )}
      {imagePath && pending && !busy && !scan && !error && (
        <Button
          type="button"
          variant="outline"
          className="receipt-scan-start"
          disabled={
            retrySeconds > 0 ||
            (usage.data ? usage.data.used >= usage.data.limit : false)
          }
          onClick={() => upload(pending, true)}
        >
          {usage.data && usage.data.used >= usage.data.limit
            ? "Scan allowance used · enter details below"
            : retrySeconds > 0
              ? `Scan available in ${retrySeconds}s`
              : "Scan this photo"}
        </Button>
      )}
      {error && (
        <Alert className="form-error">
          <AlertDescription>
            {error}
            {imagePath && status === "failed" && !busy && (
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setError("");
                  setFocus("merchant");
                }}
              >
                Enter details manually
              </button>
            )}
            {pending && vault && !busy && (
              <button
                type="button"
                className="text-link"
                disabled={retrySeconds > 0}
                onClick={() => upload(pending, imagePath ? true : autoScan)}
              >
                {retrySeconds > 0
                  ? `Retry in ${retrySeconds}s`
                  : `Retry ${imagePath ? "scan" : "upload"}`}
              </button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {scan && (
        <div className="scan-status">
          <Badge variant="secondary">
            <Check size={13} /> AI extracted
          </Badge>
          <span>Review the details before saving.</span>
        </div>
      )}
      {scan && scan.confidence < 0.8 && (
        <p className="uncertain">
          Some details may be uncertain. Please double-check the highlighted
          fields.
        </p>
      )}
      <fieldset
        disabled={busy || isSubmitting}
        className={`form-grid ${scan && scan.confidence < 0.8 ? "low-confidence" : ""}`}
      >
        {[
          { name: "merchant", label: "Store name", type: "text" },
          { name: "purchase_date", label: "Purchase date", type: "date" },
          { name: "total_amount", label: "Total", type: "number" },
          { name: "currency", label: "Currency", type: "text" },
        ].map(({ name, label, type }) => (
          <label key={name}>
            {label}
            <Input
              type={type}
              step={type === "number" ? "0.01" : undefined}
              {...register(name as keyof ReceiptInput, {
                setValueAs:
                  type === "number"
                    ? (v) => (v === "" ? NaN : Number(v))
                    : undefined,
              })}
            />
            {errors[name as keyof ReceiptInput] && (
              <small className="field-error">
                {errors[name as keyof ReceiptInput]?.message}
              </small>
            )}
          </label>
        ))}
        <label>
          Category
          <Controller
            control={control}
            name="category_id"
            render={({ field }) => (
              <VaultSelect
                label="Receipt category"
                value={field.value ?? ""}
                onValueChange={(value) => field.onChange(value || null)}
                onBlur={field.onBlur}
                triggerRef={field.ref}
                options={[
                  { value: "", label: "Other / uncategorized" },
                  ...cats.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            )}
          />
        </label>
        <label>
          Payment method
          <Controller
            control={control}
            name="payment_method"
            render={({ field }) => (
              <VaultSelect
                label="Payment method"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                triggerRef={field.ref}
                options={[
                  { value: "", label: "Not specified" },
                  ...["Cash", "Card", "GCash", "Bank transfer"].map(
                    (value) => ({ value, label: value }),
                  ),
                ]}
              />
            )}
          />
        </label>
        <label className="full-width">
          Notes
          <Textarea rows={2} {...register("notes")} />
          {errors.notes && (
            <small className="field-error">{errors.notes.message}</small>
          )}
        </label>
      </fieldset>
      <div className="form-actions">
        <span className="muted">A little more organized.</span>
        <Button type="submit" disabled={isSubmitting || busy}>
          {isSubmitting ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Check size={16} />
          )}{" "}
          Save receipt
        </Button>
      </div>
    </form>
  );
}
