"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
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
import {
  formatReceiptDate,
  receiptDateOptions,
  resolveReceiptDate,
} from "@/lib/receipt-date";

function ScanField({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.label
      initial={false}
      animate={{ y: active && !reduceMotion ? -2 : 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
      className={
        active
          ? "[&_input]:border-primary [&_input]:ring-2 [&_input]:ring-primary/20 [&_[data-slot=select-trigger]]:border-primary [&_[data-slot=select-trigger]]:ring-2 [&_[data-slot=select-trigger]]:ring-primary/20"
          : undefined
      }
    >
      {children}
    </motion.label>
  );
}

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
  const [duplicate, setDuplicate] = useState(false);
  const [fillingField, setFillingField] = useState<keyof ReceiptInput | null>(
    null,
  );
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
    watch,
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
  const purchaseDate = watch("purchase_date");
  const printedDate = scan?.printedDate ?? receipt?.printed_date;
  const dateOptions = receiptDateOptions(printedDate);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const uploading = useRef(false);
  async function fillScan(result: ScanResult, signal: AbortSignal) {
    const animate = !window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches;
    const pause = (ms: number) =>
      new Promise<void>((resolve) => {
        const finish = () => {
          window.clearTimeout(timer);
          signal.removeEventListener("abort", finish);
          resolve();
        };
        const timer = window.setTimeout(finish, ms);
        signal.addEventListener("abort", finish, { once: true });
        if (signal.aborted) finish();
      });
    const fields = [
      ["merchant", result.merchant],
      [
        "purchase_date",
        resolveReceiptDate(result.printedDate, result.purchaseDate) ?? "",
      ],
      ...(result.total === null ? [] : [["total_amount", result.total]]),
      ["currency", result.currency],
      [
        "category_id",
        cats.find((c) => c.name.toLowerCase() === result.category)?.id ?? null,
      ],
    ] as [keyof ReceiptInput, ReceiptInput[keyof ReceiptInput]][];

    for (const [name, value] of fields) {
      if (signal.aborted) return;
      if (animate) setFillingField(name);
      if (animate && name === "merchant" && typeof value === "string") {
        const characters = Array.from(value);
        setValue(name, "");
        // Keep even long merchant names under a second.
        const step = Math.max(1, Math.ceil(characters.length / 24));
        for (let end = step; end < characters.length; end += step) {
          setValue(name, characters.slice(0, end).join(""));
          await pause(30);
          if (signal.aborted) return;
        }
      }
      setValue(name, value);
      if (animate) await pause(180);
    }
    if (!signal.aborted) setFillingField(null);
  }
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
        await fillScan(result, controller.signal);
        if (controller.signal.aborted) return;
        if (result.total === null)
          setError(
            "We filled in the readable details, but could not read the total. Enter the amount from your receipt before saving.",
          );
      } catch (e) {
        if (controller.signal.aborted) return;
        if (e instanceof VaultError && e.code === "DUPLICATE_RECEIPT")
          setDuplicate(true);
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
      if (error instanceof VaultError && error.code === "DUPLICATE_RECEIPT") {
        setDuplicate(true);
        setError(error.message);
        return;
      }
      if (error instanceof VaultError && error.retryAfter)
        setRetryUntil(Date.now() + error.retryAfter * 1000);
      setError(
        `${error instanceof Error ? error.message : "Could not upload the photo."} Your photo is still here; retry the upload after resolving the issue.`,
      );
    } finally {
      uploading.current = false;
      if (!controller.signal.aborted) {
        setFillingField(null);
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
    if (duplicate || busy) return;
    setError("");
    const r: Receipt = {
      ...values,
      id,
      user_id: userId,
      image_path: imagePath,
      scan_raw: scan,
      printed_date: printedDate ?? null,
      scan_status: status,
      created_at: receipt?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      if (vault) {
        await vault.saveReceipt(r, !!receipt);
      }
      await onSaved(r);
    } catch (error) {
      if (error instanceof VaultError && error.code === "DUPLICATE_RECEIPT") {
        setDuplicate(true);
        setError(error.message);
        return;
      }
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
          {busy && !fillingField ? (
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
                {busy && !fillingField
                  ? "Reading your receipt…"
                  : imagePath
                    ? "Photo uploaded"
                    : dragging
                      ? "Drop your receipt here"
                      : "Click to upload or drag a receipt here"}
              </strong>
              <span>
                {busy && !fillingField
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
            {imagePath && status === "failed" && !busy && !duplicate && (
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
            {pending && vault && !busy && !duplicate && (
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
          <span role="status">
            {fillingField
              ? "Filling in your receipt details…"
              : "Review the details before saving."}
          </span>
        </div>
      )}
      {scan && scan.confidence < 0.8 && (
        <p className="uncertain">
          Some details may be uncertain. Please double-check the highlighted
          fields.
        </p>
      )}
      {printedDate && (
        <p className="mb-3 text-sm text-muted-foreground">
          Date printed on receipt:{" "}
          <strong className="text-foreground">{printedDate}</strong>
        </p>
      )}
      {dateOptions.length > 1 && (
        <fieldset
          disabled={busy || isSubmitting}
          className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3"
        >
          <legend className="px-1 text-sm font-medium">
            Confirm purchase date
          </legend>
          <p className="mb-3 text-sm text-muted-foreground">
            This date can be read two ways. Choose the correct date, or enter it
            below.
          </p>
          <div className="flex flex-wrap gap-2">
            {dateOptions.map((date) => (
              <Button
                key={date}
                type="button"
                variant={purchaseDate === date ? "default" : "outline"}
                aria-pressed={purchaseDate === date}
                onClick={() =>
                  setValue("purchase_date", date, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              >
                {purchaseDate === date && (
                  <Check size={14} aria-hidden="true" />
                )}
                {formatReceiptDate(date)}
              </Button>
            ))}
          </div>
        </fieldset>
      )}
      {scan && !purchaseDate && dateOptions.length < 2 && (
        <p className="mb-3 text-sm text-muted-foreground" role="status">
          We could not determine the purchase date. Enter the date from your
          receipt below.
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
          <ScanField key={name} active={fillingField === name}>
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
            {name === "purchase_date" && purchaseDate && (
              <span className="text-xs text-muted-foreground">
                {formatReceiptDate(purchaseDate)}
              </span>
            )}
            {errors[name as keyof ReceiptInput] && (
              <small className="field-error">
                {name === "purchase_date"
                  ? "Choose or enter a valid purchase date before saving."
                  : errors[name as keyof ReceiptInput]?.message}
              </small>
            )}
          </ScanField>
        ))}
        <ScanField active={fillingField === "category_id"}>
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
        </ScanField>
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
        <Button type="submit" disabled={isSubmitting || busy || duplicate}>
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
