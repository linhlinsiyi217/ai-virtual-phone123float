"use client";

import { useState, useContext, useEffect, useLayoutEffect, useCallback, useRef, createContext, type CSSProperties, type ReactNode } from "react";
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

export const SettingsContext = createContext<{
    setSubpageTitle: (title: string | null) => void;
    setOverrideBack: (action: (() => void) | null) => void;
    setSubpageRightAction: (page: string, action: ReactNode | null) => void;
}>({ setSubpageTitle: () => { }, setOverrideBack: () => { }, setSubpageRightAction: () => { } });

export function PhoneSettingsApp({ onClose, onNotice }: { onClose: () => void, onNotice: (msg: string) => void }) {
    return (
        <SettingsShellV2>
            <PhoneSettingsContent onClose={onClose} onNotice={onNotice} />
        </SettingsShellV2>
    );
}

// 实际需要一个包装器来渲染当前子页
function SubpageRenderer({ pageId, onNotice }: { pageId: string, onNotice: (msg: string) => void }) {
    const renderSubPage = (pageId: string) => {
        switch (pageId) {
            case "api": return <ApiSettings />;
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
            default: return null;
        }
    };
    return renderSubPage(pageId);
}

function PhoneSettingsContent({ onClose, onNotice }: { onClose: () => void, onNotice: (msg: string) => void }) {
    const { push } = useContext(SettingsNavigationContext);
    const [currentPageId, setCurrentPageId] = useState<string | null>(null);

    // 监听导航变化
    useEffect(() => {
        const handleNav = (e: any) => setCurrentPageId(e.detail?.page || null);
        window.addEventListener("settings-nav-v2", handleNav);
        return () => window.removeEventListener("settings-nav-v2", handleNav);
    }, []);

    if (currentPageId) return <SubpageRenderer pageId={currentPageId} onNotice={onNotice} />;

    return (
        <>
            {!isSelfHostedModeEnabled() && (
                <div className="mb-6 bg-[var(--c-card)]/70 backdrop-blur-md rounded-2xl border border-[var(--c-card-border)] overflow-hidden shadow-sm">
                    <button className="flex items-center w-full px-4 py-4 active:bg-black/5" onClick={() => {}}>
                        <div className="w-12 h-12 rounded-full bg-[var(--c-card-border)] flex items-center justify-center mr-4">
                            <UserCircle size={24} />
                        </div>
                        <div className="flex-1 text-left">
                            <div className="text-[17px] font-semibold">账号管理</div>
                            <div className="text-sm text-[var(--c-icon)]">点击查看账号设置</div>
                        </div>
                        <ChevronRight size={20} className="text-[var(--c-icon)]" />
                    </button>
                </div>
            )}

            <SettingsListGroup title="AI 与生成">
                <SettingsListItem icon={HardDrive} label="API 设置" onClick={() => { setCurrentPageId("api"); push("api", "API 设置"); }} />
                <SettingsListItem icon={Mic} label="语音 API" onClick={() => { setCurrentPageId("voice"); push("voice", "语音 API"); }} />
                <SettingsListItem icon={Image} label="图像生成 API" onClick={() => { setCurrentPageId("imageGeneration"); push("imageGeneration", "图像生成 API"); }} />
                <SettingsListItem icon={Fingerprint} label="预设" onClick={() => { setCurrentPageId("presets"); push("presets", "预设"); }} />
            </SettingsListGroup>
            
            <SettingsListGroup title="角色与世界">
                <SettingsListItem icon={Globe} label="世界书" onClick={() => { setCurrentPageId("worldbook"); push("worldbook", "世界书"); }} />
                <SettingsListItem icon={Database} label="正则规则" onClick={() => { setCurrentPageId("regex"); push("regex", "正则规则"); }} />
                <SettingsListItem icon={UserCircle} label="用户身份" onClick={() => { setCurrentPageId("identity"); push("identity", "用户身份"); }} />
            </SettingsListGroup>

            <SettingsListGroup title="连接与工具">
                <SettingsListItem icon={Link2} label="配置绑定" onClick={() => { setCurrentPageId("binding"); push("binding", "配置绑定"); }} />
                <SettingsListItem icon={CloudUpload} label="云服务部署" onClick={() => { setCurrentPageId("cloud"); push("cloud", "云服务部署"); }} />
                <SettingsListItem icon={MessageSquare} label="微信接入" onClick={() => { setCurrentPageId("weixin"); push("weixin", "微信接入"); }} />
                <SettingsListItem icon={Wrench} label="聊天工具箱" onClick={() => { setCurrentPageId("toolbox"); push("toolbox", "聊天工具箱"); }} />
                <SettingsListItem icon={Laptop} label="角色电脑" onClick={() => { setCurrentPageId("agentComputer"); push("agentComputer", "角色电脑"); }} />
            </SettingsListGroup>
            
            <SettingsListGroup title="关于">
                 <SettingsListItem icon={Info} label="关于与声明" onClick={() => { setCurrentPageId("about"); push("about", "关于与声明"); }} />
            </SettingsListGroup>
        </>
    );
}
