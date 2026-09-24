"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
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

type Page = "main" | "account" | "theme" | "resources" | "memory" | "vn_assets" | "audio" | "display" | "api" | "voice" | "imageGeneration" | "presets" | "identity" | "worldbook" | "regex" | "binding" | "cloud" | "weixin" | "toolbox" | "agentComputer" | "data" | "moderation" | "about";
type Modal = "account" | "confirm" | "image" | "audio" | "notice" | null;
type DraftIdentity = UserIdentity & { appearanceDesc?: string; refImageUrl?: string; lockFace?: boolean };
type AudioDraft = { message: string; voice: string; video: string; volume: number; enabled: boolean; mute: boolean };
type ThemeDraft = ThemeProfile & { videoUrl: string; videoPoster: string; iconSource: "system" | "uploaded" | "drawn"; glassStrength: number };

const groups = Array.from(new Set(MENU.map(item => item.group)));
const PREVIEW_EXTRA_MENU = [
  { id: "theme", group: "AI 与生成", label: "外观与主题", desc: "壁纸、图标、桌面组件与主题包", icon: Palette },
  { id: "resources", group: "数据与管理", label: "资源库", desc: "记忆库与漫卷资源", icon: Sparkles },
  { id: "audio", group: "连接与工具", label: "声音与显示", desc: "提示音、字体、文字大小与减少动态", icon: Volume2 },
] as const;
const demoSounds = ["系统提示音", "轻柔提示音", "短促提示音"];

function iconFor(id: string, size = 18): ReactNode {
  const item = MENU.find(entry => entry.id === id);
  if (!item) return <SlidersHorizontal size={size} />;
  const Icon = item.icon;
  return <Icon size={size} strokeWidth={1.8} />;
}

function identityWithDraftFields(identity: UserIdentity): DraftIdentity {
  return { ...identity, appearanceDesc: identity.appearanceDesc || "", refImageUrl: identity.refImageUrl || "", lockFace: identity.lockFace === true };
}

function extractExtension(value: string): { customSettings: string; appearanceDesc: string; refImageUrl: string; lockFace: boolean } {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && parsed.__floatSettingsPreviewExtension) {
      return {
        customSettings: typeof parsed.text === "string" ? parsed.text : "",
        appearanceDesc: typeof parsed.appearanceDesc === "string" ? parsed.appearanceDesc : "",
        refImageUrl: typeof parsed.refImageUrl === "string" ? parsed.refImageUrl : "",
        lockFace: parsed.lockFace === true,
      };
    }
  } catch { /* normal free text */ }
  return { customSettings: value, appearanceDesc: "", refImageUrl: "", lockFace: false };
}

function buildExtension(identity: DraftIdentity): string {
  const base = extractExtension(identity.customSettings);
  const extension = {
    __floatSettingsPreviewExtension: 1,
    text: base.customSettings,
    appearanceDesc: identity.appearanceDesc || base.appearanceDesc,
    refImageUrl: identity.refImageUrl || base.refImageUrl,
    lockFace: identity.lockFace === true || base.lockFace,
  };
  return JSON.stringify(extension);
}

function initialTheme(): ThemeDraft {
  const source = typeof window !== "undefined" ? readThemeProfile() : DEFAULT_THEME_PROFILE;
  return { ...source, videoUrl: "", videoPoster: "", iconSource: "system", glassStrength: 45 };
}

