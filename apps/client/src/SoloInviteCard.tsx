import { useEffect, useState } from "react";
import { Check, Copy, QrCode, X } from "lucide-react";
import { Button, IconButton } from "./ui/index.js";

export function SoloInviteCard({ roomCode, visible }: { roomCode: string; visible: boolean }) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrSvg, setQrSvg] = useState("");
  const inviteUrl = `${location.origin}/room/${roomCode}`;

  useEffect(() => {
    if (!visible) setQrOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!qrOpen || qrSvg) return;
    let cancelled = false;
    void import("uqr").then(({ renderSVG }) => {
      if (!cancelled) setQrSvg(renderSVG(inviteUrl, { border: 2 }));
    }).catch(() => {
      if (!cancelled) setQrSvg("");
    });
    return () => { cancelled = true; };
  }, [inviteUrl, qrOpen, qrSvg]);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <aside className={`solo-invite-card ${visible ? "" : "is-hidden"}`} aria-hidden={!visible}>
      <div className="solo-invite-copy">
        <strong>You’re the only one here</strong>
        <span>Invite someone from another device.</span>
      </div>
      <code>{roomCode}</code>
      <div className="solo-invite-actions">
        <Button variant="secondary" onClick={() => void copyInvite()} disabled={!visible}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button variant="ghost" onClick={() => setQrOpen(true)} disabled={!visible}>
          <QrCode aria-hidden="true" />
          Show QR
        </Button>
      </div>
      {qrOpen && visible && (
        <div className="solo-qr-popover" role="dialog" aria-label="Room invite QR code">
          <IconButton aria-label="Close QR code" onClick={() => setQrOpen(false)}><X aria-hidden="true" /></IconButton>
          <div className="solo-qr-code" aria-label={`QR code for room ${roomCode}`} dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <span>Scan to join {roomCode}</span>
        </div>
      )}
    </aside>
  );
}
