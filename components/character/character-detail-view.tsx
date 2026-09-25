"use client";

import { useState, useRef, useEffect } from "react";
import { 
    X, Check, Edit2, ArrowLeft, Trash2, Camera, Link, Plus, 
    ChevronDown, ChevronUp, MessageSquare, ShieldAlert, Sparkles, BookOpen
} from "lucide-react";
import type { Character, CharacterGovernancePreset } from "@/lib/character-types";
import { CharacterGovernancePanel } from "@/components/character/governance-panel";
import { generateBriefPersonaText, isBriefPersonaStale } from "@/lib/brief-persona";
import { loadCharacterVersions, switchCharacterVersion, backupCharacterVersion, overwriteCharacterVersion, getCharacterCurrentVersion, getCharacterNextVersion } from "@/lib/character-version-storage";

export function CharacterDetailView({
    char,
    isEditing = false,
    isExisting = false,
    onBack,
    onEdit,
    onCancelEdit,
    onSave,
    onDelete,
    onNotice = () => {},
}: {
    char: Character;
    isEditing?: boolean;
    isExisting?: boolean;
    onBack: () => void;
    onEdit: () => void;
    onCancelEdit: () => void;
    onSave: (data: Partial<Character>, createVersion: boolean) => void;
    onDelete: () => void;
    onNotice?: (msg: string) => void;
}) {
    const [name, setName] = useState(char.name || "");
    const [persona, setPersona] = useState(char.persona || "");
    const [personality, setPersonality] = useState(char.personality || "");
    const [briefPersona, setBriefPersona] = useState(char.briefPersona || "");
    const [briefBusy, setBriefBusy] = useState(false);
    const [briefError, setBriefError] = useState("");
    const [avatar, setAvatar] = useState(char.avatar || "");
    const [tags, setTags] = useState<string[]>(char.tags || []);
    const [tagInput, setTagInput] = useState("");
    const [timeZone, setTimeZone] = useState(char.timeZone || "Asia/Shanghai");

    const [activeSection, setActiveSection] = useState<"basic" | "persona" | "governance" | "image">("basic");
    const [confirmDelete, setConfirmDelete] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    // AI 生成简量简介
    const handleGenerateBrief = async () => {
        if (briefBusy) return;
        setBriefBusy(true);
        setBriefError("");
        try {
            const text = await generateBriefPersonaText({
                ...char,
                name: name.trim() || char.name || "未命名角色",
                persona,
                personality: personality.trim() || undefined,
            });
            setBriefPersona(text);
            onNotice("AI 已成功压缩并生成简介！");
        } catch (error) {
            setBriefError(error instanceof Error ? error.message : String(error));
        } finally {
            setBriefBusy(false);
        }
    };

    const handleAddTag = () => {
        const val = tagInput.trim();
        if (!val) return;
        if (!tags.includes(val)) {
            setTags([...tags, val]);
        }
        setTagInput("");
    };

    const handleSave = () => {
        onSave({
            name: name.trim() || "未命名",
            persona,
            personality: personality.trim() || undefined,
            briefPersona: briefPersona.trim() || undefined,
            tags,
            avatar: avatar || null,
            timeZone,
        }, isExisting);
    };

    const sectionCls = (sec: typeof activeSection) => 
        `px-4 py-2 text-xs font-semibold rounded-full border transition-all ${
            activeSection === sec 
                ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white" 
                : "bg-gray-100 text-gray-600 border-transparent dark:bg-white/5 dark:text-gray-400"
        }`;

    return (
        <div className="flex flex-col h-full bg-white dark:bg-[#16161a]">
            {/* 顶栏 */}
            <div className="flex items-center justify-between px-4 pt-12 pb-3 border-b border-black/5 dark:border-white/5 shrink-0">
                <button
                    type="button"
                    onClick={onBack}
                    className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-700 dark:text-gray-300 active:scale-95"
                >
                    <ArrowLeft size={18} strokeWidth={2.5} />
                </button>
                <h2 className="text-base font-semibold text-[#111] dark:text-white">
                    {isEditing ? (isExisting ? "编辑角色" : "新建角色") : "角色主页"}
                </h2>
                <div className="flex items-center gap-1.5 shrink-0">
                    {isEditing ? (
                        <>
                            <button
                                type="button"
                                onClick={onCancelEdit}
                                className="h-8 px-3 rounded-full bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 text-xs font-semibold active:scale-95 transition-all"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                className="h-8 px-3 rounded-full bg-[#007aff] text-white text-xs font-semibold active:scale-95 transition-all"
                            >
                                保存
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={onEdit}
                                className="flex items-center gap-1 h-8 px-3 rounded-full bg-[#007aff]/10 text-[#007aff] text-xs font-semibold active:scale-95 transition-all"
                            >
                                <Edit2 size={12} />
                                <span>编辑</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmDelete(true)}
                                className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-950/20 text-red-500 flex items-center justify-center active:scale-95 transition-all"
                            >
                                <Trash2 size={14} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* 详情主内容区 */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 hide-scrollbar">
                {/* 角色大头像与核心名片 */}
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50/50 dark:bg-white/1 border border-black/5 dark:border-white/5">
                    <div 
                        onClick={() => {
                            if (isEditing) {
                                const input = document.createElement("input");
                                input.type = "file";
                                input.accept = "image/*";
                                input.onchange = (e) => {
                                    const file = (e.target as any).files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = () => setAvatar(reader.result as string);
                                    reader.readAsDataURL(file);
                                };
                                input.click();
                            }
                        }}
                        className={`w-20 h-20 rounded-2xl bg-gray-200 dark:bg-white/5 border border-black/8 dark:border-white/8 overflow-hidden shrink-0 flex items-center justify-center relative ${isEditing ? "cursor-pointer" : ""}`}
                    >
                        {avatar ? (
                            <img src={avatar} alt={name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-400 to-purple-500 text-white text-3xl font-bold">
                                {(name || "?")[0]}
                            </div>
                        )}
                        {isEditing && (
                            <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white text-[10px] font-semibold gap-1">
                                <Camera size={14} />
                                <span>更换头像</span>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                        {isEditing ? (
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="输入名字…"
                                className="text-lg font-bold text-[#111] dark:text-white bg-transparent border-b border-[#007aff] outline-none pb-0.5"
                            />
                        ) : (
                            <div className="text-lg font-bold text-[#111] dark:text-white truncate">{name || "未命名角色"}</div>
                        )}
                        <div className="text-xs text-gray-400 truncate">微信号：{char.wechatID || "自动分配"}</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                            {tags.map((t, idx) => (
                                <span key={idx} className="px-2 py-0.5 rounded bg-gray-100 dark:bg-white/5 text-[10px] text-gray-500 dark:text-gray-400 border border-black/5">
                                    {t}
                                    {isEditing && (
                                        <button type="button" onClick={() => setTags(tags.filter(tag => tag !== t))} className="ml-1 text-gray-400 hover:text-red-500">×</button>
                                    )}
                                </span>
                            ))}
                            {isEditing && (
                                <div className="flex gap-1 items-center mt-1">
                                    <input
                                        type="text"
                                        value={tagInput}
                                        onChange={e => setTagInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } }}
                                        placeholder="标签…"
                                        className="h-5 px-1.5 rounded border border-black/10 dark:border-white/10 bg-transparent text-[10px] w-12 outline-none text-[#111] dark:text-white"
                                    />
                                    <button type="button" onClick={handleAddTag} className="text-[10px] text-[#007aff] font-bold">加</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 分区可滑动 Tab */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0 hide-scrollbar">
                    <button type="button" onClick={() => setActiveSection("basic")} className={sectionCls("basic")}>基础设定</button>
                    <button type="button" onClick={() => setActiveSection("persona")} className={sectionCls("persona")}>人设/性格</button>
                    <button type="button" onClick={() => setActiveSection("governance")} className={sectionCls("governance")}>人格治理</button>
                    <button type="button" onClick={() => setActiveSection("image")} className={sectionCls("image")}>形象生成</button>
                </div>

                {/* 各分区内容 */}
                <div className="flex-1 min-h-0 flex flex-col">
                    {activeSection === "basic" && (
                        <div className="space-y-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-gray-400 dark:text-gray-500">时区设定</label>
                                {isEditing ? (
                                    <select
                                        value={timeZone}
                                        onChange={e => setTimeZone(e.target.value)}
                                        className="w-full h-11 px-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-black/8 dark:border-white/8 text-sm outline-none text-[#111] dark:text-white"
                                    >
                                        <option value="Asia/Shanghai">Asia/Shanghai (北京时间)</option>
                                        <option value="Asia/Tokyo">Asia/Tokyo (东京)</option>
                                        <option value="America/New_York">America/New_York (纽约)</option>
                                        <option value="Europe/London">Europe/London (伦敦)</option>
                                    </select>
                                ) : (
                                    <div className="text-sm font-medium text-[#111] dark:text-white">{timeZone}</div>
                                )}
                            </div>

                            {/* 简量人设 */}
                            <div className="p-4 rounded-2xl bg-gray-50/30 dark:bg-white/2 border border-black/5 dark:border-white/5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400">简量人设 (帮助在同世界配角聊天中防 OOC)</h3>
                                    {isEditing && (
                                        <button
                                            type="button"
                                            onClick={handleGenerateBrief}
                                            disabled={briefBusy}
                                            className="flex items-center gap-1 h-7 px-2.5 rounded-full bg-[#007aff]/10 text-[#007aff] text-[11px] font-bold active:scale-95 transition-all"
                                        >
                                            <Sparkles size={11} />
                                            <span>{briefBusy ? "生成中…" : "AI 自动生成"}</span>
                                        </button>
                                    )}
                                </div>
                                {isEditing ? (
                                    <textarea
                                        value={briefPersona}
                                        onChange={e => setBriefPersona(e.target.value)}
                                        placeholder="AI 会自动压缩，或手写 100~200 字简介…"
                                        rows={3}
                                        className="w-full p-3 rounded-xl border border-black/10 bg-transparent text-xs resize-none outline-none text-[#111] dark:text-white focus:ring-2 focus:ring-[#007aff]/30"
                                    />
                                ) : (
                                    <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{briefPersona || "暂无简介，点击编辑可让 AI 自动生成"}</p>
                                )}
                                {briefError && <div className="text-xs text-red-500">{briefError}</div>}
                            </div>
                        </div>
                    )}

                    {activeSection === "persona" && (
                        <div className="space-y-4 flex flex-col h-full">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-gray-400 dark:text-gray-500">性格特征</label>
                                {isEditing ? (
                                    <textarea
                                        value={personality}
                                        onChange={e => setPersonality(e.target.value)}
                                        placeholder="例如：冷酷孤傲，但对认定的人极度忠诚可靠…"
                                        rows={2}
                                        className="w-full p-3 rounded-xl border border-black/10 bg-transparent text-xs resize-none outline-none text-[#111] dark:text-white focus:ring-2 focus:ring-[#007aff]/30"
                                    />
                                ) : (
                                    <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{personality || "未填写性格特征"}</p>
                                )}
                            </div>

                            <div className="flex-1 flex flex-col gap-1.5 min-h-[200px]">
                                <label className="text-xs font-semibold text-gray-400 dark:text-gray-500">完整核心设定文本</label>
                                {isEditing ? (
                                    <textarea
                                        value={persona}
                                        onChange={e => setPersona(e.target.value)}
                                        placeholder="在这里填写角色的全部背景经历、属性、喜好等设定细节…"
                                        className="w-full flex-1 p-3 rounded-xl border border-black/10 bg-transparent text-xs resize-none outline-none text-[#111] dark:text-white focus:ring-2 focus:ring-[#007aff]/30 min-h-[240px]"
                                    />
                                ) : (
                                    <div className="flex-1 rounded-xl bg-gray-50/50 dark:bg-white/2 p-3 border border-black/5 dark:border-white/5 overflow-y-auto max-h-[300px]">
                                        <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap font-mono">{persona || "暂无核心人设设定"}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeSection === "governance" && (
                        <div className="space-y-4">
                            <CharacterGovernancePanel
                                character={{ ...char, name, persona, personality, tags }}
                                onChange={(updates) => {
                                    if (updates.name !== undefined) setName(updates.name);
                                    if (updates.persona !== undefined) setPersona(updates.persona);
                                    if (updates.personality !== undefined) setPersonality(updates.personality);
                                }}
                                onNotice={onNotice}
                            />
                        </div>
                    )}

                    {activeSection === "image" && (
                        <div className="space-y-4">
                            {/* 形象生成和面部参考图上传等 */}
                            <div className="p-4 rounded-2xl bg-gray-50/30 dark:bg-white/2 border border-black/5 dark:border-white/5 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400">面部锁定参考图</h4>
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400">待生图模块接通</span>
                                </div>
                                <p className="text-[11px] text-gray-400 leading-relaxed">
                                    上传该角色的面部参考图，未来在生成朋友圈合影或互动图片时，将基于此图进行锁脸生图。
                                </p>
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isEditing) {
                                                onNotice("由于生图模型后端暂未接通，参考图上传仅作本地保存资产。");
                                            }
                                        }}
                                        className="w-16 h-16 rounded-xl border border-dashed border-gray-300 dark:border-white/10 flex flex-col items-center justify-center text-gray-400 hover:border-[#007aff] hover:text-[#007aff] shrink-0"
                                    >
                                        <Camera size={16} />
                                        <span className="text-[9px] mt-1">上传</span>
                                    </button>
                                    <div className="text-xs text-gray-400">
                                        参考图已保存，生成功能待接入。
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 销毁确认 Modal */}
            {confirmDelete && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-sm bg-white dark:bg-[#1c1c1e] rounded-2xl p-5 border border-black/8 dark:border-white/8 shadow-2xl">
                        <h4 className="text-base font-bold text-red-500 mb-2 flex items-center gap-2">
                            <ShieldAlert size={18} />
                            <span>确认销毁角色？</span>
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
                            销毁该角色将一并清除其在所有世界中的归属信息与对话备忘录。此操作将无法撤销。
                        </p>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setConfirmDelete(false)}
                                className="flex-1 h-9 rounded-xl border border-black/10 text-gray-700 text-xs font-semibold"
                            >
                                我再想想
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setConfirmDelete(false);
                                    onDelete();
                                }}
                                className="flex-1 h-9 rounded-xl bg-red-500 text-white text-xs font-semibold"
                            >
                                确认销毁
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
