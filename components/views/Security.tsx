"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck, HardDriveDownload, KeyRound, ScrollText, CheckCircle2, AlertTriangle, Link2, RefreshCw,
} from "lucide-react";
import { Card, Badge, Empty, Button, Spinner, relTime, fmtBytes } from "../ui";

export default function Security({ data, refresh, notify, onLock }: any) {
  const ov = data?.overview;
  const [audit, setAudit] = useState<any>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<any>(null);
  const [rot, setRot] = useState({ current: "", next: "" });

  const load = () => {
    fetch("/api/audit").then((x) => x.json()).then((r) => r.ok && setAudit(r));
    fetch("/api/security").then((x) => x.json()).then((r) => r.ok && setBackups(r.backups));
  };
  useEffect(load, [data]);

  const act = async (action: string) => {
    setBusy(action);
    const r = await fetch("/api/security", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    }).then((x) => x.json());
    setBusy(null);
    if (!r.ok) return notify(r.error, "err");
    if (action === "backup") { notify(`Backup complete — ${r.backup.docCount} documents`); refresh(); }
    if (action === "verify") {
      setIntegrity(r.integrity);
      notify(r.integrity.failed === 0
        ? `All ${r.integrity.checked} documents verified intact`
        : `${r.integrity.failed} document(s) failed verification`, r.integrity.failed ? "err" : "ok");
    }
    load();
  };

  const rotate = async () => {
    if (rot.next.length < 8) return notify("New passphrase must be at least 8 characters", "err");
    setBusy("rotate");
    const r = await fetch("/api/session", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rotate", passphrase: rot.current, newPassphrase: rot.next }),
    }).then((x) => x.json());
    setBusy(null);
    if (!r.ok) return notify(r.error, "err");
    notify(`Passphrase rotated — ${r.rewrapped} document keys re-wrapped`);
    setRot({ current: "", next: "" });
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="grid sm:grid-cols-3 gap-3.5">
        <Card>
          <div className="p-4">
            <div className="flex items-center gap-2 text-[12px] font-medium">
              <ShieldCheck size={15} style={{ color: "#059669" }} /> Encryption
            </div>
            <p className="text-[11.5px] dim mt-1.5 leading-relaxed">
              Each document is sealed with its own AES-256-GCM key. That key is wrapped with a KEK derived
              from your passphrase via scrypt, so rotating your passphrase never re-encrypts the files.
            </p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="flex items-center gap-2 text-[12px] font-medium">
              {ov?.auditChain?.ok
                ? <CheckCircle2 size={15} style={{ color: "#059669" }} />
                : <AlertTriangle size={15} style={{ color: "#be123c" }} />}
              Audit chain
            </div>
            <p className="text-[11.5px] dim mt-1.5 leading-relaxed">
              {ov?.auditChain?.ok
                ? `${ov.auditChain.entries} entries, each committing to the hash of the one before it. No gaps or edits detected.`
                : `Chain broken at entry ${ov?.auditChain?.brokenAt}. The log has been altered.`}
            </p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="flex items-center gap-2 text-[12px] font-medium">
              <HardDriveDownload size={15} className="dim" /> Backup
            </div>
            <p className="text-[11.5px] dim mt-1.5 leading-relaxed">
              {ov?.lastBackup
                ? `Last snapshot ${relTime(ov.lastBackup.created_at)} covering ${ov.lastBackup.doc_count} documents (${fmtBytes(ov.lastBackup.bytes)}).`
                : "No snapshot taken yet."}
            </p>
          </div>
        </Card>
      </div>

      <Card title="Operations">
        <div className="p-4 flex flex-wrap gap-2">
          <Button onClick={() => act("backup")} disabled={!!busy}>
            {busy === "backup" ? <Spinner /> : <HardDriveDownload size={14} />} Run encrypted backup
          </Button>
          <Button onClick={() => act("verify")} disabled={!!busy}>
            {busy === "verify" ? <Spinner /> : <RefreshCw size={14} />} Verify every document
          </Button>
          <Button variant="ghost" onClick={onLock}>Lock vault now</Button>
        </div>
        {integrity && (
          <div className="px-4 pb-4">
            <div className="rounded-lg p-3 text-[12.5px]"
              style={{ background: integrity.failed ? "rgba(190,18,60,.1)" : "rgba(4,120,87,.1)", color: integrity.failed ? "#be123c" : "#047857" }}>
              Decrypted and hash-checked {integrity.checked} documents · {integrity.failed} failure{integrity.failed !== 1 && "s"}.
              {integrity.failed === 0 && " Every ciphertext matches its recorded plaintext digest."}
            </div>
          </div>
        )}
      </Card>

      <Card title="Rotate master passphrase"
        subtitle="Re-wraps every document key. Blobs are never re-encrypted, so this is fast even for large vaults.">
        <div className="p-4 grid sm:grid-cols-[1fr_1fr_auto] gap-2.5 items-end">
          <label className="block">
            <span className="text-[11.5px] dim font-medium">Current passphrase</span>
            <input type="password" value={rot.current} onChange={(e) => setRot({ ...rot, current: e.target.value })}
              className="mt-1 w-full rounded-lg px-3 py-2 text-[13px]" />
          </label>
          <label className="block">
            <span className="text-[11.5px] dim font-medium">New passphrase</span>
            <input type="password" value={rot.next} onChange={(e) => setRot({ ...rot, next: e.target.value })}
              placeholder="At least 8 characters" className="mt-1 w-full rounded-lg px-3 py-2 text-[13px]" />
          </label>
          <Button variant="primary" onClick={rotate} disabled={!!busy || !rot.current || !rot.next}>
            {busy === "rotate" ? <Spinner /> : <KeyRound size={14} />} Rotate
          </Button>
        </div>
      </Card>

      <Card title="Snapshots">
        {backups.length === 0 ? (
          <Empty icon={<HardDriveDownload size={22} />} title="No snapshots yet" />
        ) : (
          <ul className="divide-y">
            {backups.map((b) => (
              <li key={b.id} className="px-4 py-2.5 flex items-center gap-3 text-[12.5px]">
                <HardDriveDownload size={14} className="dim shrink-0" />
                <span className="flex-1">{b.doc_count} documents · {fmtBytes(b.bytes)}</span>
                <Badge>{b.destination}</Badge>
                <span className="mono text-[11px] dim truncate w-24" title={b.manifest_hash}>{b.manifest_hash.slice(0, 12)}…</span>
                <span className="dim w-16 text-right">{relTime(b.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Audit trail"
        subtitle={audit?.chain?.ok ? `Hash chain verified across ${audit.chain.entries} entries` : "Chain verification failed"}>
        {!audit ? (
          <div className="p-4 flex items-center gap-2 dim text-[13px]"><Spinner /> Loading…</div>
        ) : (
          <ul className="divide-y max-h-[420px] overflow-y-auto">
            {audit.entries.map((e: any) => (
              <li key={e.id} className="px-4 py-2 flex items-center gap-2.5 text-[12px]">
                <Link2 size={11} className="dim shrink-0" />
                <span className="mono font-medium w-[150px] shrink-0 truncate">{e.action}</span>
                <span className="dim flex-1 truncate">{e.title ?? e.detail ?? "—"}</span>
                <span className="dim shrink-0">{e.actor}</span>
                <span className="mono text-[10.5px] dim w-20 truncate shrink-0" title={e.hash}>{e.hash.slice(0, 10)}…</span>
                <span className="dim w-14 text-right shrink-0">{relTime(e.ts)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
