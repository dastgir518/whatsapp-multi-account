"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import type { WaAccount } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onLinked: (account: WaAccount) => void;
  socket: Socket | null;
};

export function LinkAccountModal({ open, onClose, onLinked, socket }: Props) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [account, setAccount] = useState<WaAccount | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !socket || !account) return;

    const onQr = (payload: { accountId: string; qr: string }) => {
      if (payload.accountId !== account.id) return;
      setQr(payload.qr);
    };
    const onCode = (payload: { accountId: string; code: string }) => {
      if (payload.accountId !== account.id) return;
      setPairingCode(payload.code);
    };
    const onConnected = (payload: {
      accountId: string;
      phone: string;
      pushName?: string | null;
    }) => {
      if (payload.accountId !== account.id) return;
      onLinked({
        ...account,
        phone: payload.phone,
        pushName: payload.pushName ?? account.pushName,
        status: "connected",
      });
      resetAndClose();
    };
    const onErr = (payload: { accountId: string; message: string }) => {
      if (payload.accountId !== account.id) return;
      setError(payload.message);
    };

    socket.emit("account:subscribe", account.id);
    socket.emit("account:start", account.id);
    socket.on("account:qr", onQr);
    socket.on("account:pairing-code", onCode);
    socket.on("account:connected", onConnected);
    socket.on("account:error", onErr);

    return () => {
      socket.off("account:qr", onQr);
      socket.off("account:pairing-code", onCode);
      socket.off("account:connected", onConnected);
      socket.off("account:error", onErr);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, socket, account?.id]);

  function resetAndClose() {
    setPhone("");
    setError("");
    setLoading(false);
    setAccount(null);
    setQr(null);
    setPairingCode(null);
    onClose();
  }

  async function startLink(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setQr(null);
    setPairingCode(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start linking");
        return;
      }
      setAccount(data.account);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={resetAndClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Link WhatsApp account</h3>
        <p className="muted">
          Enter your number with country code. Then scan the QR or enter the
          pairing code on your phone: Linked Devices → Link a device.
        </p>

        {error ? <div className="error">{error}</div> : null}

        {!account ? (
          <form onSubmit={startLink}>
            <div className="field">
              <label htmlFor="phone">Phone number</label>
              <input
                id="phone"
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
                {loading ? "Starting…" : "Continue"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="muted">
              Linking <strong>+{account.phone}</strong>
            </p>
            <div className="link-grid">
              <div className="link-box">
                <strong>Scan QR</strong>
                <p className="muted">Phone → ⋮ → Link a device → Scan QR</p>
                <div className="qr-wrap">
                  {qr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qr} alt="WhatsApp QR code" />
                  ) : (
                    <span className="muted">Waiting for QR…</span>
                  )}
                </div>
              </div>
              <div className="link-box">
                <strong>Enter code</strong>
                <p className="muted">
                  Link a device → Link with phone number instead
                </p>
                <div className="pairing-code">
                  {pairingCode
                    ? pairingCode.replace(/(\d{4})(\d{4})/, "$1 $2")
                    : "•••• ••••"}
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={resetAndClose}
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
