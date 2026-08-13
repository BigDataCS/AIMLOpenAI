"use client";

import { useCallback, useEffect, useState } from "react";
import LockScreen from "@/components/LockScreen";
import Shell from "@/components/Shell";
import { Spinner } from "@/components/ui";

export default function Page() {
  const [session, setSession] = useState<any>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/session").then((x) => x.json());
    setSession(r);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 dim text-[13px]">
        <Spinner /> Starting VaultMind…
      </div>
    );
  }

  if (!session.unlocked) {
    return <LockScreen exists={session.exists} onUnlocked={load} />;
  }

  return <Shell engine={session.engine} onLock={load} />;
}
