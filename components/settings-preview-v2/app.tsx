"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft, CircleAlert, Cloud, Eye, FileAudio, FileImage, FileVideo, Fingerprint, Image as ImageIcon, Info, KeyRound, Link2, LockKeyhole, Palette, Play, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Sparkles, StopCircle, TestTube2, Trash2, Upload, User, Volume2, WandSparkles, Wifi, X } from "lucide-react";
import { PageShell } from "./shell";
import { Button, IosCell, IosGroup, IosInput, IosSelect, IosSwitch, IosTextarea, PreviewModal, SearchBox } from "./controls";
import { hydrateKvDb, isKvHydrated } from "@/lib/kv-db";
import { loadApiConfigs, loadBindingConfig, loadImageGenerationSettings, loadPresets, loadRegexes, loadUserIdentities, loadVoiceConfigs, loadWorldBooks } from "@/lib/settings-storage";
import type { UserIdentity } from "@/components/settings/user-identity";
import { loadCharacters } from "@/lib/character-storage";
import type { Character } from "@/lib/character-types";
import { DEFAULT_THEME_PROFILE, type ThemeProfile } from "@/lib/theme-types";
import { readThemeProfile } from "@/lib/theme-storage";

const MENU = [
  { id: "api", group: "AI 与生成", label: "API 设置", icon: KeyRound },
  { id: "voice", group: "AI 与生成", label: "语音 API", icon: Volume2 },
  { id: "imageGeneration", group: "AI 与生成", label: "图像生成 API", icon: ImageIcon },
  { id: "presets", group: "AI 与生成", label: "预设", icon: SlidersHorizontal },
  { id: "identity", group: "角色与世界", label: "用户身份", icon: User },
  { id: "worldbook", group: "角色与世界", label: "世界书", icon: Sparkles },
  { id: "regex", group: "角色与世界", label: "正则规则", icon: WandSparkles },
  { id: "binding", group: "连接与工具", label: "配置绑定", icon: Link2 },
  { id: "cloud", group: "连接与工具", label: "云服务部署", icon: Cloud },
  { id: "weixin", group: "连接与工具", label: "微信接入", icon: Wifi },
  { id: "toolbox", group: "连接与工具", label: "聊天工具箱", icon: TestTube2 },
  { id: "agentComputer", group: "连接与工具", label: "角色电脑", icon: ShieldCheck },
  { id: "data", group: "数据与管理", label: "数据管理", icon: FileImage },
  { id: "moderation", group: "数据与管理", label: "管理中心", icon: LockKeyhole },
  { id: "about", group: "底部", label: "关于与声明", icon: Info },
] as const;

const PREVIEW_EXTRA_MENU = [
  { id: "theme", group: "AI 与生成", label: "外观与主题", icon: Palette },
  { id: "resources", group: "数据与管理", label: "资源库", icon: Sparkles },
  { id: "audio", group: "连接与工具", label: "声音与显示", icon: Volume2 },
] as const;

type Page = "main" | "account" | "theme" | "resources" | "memory" | "vn_assets" | "audio" | "display" | "api" | "voice" | "imageGeneration" | "presets" | "identity" | "worldbook" | "regex" | "binding" | "cloud" | "weixin" | "toolbox" | "agentComputer" | "data" | "moderation" | "about";

function iconFor(id: string, size = 18): ReactNode {
  const item = [...MENU, ...PREVIEW_EXTRA_MENU].find(e => e.id === id);
  if (!item) return <SlidersHorizontal size={size} />;
  const Icon = item.icon;
  return <Icon size={size} strokeWidth={1.8} />;
}

export function SettingsPreviewApp() {
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState<Page>("main");
  const [search, setSearch] = useState("");
  const [identities, setIdentities] = useState<UserIdentity[]>([]);

  useEffect(() => {
    setIdentities(loadUserIdentities());
  }, []);
    void hydrateKvDb().then(() => setReady(true));
  }, []);

  if (!ready) return <div className="sv2-loading">加载中...</div>;

  const visibleMenu = [...MENU, ...PREVIEW_EXTRA_MENU].filter(i => `${i.label} ${i.group}`.includes(search));

  const [history, setHistory] = useState<Page[]>([]);
  const go = (next: Page) => { setHistory(prev => [...prev, page]); setPage(next); };
  const back = () => { if (history.length) { setPage(history[history.length - 1]); setHistory(prev => prev.slice(0, -1)); } };

  return (
    <PageShell title={page === "main" ? "设置" : "预览"} onBack={page !== "main" ? back : undefined}>
      {page === "main" ? (
        <>
          <SearchBox value={search} onChange={e => setSearch(e.target.value)} onClear={() => setSearch("")} />
          <IosGroup><IosCell label="主人设" onClick={() => go("identity")} /></IosGroup>
          {Array.from(new Set(visibleMenu.map(i => i.group))).map(group => (
            <IosGroup key={group} title={group}>
              {visibleMenu.filter(i => i.group === group).map(item => <IosCell key={item.id} label={item.label} icon={iconFor(item.id)} onClick={() => go(item.id as Page)} />)}
            </IosGroup>
          ))}
        </>
      ) : (
        <div className="sv2-empty"><strong>{page}</strong><span>页面接入中</span></div>
      )}
    </PageShell>
  );
}
