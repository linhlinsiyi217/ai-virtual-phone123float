"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, Link2, Loader2, Search, Upload, User, X } from "lucide-react";

import { hydrateKvDb, isKvHydrated } from "@/lib/kv-db";
import { loadUserIdentities, loadBindingConfig } from "@/lib/settings-storage";
import type { UserIdentity } from "@/components/settings/user-identity";

type PreviewIdentity = UserIdentity & {
  appearanceDesc?: string;
  lockFace?: boolean;
  refImageUrl?: string;
};

type DraftState = {
  identities: PreviewIdentity[];
  defaultIdentityId: string | null;
  saved: boolean;
};

const MENU_GROUPS: { title: string; items: { id: string; label: string; desc: string }[] }[] = [
  {
    title: "API Config",
    items: [
      { id: "api", label: "API 设置", desc: "大模型接口" },
      { id: "voice", label: "语音 API", desc: "语音合成" },
    ],
  },
  {
    title: "Data & Rules",
    items: [
      { id: "presets", label: "预设", desc: "角色预设" },
      { id: "worldbook", label: "世界书", desc: "世界观设定" },
      { id: "regex", label: "正则规则", desc: "文本替换" },
      { id: "data", label: "数据管理", desc: "导入导出" },
      { id: "binding", label: "配置绑定", desc: "全局默认与角色/应用绑定" },
    ],
  },
  {
    title: "Image Generation",
    items: [
      { id: "image_generation", label: "图像生成 API", desc: "模型、参考图与提示词" },
    ],
  },
  {
    title: "Connections",
    items: [
      { id: "cloud", label: "云服务部署", desc: "备份/微信/推送一站配置" },
      { id: "weixin", label: "微信接入", desc: "iLink Bot" },
      { id: "toolbox", label: "聊天工具箱", desc: "外部工具调用" },
    ],
  },
  {
    title: "User",
    items: [
      { id: "identity", label: "用户身份", desc: "主人设与聊天身份" },
      { id: "about", label: "关于与声明", desc: "版本与协议" },
    ],
  },
];

const BIODEMO = "一个普通的上班族，喜欢在周末去咖啡馆看书。";

function demoIdentity(): PreviewIdentity {
  return {
    id: "preview-demo-main",
    name: "李斯特",
    avatarUrl: "",
    bio: BIODEMO,
    gender: "男",
    age: "26",
    occupation: "程序员",
    customSettings: "性格温和，说话带有一点理性逻辑。",
    appearanceDesc: "",
    lockFace: false,
    refImageUrl: "",
  };
}

