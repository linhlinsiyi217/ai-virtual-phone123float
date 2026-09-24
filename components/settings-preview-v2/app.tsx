"use client";

import { useEffect, useState } from "react";
import { PageShell } from "./shell";
import { IosGroup, IosCell, SearchBox } from "./controls";
import { hydrateKvDb } from "@/lib/kv-db";

export function SettingsPreviewApp() {
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState("main");
  const [search, setSearch] = useState("");
  
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    void hydrateKvDb().then(() => setReady(true));
  }, []);

  if (!ready) return <div className="sv2-loading">加载中...</div>;
  const go = (next: string) => { setHistory(prev => [...prev, page]); setPage(next); };
  const back = () => { if (history.length) { setPage(history[history.length - 1]); setHistory(prev => prev.slice(0, -1)); } };
  
  return (
    <PageShell title={page === "main" ? "设置" : page} onBack={page !== "main" ? back : undefined}>
      {page === "main" ? (
        <>
          <SearchBox value={search} onChange={e => setSearch(e.target.value)} onClear={() => setSearch("")} />
          <IosGroup>
            <IosCell label="主人设" onClick={() => go("identity")} />
            <IosCell label="外观与主题" onClick={() => go("theme")} />
            <IosCell label="资源库" onClick={() => go("resources")} />
            <IosCell label="API 设置" onClick={() => go("api")} />
            <IosCell label="语音 API" onClick={() => go("voice")} />
          </IosGroup>
        </>
      ) : (
        <div className="sv2-empty"><strong>{page}</strong><span>接入中</span></div>
      )}
    </PageShell>
  );
}
