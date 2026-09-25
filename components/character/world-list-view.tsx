"use client";

import { useState } from "react";
import { Plus, ChevronRight, Globe, Edit2, Check, X } from "lucide-react";
import type { CharacterWorldGroup } from "@/lib/character-world-storage";
import { createCharacterWorldGroup, renameCharacterWorldGroup, updateCharacterWorldDescription } from "@/lib/character-world-storage";
import type { Character } from "@/lib/character-types";

function CharAvatarMini({ char }: { char: Character }) {
    return (
        <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 shrink-0 border-2 border-white -ml-2 first:ml-0">
            {char.avatar ? (
                <img src={char.avatar} alt={char.name} className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-300 to-gray-400 text-white text-[10px] font-bold">
                    {(char.name || "?")[0]}
                </div>
            )}
        </div>
    );
}

export function WorldListView({
    worldGroups,
    characters,
    onSelectWorld,
    onWorldsChanged,
    onNotice,
}: {
    worldGroups: CharacterWorldGroup[];
    characters: Character[];
    onSelectWorld: (worldId: string) => void;
    onWorldsChanged: () => void;
    onNotice: (msg: string) => void;
}) {
    const [showNewWorld, setShowNewWorld] = useState(false);
    const [newWorldName, setNewWorldName] = useState("");
    const [editingWorldId, setEditingWorldId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");

    const handleCreateWorld = () => {
        const name = newWorldName.trim();
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

    const charById = new Map(characters.map(c => [c.id, c]));

    return (
        <div className="flex flex-col h-full">
            {/* 顶部操作栏 */}
            <div className="flex items-center justify-between px-4 pt-2 pb-3">
                <h2 className="text-[17px] font-semibold text-[#111]">角色卷宗</h2>
                <button
                    type="button"
                    onClick={() => setShowNewWorld(true)}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#007aff] text-white text-[13px] font-semibold active:scale-95 transition-all"
                >
                    <Plus size={14} />
                    <span>新建世界</span>
                </button>
            </div>

            {/* 新建世界输入 */}
            {showNewWorld && (
                <div className="mx-4 mb-3 flex items-center gap-2 p-3 rounded-2xl bg-[#f2f3f7] border border-black/8">
                    <input
                        autoFocus
                        type="text"
                        value={newWorldName}
                        onChange={e => setNewWorldName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleCreateWorld(); if (e.key === "Escape") setShowNewWorld(false); }}
                        placeholder="世界名称…"
                        className="flex-1 bg-transparent text-sm text-[#111] outline-none placeholder:text-gray-400"
                    />
                    <button type="button" onClick={handleCreateWorld} className="p-1.5 rounded-full bg-[#007aff] text-white active:scale-95"><Check size={14} /></button>
                    <button type="button" onClick={() => setShowNewWorld(false)} className="p-1.5 rounded-full bg-gray-200 text-gray-600 active:scale-95"><X size={14} /></button>
                </div>
            )}

            {/* 世界列表 */}
            <div className="flex-1 overflow-y-auto px-4 pb-8">
                {worldGroups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Globe size={48} className="text-gray-300" />
                        <p className="text-sm text-gray-400 text-center">还没有世界，点击「新建世界」开始</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {worldGroups.map(world => {
                            const members = world.memberIds
                                .map(id => charById.get(id))
                                .filter((c): c is Character => !!c);
                            const preview = members.slice(0, 5);
                            const isEditing = editingWorldId === world.id;

                            return (
                                <div
                                    key={world.id}
                                    className="relative overflow-hidden rounded-2xl bg-white border border-black/8 shadow-sm active:scale-[0.99] transition-all"
                                >
                                    <button
                                        type="button"
                                        className="w-full text-left p-4"
                                        onClick={() => !isEditing && onSelectWorld(world.id)}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                {isEditing ? (
                                                    <input
                                                        autoFocus
                                                        type="text"
                                                        value={editingName}
                                                        onChange={e => setEditingName(e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === "Enter") handleRenameWorld(world.id);
                                                            if (e.key === "Escape") setEditingWorldId(null);
                                                        }}
                                                        onClick={e => e.stopPropagation()}
                                                        className="w-full text-base font-semibold text-[#111] bg-transparent border-b border-[#007aff] outline-none pb-0.5"
                                                    />
                                                ) : (
                                                    <div className="text-base font-semibold text-[#111] truncate">{world.name}</div>
                                                )}
                                                {world.description ? (
                                                    <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{world.description}</div>
                                                ) : null}
                                                <div className="text-xs text-gray-400 mt-1">
                                                    {members.length === 0 ? "暂无角色" : `${members.length} 个角色`}
                                                    {world.relations.length > 0 ? ` · ${world.relations.length} 条关系` : ""}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                {isEditing ? (
                                                    <>
                                                        <button type="button" onClick={e => { e.stopPropagation(); handleRenameWorld(world.id); }} className="p-1.5 rounded-full bg-[#007aff] text-white"><Check size={13} /></button>
                                                        <button type="button" onClick={e => { e.stopPropagation(); setEditingWorldId(null); }} className="p-1.5 rounded-full bg-gray-200 text-gray-600"><X size={13} /></button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={e => { e.stopPropagation(); setEditingWorldId(world.id); setEditingName(world.name); }}
                                                            className="p-1.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
                                                        >
                                                            <Edit2 size={13} />
                                                        </button>
                                                        <ChevronRight size={18} className="text-gray-300" />
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* 角色头像预览 */}
                                        {preview.length > 0 && (
                                            <div className="flex items-center mt-3">
                                                {preview.map(c => <CharAvatarMini key={c.id} char={c} />)}
                                                {members.length > 5 && (
                                                    <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white -ml-2 flex items-center justify-center text-[10px] text-gray-500 font-semibold">
                                                        +{members.length - 5}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
