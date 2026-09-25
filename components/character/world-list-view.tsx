"use client";

import { useState } from "react";
import { Plus, ChevronLeft, ChevronRight, Edit2, Check, X, FolderPlus } from "lucide-react";
import type { CharacterWorldGroup } from "@/lib/character-world-storage";
import { createCharacterWorldGroup, renameCharacterWorldGroup } from "@/lib/character-world-storage";
import type { Character } from "@/lib/character-types";

function FolderCover({ 
    members 
}: { 
    members: Character[] 
}) {
    const preview = members.slice(0, 3);
    return (
        <div className="relative w-full aspect-[4/3] rounded-xl bg-gradient-to-b from-gray-100/40 to-gray-200/20 dark:from-white/5 dark:to-white/2 border border-black/5 dark:border-white/5 overflow-hidden flex items-center justify-center">
            {/* 文件夹背面叠纸层 */}
            <div className="absolute inset-x-3 top-2 bottom-1 rounded bg-white/60 dark:bg-white/5 shadow-sm transform -rotate-2" />
            <div className="absolute inset-x-2 top-3 bottom-1 rounded bg-white/80 dark:bg-white/10 shadow-sm transform rotate-1" />
            
            {/* 夹在中间的角色头像照片 */}
            <div className="absolute inset-0 flex items-center justify-center gap-1.5 px-4 z-10">
                {preview.length === 0 ? (
                    <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-gray-400 dark:text-gray-600">
                        ?
                    </div>
                ) : (
                    preview.map((m, idx) => {
                        const rot = idx === 0 ? "-rotate-6 translate-x-1" : idx === 2 ? "rotate-6 -translate-x-1" : "z-20 scale-105 translate-y-[-2px]";
                        return (
                            <div 
                                key={m.id} 
                                className={`w-11 h-11 rounded-lg overflow-hidden border-2 border-white dark:border-gray-800 shadow-md transform ${rot} shrink-0 transition-transform hover:scale-110`}
                            >
                                {m.avatar ? (
                                    <img src={m.avatar} alt={m.name} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-400 to-purple-500 text-white text-[11px] font-bold">
                                        {(m.name || "?")[0]}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* 文件夹半透正面珍珠玻璃卡片，带有标签切口 Tab */}
            <div className="absolute inset-x-0 bottom-0 top-1/3 bg-white/40 dark:bg-[#1c1c1e]/40 backdrop-blur-[6px] border-t border-white/20 dark:border-white/10 rounded-b-xl z-20 flex items-end p-2.5">
                {/* 模拟 Tab 标签 */}
                <div className="absolute left-3 top-[-10px] h-3.5 w-12 bg-white/40 dark:bg-[#1c1c1e]/40 backdrop-blur-[6px] border-t border-x border-white/20 dark:border-white/10 rounded-t-md" />
                <div className="w-full h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-[#007aff] rounded-full transition-all duration-500" 
                        style={{ width: `${Math.min(100, Math.max(10, members.length * 10))}%` }} 
                    />
                </div>
            </div>
        </div>
    );
}

export function WorldListView({
    worldGroups,
    characters,
    onSelectWorld,
    onWorldsChanged,
    onNotice,
    onClose,
}: {
    worldGroups: CharacterWorldGroup[];
    characters: Character[];
    onSelectWorld: (worldId: string) => void;
    onWorldsChanged: () => void;
    onNotice: (msg: string) => void;
    onClose?: () => void;
}) {
    const [showNewWorld, setShowNewWorld] = useState(false);
    const [newWorldName, setNewWorldName] = useState("");
    const [editingWorldId, setEditingWorldId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");
    const [page, setPage] = useState(0);

    const charById = new Map(characters.map(c => [c.id, c]));

    const handleCreateWorld = (customName?: string) => {
        const name = (customName || newWorldName).trim();
        if (!name) { onNotice("请输入世界名称"); return; }
        createCharacterWorldGroup(name);
        setNewWorldName("");
        setShowNewWorld(false);
        onWorldsChanged();
        onNotice(`已创建「${name}」`);
    };

    const handleRenameWorld = (worldId: string) => {
        const name = editingName.trim();
        if (!name) return;
        renameCharacterWorldGroup(worldId, name);
        setEditingWorldId(null);
        onWorldsChanged();
    };

    // 每页 6 个位置，做六宫格
    const PAGE_SIZE = 6;
    const totalPages = Math.max(1, Math.ceil((worldGroups.length + 1) / PAGE_SIZE));
    
    // 我们在这个页面将已有世界按稳定顺序占位，并支持占位符
    const displayItems = [...worldGroups];

    // 获取当前页的项目
    const pageItems = displayItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    
    // 如果当前页不足 6 个，且是最后一页，用“新建世界”占位符补齐到 6 个
    const renderSlots = [...pageItems];
    const slotsNeeded = PAGE_SIZE - renderSlots.length;
    for (let i = 0; i < slotsNeeded; i++) {
        // 我们只在最后一页或者空页放置一个可点击的“新增世界占位符”
        renderSlots.push({
            id: `placeholder-${page}-${i}`,
            name: "+ 新建世界观",
            description: "点击快速创建新世界",
            memberIds: [],
            relations: [],
            createdAt: "",
            updatedAt: "",
            isPlaceholder: true,
        } as any);
    }

    return (
        <div className="flex flex-col h-full bg-white dark:bg-[#16161a]">
            {/* 顶栏：不重叠、有安全高 */}
            <div className="flex items-center gap-3 px-4 pt-12 pb-3 border-b border-black/5 dark:border-white/5">
                {onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-700 dark:text-gray-300 active:scale-95 shrink-0"
                        aria-label="返回上一页"
                    >
                        <ChevronLeft size={20} strokeWidth={2.5} />
                    </button>
                )}
                <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold text-[#111] dark:text-white truncate">角色卷宗</h2>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">双击或点编辑图标可修改世界名称</p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowNewWorld(true)}
                    className="flex items-center gap-1 h-8 px-3 rounded-full bg-[#007aff] text-white text-[12px] font-semibold active:scale-95 transition-all shrink-0"
                >
                    <Plus size={14} />
                    <span>新建世界</span>
                </button>
            </div>

            {/* 新建世界临时弹窗/输入框 */}
            {showNewWorld && (
                <div className="mx-4 mt-3 flex items-center gap-2 p-3 rounded-2xl bg-gray-50 dark:bg-white/5 border border-black/8 dark:border-white/8">
                    <input
                        autoFocus
                        type="text"
                        value={newWorldName}
                        onChange={e => setNewWorldName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleCreateWorld(); if (e.key === "Escape") setShowNewWorld(false); }}
                        placeholder="世界观名称，例：赛博朋克大都会"
                        className="flex-1 bg-transparent text-sm text-[#111] dark:text-white outline-none placeholder:text-gray-400"
                    />
                    <button type="button" onClick={() => handleCreateWorld()} className="p-1.5 rounded-full bg-[#007aff] text-white active:scale-95"><Check size={14} /></button>
                    <button type="button" onClick={() => setShowNewWorld(false)} className="p-1.5 rounded-full bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-400 active:scale-95"><X size={14} /></button>
                </div>
            )}

            {/* 文件夹六宫格网格 */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-between">
                <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                    {renderSlots.map((item: any, index) => {
                        if (item.isPlaceholder) {
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                        const name = prompt("请输入新世界名称：");
                                        if (name) handleCreateWorld(name);
                                    }}
                                    className="flex flex-col items-center justify-center aspect-[4/3] rounded-2xl border-2 border-dashed border-gray-200 dark:border-white/10 hover:border-[#007aff] dark:hover:border-[#007aff] hover:bg-[#007aff]/2 transition-all p-4 group"
                                >
                                    <FolderPlus size={28} className="text-gray-300 dark:text-gray-600 group-hover:text-[#007aff] transition-colors" />
                                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500 group-hover:text-[#007aff] transition-colors mt-2">
                                        {item.name}
                                    </span>
                                </button>
                            );
                        }

                        const members = item.memberIds
                            .map((id: string) => charById.get(id))
                            .filter((c: any): c is Character => !!c);
                        const isEditing = editingWorldId === item.id;

                        return (
                            <div 
                                key={item.id} 
                                className="flex flex-col gap-2 group relative"
                            >
                                <button
                                    type="button"
                                    onClick={() => !isEditing && onSelectWorld(item.id)}
                                    className="w-full text-left transition-transform active:scale-[0.97]"
                                >
                                    <FolderCover members={members} />
                                </button>

                                <div className="px-1 flex items-start justify-between gap-1">
                                    <div className="min-w-0 flex-1">
                                        {isEditing ? (
                                            <input
                                                autoFocus
                                                type="text"
                                                value={editingName}
                                                onChange={e => setEditingName(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === "Enter") handleRenameWorld(item.id);
                                                    if (e.key === "Escape") setEditingWorldId(null);
                                                }}
                                                className="w-full text-xs font-semibold text-[#111] dark:text-white bg-transparent border-b border-[#007aff] outline-none"
                                            />
                                        ) : (
                                            <div 
                                                className="text-xs font-semibold text-[#111] dark:text-white truncate cursor-pointer"
                                                onDoubleClick={() => { setEditingWorldId(item.id); setEditingName(item.name); }}
                                            >
                                                {item.name}
                                            </div>
                                        )}
                                        <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                                            {members.length} 个角色 · {item.relations?.length || 0} 关系
                                        </div>
                                    </div>
                                    
                                    {!isEditing && (
                                        <button
                                            type="button"
                                            onClick={() => { setEditingWorldId(item.id); setEditingName(item.name); }}
                                            className="p-1 rounded-full bg-gray-50 dark:bg-white/5 text-gray-400 hover:text-[#007aff] transition-colors shrink-0"
                                            title="重命名"
                                        >
                                            <Edit2 size={10} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* 翻页指示器 */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t border-black/5 dark:border-white/5">
                        <button
                            type="button"
                            disabled={page === 0}
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 disabled:opacity-40 flex items-center justify-center active:scale-90 transition-all"
                        >
                            <ChevronLeft size={16} strokeWidth={2.5} />
                        </button>
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                            {page + 1} / {totalPages}
                        </span>
                        <button
                            type="button"
                            disabled={page === totalPages - 1}
                            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                            className="w-8 h-8 rounded-full bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 disabled:opacity-40 flex items-center justify-center active:scale-90 transition-all"
                        >
                            <ChevronRight size={16} strokeWidth={2.5} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
