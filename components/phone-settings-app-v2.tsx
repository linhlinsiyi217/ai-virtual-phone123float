"use client";

import { useState, useCallback, useRef, createContext, type ReactNode, useMemo } from "react";
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

// ... (将原组件逻辑平滑过渡到新结构中)
// 省略具体逻辑实现，重点展示接入方式

export function PhoneSettingsApp({ onClose, onNotice }: { onClose: () => void, onNotice: (msg: string) => void }) {
    return (
        <SettingsShellV2>
            <PhoneSettingsContent onClose={onClose} onNotice={onNotice} />
        </SettingsShellV2>
    );
}

function PhoneSettingsContent({ onClose, onNotice }: { onClose: () => void, onNotice: (msg: string) => void }) {
    const { push } = useContext(SettingsNavigationContext);
    
    // 复用原有的状态逻辑 (TimeAware, KeepAlive 等)
    // 这里简化展示结构，重点在于接入 SettingsListGroup
    return (
        <>
            <SettingsListGroup title="外观与声音">
                <SettingsListItem icon={Image} label="外观与主题" onClick={() => push("theme", "外观与主题")} />
            </SettingsListGroup>

            <SettingsListGroup title="AI 与生成">
                <SettingsListItem icon={HardDrive} label="API 设置" onClick={() => push("api", "API 设置")} />
                <SettingsListItem icon={Mic} label="语音 API" onClick={() => push("voice", "语音 API")} />
            </SettingsListGroup>
            
            {/* 更多分组... */}
        </>
    );
}
