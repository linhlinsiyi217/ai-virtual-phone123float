"use client";

import { useEffect, useState } from "react";
import { PageShell } from "./shell";
import { IosGroup, IosCell, SearchBox } from "./controls";
import { hydrateKvDb } from "@/lib/kv-db";

export function SettingsPreviewApp() {
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState("main");
  const [search, setSearch] = useState("");
  
  useEffect(() => {
    void hydrateKvDb().then(() => setReady(true));
  }, []);

  if (!ready) return <div className="sv2-loading">加载中...</div>;

  return (
    <PageShell title={page === "main" ? "设置" : "预览"}>
      <SearchBox value={search} onChange={e => setSearch(e.target.value)} onClear={() => setSearch("")} />
      <IosGroup>
        <IosCell label="主人设" onClick={() => setPage("identity")} />
      </IosGroup>
      <div className="sv2-empty"><strong>{page}</strong><span>页面接入中</span></div>
    </PageShell>
  );
}
