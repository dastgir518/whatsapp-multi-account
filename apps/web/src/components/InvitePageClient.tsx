"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { publicGatewayUrl } from "@/lib/config";

type Props = {
  token: string;
  phone: string;
  initialStatus: string;
};

export function InvitePageClient({ token, phone, initialStatus }: Props) {
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState("");
  const [socketOk, setSocketOk] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const startedRef = useRef(false);

  const applyInvitePayload = useCallback(
    (data: {
      qr?: string | null;
      pairingCode?: string | null;
      status?: string;
    }) => {
      if (data.qr) setQr(data.qr);
      if (data.pairingCode) setPairingCode(data.pairingCode);
      if (data.status) setStatus(data.status);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (startedRef.current) return;
      startedRef.current = true;
      try {
        const startRes = await fetch(
          `${publicGatewayUrl()}/invites/${token}/start`,
          { method: "POST" }
        );
        const startData = await startRes.json().catch(() => ({}));
        if (cancelled) return;
        applyInvitePayload(startData);

        const res = await fetch(`/api/invites/${token}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        applyInvitePayload(data);
      } catch {
        startedRef.current = false;
      }
    }

    void bootstrap();

    const socket = io(publicGatewayUrl(), {
      auth: { inviteToken: token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketOk(true);
      // Only ask gateway to start if we still have no code/QR
      if (!qr && !pairingCode) {
        socket.emit("invite:start");
      }
    });
    socket.on("disconnect", () => setSocketOk(false));

    socket.on("account:qr", (payload: { qr: string }) => {
      setQr(payload.qr);
      setError("");
    });
    socket.on("account:pairing-code", (payload: { code: string }) => {
      setPairingCode(payload.code);
      setError("");
    });
    socket.on("account:connected", () => {
      setStatus("connected");
      setError("");
    });
    socket.on("account:error", (payload: { message: string }) => {
      setError(
        payload.message ||
          "Linking failed. Tap Refresh code and try again on your phone."
      );
    });

    const poll = setInterval(() => {
      if (cancelled || status === "connected") return;
      void fetch(`/api/invites/${token}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          applyInvitePayload(data);
        })
        .catch(() => undefined);
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, applyInvitePayload]);

  async function refreshCode() {
    setRefreshing(true);
    setError("");
    setQr(null);
    setPairingCode(null);
    setStatus("pending");
    try {
      const res = await fetch(
        `${publicGatewayUrl()}/invites/${token}/refresh`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not refresh. Try again in a moment.");
        return;
      }
      applyInvitePayload(data);
      socketRef.current?.emit("invite:refresh");
    } catch {
      setError("Network error while refreshing. Check that the gateway is running.");
    } finally {
      setRefreshing(false);
    }
  }

  const formattedCode = pairingCode
    ? pairingCode.replace(/(\d{4})(\d{4})/, "$1 $2")
    : null;

  const connected = status === "connected";

  return (
    <div className="invite-page">
      <header className="invite-hero">
        <div className="invite-brand">WhatsApp Hub</div>
        <h1>Link your WhatsApp</h1>
        <p>
          Follow the steps below on the phone that uses{" "}
          <strong>+{phone}</strong>. You do not need to sign in to this website.
        </p>
        <span
          className={`status-pill ${
            connected ? "online" : status === "pending" ? "pending" : ""
          }`}
        >
          {connected
            ? "Linked successfully"
            : socketOk
              ? "Waiting for you to link…"
              : "Connecting…"}
        </span>
        {!connected ? (
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: "auto" }}
              onClick={() => void refreshCode()}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing…" : "Refresh code"}
            </button>
          </div>
        ) : null}
      </header>

      {error ? <div className="error invite-error">{error}</div> : null}

      {connected ? (
        <section className="invite-success">
          <h2>You&apos;re all set</h2>
          <p>
            <strong>+{phone}</strong> is linked. You can close this page. The
            account owner can now manage chats in WhatsApp Hub.
          </p>
        </section>
      ) : (
        <>
          <section className="invite-methods">
            <article className="invite-card">
              <h2>Option A — Scan QR code</h2>
              <ol className="invite-steps">
                <li>
                  Open <strong>WhatsApp</strong> on your phone.
                </li>
                <li>
                  Tap the <strong>three dots ⋮</strong> (Android) or go to{" "}
                  <strong>Settings</strong> (iPhone).
                </li>
                <li>
                  Tap <strong>Linked devices</strong>.
                </li>
                <li>
                  Tap <strong>Link a device</strong>.
                </li>
                <li>Point your camera at the QR code on this page.</li>
              </ol>
              <div className="qr-wrap invite-qr">
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt="WhatsApp link QR code" />
                ) : (
                  <span className="muted">
                    {refreshing ? "Generating new QR…" : "Generating QR code…"}
                  </span>
                )}
              </div>
              <p className="muted tip">
                Tip: if WhatsApp says it couldn&apos;t link, tap{" "}
                <strong>Refresh code</strong> above and scan the new QR.
              </p>
            </article>

            <article className="invite-card">
              <h2>Option B — Enter pairing code</h2>
              <ol className="invite-steps">
                <li>
                  Open <strong>WhatsApp</strong> on your phone.
                </li>
                <li>
                  Tap <strong>Linked devices</strong> →{" "}
                  <strong>Link a device</strong>.
                </li>
                <li>
                  Tap <strong>Link with phone number instead</strong> (under the
                  camera).
                </li>
                <li>
                  Enter this 8-digit code for <strong>+{phone}</strong>:
                </li>
              </ol>
              <div className="pairing-code invite-code">
                {formattedCode || "•••• ••••"}
              </div>
              <p className="muted tip">
                Use the exact number <strong>+{phone}</strong>. If linking
                hangs or fails, refresh the code and try once more.
              </p>
            </article>
          </section>

          <section className="invite-card invite-help">
            <h2>Full instructions</h2>
            <div className="help-grid">
              <div>
                <h3>Android</h3>
                <ol className="invite-steps">
                  <li>Open WhatsApp.</li>
                  <li>
                    Tap ⋮ (top right) → <strong>Linked devices</strong>.
                  </li>
                  <li>
                    Tap <strong>Link a device</strong>.
                  </li>
                  <li>
                    Scan the QR here, or choose{" "}
                    <strong>Link with phone number instead</strong> and type the
                    code.
                  </li>
                </ol>
              </div>
              <div>
                <h3>iPhone</h3>
                <ol className="invite-steps">
                  <li>Open WhatsApp.</li>
                  <li>
                    Go to <strong>Settings</strong> →{" "}
                    <strong>Linked devices</strong>.
                  </li>
                  <li>
                    Tap <strong>Link a Device</strong>.
                  </li>
                  <li>
                    Scan the QR, or tap{" "}
                    <strong>Link with Phone Number Instead</strong> and enter
                    the code.
                  </li>
                </ol>
              </div>
            </div>
            <ul className="invite-notes">
              <li>Your phone must stay online while linking.</li>
              <li>
                Keep this page open until WhatsApp confirms the device is
                linked.
              </li>
              <li>
                If you see &quot;Couldn&apos;t link&quot; / it spins forever:
                close the link screen on your phone, tap{" "}
                <strong>Refresh code</strong> here, then try again.
              </li>
              <li>
                You can unlink anytime on your phone: Linked devices → this
                device → Log out.
              </li>
            </ul>
          </section>
        </>
      )}

      <footer className="invite-footer">
        Public invite for +{phone} · No login required
      </footer>
    </div>
  );
}
