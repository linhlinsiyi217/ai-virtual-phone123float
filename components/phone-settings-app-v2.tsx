"use client";

import { useState, useContext, useEffect, useCallback, useRef, useMemo, type ReactNode } from "react";
import { ChevronRight, X, HardDrive, Mic, Image, Fingerprint, Globe, Database, Layers, Link2, CloudUpload, MessageSquare, Wrench, Laptop, UserCircle, Info, LogOut, KeyRound, User, ShieldCheck } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/modal";
import { useAccount } from "@/lib/account-context";
import { isSelfHostedModeEnabled } from "@/lib/self-hosting";
import { changeAccountPassword } from "@/lib/account-client";
import { loadUserIdentities } from "@/lib/settings-storage";
import { ApiSettings } from "./settings/api-settings";
import { VoiceSettings } from "./settings/voice-settings";
import { ImageGenerationSettings } from "./settings/image-generation-settings";
import { PresetManager } from "./settings/preset-manager";
import { WorldBookManager } from "./settings/worldbook-manager";
import { RegexManager } from "./settings/regex-manager";
import { DataManagement } from "./settings/data-management";
import { UserIdentitySettings } from "./settings/user-identity";
import { AboutDeclaration } from "./settings/about-declaration";
import { BindingManager } from "./settings/binding-manager";
import { WeixinSettings } from "./settings/weixin-settings";
import { CloudServicesPage } from "./settings/cloud-services-setup";
import { ToolboxSettings } from "./settings/toolbox-settings";
import { ModerationCenter } from "./settings/moderation-center";
import { AgentComputerSettings } from "./settings/agent-computer-settings";
import { SettingsShellV2 } from "./settings-preview-v2/shell";
import { SettingsSection, SettingsRow, SettingsPrimaryButton } from "./settings-preview-v2/controls";
import { SettingsContext } from "./phone-settings-app";
import { PhoneCharacterApp } from "./phone-character-app";
import { PhoneThemeApp } from "./phone-theme-app";
import { PhoneResourcesApp } from "./phone-resources-app";
import "./settings-preview-v2/settings-v2.css";

