"use client";

import { useState, useContext, useEffect, useLayoutEffect, useCallback, useRef, useMemo, createContext, type CSSProperties, type ReactNode } from "react";
import { ChevronRight, Search, X, HardDrive, Mic, Image, Fingerprint, Globe, Database, Layers, Link2, CloudUpload, MessageSquare, Wrench, Laptop, UserCircle, Info, SlidersHorizontal, Check, Loader2, LogOut, KeyRound } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/modal";
import { useAccount } from "@/lib/account-context";
import { isSelfHostedModeEnabled } from "@/lib/self-hosting";
import { changeAccountPassword } from "@/lib/account-client";
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
import { fetchIsAdmin } from "@/lib/moderation-client";
import { loadChatAppSettings, saveChatAppSettings } from "@/lib/chat-storage";
import { loadKeepAlive, saveKeepAlive } from "@/lib/weixin-storage";
import { BINDING_ACCENTS, CONTENT_APP_ACCENTS } from "@/lib/ui-accent-colors";
import { Toggle } from "./ui/form";
import { SettingsShellV2 } from "./settings-preview-v2/shell";
import { SettingsListGroup, SettingsListItem } from "./settings-preview-v2/controls";
import { SettingsNavigationContext } from "./settings-preview-v2/nav-shell";
import { SettingsContext } from "./phone-settings-app";
import { PhoneCharacterApp } from "./phone-character-app";
import { PhoneThemeApp } from "./phone-theme-app";
import { PhoneResourcesApp } from "./phone-resources-app";
import "./settings-preview-v2/settings-v2.css";

export function PhoneSettingsApp({ 
    onClose, 
    onNotice,
    // 从 desktop-shell 传入的主题与桌面状态
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
    
    // 账号管理状态
    const { account, logout } = useAccount();
    const [pwdModalOpen, setPwdModalOpen] = useState(false);
    const [oldPwd, setOldPwd] = useState("");
    const [newPwd, setNewPwd] = useState("");
    const [confirmPwd, setConfirmPwd] = useState("");
    const [pwdBusy, setPwdBusy] = useState(false);
    const [pwdError, setPwdError] = useState("");
    const [confirmLogout, setConfirmLogout] = useState(false);
    const [accountSheetOpen, setAccountSheetOpen] = useState(false);

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
            // 这里不清除 searchQuery，保留上一级的搜索状态
        } else {
            onClose();
        }
    }, [overrideBack, currentPageId, onClose]);

    const handleChangePassword = async () => {
        if (pwdBusy) return;
        if (!oldPwd || !newPwd) { setPwdError("请填写当前密码和新密码。"); return; }
        if (newPwd.length < 6) { setPwdError("新密码至少需要 6 位。"); return; }
        if (newPwd !== confirmPwd) { setPwdError("两次输入的新密码不一致。"); return; }
        setPwdBusy(true);
        setPwdError("");
        try {
            const result = await changeAccountPassword({ oldPassword: oldPwd, newPassword: newPwd });
            if (!result.ok) { setPwdError(result.error || "修改失败。"); return; }
            setPwdModalOpen(false);
            setOldPwd("");
            setNewPwd("");
            setConfirmPwd("");
            onNotice("密码已修改");
        } finally {
            setPwdBusy(false);
        }
    };

    const handleCopyUsername = () => {
        if (navigator.clipboard?.writeText) {
            void navigator.clipboard.writeText(account?.username ?? "").then(() => onNotice("用户名已复制"));
        } else {
            onNotice(`用户名：${account?.username}`);
        }
    };

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
                >
                    <PhoneSettingsContent 
                        onClose={onClose} 
                        onNotice={onNotice} 
                        currentPageId={currentPageId}
                        setCurrentPageId={setCurrentPageId}
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
                    />
                </SettingsShellV2>
            )}
        </SettingsContext.Provider>
    );
}

// 实际需要一个包装器来渲染当前子页
function SubpageRenderer({ 
    pageId, onNotice, draft, onDraftChange, onApply, widgets, onWidgetsChange, onDesktopThemeChange, pageIcons, iconSkins, wallpaperStyle, onBack 
}: any) {
    const renderSubPage = (pageId: string) => {
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
    };
    return renderSubPage(pageId);
}

function PhoneSettingsContent({ 
    onClose, onNotice, currentPageId, setCurrentPageId, handleBack,
    draftTheme, onDraftChange, onApplyTheme, widgets, onWidgetsChange, onDesktopThemeChange, pageIcons, iconSkins, wallpaperStyle,
    searchQuery
}: any) {
    const { push } = useContext(SettingsNavigationContext);
    
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
            {!isSelfHostedModeEnabled() && account && (
                <div className="mb-6 bg-[#ffffff] border-y border-[#e5e7eb] -mx-4 px-4">
                    <button className="flex items-center w-full py-3" onClick={() => setAccountSheetOpen(true)}>
                        <div className="w-14 h-14 rounded-full bg-[#f3f4f6] flex items-center justify-center mr-4">
                            <UserCircle size={32} className="text-[#9ca3af]" />
                        </div>
                        <div className="flex-1 text-left">
                            <div className="text-[19px] font-semibold text-[#111827]">{account.displayName || account.username}</div>
                            <div className="text-sm text-[#6b7280]">账号设置、密码与安全</div>
                        </div>
                        <ChevronRight size={20} className="text-[#c7c7cc]" />
                    </button>
                </div>
            )}

            {/* 在 PhoneSettingsContent 顶部定义菜单以供筛选 */}
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
                    { id: "identity", label: "用户身份", group: "角色与世界", icon: UserCircle },
                    { id: "resources", label: "资源库", group: "数据与资源", icon: Layers },
                    { id: "data", label: "数据管理", group: "数据与资源", icon: Database },
                    { id: "binding", label: "配置绑定", group: "连接与工具", icon: Link2 },
                    { id: "cloud", label: "云服务部署", group: "连接与工具", icon: CloudUpload },
                    { id: "weixin", label: "微信接入", group: "连接与工具", icon: MessageSquare },
                    { id: "toolbox", label: "聊天工具箱", group: "连接与工具", icon: Wrench },
                    { id: "agentComputer", label: "角色电脑", group: "连接与工具", icon: Laptop },
                    { id: "about", label: "关于与声明", group: "关于", icon: Info },
                ];
                const q = String(searchQuery ?? "").trim().toLowerCase();
                const filtered = q ? menu.filter(i => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q)) : menu;
                
                if (filtered.length === 0) return <div className="text-center py-10 text-[var(--settings-secondary)] text-sm">没有找到设置</div>;

                const groups = Array.from(new Set(filtered.map(i => i.group)));
                return groups.map(g => (
                    <SettingsListGroup key={g} title={g}>
                        {filtered.filter(i => i.group === g).map(i => (
                            <SettingsListItem key={i.id} icon={i.icon} label={i.label} onClick={() => { setCurrentPageId(i.id); push(i.id, i.label); }} />
                        ))}
                    </SettingsListGroup>
                ));
            })()}
        </>
    );
}