async function compressAvatarImage(file: File, maxSize = 400, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/webp", quality));
      };
      img.onerror = () => reject(new Error("image load failed"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

function truncateLine(value: string, max = 140): string {
  const text = (value || "").trim();
  if (text.length <= max) return text || "未填写简介";
  return text.slice(0, max) + "…";
}

export function SettingsPreviewApp() {
  const [hydrated, setHydrated] = useState(false);
  const [hydrateError, setHydrateError] = useState(false);
  const [view, setView] = useState<"home" | "edit">("home");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<DraftState>({ identities: [], defaultIdentityId: null, saved: true });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [pendingLeave, setPendingLeave] = useState<null | { type: "back" | "switch"; targetId?: string }>(null);
  const [picker, setPicker] = useState<null | { mode: "avatar" | "ref" }>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [urlInputOpen, setUrlInputOpen] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const noticeTimer = useRef<number | null>(null);
  const committedRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await hydrateKvDb();
        if (cancelled) return;
        if (!isKvHydrated()) {
          setHydrateError(true);
          return;
        }
        const identitiesRaw = loadUserIdentities();
        let identities: PreviewIdentity[];
        let defaultId: string | null = null;
        if (identitiesRaw.length > 0) {
          identities = identitiesRaw.map((i) => ({
            ...i,
            appearanceDesc: "",
            lockFace: false,
            refImageUrl: "",
          }));
          const gid = loadBindingConfig().globalDefaults.userIdentityId ?? null;
          defaultId = gid && identities.some((i) => i.id === gid) ? gid : null;
          setIsDemo(false);
        } else {
          identities = [demoIdentity()];
          defaultId = "preview-demo-main";
          setIsDemo(true);
        }
        setDraft({ identities, defaultIdentityId: defaultId, saved: true });
        committedRef.current = JSON.stringify({ identities, defaultIdentityId: defaultId });
        setEditingId(defaultId ?? identities[0]?.id ?? null);
        setHydrated(true);
      } catch {
        if (!cancelled) setHydrateError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const current = useMemo(() => {
    return draft.identities.find((i) => i.id === editingId) ?? null;
  }, [draft.identities, editingId]);

  const mainIdentity = useMemo(() => {
    return draft.identities.find((i) => i.id === draft.defaultIdentityId) ?? null;
  }, [draft.identities, draft.defaultIdentityId]);

  const filteredMenu = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MENU_GROUPS;
    return MENU_GROUPS
      .map((g) => ({
        title: g.title,
        items: g.items.filter(
          (it) => it.label.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [query]);

  const isDirty = useMemo(() => {
    return committedRef.current !== JSON.stringify({ identities: draft.identities, defaultIdentityId: draft.defaultIdentityId });
  }, [draft]);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 2200);
  }, []);

  const updateCurrent = useCallback(
    (patch: Partial<PreviewIdentity>) => {
      setDraft((prev) => ({
        ...prev,
        saved: false,
        identities: prev.identities.map((i) => (i.id === editingId ? { ...i, ...patch } : i)),
      }));
    },
    [editingId]
  );

  const requestLeave = useCallback(
    (kind: "back" | "switch", targetId?: string) => {
      if (!isDirty) {
        if (kind === "back") setView("home");
        else if (targetId) setEditingId(targetId);
        return;
      }
      setPendingLeave({ type: kind, targetId });
    },
    [isDirty]
  );

  const saveDraft = useCallback(() => {
    if (saving) return;
    const editing = draft.identities.find((i) => i.id === editingId);
    if (editing && !editing.name.trim()) {
      showNotice("名字不能为空");
      return;
    }
    setSaving(true);
    window.setTimeout(() => {
      const snapshot = {
        identities: draft.identities,
        defaultIdentityId: draft.defaultIdentityId,
      };
      committedRef.current = JSON.stringify(snapshot);
      setDraft((prev) => {
        const next = { ...prev, saved: true };
        return next;
      });
      setSaving(false);
      showNotice("预览已保存，未修改正式资料");
      const leave = pendingLeave;
      setPendingLeave(null);
      if (leave) {
        if (leave.type === "back") setView("home");
        else if (leave.targetId) setEditingId(leave.targetId);
      }
    }, 220);
  }, [draft.identities, editingId, pendingLeave, saving, showNotice]);

  const confirmDiscard = useCallback(() => {
    const leave = pendingLeave;
    setDraft((prev) => {
      let identities = prev.identities;
      let defaultIdentityId = prev.defaultIdentityId;
      if (committedRef.current) {
        try {
          const committed = JSON.parse(committedRef.current) as {
            identities: PreviewIdentity[];
            defaultIdentityId: string | null;
          };
          identities = committed.identities;
          defaultIdentityId = committed.defaultIdentityId;
        } catch {
          /* keep current */
        }
      }
      const next = { identities, defaultIdentityId, saved: true };
      committedRef.current = JSON.stringify({ identities: next.identities, defaultIdentityId: next.defaultIdentityId });
      return next;
    });
    setPendingLeave(null);
    if (leave) {
      if (leave.type === "back") setView("home");
      else if (leave.targetId) setEditingId(leave.targetId);
    }
  }, [pendingLeave]);

  const handleFileChoose = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await compressAvatarImage(file);
        if (picker?.mode === "ref") {
          updateCurrent({ refImageUrl: dataUrl });
        } else {
          updateCurrent({ avatarUrl: dataUrl });
        }
        setImgError(false);
        setPicker(null);
      } catch {
        showNotice("图片读取失败，请重试");
      }
    };
    input.click();
  }, [picker, showNotice, updateCurrent]);

  const confirmUrl = useCallback(() => {
    const url = urlDraft.trim();
    if (!url) return;
    setUrlLoading(true);
    setImgError(false);
    const img = new Image();
    img.onload = () => {
      setUrlLoading(false);
      if (picker?.mode === "ref") {
        updateCurrent({ refImageUrl: url });
      } else {
        updateCurrent({ avatarUrl: url });
      }
      setUrlDraft("");
      setPicker(null);
    };
    img.onerror = () => {
      setUrlLoading(false);
      setImgError(true);
    };
    img.src = url;
  }, [picker, updateCurrent, urlDraft]);

  const openPicker = useCallback((mode: "avatar" | "ref") => {
    setUrlDraft("");
    setImgError(false);
    setUrlInputOpen(false);
    setPicker({ mode });
  }, []);

  const openUrlInput = useCallback((mode: "avatar" | "ref") => {
    setUrlDraft("");
    setImgError(false);
    setUrlInputOpen(true);
    setPicker({ mode });
  }, []);

  return (
    <>
      <style>{`
      .fsp-root{
        --fsp-bg:#f2f2f7;
        --fsp-group:#ffffff;
        --fsp-ink:#000000;
        --fsp-ink-2:#3c3c43;
        --fsp-ink-3:rgba(60,60,67,0.6);
        --fsp-sep:rgba(60,60,67,0.12);
        --fsp-accent:#0a84ff;
        --fsp-danger:#ff3b30;
        color:var(--fsp-ink);
        background:var(--fsp-bg);
        min-height:100dvh;
        height:100dvh;
        overflow:hidden;
        font-family:var(--app-font-family,-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Segoe UI",sans-serif);
        -webkit-font-smoothing:antialiased;
        display:flex;
        flex-direction:column;
      }
      @media (prefers-color-scheme: dark){
        .fsp-root{
          --fsp-bg:#000000;
          --fsp-group:#1c1c1e;
          --fsp-ink:#ffffff;
          --fsp-ink-2:rgba(255,255,255,0.9);
          --fsp-ink-3:rgba(235,235,245,0.6);
          --fsp-sep:rgba(84,84,88,0.6);
        }
      }
      .fsp-root *,.fsp-root *::before,.fsp-root *::after{box-sizing:border-box;}
      .fsp-safe-top{height:env(safe-area-inset-top,0px);}
      .fsp-header{
        position:relative;
        padding:0 16px;
        padding-top:calc(8px + env(safe-area-inset-top,0px));
        background:var(--fsp-bg);
        z-index:5;
      }
      .fsp-title-row{display:flex;align-items:center;min-height:40px;gap:4px;}
      .fsp-title{font-size:28px;font-weight:700;letter-spacing:-0.4px;line-height:1.1;}
      .fsp-navbtn{
        width:36px;height:36px;display:grid;place-items:center;border:0;background:transparent;color:var(--fsp-accent);
        border-radius:50%;cursor:pointer;padding:0;flex-shrink:0;
      }
      .fsp-navbtn:active{background:rgba(128,128,128,0.14);}
      .fsp-save{
        margin-left:auto;border:0;background:transparent;color:var(--fsp-accent);font-size:16px;font-weight:600;
        padding:6px 10px;border-radius:8px;cursor:pointer;flex-shrink:0;
      }
      .fsp-save:active{background:rgba(128,128,128,0.14);}
      .fsp-save:disabled{opacity:0.4;cursor:default;}
      .fsp-search{
        display:flex;align-items:center;gap:6px;background:var(--fsp-group);border:1px solid var(--fsp-sep);
        border-radius:10px;padding:7px 10px;margin:4px 0 10px;color:var(--fsp-ink-3);
      }
      .fsp-search input{
        flex:1;border:0;outline:0;background:transparent;font-size:16px;color:var(--fsp-ink);
      }
      .fsp-search input::placeholder{color:var(--fsp-ink-3);}
      .fsp-clear{border:0;background:transparent;padding:4px;color:var(--fsp-ink-3);display:grid;place-items:center;border-radius:50%;cursor:pointer;}
      .fsp-clear:active{background:rgba(128,128,128,0.14);}
      .fsp-scroll{flex:1;overflow-y:auto;padding:0 16px calc(24px + env(safe-area-inset-bottom,0px));}
      .fsp-scroll::-webkit-scrollbar{display:none;}
      .fsp-card{
        display:flex;align-items:center;gap:14px;background:var(--fsp-group);border:0;border-radius:12px;
        padding:14px;width:100%;cursor:pointer;text-align:left;color:var(--fsp-ink);
        transition:transform .12s ease,opacity .12s ease;
      }
      .fsp-card:active{transform:scale(.985);opacity:.92;}
      .fsp-avatar{
        width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#e5e5ea,#d1d1d6);
        display:grid;place-items:center;overflow:hidden;flex-shrink:0;color:var(--fsp-ink-3);
      }
      .fsp-avatar img{width:100%;height:100%;object-fit:cover;}
      .fsp-card-copy{flex:1;min-width:0;}
      .fsp-card-name{font-size:17px;font-weight:600;line-height:1.3;}
      .fsp-card-bio{font-size:13px;color:var(--fsp-ink-3);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .fsp-chevron{color:var(--fsp-ink-3);flex-shrink:0;}
      .fsp-em{
        display:flex;align-items:center;gap:14px;background:var(--fsp-group);
        border-radius:12px;padding:14px;color:var(--fsp-ink-3);font-size:14px;
      }
      .fsp-group{margin-top:22px;}
      .fsp-group-title{
        font-size:13px;color:var(--fsp-ink-3);text-transform:uppercase;letter-spacing:.4px;
        margin:0 0 8px 16px;font-weight:600;
      }
      .fsp-list{background:var(--fsp-group);border-radius:12px;overflow:hidden;}
      .fsp-row{
        width:100%;display:flex;align-items:center;gap:4px;background:transparent;border:0;padding:11px 16px;
        color:var(--fsp-ink);cursor:pointer;text-align:left;font-size:16px;
      }
      .fsp-row:active{background:rgba(128,128,128,0.12);}
      .fsp-row + .fsp-row{border-top:1px solid var(--fsp-sep);}
      .fsp-row-main{flex:1;min-width:0;padding-right:8px;}
      .fsp-row-label{display:block;font-size:16px;line-height:1.35;}
      .fsp-row-desc{display:block;font-size:13px;color:var(--fsp-ink-3);margin-top:1px;}
      .fsp-row-tag{
        flex-shrink:0;font-size:12px;color:var(--fsp-ink-3);background:rgba(128,128,128,0.12);
        padding:3px 8px;border-radius:999px;white-space:nowrap;
      }
      .fsp-empty{
        display:flex;flex-direction:column;align-items:center;gap:8px;padding:32px 16px;
        color:var(--fsp-ink-3);font-size:14px;text-align:center;
      }
      .fsp-section{margin-top:22px;}
      .fsp-section-title{font-size:13px;color:var(--fsp-ink-3);margin:0 0 8px 16px;font-weight:600;}
      .fsp-field{
        background:var(--fsp-group);border-radius:12px;padding:4px 0;margin-bottom:2px;
      }
      .fsp-field-row{
        display:flex;align-items:center;min-height:44px;padding:8px 16px;gap:12px;
      }
      .fsp-field-row + .fsp-field-row{border-top:1px solid var(--fsp-sep);}
      .fsp-field-label{font-size:16px;color:var(--fsp-ink);width:88px;flex-shrink:0;}
      .fsp-field input,.fsp-field textarea{
        flex:1;border:0;outline:0;background:transparent;color:var(--fsp-ink);font-size:16px;
        font-family:inherit;resize:none;min-width:0;
      }
      .fsp-field input::placeholder,.fsp-field textarea::placeholder{color:var(--fsp-ink-3);}
      .fsp-field textarea{line-height:1.5;padding:4px 0;}
      .fsp-avatar-row{
        display:flex;align-items:center;gap:16px;background:var(--fsp-group);border-radius:12px;padding:14px 16px;
      }
      .fsp-avatar-big{width:64px;height:64px;border-radius:50%;overflow:hidden;background:#e5e5ea;position:relative;color:var(--fsp-ink-3);display:grid;place-items:center;}
      .fsp-avatar-big img{width:100%;height:100%;object-fit:cover;}
      .fsp-avatar-overlay{
        position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,0.28);
        color:#fff;opacity:0;transition:opacity .15s ease;border-radius:50%;
      }
      .fsp-avatar-big:hover .fsp-avatar-overlay,.fsp-avatar-big:active .fsp-avatar-overlay{opacity:1;}
      .fsp-mini-hint{font-size:13px;color:var(--fsp-ink-3);}
      .fsp-switch{
        position:relative;width:51px;height:31px;border-radius:999px;background:rgba(120,120,128,0.32);
        border:0;padding:0;cursor:pointer;flex-shrink:0;transition:background .18s ease;
      }
      .fsp-switch[data-on="true"]{background:#34c759;}
      .fsp-thumb{
        position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:#fff;
        box-shadow:0 1px 3px rgba(0,0,0,0.25);transition:transform .18s ease;
      }
      .fsp-switch[data-on="true"] .fsp-thumb{transform:translateX(20px);}
      .fsp-note{
        font-size:13px;color:var(--fsp-ink-3);line-height:1.5;margin:8px 2px 0;padding:0 14px;
      }
      .fsp-note.warn{color:var(--fsp-danger);}
      .fsp-select-list{display:flex;flex-direction:column;gap:8px;}
      .fsp-select-item{
        display:flex;align-items:center;gap:12px;background:var(--fsp-group);border:0;border-radius:12px;
        padding:12px 14px;color:var(--fsp-ink);cursor:pointer;text-align:left;width:100%;
      }
      .fsp-select-item:active{background:rgba(128,128,128,0.12);}
      .fsp-select-item-copy{flex:1;min-width:0;}
      .fsp-select-name{font-size:15px;font-weight:600;}
      .fsp-select-bio{font-size:12px;color:var(--fsp-ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .fsp-btn{
        display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:10px;
        padding:9px 14px;font-size:14px;font-weight:600;cursor:pointer;background:rgba(128,128,128,0.14);
        color:var(--fsp-accent);transition:transform .12s ease,opacity .12s ease;
      }
      .fsp-btn:active{transform:scale(.97);opacity:.85;}
      .fsp-btn.block{display:flex;width:100%;}
      .fsp-btn.danger{color:var(--fsp-danger);}
      .fsp-ov{
        position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:40;display:flex;align-items:flex-end;
      }
      .fsp-sheet{
        width:100%;background:var(--fsp-group);border-radius:16px 16px 0 0;padding:8px 16px calc(16px + env(safe-area-inset-bottom,0px));
      }
      .fsp-sheet-title{font-size:13px;color:var(--fsp-ink-3);text-align:center;margin:8px 0 2px;}
      .fsp-sheet-opt{
        width:100%;display:flex;align-items:center;justify-content:center;gap:8px;border:0;background:transparent;
        padding:14px;font-size:16px;color:var(--fsp-accent);cursor:pointer;border-radius:10px;
      }
      .fsp-sheet-opt + .fsp-sheet-opt{border-top:1px solid var(--fsp-sep);}
      .fsp-sheet-opt:active{background:rgba(128,128,128,0.12);}
      .fsp-sheet-opt:disabled{color:var(--fsp-ink-3);}
      .fsp-sheet-opt.danger{color:var(--fsp-danger);}
      .fsp-toast{
        position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);
        background:rgba(0,0,0,0.82);color:#fff;font-size:13px;padding:10px 16px;border-radius:10px;
        z-index:60;max-width:80vw;text-align:center;
      }
      @media (prefers-reduced-motion: reduce){
        .fsp-root *,.fsp-root *::before,.fsp-root *::after{transition:none !important;}
      }
    `}</style>
      <div className="fsp-root" data-ui="preview">
      {!hydrated ? (
        <div className="fsp-scroll" style={{ display: "grid", placeItems: "center" }}>
          {hydrateError ? (
            <div className="fsp-empty">
              <span>本机数据暂时读取失败</span>
              <span style={{ fontSize: 13 }}>仅预览环境缺数据，未修改任何正式资料。</span>
            </div>
          ) : (
            <div className="fsp-empty">
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
              <span>正在读取人设…</span>
            </div>
          )}
        </div>
      ) : view === "home" ? (
        <>
          <header className="fsp-header">
            <div className="fsp-title-row">
              <h1 className="fsp-title">设置</h1>
            </div>
            <label className="fsp-search">
              <Search size={16} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索"
                aria-label="搜索设置"
              />
              {query ? (
                <button className="fsp-clear" type="button" onClick={() => setQuery("")} aria-label="清除搜索">
                  <X size={16} />
                </button>
              ) : null}
            </label>
          </header>
          <div className="fsp-scroll">
            {isDemo ? (
              <div className="fsp-note" style={{ padding: "0 4px 10px", color: "var(--fsp-ink-3)" }}>
                本机暂无用户人设，以下为演示资料（仅用于预览展示，不会写入正式资料）。
              </div>
            ) : null}
            <button className="fsp-card" type="button" onClick={() => setView("edit")}>
              {mainIdentity ? (
                <>
                  <span className="fsp-avatar">
                    {mainIdentity.avatarUrl ? <img src={mainIdentity.avatarUrl} alt="" /> : <User size={26} />}
                  </span>
                  <span className="fsp-card-copy">
                    <span className="fsp-card-name">{mainIdentity.name || "未命名身份"}</span>
                    <span className="fsp-card-bio">{truncateLine(mainIdentity.bio)}</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="fsp-avatar"><User size={26} /></span>
                  <span className="fsp-card-copy">
                    <span className="fsp-card-name">未设置全局默认主人设</span>
                    <span className="fsp-card-bio">在编辑页选择身份设为全局默认</span>
                  </span>
                </>
              )}
              <ChevronRight className="fsp-chevron" size={20} />
            </button>

            {filteredMenu.length === 0 ? (
              <div className="fsp-empty">
                <span>没有匹配“{query.trim()}”的设置项</span>
              </div>
            ) : (
              filteredMenu.map((group) => (
                <section className="fsp-group" key={group.title}>
                  <h2 className="fsp-group-title">{group.title}</h2>
                  <div className="fsp-list">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        className="fsp-row"
                        type="button"
                        onClick={() => {
                          if (item.id === "identity") {
                            setView("edit");
                          } else {
                            showNotice(`「${item.label}」后续接入`);
                          }
                        }}
                      >
                        <span className="fsp-row-main">
                          <span className="fsp-row-label">{item.label}</span>
                          <span className="fsp-row-desc">{item.desc}</span>
                        </span>
                        <span className="fsp-row-tag">后续接入</span>
                        <ChevronRight className="fsp-chevron" size={18} />
                      </button>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </>
      ) : current ? (
        <>
          <header className="fsp-header">
            <div className="fsp-title-row">
              <button className="fsp-navbtn" type="button" onClick={() => requestLeave("back")} aria-label="返回">
                <ChevronLeft size={22} />
              </button>
              <h1 className="fsp-title" style={{ fontSize: 20 }}>主人设</h1>
              <button
                className="fsp-save"
                type="button"
                onClick={saveDraft}
                disabled={saving || !isDirty}
              >
                {saving ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : "保存"}
              </button>
            </div>
          </header>
          <div className="fsp-scroll">
            <section className="fsp-section">
              <h2 className="fsp-section-title">头像与名字</h2>
              <div className="fsp-avatar-row">
                <button
                  className="fsp-avatar-big"
                  type="button"
                  onClick={() => openPicker("avatar")}
                  aria-label="更换头像"
                >
                  {current.avatarUrl ? (
                    <img src={current.avatarUrl} alt="" onError={() => setImgError(true)} />
                  ) : (
                    <User size={28} />
                  )}
                  <span className="fsp-avatar-overlay"><Camera size={18} /></span>
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="fsp-mini-hint">头像只保存在本预览草稿</div>
                  {current.avatarUrl ? (
                    <button
                      className="fsp-btn"
                      type="button"
                      style={{ marginTop: 10 }}
                      onClick={() => updateCurrent({ avatarUrl: "" })}
                    >
                      移除头像
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="fsp-field" style={{ marginTop: 10 }}>
                <div className="fsp-field-row">
                  <span className="fsp-field-label">姓名</span>
                  <input
                    type="text"
                    value={current.name}
                    onChange={(e) => updateCurrent({ name: e.target.value.slice(0, 24) })}
                    placeholder={current.name ? "" : "您希望 AI 怎么称呼您"}
                  />
                </div>
              </div>
            </section>

            <section className="fsp-section">
              <h2 className="fsp-section-title">人设资料</h2>
              <div className="fsp-field">
                <div className="fsp-field-row">
                  <span className="fsp-field-label">性别</span>
                  <select
                    value={current.gender}
                    onChange={(e) => updateCurrent({ gender: e.target.value })}
                    style={{ flex: 1, border: 0, background: "transparent", color: "var(--fsp-ink)", fontSize: 16, outline: "none" }}
                  >
                    <option value="保密">保密</option>
                    <option value="男">男</option>
                    <option value="女">女</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
                <div className="fsp-field-row">
                  <span className="fsp-field-label">年龄</span>
                  <input
                    type="text"
                    value={current.age}
                    onChange={(e) => updateCurrent({ age: e.target.value.slice(0, 12) })}
                    placeholder="例如: 24, 未知"
                  />
                </div>
                <div className="fsp-field-row">
                  <span className="fsp-field-label">职业</span>
                  <input
                    type="text"
                    value={current.occupation}
                    onChange={(e) => updateCurrent({ occupation: e.target.value.slice(0, 30) })}
                    placeholder="例如: 学生, 自由职业"
                  />
                </div>
              </div>
              <div className="fsp-field" style={{ marginTop: 10 }}>
                <div className="fsp-field-row" style={{ alignItems: "flex-start" }}>
                  <span className="fsp-field-label" style={{ paddingTop: 8 }}>简介</span>
                  <textarea
                    rows={2}
                    value={current.bio}
                    onChange={(e) => updateCurrent({ bio: e.target.value.slice(0, 500) })}
                    placeholder="简短介绍，作为 AI 了解您的基础背景"
                  />
                </div>
              </div>
              <div className="fsp-field" style={{ marginTop: 10 }}>
                <div className="fsp-field-row" style={{ alignItems: "flex-start" }}>
                  <span className="fsp-field-label" style={{ paddingTop: 8 }}>人设正文</span>
                  <textarea
                    rows={4}
                    value={current.customSettings}
                    onChange={(e) => updateCurrent({ customSettings: e.target.value.slice(0, 2000) })}
                    placeholder="更深的性格、爱好与对话要求"
                  />
                </div>
              </div>
            </section>

            <section className="fsp-section">
              <h2 className="fsp-section-title">外貌与生图</h2>
              <div className="fsp-field">
                <div className="fsp-field-row">
                  <span className="fsp-field-label">参考图片</span>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <button className="fsp-btn" type="button" onClick={() => openPicker("ref")}>
                      {current.refImageUrl ? "更换图片" : "选择图片"}
                    </button>
                    {current.refImageUrl ? (
                      <button className="fsp-btn danger" type="button" onClick={() => updateCurrent({ refImageUrl: "" })}>
                        移除
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="fsp-field-row">
                  <span className="fsp-field-label" style={{ alignSelf: "flex-start", paddingTop: 4 }}>预览</span>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    {current.refImageUrl ? (
                      <img
                        src={current.refImageUrl}
                        alt=""
                        style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover" }}
                        onError={() => setImgError(true)}
                      />
                    ) : (
                      <span className="fsp-mini-hint">暂无参考图</span>
                    )}
                    <button
                      className="fsp-btn"
                      type="button"
                      onClick={() => updateCurrent({ refImageUrl: current.avatarUrl || "" })}
                      disabled={!current.avatarUrl}
                    >
                      使用聊天头像
                    </button>
                  </div>
                </div>
                <div className="fsp-field-row" style={{ alignItems: "flex-start" }}>
                  <span className="fsp-field-label" style={{ paddingTop: 8 }}>外貌描述</span>
                  <textarea
                    rows={3}
                    value={current.appearanceDesc || ""}
                    onChange={(e) => updateCurrent({ appearanceDesc: e.target.value.slice(0, 500) })}
                    placeholder="描述希望生成的外貌特征"
                  />
                </div>
                <div className="fsp-field-row">
                  <span className="fsp-field-label">锁定面容</span>
                  <button
                    className="fsp-switch"
                    type="button"
                    data-on={current.lockFace ? "true" : "false"}
                    onClick={() => updateCurrent({ lockFace: !current.lockFace })}
                    role="switch"
                    aria-checked={!!current.lockFace}
                  >
                    <span className="fsp-thumb" />
                  </button>
                </div>
              </div>
              <p className="fsp-note warn">
                尚未接入生图：参考图、外貌描述与锁脸开关仅保存在本预览草稿，不会触发生成，也不会写入 AI 角色参考图字段。
              </p>
            </section>

            <section className="fsp-section">
              <h2 className="fsp-section-title">身份使用</h2>
              <div className="fsp-select-list">
                {draft.identities.map((idn) => (
                  <button
                    className="fsp-select-item"
                    type="button"
                    key={idn.id}
                    onClick={() => {
                      if (idn.id !== editingId) requestLeave("switch", idn.id);
                    }}
                  >
                    <span className="fsp-avatar" style={{ width: 40, height: 40 }}>
                      {idn.avatarUrl ? <img src={idn.avatarUrl} alt="" /> : <User size={20} />}
                    </span>
                    <span className="fsp-select-item-copy">
                      <span className="fsp-select-name">{idn.name || "未命名身份"}</span>
                      <span className="fsp-select-bio">{truncateLine(idn.bio, 60)}</span>
                    </span>
                    {idn.id === editingId ? <span className="fsp-row-tag">编辑中</span> : null}
                    {idn.id === draft.defaultIdentityId ? <span className="fsp-row-tag">全局默认</span> : null}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <button
                  className="fsp-btn block"
                  type="button"
                  onClick={() => {
                    setDraft((prev) => ({ ...prev, defaultIdentityId: editingId, saved: false }));
                    showNotice("已设为全局默认主人设（仅预览）");
                  }}
                  disabled={draft.defaultIdentityId === editingId}
                >
                  <Check size={16} /> 设为全局默认主人设
                </button>
                <p className="fsp-note">此操作仅更新本预览首页卡片；已有角色/应用的单独绑定不受影响，也不修改正式绑定数据。</p>
              </div>
            </section>
          </div>
        </>
      ) : (
        <div className="fsp-scroll" style={{ display: "grid", placeItems: "center" }}>
          <div className="fsp-empty">
            <span>没有可用的人设</span>
            <button className="fsp-btn" type="button" onClick={() => setView("home")}>返回首页</button>
          </div>
        </div>
      )}

      {notice ? <div className="fsp-toast" role="status">{notice}</div> : null}

      {pendingLeave ? (
        <div className="fsp-ov" onClick={() => setPendingLeave(null)}>
          <div className="fsp-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="fsp-sheet-title">有未保存的修改</div>
            <button className="fsp-sheet-opt" type="button" onClick={saveDraft} disabled={saving}>
              {saving ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={18} />}
              保存草稿
            </button>
            <button className="fsp-sheet-opt danger" type="button" onClick={confirmDiscard}>放弃修改</button>
            <button className="fsp-sheet-opt" type="button" onClick={() => setPendingLeave(null)}>继续编辑</button>
          </div>
        </div>
      ) : null}

      {picker ? (
        <div className="fsp-ov" onClick={() => { setPicker(null); setUrlInputOpen(false); }}>
          <div className="fsp-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="fsp-sheet-title">选择图片方式</div>
            {urlInputOpen ? (
              <>
                <div className="fsp-search" style={{ margin: "8px 0" }}>
                  <Link2 size={16} />
                  <input
                    type="url"
                    autoFocus
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    placeholder="粘贴图片 URL，确认后加载"
                    aria-label="图片 URL"
                  />
                </div>
                {imgError ? <div className="fsp-note warn">URL 图片加载失败，请检查地址后重试</div> : null}
                <button className="fsp-sheet-opt" type="button" onClick={confirmUrl} disabled={urlLoading || !urlDraft.trim()}>
                  {urlLoading ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={18} />}
                  确认加载
                </button>
                <button className="fsp-sheet-opt" type="button" onClick={() => { setUrlInputOpen(false); setImgError(false); }}>返回</button>
              </>
            ) : (
              <>
                <button className="fsp-sheet-opt" type="button" onClick={handleFileChoose}>
                  <Upload size={18} /> 上传图片
                </button>
                <button className="fsp-sheet-opt" type="button" onClick={() => openUrlInput(picker.mode)}>
                  <Link2 size={18} /> 图片 URL
                </button>
                <button className="fsp-sheet-opt" type="button" disabled aria-disabled="true">
                  <Link2 size={18} /> 文件管理器导入（未接入）
                </button>
                <button className="fsp-sheet-opt" type="button" onClick={() => setPicker(null)}>取消</button>
              </>
            )}
          </div>
        </div>
      ) : null}
      </div>
    </>
  );
}