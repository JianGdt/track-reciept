"use client";
import { useEffect, useState } from "react";
import { Check, ReceiptText } from "lucide-react";
import type { ScanProgress as Progress } from "@/lib/scan-recovery";

export function ScanProgress({
  progress,
  preview,
}: {
  progress: Progress;
  preview: string;
}) {
  const [started] = useState(Date.now);
  const [now, setNow] = useState(started);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const uploading = ["preparing", "uploading"].includes(progress.stage);
  const seconds = Math.max(
    0,
    Math.ceil(((progress.retryAt ?? now) - now) / 1000),
  );
  const title = {
    preparing: "Preparing your photo",
    uploading: "Uploading your receipt",
    scanning: "Reading your receipt",
    waiting: progress.retryAt
      ? "Giving the scanner a moment"
      : "Checking your scan",
    retrying: "Trying your scan once more",
  }[progress.stage];
  const detail =
    progress.stage === "waiting"
      ? progress.retryAt
        ? `Retrying automatically in ${seconds}s. Your photo is already uploaded.`
        : "Checking for a completed result before trying again."
      : uploading
        ? "Getting your photo ready for your vault."
        : "Looking for the store, date, and total. No need to upload again.";
  return (
    <div className="receipt-scan-progress" aria-busy="true">
      <div className="receipt-scan-visual" aria-hidden="true">
        <div className="receipt-scan-orbit" />
        <div className="receipt-scan-paper">
          {preview ? (
            <img src={preview} alt="" />
          ) : (
            <ReceiptText size={60} strokeWidth={1} />
          )}
          <div className="receipt-scan-beam" />
        </div>
        <span className="receipt-scan-spark spark-one" />
        <span className="receipt-scan-spark spark-two" />
      </div>
      <div role="status" aria-live="polite" aria-atomic="true">
        <h3>
          {title}
          <span className="receipt-scan-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </h3>
      </div>
      <p>{detail}</p>
      <ol className="receipt-scan-steps" aria-label="Receipt progress">
        <li
          className={uploading ? "is-current" : "is-complete"}
          aria-current={uploading ? "step" : undefined}
        >
          <span>{uploading ? "1" : <Check size={12} />}</span> Upload
        </li>
        <li
          className={!uploading ? "is-current" : ""}
          aria-current={!uploading ? "step" : undefined}
        >
          <span>2</span> Read
        </li>
        <li>
          <span>3</span> Review
        </li>
      </ol>
      <small>
        {Math.floor((now - started) / 1000)}s elapsed · Keep this window open
      </small>
    </div>
  );
}