export function SettingsPreviewApp() {
  const [ready, setReady] = useState(false);
  const [readError, setReadError] = useState("");
  const [page, setPage] = useState<Page>("main");
  const [history, setHistory] = useState<Page[]>([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [modalText, setModalText] = useState("");
  const [notice, setNotice] = useState("");
  const [identities, setIdentities] = useState<DraftIdentity[]>([]);
  const [defaultIdentityId, setDefaultIdentityId] = useState<string | null>(null);
  const [editingIdentityId, setEditingIdentityId] = useState<string | null>(null);
  const [identityDraft, setIdentityDraft] = useState<DraftIdentity | null>(null);
  const [identityDirty, setIdentityDirty] = useState(false);
  const [theme, setTheme] = useState<ThemeDraft>(initialTheme);
  const [audio, setAudio] = useState<AudioDraft>({ message: demoSounds[0], voice: demoSounds[1], video: demoSounds[1], volume: 75, enabled: true, mute: false });
  const [toggles, setToggles] = useState({ timeAware: true, keepAlive: false, promptViewer: false, quickAction: false, floatingDock: false, reduceMotion: false });
  const [filter, setFilter] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [customAudio, setCustomAudio] = useState<Record<string, string>>({});
  const [imageFile, setImageFile] = useState("");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const toast = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 2400); };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await hydrateKvDb();
        if (!isKvHydrated()) throw new Error("本机数据读取失败");
        const raw = loadUserIdentities();
        const next = raw.map(identityWithDraftFields);
        const binding = loadBindingConfig();
        const globalId = binding.globalDefaults.userIdentityId || null;
        if (!cancelled) {
          setIdentities(next);
          setDefaultIdentityId(globalId && next.some(item => item.id === globalId) ? globalId : null);
          setEditingIdentityId(globalId && next.some(item => item.id === globalId) ? globalId : next[0]?.id || null);
          setCharacters(loadCharacters());
          setReady(true);
        }
      } catch (error) {
        if (!cancelled) setReadError(error instanceof Error ? error.message : "读取失败");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visibleMenu = useMemo(() => {
    const source = [...MENU, ...PREVIEW_EXTRA_MENU];
    const query = search.trim().toLowerCase();
    if (!query) return source;
    return source.filter(item => `${item.label} ${item.desc} ${item.group}`.toLowerCase().includes(query));
  }, [search]);
  const currentIdentity = identities.find(item => item.id === defaultIdentityId) || null;
  const activeIdentity = identityDraft || identities.find(item => item.id === editingIdentityId) || null;
  const updateToggle = (key: keyof typeof toggles) => setToggles(prev => ({ ...prev, [key]: !prev[key] }));

  const go = (next: Page) => { setHistory(prev => [...prev, page]); setPage(next); };
  const back = () => { const previous = history[history.length - 1]; if (previous) { setHistory(prev => prev.slice(0, -1)); setPage(previous); } else setPage("main"); };
  const closeModal = () => { setModal(null); setModalText(""); };

  const startIdentity = (id?: string) => {
    const source = identities.find(item => item.id === (id || defaultIdentityId)) || identities[0];
    if (!source) { toast("当前没有正式人设数据，无法进入编辑"); return; }
    setEditingIdentityId(source.id);
    setIdentityDraft({ ...source });
    setIdentityDirty(false);
    go("identity");
  };
  const updateIdentity = (patch: Partial<DraftIdentity>) => { setIdentityDraft(prev => prev ? { ...prev, ...patch } : prev); setIdentityDirty(true); };
  const saveIdentityDraft = () => {
    if (!identityDraft?.name.trim()) { toast("名字不能为空"); return; }
    setIdentities(prev => prev.map(item => item.id === identityDraft.id ? { ...identityDraft, customSettings: buildExtension(identityDraft) } : item));
    setIdentityDirty(false);
    toast("预览草稿已保存，未写入正式 UserIdentity");
  };
  const setPreviewDefault = () => { if (!identityDraft) return; setDefaultIdentityId(identityDraft.id); toast("已设为预览中的全局默认，不修改正式绑定"); };

  const pickLocalFile = (kind: "avatar" | "reference" | "audio" | "wallpaper" | "video") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = kind === "audio" ? "audio/*" : kind === "video" ? "video/*" : "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      if (kind === "avatar") updateIdentity({ avatarUrl: url });
      if (kind === "reference") updateIdentity({ refImageUrl: url });
      if (kind === "audio") setCustomAudio(prev => ({ ...prev, [filter || "message"]: url }));
      if (kind === "wallpaper") setTheme(prev => ({ ...prev, wallpaperAssetId: `preview:${file.name}`, wallpaperLibrary: [...prev.wallpaperLibrary, `preview:${file.name}`] }));
      if (kind === "video") setTheme(prev => ({ ...prev, videoUrl: url }));
      toast(`${file.name} 已加入预览草稿`);
    };
    input.click();
  };
  const playAudio = (key: string) => {
    if (playing === key) { audioRef.current?.pause(); setPlaying(null); return; }
    audioRef.current?.pause();
    const src = customAudio[key];
    if (src) {
      const audioElement = new Audio(src);
      audioRef.current = audioElement;
      void audioElement.play().then(() => setPlaying(key)).catch(() => toast("浏览器阻止了音频播放，请先与页面交互"));
      audioElement.onended = () => setPlaying(null);
      return;
    }
    toast(`「${key}」为预览音效占位，未接入正式音频资源`);
  };
  const handleThemeFile = (kind: "wallpaper" | "video") => pickLocalFile(kind);
  const renderIcon = (id: string) => <span className="sv2-symbol">{iconFor(id, 17)}</span>;

  const pageTitle: Record<Page, string> = { main: "设置", account: "账号", theme: "外观与主题", resources: "资源库", memory: "记忆库", vn_assets: "漫卷资源", audio: "声音与显示", display: "文字与阅读", api: "API 设置", voice: "语音 API", imageGeneration: "图像生成 API", presets: "预设", identity: "主人设", worldbook: "世界书", regex: "正则规则", binding: "配置绑定", cloud: "云服务部署", weixin: "微信接入", toolbox: "聊天工具箱", agentComputer: "角色电脑", data: "数据管理", moderation: "管理中心", about: "关于与声明" };

  const renderMain = () => (
    <>
      <SearchBox value={search} onChange={event => setSearch(event.target.value)} onClear={() => setSearch("")} />
      <button className="sv2-profile" type="button" onClick={() => go("account")}>
        <span className="sv2-profile-avatar"><User size={25} /></span>
        <span className="sv2-profile-copy"><strong>预览账户</strong><span>正式账户信息与设置</span></span>
        <span className="sv2-chevron">›</span>
      </button>
      <IosGroup>
        <IosCell label="外观与主题" desc="壁纸、图标、桌面组件与主题包" icon={renderIcon("theme")} onClick={() => go("theme")} />
      </IosGroup>
      {groups.map(group => {
        const items = visibleMenu.filter(item => item.group === group);
        if (!items.length) return null;
        return <IosGroup key={group} title={group}>{items.map(item => item.id === "identity" ? <IosCell key={item.id} label={item.label} icon={renderIcon(item.id)} onClick={() => startIdentity()} /> : <IosCell key={item.id} label={item.label} icon={renderIcon(item.id)} onClick={() => go(item.id as Page)} />)}</IosGroup>;
      })}
      {!search.trim() ? <>
        <IosGroup title="内容与数据"><IosCell label="资源库" desc="记忆库与漫卷资源" icon={renderIcon("resources")} onClick={() => go("resources")} /><IosCell label="数据管理" desc="导入、导出、备份与恢复" icon={renderIcon("data")} onClick={() => go("data")} /></IosGroup>
        <IosGroup title="运行与快捷">
          <div className="sv2-list">
            <div className="sv2-cell"><span className="sv2-cell-icon"><Eye size={17} /></span><span className="sv2-cell-copy"><span className="sv2-cell-label">真实时间感知</span><span className="sv2-cell-desc">控制历史事件流中的时间信息</span></span><IosSwitch checked={toggles.timeAware} onChange={() => updateToggle("timeAware")} label="真实时间感知" /></div>
            <div className="sv2-cell"><span className="sv2-cell-icon"><Wifi size={17} /></span><span className="sv2-cell-copy"><span className="sv2-cell-label">后台保活</span><span className="sv2-cell-desc">切到后台时尽量保持网页运行</span></span><IosSwitch checked={toggles.keepAlive} onChange={() => updateToggle("keepAlive")} label="后台保活" /></div>
            <div className="sv2-cell"><span className="sv2-cell-icon"><SlidersHorizontal size={17} /></span><span className="sv2-cell-copy"><span className="sv2-cell-label">提示词查看器</span><span className="sv2-cell-desc">显示当前提示词浮动按钮</span></span><IosSwitch checked={toggles.promptViewer} onChange={() => updateToggle("promptViewer")} label="提示词查看器" /></div>
            <div className="sv2-cell"><span className="sv2-cell-icon"><Sparkles size={17} /></span><span className="sv2-cell-copy"><span className="sv2-cell-label">快捷操作</span><span className="sv2-cell-desc">快速切换 API 与世界书</span></span><IosSwitch checked={toggles.quickAction} onChange={() => updateToggle("quickAction")} label="快捷操作" /></div>
            <IosCell label="声音与显示" desc="提示音、字体、文字大小与减少动态" icon={renderIcon("audio")} onClick={() => go("audio")} />
          </div>
        </IosGroup>
      </> : null}
      {!visibleMenu.length ? <div className="sv2-empty"><Search size={22} /><strong>没有匹配的设置</strong><span>尝试搜索其他关键词</span></div> : null}
      <IosGroup title="关于"><IosCell label="关于与声明" desc="版本与协议" icon={renderIcon("about")} onClick={() => go("about")} /></IosGroup>
    </>
  );

  const renderAccount = () => <>
    <IosGroup title="登录账户"><div className="sv2-account-head"><span className="sv2-profile-avatar"><User size={25} /></span><span><strong>预览账户</strong><small>账户资料操作为预览模拟</small></span></div><IosCell label="用户名" desc="preview-user" right={<span className="sv2-inline-actions"><Button onClick={() => toast("预览：用户名已复制")}>复制</Button></span>} chevron={false} /><IosCell label="修改密码" desc="需验证当前密码" onClick={() => { setModalText("修改密码表单为预览草稿，不会调用登录接口"); setModal("account"); }} /><IosCell label="退出登录" desc="预览不会清除真实会话" danger onClick={() => { setModalText("退出登录在预览中已拦截，未调用正式登录系统"); setModal("notice"); }} /></IosGroup><p className="sv2-footer">正式设置页中的账户信息、复制用户名、修改密码与退出登录入口保持不变；本预览不接入账号写操作。</p></>;

  const renderIdentity = () => activeIdentity ? <>
    <IosGroup title="头像与名字"><div className="sv2-avatar-editor"><button type="button" className="sv2-big-avatar" onClick={() => pickLocalFile("avatar")}>{activeIdentity.avatarUrl ? <img src={activeIdentity.avatarUrl} alt="" /> : <User size={30} />}<span><CameraIcon /></span></button><span>上传或更换头像<br /><small>图片只进入本次预览草稿</small></span><Button onClick={() => updateIdentity({ avatarUrl: "" })} danger>移除</Button></div><div className="sv2-form-list"><IosInput label="姓名" value={activeIdentity.name} onChange={event => updateIdentity({ name: event.target.value.slice(0, 40) })} placeholder="您希望 AI 如何称呼您" /></div></IosGroup>
    <IosGroup title="人设资料"><div className="sv2-form-list"><IosSelect label="性别" value={activeIdentity.gender} onChange={event => updateIdentity({ gender: event.target.value })}><option>保密</option><option>男</option><option>女</option><option>其他</option></IosSelect><IosInput label="年龄" value={activeIdentity.age} onChange={event => updateIdentity({ age: event.target.value })} /><IosInput label="职业" value={activeIdentity.occupation} onChange={event => updateIdentity({ occupation: event.target.value })} /><IosTextarea label="简介" rows={3} value={activeIdentity.bio} onChange={event => updateIdentity({ bio: event.target.value })} /><IosTextarea label="人设正文" rows={5} value={extractExtension(activeIdentity.customSettings).customSettings} onChange={event => updateIdentity({ customSettings: event.target.value })} /></div></IosGroup>
    <IosGroup title="外貌与生图" footer="参考图、外貌描述和锁脸仅在预览中编辑；正式生图链路是否支持参考图需按提供方判断。"><div className="sv2-form-list"><IosTextarea label="外貌描述" rows={4} value={activeIdentity.appearanceDesc || ""} onChange={event => updateIdentity({ appearanceDesc: event.target.value })} /><div className="sv2-cell"><span className="sv2-cell-icon"><FileImage size={17} /></span><span className="sv2-cell-copy"><span className="sv2-cell-label">参考图片</span><span className="sv2-cell-desc">不写入 AI 角色参考图字段</span></span><Button onClick={() => pickLocalFile("reference")}>上传</Button><Button onClick={() => { setModal("image"); setModalText(""); }}>URL</Button>{activeIdentity.refImageUrl ? <Button danger onClick={() => updateIdentity({ refImageUrl: "" })}>移除</Button> : null}</div><div className="sv2-cell"><span className="sv2-cell-copy"><span className="sv2-cell-label">锁定面容</span><span className="sv2-cell-desc">已保存，生图接入待完成</span></span><IosSwitch checked={activeIdentity.lockFace === true} onChange={value => updateIdentity({ lockFace: value })} label="锁定面容" /></div></div></IosGroup>
    <IosGroup title="身份使用"><div className="sv2-list">{identities.map(item => <IosCell key={item.id} label={item.name || "未命名身份"} desc={item.id === defaultIdentityId ? "全局默认主人设" : "已有角色/应用绑定不受影响"} icon={<User size={17} />} right={item.id === editingIdentityId ? <Check size={17} className="sv2-check" /> : null} onClick={() => { setIdentityDraft({ ...item }); setEditingIdentityId(item.id); setIdentityDirty(false); }} />)}</div><div className="sv2-inline-actions"><Button onClick={setPreviewDefault} disabled={defaultIdentityId === activeIdentity.id}>设为预览全局默认</Button><Button onClick={saveIdentityDraft}>保存预览草稿</Button></div></IosGroup>
  </> : <div className="sv2-empty"><User size={24} /><strong>没有用户人设</strong><span>预览不会自动写入默认身份，请先在正式身份页创建。</span></div>;

  const renderTheme = () => <>
    <IosGroup title="主题预览"><div className="sv2-theme-preview" style={{ background: theme.wallpaperAssetId ? "linear-gradient(135deg, rgba(255,255,255,.72), rgba(215,220,230,.4))" : "linear-gradient(135deg,#f6f5ef,#dfe5eb)" }}><span>桌面 / Dock / 设置控件</span><small>玻璃强度 {theme.glassStrength}% · 预览草稿</small></div></IosGroup>
    <IosGroup title="主题与壁纸"><IosCell label="主题色" desc="沿用当前主题变量" icon={<Palette size={17} />} onClick={() => toast("预览：主题色选择器已打开（未写入正式主题）")} /><IosCell label="静态图片壁纸" desc="上传、裁切位置与透明度" icon={<ImageIcon size={17} />} onClick={() => handleThemeFile("wallpaper")} /><IosCell label="本地视频壁纸" desc="静音、循环、切出画面时暂停" icon={<FileVideo size={17} />} onClick={() => handleThemeFile("video")} /><div className="sv2-cell"><span className="sv2-cell-copy"><span className="sv2-cell-label">拟态强度</span><span className="sv2-cell-desc">实时预览，未写入正式主题</span></span><input className="sv2-range" type="range" min="0" max="100" value={theme.glassStrength} onChange={event => setTheme(prev => ({ ...prev, glassStrength: Number(event.target.value) }))} /></div></IosGroup>
    {theme.videoUrl ? <IosGroup title="视频壁纸播放"><video ref={videoRef} className="sv2-video" src={theme.videoUrl} muted loop playsInline poster={theme.videoPoster || undefined} controls /><div className="sv2-inline-actions"><Button onClick={() => videoRef.current?.play().catch(() => toast("浏览器阻止视频播放"))}><Play size={15} />播放</Button><Button onClick={() => { videoRef.current?.pause(); toast("视频已暂停并保留静帧"); }}><StopCircle size={15} />暂停</Button></div><p className="sv2-footer">视频只保存在本次预览对象 URL，不进入主题资源 IndexedDB。</p></IosGroup> : null}
    <IosGroup title="图标覆盖"><IosCell label="用户上传完整图片" desc="最高优先级，原样显示，不强制滤镜" icon={<Upload size={17} />} onClick={() => toast("预览：可在下方选择上传图标，未写入主题资源")} /><IosCell label="内置工具制作图标" desc="可使用统一圆角底座和效果" icon={<WandSparkles size={17} />} onClick={() => toast("预览：内置制图工具尚未在 v2 接通")} /><IosCell label="系统原生图标" desc="统一圆角底座、边缘高光与阴影" icon={<Sparkles size={17} />} onClick={() => toast("预览：原生图标效果面板")}/><IosCell label="恢复单个图标" desc="只恢复当前覆盖" icon={<RotateCcw size={17} />} onClick={() => toast("预览：已恢复单个图标草稿")}/><IosCell label="恢复整套默认" desc="恢复桌面与 Dock 图标" icon={<RotateCcw size={17} />} onClick={() => { setTheme(prev => ({ ...prev, iconSkins: {}, iconSource: "system" })); toast("预览：已恢复整套默认图标") }} /></IosGroup>
    <IosGroup title="字体与 CSS"><IosCell label="文字与阅读" desc="字体上传、文字大小、减少动态" icon={<Fingerprint size={17} />} onClick={() => go("display")} /><IosCell label="CSS 变量" desc="现有 CSS 覆盖预览" icon={<SlidersHorizontal size={17} />} onClick={() => toast("预览：CSS 变量编辑尚未写入正式主题")}/></IosGroup>
  </>;

  const renderResources = () => <><IosGroup title="资源库"><IosCell label="记忆库" desc="角色记忆档案、详情与记忆设置" icon={<Sparkles size={17} />} onClick={() => { setFilter(""); go("memory"); }} /><IosCell label="漫卷资源" desc="场景与角色立绘资源" icon={<ImageIcon size={17} />} onClick={() => { setFilter("vn_assets"); go("vn_assets"); }} /></IosGroup>{filter === "vn_assets" ? <IosGroup title="漫卷资源"><div className="sv2-resource-grid"><Button onClick={() => toast("预览：漫卷资源浏览")}>场景资源</Button><Button onClick={() => toast("预览：角色立绘资源")}>角色立绘</Button><Button onClick={() => toast("预览：资源选择器")}>选择资源</Button></div></IosGroup> : <IosGroup title="记忆库"><div className="sv2-list">{characters.length ? characters.map(character => <IosCell key={character.id} label={character.name} desc="角色记忆详情" icon={<User size={17} />} onClick={() => { setSelectedCharacterId(character.id); toast(`预览：打开 ${character.name} 的记忆详情`); }} />) : <div className="sv2-empty">暂无角色记忆</div>}</div><IosCell label="记忆设置" desc="摘要与记忆行为" icon={<SlidersHorizontal size={17} />} onClick={() => toast("预览：记忆设置已打开")}/></IosGroup>}</>;

  const renderAudio = () => <><IosGroup title="提示音"><AudioRow label="消息提示音" value={audio.message} onChange={value => setAudio(prev => ({ ...prev, message: value }))} onPlay={() => playAudio(audio.message)} onUpload={() => { setFilter("message"); pickLocalFile("audio"); }} onReset={() => setAudio(prev => ({ ...prev, message: demoSounds[0] }))} /><AudioRow label="语音来电提示音" value={audio.voice} onChange={value => setAudio(prev => ({ ...prev, voice: value }))} onPlay={() => playAudio(audio.voice)} onUpload={() => { setFilter("voice"); pickLocalFile("audio"); }} onReset={() => setAudio(prev => ({ ...prev, voice: demoSounds[1] }))} /><AudioRow label="视频来电提示音" value={audio.video} onChange={value => setAudio(prev => ({ ...prev, video: value }))} onPlay={() => playAudio(audio.video)} onUpload={() => { setFilter("video"); pickLocalFile("audio"); }} onReset={() => setAudio(prev => ({ ...prev, video: demoSounds[1] }))} /></IosGroup><IosGroup title="音量与行为"><div className="sv2-cell"><span className="sv2-cell-copy"><span className="sv2-cell-label">提示音开关</span><span className="sv2-cell-desc">正式事件接入待完成，试听可用</span></span><IosSwitch checked={audio.enabled} onChange={value => setAudio(prev => ({ ...prev, enabled: value }))} label="提示音开关" /></div><div className="sv2-cell"><span className="sv2-cell-copy"><span className="sv2-cell-label">静音</span><span className="sv2-cell-desc">预览中立即停止试听</span></span><IosSwitch checked={audio.mute} onChange={value => { setAudio(prev => ({ ...prev, mute: value })); if (value) { audioRef.current?.pause(); setPlaying(null); } }} label="静音" /></div><div className="sv2-cell"><span className="sv2-cell-copy"><span className="sv2-cell-label">总音量 {audio.volume}%</span></span><input className="sv2-range" type="range" min="0" max="100" value={audio.volume} onChange={event => setAudio(prev => ({ ...prev, volume: Number(event.target.value) }))} /></div></IosGroup><p className="sv2-footer">试听使用真实 Audio 播放 Promise；消息、语音来电和视频来电的正式事件接入、去重、通话结束停铃及与语音消息互斥仍待接入。</p></>;

  const renderDisplay = () => <><IosGroup title="文字与阅读"><IosCell label="字体文件" desc={theme.fontAssetId ? "当前已有字体资源" : "未选择上传字体"} icon={<Fingerprint size={17} />} onClick={() => pickLocalFile("wallpaper")} /><div className="sv2-cell"><span className="sv2-cell-copy"><span className="sv2-cell-label">文字大小</span><span className="sv2-cell-desc">适配小屏阅读</span></span><input className="sv2-range" type="range" min="85" max="125" defaultValue="100" /></div><div className="sv2-cell"><span className="sv2-cell-copy"><span className="sv2-cell-label">减少动态效果</span><span className="sv2-cell-desc">尊重系统 reduced-motion</span></span><IosSwitch checked={toggles.reduceMotion} onChange={() => updateToggle("reduceMotion")} label="减少动态效果" /></div></IosGroup><p className="sv2-footer">字体上传与应用在正式 PhoneThemeApp 中已有完整流程；此预览不调用主题资源保存函数。</p></>;

  const renderGeneric = (id: Page) => { const item = MENU.find(entry => entry.id === id); if (!item) return null; return <><IosGroup title="预览状态"><div className="sv2-status"><span className="sv2-status-dot" />{item.label} 页面可进入，下面按钮均为隔离预览</div></IosGroup><IosGroup title="原有功能入口"><IosCell label="新建" desc="预览草稿操作，不写正式数据" icon={<Sparkles size={17} />} onClick={() => toast(`预览：${item.label} 新建草稿`)}/><IosCell label="编辑与选择" desc="预览表单与选择器" icon={<SlidersHorizontal size={17} />} onClick={() => { setModalText(`${item.label} 编辑表单为预览草稿，不调用正式保存函数`); setModal("notice"); }} /><IosCell label="导入 / 导出" desc="文件选择可操作，正式落盘已隔离" icon={<Upload size={17} />} onClick={() => pickLocalFile("wallpaper")} /><IosCell label="测试连接" desc="不向外部服务发起请求" icon={<TestTube2 size={17} />} onClick={() => toast("预览：连接测试已拦截，未调用外部服务")}/><IosCell label="删除 / 恢复默认" desc="需要确认，当前只改预览状态" icon={<Trash2 size={17} />} danger onClick={() => { setModalText("危险操作仅在预览内模拟，不会删除正式数据"); setModal("confirm"); }} /></IosGroup>{id === "imageGeneration" ? <IosGroup title="生图与锁脸状态"><div className="sv2-lock-panel"><IosSelect label="生图提供方" value="NovelAI（文字生成）" onChange={() => {}}><option>NovelAI（文字生成）</option><option>OpenAI 兼容图像接口（能力取决于服务商）</option></IosSelect><IosSelect label="角色" value={selectedCharacterId} onChange={event => setSelectedCharacterId(event.target.value)}><option value="">请选择角色</option>{characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</IosSelect><p>锁脸解析结果：当前预览只展示角色、参考图与提供方能力，不调用正式生图。NovelAI 当前链路只支持文字生成，不能宣称锁脸已生效。</p></div></IosGroup> : null}</>; };

  const renderPage = () => { switch (page) { case "main": return renderMain(); case "account": return renderAccount(); case "identity": return renderIdentity(); case "theme": return renderTheme(); case "resources": case "memory": case "vn_assets": return renderResources(); case "audio": return renderAudio(); case "display": return renderDisplay(); case "about": return <IosGroup title="关于"><div className="sv2-about"><Info size={28} /><strong>float</strong><span>设置 App 独立预览</span><small>正式页面、桌面入口与旧 App 保留</small></div></IosGroup>; default: return renderGeneric(page); } };

  if (!ready) return <div className="sv2-root"><div className="sv2-loading">{readError ? <><CircleAlert size={22} /><strong>{readError}</strong><span>预览未写入正式资料</span></> : <span>正在读取真实设置数据…</span>}</div></div>;

  return <div className="sv2-root" data-reduced-motion={toggles.reduceMotion ? "true" : "false"}>
    <style>{CSS}
      {`@keyframes sv2-spin{to{transform:rotate(360deg)}}`}
    </style>
    <PageShell title={pageTitle[page]} large={page === "main"} onBack={page !== "main" ? back : undefined} rightAction={page === "identity" ? <Button onClick={saveIdentityDraft}>保存</Button> : page === "theme" ? <Button onClick={() => toast("预览主题已保存，未写入主题资源")}>应用</Button> : undefined}>
      {renderPage()}
    </PageShell>
    {notice ? <div className="sv2-toast" role="status">{notice}</div> : null}
    {modal === "image" ? <PreviewModal title="图片 URL" actions={<><Button onClick={closeModal}>取消</Button><Button onClick={() => { updateIdentity({ refImageUrl: modalText.trim() }); closeModal(); toast("参考图 URL 已加入预览草稿"); }}>确认</Button></>}><IosInput label="URL" value={modalText} onChange={event => setModalText(event.target.value)} placeholder="https://..." /><p className="sv2-footer">确认后仅保存到本次预览草稿，不写入角色参考图。</p></PreviewModal> : null}
    {modal === "notice" ? <PreviewModal title="预览操作" actions={<Button onClick={closeModal}>知道了</Button>}><p>{modalText}</p></PreviewModal> : null}
    {modal === "confirm" ? <PreviewModal title="确认危险操作" actions={<><Button onClick={closeModal}>取消</Button><Button danger onClick={() => { closeModal(); toast("预览操作完成，正式数据未改变"); }}>确认</Button></>}><p>{modalText}</p></PreviewModal> : null}
    {modal === "account" ? <PreviewModal title="修改密码" actions={<><Button onClick={closeModal}>取消</Button><Button onClick={() => { closeModal(); toast("预览密码草稿已保存，未调用账号接口"); }}>保存预览</Button></>}><IosInput label="当前密码" type="password" /><IosInput label="新密码" type="password" /><IosInput label="确认" type="password" /></PreviewModal> : null}
  </div>;
}

