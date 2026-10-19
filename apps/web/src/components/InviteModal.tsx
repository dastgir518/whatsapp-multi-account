"use client";

import { FormEvent, useState } from "react";
import type { WaAccount } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (account: WaAccount, inviteUrl: string) => void;
};

export function InviteModal({ open, onClose, onCreated }: Props) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  function resetAndClose() {
    setPhone("");
    setError("");
    setLoading(false);
    setInviteUrl(null);
    setCopied(false);
    onClose();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create invite");
        return;
      }
      setInviteUrl(data.inviteUrl);
      onCreated(data.account, data.inviteUrl);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="modal-backdrop" onClick={resetAndClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Create public invite</h3>
        <p className="muted">
          Enter a WhatsApp number. You get a public link with QR code, pairing
          code, and step-by-step instructions — no login required to open it.
        </p>

        {error ? <div className="error">{error}</div> : null}

        {!inviteUrl ? (
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="invite-phone">Phone number</label>
              <input
                id="invite-phone"
                placeholder="15551234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={resetAndClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: "auto" }}
                disabled={loading}
              >
                {loading ? "Creating…" : "Create invite"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="field">
              <label>Public invite link</label>
              <input readOnly value={inviteUrl} onFocus={(e) => e.target.select()} />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={resetAndClose}
              >
                Done
              </button>
              <a
                className="btn btn-ghost"
                href={inviteUrl}
                target="_blank"
                rel="noreferrer"
                style={{ width: "auto", textDecoration: "none" }}
              >
                Open page
              </a>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: "auto" }}
                onClick={() => void copyLink()}
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
