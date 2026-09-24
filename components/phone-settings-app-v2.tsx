"use client";

import { useContext, useState, useEffect, useLayoutEffect, useCallback, useRef, type ReactNode } from "react";
import { HardDrive, Mic, Image, Fingerprint, Globe, Database, Layers, Link2, CloudUpload, MessageSquare, Wrench, Laptop, UserCircle, Info, SlidersHorizontal, ChevronRight, Search } from "lucide-react";
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
import { AgentComputerSettings } from "./settings/agent-computer-settings";
import { SettingsShellV2 } from "./settings-preview-v2/shell";
import { SettingsListGroup, SettingsListItem } from "./settings-preview-v2/controls";
import { SettingsNavigationContext } from "./settings-preview-v2/nav-shell";

export function PhoneSettingsApp({ onClose, onNotice }: { onClose: () => void, onNotice: (msg: string) => void }) {
    return (
        <SettingsShellV2>
            <PhoneSettingsContent onClose={onClose} onNotice={onNotice} />
        </SettingsShellV2>
    );
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
            case "weixin": return <WeixinSettings onOpenCloudServices={() => push("cloud", "云服务部署")} />;
            case "toolbox": return <ToolboxSettings />;
            case "agentComputer": return <AgentComputerSettings onNotice={onNotice} />;
            case "identity": return <UserIdentitySettings />;
            case "about": return <AboutDeclaration />;
            default: return null;
        }
    };

    if (currentPageId) return renderSubPage(currentPageId);

    return (
        <>
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