function AudioRow({ label, value, onChange, onPlay, onUpload, onReset }: { label: string; value: string; onChange: (value: string) => void; onPlay: () => void; onUpload: () => void; onReset: () => void }) {
  return <div className="sv2-audio-row"><div><strong>{label}</strong><small>{value}</small></div><select value={value} onChange={event => onChange(event.target.value)}>{demoSounds.map(sound => <option key={sound}>{sound}</option>)}</select><Button onClick={onPlay}><Play size={14} /></Button><Button onClick={onUpload}><Upload size={14} /></Button><Button onClick={onReset}><RotateCcw size={14} /></Button></div>;
}

function CameraIcon() { return <Upload size={17} />; }

const CSS = `
.sv2-root{--sv-bg:var(--c-page-body-bg,#f2f2f7);--sv-card:var(--c-card,rgba(255,255,255,.8));--sv-text:var(--c-text-title,#1c1c1e);--sv-muted:var(--c-text,#6e6e73);--sv-line:var(--c-card-border,rgba(60,60,67,.16));--sv-blue:#1683ff;--sv-red:#ff3b30;min-height:100dvh;height:100dvh;overflow:hidden;background:var(--sv-bg);color:var(--sv-text);font-family:var(--app-font-family,-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Segoe UI",sans-serif);-webkit-font-smoothing:antialiased}.sv2-root *{box-sizing:border-box}.sv2-page{height:100%;display:flex;flex-direction:column;min-height:0}.sv2-header{flex:0 0 auto;padding:0 16px;background:color-mix(in srgb,var(--sv-bg) 86%,transparent);backdrop-filter:blur(22px) saturate(145%);-webkit-backdrop-filter:blur(22px) saturate(145%);z-index:2}.sv2-safe-top{height:env(safe-area-inset-top,0px)}.sv2-nav{height:50px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px}.sv2-nav-side{min-width:0;display:flex;align-items:center;gap:4px}.sv2-nav-right{justify-content:flex-end}.sv2-nav-btn{border:0;background:transparent;color:var(--sv-blue);display:inline-flex;align-items:center;gap:0;padding:7px 0;font:inherit;cursor:pointer;min-height:36px}.sv2-nav-btn:active{opacity:.55}.sv2-nav-btn span{font-size:15px}.sv2-icon-btn{padding:8px}.sv2-title{font-size:17px;line-height:1.25;font-weight:650;margin:0;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sv2-title-large{font-size:32px;text-align:left;justify-self:start;line-height:1.1;letter-spacing:-.5px}.sv2-body{flex:1;min-height:0;overflow-y:auto;padding:0 16px calc(32px + env(safe-area-inset-bottom,0px));overscroll-behavior:contain}.sv2-body::-webkit-scrollbar{display:none}.sv2-search{height:36px;display:flex;align-items:center;gap:7px;border-radius:10px;background:var(--sv-card);border:1px solid var(--sv-line);padding:0 10px;margin:0 0 12px;color:var(--sv-muted)}.sv2-search input{border:0;background:transparent;outline:0;flex:1;min-width:0;color:var(--sv-text);font:inherit}.sv2-search button{border:0;background:transparent;color:var(--sv-muted);padding:3px;display:grid;place-items:center}.sv2-group{margin:20px 0 0}.sv2-group-title{font-size:13px;color:var(--sv-muted);font-weight:600;margin:0 0 7px 16px}.sv2-list{background:var(--sv-card);border:1px solid var(--sv-line);border-radius:13px;overflow:hidden;box-shadow:0 1px 1px rgba(0,0,0,.03)}.sv2-cell{min-height:51px;display:flex;align-items:center;gap:10px;padding:9px 14px;background:transparent;border:0;width:100%;text-align:left;color:inherit}.sv2-cell+.sv2-cell,.sv2-cell+.sv2-field,.sv2-field+.sv2-cell{border-top:1px solid var(--sv-line)}.sv2-cell:has(button:active),.sv2-cell:has(input:focus){background:rgba(128,128,128,.08)}.sv2-cell-icon{width:28px;height:28px;border-radius:8px;background:color-mix(in srgb,var(--sv-text) 9%,transparent);display:grid;place-items:center;flex:0 0 auto;color:var(--sv-text)}.sv2-symbol{width:28px;height:28px;display:grid;place-items:center;border-radius:8px;background:color-mix(in srgb,var(--sv-text) 9%,transparent);flex:0 0 auto}.sv2-cell-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.sv2-cell-label{font-size:15px;line-height:1.3}.sv2-cell-desc{font-size:12px;line-height:1.3;color:var(--sv-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sv2-cell:disabled,.sv2-cell[disabled]{cursor:default}.sv2-cell:not(:disabled){cursor:pointer}.sv2-cell button,.sv2-cell input,.sv2-cell select{flex:0 0 auto}.sv2-chevron{color:var(--sv-muted);flex:0 0 auto}.sv2-cell{appearance:none}.sv2-list>button.sv2-cell{cursor:pointer}.sv2-list>button.sv2-cell:active{background:rgba(128,128,128,.12)}.sv2-danger .sv2-cell-label{color:var(--sv-red)}.sv2-switch-row{border:0;background:transparent;padding:4px;display:grid;place-items:center;cursor:pointer}.sv2-switch{display:block;width:51px;height:31px;border-radius:99px;background:rgba(120,120,128,.32);padding:2px;transition:background .18s ease}.sv2-switch>span{display:block;width:27px;height:27px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.22);transition:transform .18s ease}.sv2-switch.is-on{background:#34c759}.sv2-switch.is-on>span{transform:translateX(20px)}.sv2-field{display:flex;align-items:center;gap:10px;min-height:51px;padding:9px 14px}.sv2-field>span{width:78px;flex:0 0 auto;font-size:15px}.sv2-field input,.sv2-field textarea,.sv2-field select{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--sv-text);font:inherit}.sv2-field textarea{line-height:1.5;resize:vertical}.sv2-field-top{align-items:flex-start}.sv2-field-top>span{padding-top:4px}.sv2-profile{display:flex;align-items:center;gap:13px;width:100%;border:1px solid var(--sv-line);background:var(--sv-card);border-radius:15px;padding:13px;text-align:left;color:inherit;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.03)}.sv2-profile:active,.sv2-button:active{transform:scale(.985);opacity:.84}.sv2-profile-avatar{width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#e7e7ec,#cfd0d5);overflow:hidden;display:grid;place-items:center;color:var(--sv-muted);flex:0 0 auto}.sv2-profile-avatar img,.sv2-big-avatar img{width:100%;height:100%;object-fit:cover}.sv2-profile-copy{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px}.sv2-profile-copy strong{font-size:17px}.sv2-profile-copy span{font-size:13px;color:var(--sv-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sv2-chevron{font-size:28px;line-height:1;color:var(--sv-muted)}.sv2-button{border:0;border-radius:9px;background:color-mix(in srgb,var(--sv-text) 9%,transparent);color:var(--sv-blue);font:inherit;font-size:13px;font-weight:600;min-height:34px;padding:6px 10px;display:inline-flex;align-items:center;justify-content:center;gap:5px;cursor:pointer;white-space:nowrap}.sv2-button:disabled{opacity:.42;cursor:default}.sv2-button-danger{color:var(--sv-red)}.sv2-footer{font-size:12px;line-height:1.55;color:var(--sv-muted);padding:0 14px;margin:7px 0 0}.sv2-empty{display:flex;flex-direction:column;align-items:center;gap:7px;color:var(--sv-muted);padding:42px 16px;text-align:center}.sv2-empty strong{color:var(--sv-text);font-size:16px}.sv2-toast{position:fixed;z-index:20;left:50%;bottom:calc(22px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);max-width:82vw;padding:10px 14px;border-radius:11px;background:rgba(25,25,28,.88);color:#fff;font-size:13px;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.2)}.sv2-modal-backdrop{position:fixed;inset:0;z-index:10;background:rgba(0,0,0,.32);display:flex;align-items:flex-end;justify-content:center;padding:16px}.sv2-modal{width:min(520px,100%);max-height:88dvh;overflow:auto;border:1px solid rgba(255,255,255,.4);border-radius:19px;background:color-mix(in srgb,var(--sv-card) 90%,transparent);backdrop-filter:blur(26px) saturate(150%);-webkit-backdrop-filter:blur(26px) saturate(150%);padding:17px}.sv2-modal h2{font-size:18px;margin:0 0 14px}.sv2-modal-body{display:flex;flex-direction:column;gap:8px}.sv2-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:15px}.sv2-loading{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;color:var(--c-text,#666);font-family:var(--app-font-family,sans-serif)}.sv2-account-head{display:flex;gap:12px;align-items:center;padding:16px}.sv2-account-head strong,.sv2-account-head small{display:block}.sv2-account-head small{color:var(--sv-muted);font-size:12px;margin-top:3px}.sv2-status{padding:14px;display:flex;align-items:center;gap:8px;font-size:14px}.sv2-status-dot{width:8px;height:8px;border-radius:50%;background:#34c759}.sv2-avatar-editor{display:flex;align-items:center;gap:12px;padding:14px}.sv2-avatar-editor>span{flex:1;font-size:14px}.sv2-avatar-editor small{color:var(--sv-muted);font-size:12px}.sv2-big-avatar{position:relative;width:70px;height:70px;border-radius:50%;overflow:hidden;background:#e4e5e9;border:0;color:var(--sv-muted);display:grid;place-items:center;cursor:pointer}.sv2-big-avatar>span{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.3);color:#fff;opacity:0}.sv2-big-avatar:hover>span,.sv2-big-avatar:active>span{opacity:1}.sv2-form-list{background:var(--sv-card)}.sv2-check{color:var(--sv-blue)}.sv2-inline-actions{display:flex;gap:8px;flex-wrap:wrap;padding:12px 14px}.sv2-theme-preview{min-height:130px;border-radius:14px;padding:18px;display:flex;flex-direction:column;justify-content:flex-end;gap:4px;overflow:hidden;background-size:cover}.sv2-theme-preview span{font-size:17px;font-weight:650}.sv2-theme-preview small{font-size:12px;color:var(--sv-muted)}.sv2-range{accent-color:var(--sv-blue);width:125px}.sv2-video{display:block;width:100%;max-height:230px;object-fit:cover;background:#111}.sv2-resource-grid{display:flex;gap:8px;padding:14px;flex-wrap:wrap}.sv2-audio-row{display:grid;grid-template-columns:minmax(110px,1fr) minmax(110px,1fr) auto auto auto;align-items:center;gap:7px;padding:11px 14px}.sv2-audio-row+.sv2-audio-row{border-top:1px solid var(--sv-line)}.sv2-audio-row strong,.sv2-audio-row small{display:block}.sv2-audio-row strong{font-size:14px}.sv2-audio-row small{color:var(--sv-muted);font-size:12px;margin-top:2px}.sv2-audio-row select{min-width:0;max-width:100%;border:0;background:transparent;color:var(--sv-text)}.sv2-about{display:flex;flex-direction:column;align-items:center;gap:8px;padding:32px;color:var(--sv-muted)}.sv2-about strong{font-size:22px;color:var(--sv-text)}.sv2-lock-panel{padding:4px 0 10px}.sv2-lock-panel p{font-size:12px;line-height:1.55;color:var(--sv-muted);padding:0 14px}.sv2-root[data-reduced-motion=true] *{transition:none!important;scroll-behavior:auto!important}@media(prefers-color-scheme:dark){.sv2-root{--sv-bg:#000;--sv-card:rgba(30,30,32,.88);--sv-text:#fff;--sv-muted:rgba(235,235,245,.6);--sv-line:rgba(84,84,88,.65)}}@media(max-width:430px){.sv2-audio-row{grid-template-columns:1fr auto auto auto;}.sv2-audio-row select{grid-column:1/-1;grid-row:2;width:100%;}.sv2-field>span{width:70px}.sv2-title-large{font-size:30px}}
@media(prefers-reduced-motion:reduce){.sv2-root *{transition:none!important;animation:none!important}}
`;