export function PhoneSettingsApp({ 
    onClose, 
    onNotice,
    draftTheme,
    onDraftChange,
    onApplyTheme,
    widgets,
    onWidgetsChange,
    onDesktopThemeChange,
    pageIcons,
    iconSkins,
    wallpaperStyle
}: { 
    onClose: () => void, 
    onNotice: (msg: string) => void,
    draftTheme: any,
    onDraftChange: (a: any) => void,
    onApplyTheme: (a: any) => void,
    widgets: any[],
    onWidgetsChange: (a: any[]) => void,
    onDesktopThemeChange: (a: any) => void,
    pageIcons: any,
    iconSkins: any,
    wallpaperStyle: any
}) {
    const [title, setTitle] = useState<string | null>(null);
    const [overrideBack, setOverrideBack] = useState<(() => void) | null>(null);
    const [rightActions, setRightActions] = useState<Record<string, ReactNode>>({});
    const [currentPageId, setCurrentPageId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const scrollPosRef = useRef(0);
    
    const { account, logout } = useAccount();
    const [syncedAvatar, setSyncedAvatar] = useState<string | null>(null);
    const [syncedName, setSyncedName] = useState<string | null>(null);

    useEffect(() => {
        try {
            const identities = loadUserIdentities();
            if (identities.length > 0) {
                if (identities[0].avatarUrl) setSyncedAvatar(identities[0].avatarUrl);
                if (identities[0].name) setSyncedName(identities[0].name);
            }
        } catch {}
    }, [currentPageId]);

    const setSubpageRightAction = useCallback((page: string, action: ReactNode | null) => {
        setRightActions(prev => ({ ...prev, [page]: action }));
    }, []);

    const handleBack = useCallback(() => {
        if (overrideBack) {
            overrideBack();
        } else if (currentPageId) {
            setCurrentPageId(null);
            setTitle(null);
            setOverrideBack(null);
        } else {
            onClose();
        }
    }, [overrideBack, currentPageId, onClose]);

    const settingsContextValue = useMemo(() => ({ 
        setSubpageTitle: setTitle, 
        setOverrideBack, 
        setSubpageRightAction 
    }), [setSubpageRightAction]);

    const isEmbeddedApp = ["character", "theme", "resources"].includes(currentPageId ?? "");

    return (
        <SettingsContext.Provider value={settingsContextValue}>
            {isEmbeddedApp ? (
                <div className="settings-v2-embedded">
                    <SubpageRenderer
                        pageId={currentPageId}
                        onNotice={onNotice}
                        draft={draftTheme}
                        onDraftChange={onDraftChange}
                        onApply={onApplyTheme}
                        widgets={widgets}
                        onWidgetsChange={onWidgetsChange}
                        onDesktopThemeChange={onDesktopThemeChange}
                        pageIcons={pageIcons}
                        iconSkins={iconSkins}
                        wallpaperStyle={wallpaperStyle}
                        onBack={handleBack}
                        setSubpageTitle={setTitle}
                    />
                </div>
            ) : (
                <SettingsShellV2
                    isMain={!currentPageId}
                    title={currentPageId ? (title || "设置") : "设置"}
                    onClose={onClose}
                    onBack={handleBack}
                    rightAction={currentPageId ? rightActions[currentPageId] : undefined}
                    searchQuery={currentPageId ? undefined : searchQuery}
                    onSearchQueryChange={currentPageId ? undefined : setSearchQuery}
                    bodyRef={(el) => {
                        if (!currentPageId && el) {
                            if (scrollPosRef.current > 0 && el.scrollTop === 0) {
                                el.scrollTop = scrollPosRef.current;
                            }
                            el.onscroll = () => {
                                scrollPosRef.current = el.scrollTop;
                            };
                        }
                    }}
                >
                    <PhoneSettingsContent 
                        onClose={onClose} 
                        onNotice={onNotice} 
                        currentPageId={currentPageId}
                        setCurrentPageId={setCurrentPageId}
                        setSubpageTitle={setTitle}
                        handleBack={handleBack}
                        draftTheme={draftTheme}
                        onDraftChange={onDraftChange}
                        onApplyTheme={onApplyTheme}
                        widgets={widgets}
                        onWidgetsChange={onWidgetsChange}
                        onDesktopThemeChange={onDesktopThemeChange}
                        pageIcons={pageIcons}
                        iconSkins={iconSkins}
                        wallpaperStyle={wallpaperStyle}
                        searchQuery={searchQuery}
                        account={account}
                        syncedAvatar={syncedAvatar}
                        syncedName={syncedName}
                        onOpenIdentity={() => {
                            setTitle("我的人设");
                            setCurrentPageId("identity");
                        }}
                        onBeforeNavigate={() => {
                            const scroller = document.querySelector(".settings-v2__scroller");
                            if (scroller) scrollPosRef.current = (scroller as HTMLElement).scrollTop;
                        }}
                    />
                </SettingsShellV2>
            )}
        </SettingsContext.Provider>
    );
}

function SubpageRenderer({ 
    pageId, onNotice, draft, onDraftChange, onApply, widgets, onWidgetsChange, onDesktopThemeChange, pageIcons, iconSkins, wallpaperStyle, onBack
}: any) {
    switch (pageId) {
        case "api": return <ApiSettings hideHeading />;
        case "voice": return <VoiceSettings />;
        case "imageGeneration": return <ImageGenerationSettings />;
        case "presets": return <PresetManager isActive />;
        case "worldbook": return <WorldBookManager isActive />;
        case "regex": return <RegexManager isActive />;
        case "data": return <DataManagement onNotice={onNotice} />;
        case "binding": return <BindingManager />;
        case "cloud": return <CloudServicesPage />;
        case "weixin": return <WeixinSettings onOpenCloudServices={() => {}} />;
        case "toolbox": return <ToolboxSettings />;
        case "agentComputer": return <AgentComputerSettings onNotice={onNotice} />;
        case "moderation": return <ModerationCenter onNotice={onNotice} />;
        case "identity": return <UserIdentitySettings />;
        case "accountSecurity": return <AccountSecurityPage onNotice={onNotice} />;
        case "about": return <AboutDeclaration />;
        case "character": return <PhoneCharacterApp onClose={onBack} onNotice={onNotice} />;
        case "theme": return (
            <PhoneThemeApp 
                draft={draft} 
                onDraftChange={onDraftChange} 
                onApply={onApply} 
                onClose={onBack} 
                onNotice={onNotice} 
                widgets={widgets}
                onWidgetsChange={onWidgetsChange}
                onDesktopThemeChange={onDesktopThemeChange}
                pageIcons={pageIcons}
                iconSkins={iconSkins}
                wallpaperStyle={wallpaperStyle}
            />
        );
        case "resources": return <PhoneResourcesApp onClose={onBack} onNotice={onNotice} />;
        default: return null;
    }
}

function PhoneSettingsContent({ 
    onClose, onNotice, currentPageId, setCurrentPageId, handleBack,
    draftTheme, onDraftChange, onApplyTheme, widgets, onWidgetsChange, onDesktopThemeChange, pageIcons, iconSkins, wallpaperStyle,
    searchQuery, setSubpageTitle, onBeforeNavigate, account, syncedAvatar, syncedName, onOpenIdentity
}: any) {
    if (currentPageId) return <SubpageRenderer 
        pageId={currentPageId} 
        onNotice={onNotice} 
        draft={draftTheme}
        onDraftChange={onDraftChange}
        onApply={onApplyTheme}
        widgets={widgets}
        onWidgetsChange={onWidgetsChange}
        onDesktopThemeChange={onDesktopThemeChange}
        pageIcons={pageIcons}
        iconSkins={iconSkins}
        wallpaperStyle={wallpaperStyle}
        onBack={handleBack}
    />;

    return (
        <>
            {/* 顶部个人卡片：点击直达「我的人设」设置 */}
            {(!searchQuery || "账号 用户信息 我的人设 身份 资料".includes(searchQuery.toLowerCase())) && (
                <div className="mb-6 rounded-2xl bg-[var(--s-surface)] p-3 border border-[var(--s-line)]">
                    <button type="button" className="flex items-center w-full text-left" onClick={onOpenIdentity}>
                        <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center mr-4 overflow-hidden shrink-0">
                            {syncedAvatar ? (
                                <img src={syncedAvatar} alt="人设头像" className="w-full h-full object-cover" />
                            ) : (
                                <UserCircle size={36} className="text-gray-400" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[18px] font-semibold text-[var(--s-text)] truncate">
                                {syncedName || account?.displayName || account?.username || "我的人设 / 用户资料"}
                            </div>
                            <div className="text-xs text-[var(--s-muted)] truncate">
                                点击设置头像、人设资料、性格偏好与合影参考图
                            </div>
                        </div>
                        <ChevronRight size={20} className="text-[var(--s-muted)] shrink-0 ml-2" />
                    </button>
                </div>
            )}

            {/* 设置分组项 */}
            {(() => {
                const menu = [
                    { id: "theme", label: "外观", group: "外观与显示", icon: Image },
                    { id: "api", label: "API 设置", group: "AI 与生成", icon: HardDrive },
                    { id: "voice", label: "语音 API", group: "AI 与生成", icon: Mic },
                    { id: "imageGeneration", label: "图像生成 API", group: "AI 与生成", icon: Image },
                    { id: "presets", label: "预设", group: "AI 与生成", icon: Fingerprint },
                    { id: "character", label: "角色卷宗", group: "角色与世界", icon: UserCircle },
                    { id: "worldbook", label: "世界书", group: "角色与世界", icon: Globe },
                    { id: "regex", label: "正则规则", group: "角色与世界", icon: Database },
                    { id: "resources", label: "资源库", group: "数据与资源", icon: Layers },
                    { id: "data", label: "数据管理", group: "数据与资源", icon: Database },
                    { id: "binding", label: "配置绑定", group: "连接与工具", icon: Link2 },
                    { id: "cloud", label: "云服务部署", group: "连接与工具", icon: CloudUpload },
                    { id: "weixin", label: "微信接入", group: "连接与工具", icon: MessageSquare },
                    { id: "toolbox", label: "聊天工具箱", group: "连接与工具", icon: Wrench },
                    { id: "agentComputer", label: "角色电脑", group: "连接与工具", icon: Laptop },
                    { id: "accountSecurity", label: "账号与安全", group: "关于", icon: KeyRound },
                    { id: "about", label: "关于与声明", group: "关于", icon: Info },
                ];
                const q = String(searchQuery ?? "").trim().toLowerCase();
                const filtered = q ? menu.filter(i => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q)) : menu;
                
                if (filtered.length === 0) return <div className="text-center py-10 text-[var(--s-muted)] text-sm">没有找到相关设置项</div>;

                const groups = Array.from(new Set(filtered.map(i => i.group)));
                return groups.map(g => (
                    <SettingsSection key={g} title={g}>
                        {filtered.filter(i => i.group === g).map(i => (
                            <SettingsRow key={i.id} icon={i.icon} label={i.label} onClick={() => { 
                                if (typeof onBeforeNavigate === "function") onBeforeNavigate();
                                setSubpageTitle(i.label); 
                                setCurrentPageId(i.id); 
                            }} />
                        ))}
                    </SettingsSection>
                ));
            })()}
        </>
    );
}

function AccountSecurityPage({ onNotice }: { onNotice: (msg: string) => void }) {
    const { account, logout } = useAccount();
    const [oldPwd, setOldPwd] = useState("");
    const [newPwd, setNewPwd] = useState("");
    const [confirmPwd, setConfirmPwd] = useState("");
    const [pwdBusy, setPwdBusy] = useState(false);
    const [pwdError, setPwdError] = useState("");
    const [pwdSuccess, setPwdSuccess] = useState(false);
    const [confirmLogout, setConfirmLogout] = useState(false);

    const handleChangePassword = async () => {
        if (pwdBusy) return;
        setPwdError("");
        setPwdSuccess(false);
        if (!oldPwd || !newPwd) { setPwdError("请填写当前密码和新密码"); return; }
        if (newPwd.length < 6) { setPwdError("新密码至少需要 6 位"); return; }
        if (newPwd !== confirmPwd) { setPwdError("两次输入的新密码不一致"); return; }
        setPwdBusy(true);
        try {
            const result = await changeAccountPassword({ oldPassword: oldPwd, newPassword: newPwd });
            if (!result.ok) { setPwdError(result.error || "修改密码失败"); return; }
            setOldPwd(""); setNewPwd(""); setConfirmPwd("");
            setPwdSuccess(true);
            onNotice("密码修改成功");
        } finally {
            setPwdBusy(false);
        }
    };

    const inputCls = "w-full h-11 px-3 rounded-xl bg-[var(--s-surface,#f2f3f7)] text-sm border-0 focus:outline-none focus:ring-2 focus:ring-[#007aff]/40 text-[var(--s-text,#111)]";

    return (
        <div className="flex flex-col gap-6 pb-10">
            {/* 账号信息 */}
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-[var(--s-surface,#f2f3f7)]">
                <div className="w-14 h-14 rounded-full bg-gray-200 shrink-0 flex items-center justify-center">
                    <UserCircle size={36} className="text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-base font-semibold text-[var(--s-text,#111)] truncate">
                        {account?.displayName || account?.username || "本地用户"}
                    </div>
                    <div className="text-xs text-[var(--s-muted,#6b7280)] truncate">
                        {account ? `@${account.username}` : "自托管 / 本地离线模式"}
                    </div>
                </div>
            </div>

            {account ? (
                <>
                    {/* 修改密码 */}
                    <div className="flex flex-col gap-3">
                        <h3 className="text-xs font-semibold text-[var(--s-muted,#6b7280)] uppercase tracking-wider ml-1">修改密码</h3>
                        <div className="flex flex-col gap-2">
                            <input className={inputCls} type="password" autoComplete="current-password"
                                placeholder="当前密码" value={oldPwd} onChange={e => setOldPwd(e.target.value)} />
                            <input className={inputCls} type="password" autoComplete="new-password"
                                placeholder="新密码（至少 6 位）" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
                            <input className={inputCls} type="password" autoComplete="new-password"
                                placeholder="再次输入新密码" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
                        </div>
                        {pwdError && <p role="alert" className="text-xs text-red-500 ml-1">{pwdError}</p>}
                        {pwdSuccess && <p className="text-xs text-emerald-600 ml-1">密码已更新</p>}
                        <button
                            type="button"
                            disabled={pwdBusy}
                            onClick={() => void handleChangePassword()}
                            className="h-11 rounded-xl bg-[#007aff] text-white text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-all"
                        >
                            {pwdBusy ? "保存中…" : "保存新密码"}
                        </button>
                    </div>

                    {/* 退出登录 */}
                    <div className="flex flex-col gap-2">
                        <h3 className="text-xs font-semibold text-[var(--s-muted,#6b7280)] uppercase tracking-wider ml-1">账号操作</h3>
                        <button
                            type="button"
                            onClick={() => setConfirmLogout(true)}
                            className="h-11 rounded-xl bg-red-50 text-red-500 text-sm font-semibold border border-red-100 active:scale-[0.98] transition-all"
                        >
                            退出登录
                        </button>
                    </div>
                </>
            ) : (
                <div className="p-4 rounded-xl bg-[var(--s-surface,#f2f3f7)] text-center">
                    <p className="text-sm text-[var(--s-muted,#6b7280)] m-0">当前为本地离线模式，无账号密码管理。</p>
                </div>
            )}

            {confirmLogout && account && (
                <ConfirmDialog
                    title="退出登录"
                    message={`当前账号 @${account.username}，退出后需要重新登录。`}
                    icon={LogOut}
                    variant="danger"
                    confirmLabel="退出登录"
                    onConfirm={() => { setConfirmLogout(false); void logout(); }}
                    onCancel={() => setConfirmLogout(false)}
                />
            )}
        </div>
    );
}
