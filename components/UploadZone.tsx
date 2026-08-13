"use client";

import { useEffect, useState } from "react";
import { UploadCloud } from "lucide-react";
import { Spinner } from "./ui";

/** Full-window drop target that only appears while a file is being dragged in. */
export default function UploadZone({ onDrop, busy }: { onDrop: (f: FileList) => void; busy: boolean }) {
  const [over, setOver] = useState(false);

  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      depth++;
      setOver(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const over_ = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setOver(false);
      if (e.dataTransfer?.files?.length) onDrop(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over_);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over_);
      window.removeEventListener("drop", drop);
    };
  }, [onDrop]);

  if (!over && !busy) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-8"
      style={{ background: "color-mix(in srgb, var(--bg) 82%, transparent)" }}>
      <div className="rounded-2xl border-2 border-dashed w-full max-w-lg py-14 text-center surface"
        style={{ borderColor: "var(--accent)" }}>
        {busy ? (
          <>
            <div className="flex justify-center accent mb-3"><Spinner size={26} /></div>
            <p className="text-[14px] font-medium">Encrypting and analysing…</p>
            <p className="text-[12.5px] dim mt-1">Classifier · entities · summariser · indexer · compliance</p>
          </>
        ) : (
          <>
            <UploadCloud size={30} className="mx-auto accent mb-3" />
            <p className="text-[14px] font-medium">Drop to add to your vault</p>
            <p className="text-[12.5px] dim mt-1">PDF, DOCX, TXT, CSV, HTML, images · encrypted the moment it lands</p>
          </>
        )}
      </div>
    </div>
  );
}
