"use client";

import { useState, useCallback } from "react";
import { Plus, ChevronRight, Link2, Users, X, Check, AlertCircle } from "lucide-react";
import type { CharacterWorldGroup, CharacterWorldRelation } from "@/lib/character-world-storage";
import {
    addCharacterWorldRelation,
    deleteCharacterWorldRelation,
    loadCharacterWorldGroups,
    updateCharacterWorldDescription,
} from "@/lib/character-world-storage";
import { generateSupportingCharacters, materializeSupportingCharacter, type GeneratedSupportingCharacter } from "@/lib/npc-generator";
import { loadCharacters } from "@/lib/character-storage";
import type { Character } from "@/lib/character-types";

function CharCard({
    char,
    relations,
    allChars,
    onOpen,
}: {
    char: Character;
    relations: CharacterWorldRelation[];
    allChars: Map<string, Character>;
    onOpen: () => void;
}) {
    const myRelations = relations.filter(
        r => r.fromCharacterId === char.id || r.toCharacterId === char.id
    );
    return (
        <button
            type="button"
            onClick={onOpen}
            className="flex items-center gap-3 w-full p-3 rounded-2xl bg-white border border-black/8 text-left active:scale-[0.98] transition-all shadow-sm"
        >
            <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 shrink-0">
                {char.avatar ? (
                    <img src={char.avatar} alt={char.name} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-300 to-gray-400 text-white text-lg font-bold">
                        {(char.name || "?")[0]}
                    </div>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-[#111] truncate">{char.name || "未命名"}</div>
                <div className="text-xs text-gray-400 truncate mt-0.5">
                    {char.tags?.length ? char.tags.slice(0, 3).join(" · ") : (char.persona?.slice(0, 40) || "暂无简介")}
                </div>
                {myRelations.length > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                        <Link2 size={10} className="text-gray-400 shrink-0" />
                        <span className="text-[11px] text-gray-400 truncate">
                            {myRelations.slice(0, 2).map(r => {
                                const other = allChars.get(r.fromCharacterId === char.id ? r.toCharacterId : r.fromCharacterId);
                                return other ? `${r.label} ${other.name}` : r.label;
                            }).join("、")}
                            {myRelations.length > 2 ? ` 等${myRelations.length}条` : ""}
                        </span>
                    </div>
                )}
            </div>
            <ChevronRight size={16} className="text-gray-300 shrink-0" />
        </button>
    );
}

function NpcGenSheet({
    world,
    characters,
    onDone,
    onCancel,
    onNotice,
}: {
    world: CharacterWorldGroup;
    characters: Character[];
    onDone: (newChars: Character[]) => void;
    onCancel: () => void;
    onNotice: (msg: string) => void;
}) {
    const [busy, setBusy] = useState(false);
    const [candidates, setCandidates] = useState<GeneratedSupportingCharacter[] | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [description, setDescription] = useState("");
    const [count, setCount] = useState(3);

    // 取世界里第一个角色作为生成目标（生成配角以某个已有角色的世界为基准）
    const worldChars = characters.filter(c => world.memberIds.includes(c.id));
    const targetChar = worldChars[0];

    const handleGenerate = async () => {
        if (!targetChar) {
            setError("当前世界没有角色，请先创建至少一个主角再生成配角");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const result = await generateSupportingCharacters(targetChar.id, description, Math.min(count, 5));
            setCandidates(result);
            setSelected(new Set(result.map((_, i) => i)));
        } catch (e) {
            setError(e instanceof Error ? e.message : "生成失败，请检查 API 配置");
        } finally {
            setBusy(false);
        }
    };

    const handleConfirm = () => {
        if (!candidates || !targetChar) return;
        const newChars: Character[] = [];
        for (const i of selected) {
            const c = candidates[i];
            if (!c) continue;
            newChars.push(materializeSupportingCharacter(c, targetChar.id, { placementIndex: i }));
        }
        onDone(newChars);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end justify-center" onClick={onCancel}>
            <div
                className="w-full max-w-lg bg-white rounded-t-3xl overflow-hidden shadow-2xl max-h-[80vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-black/8">
                    <h3 className="text-base font-semibold">AI 生成配角</h3>
                    <button type="button" onClick={onCancel} className="p-1.5 rounded-full bg-gray-100"><X size={16} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                    {!targetChar && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 text-amber-700 text-sm">
                            <AlertCircle size={16} /><span>请先在此世界创建至少一个主角</span>
                        </div>
                    )}
                    <div className="flex items-center gap-3">
                        <div className="flex-1">
                            <label className="text-xs text-gray-500 mb-1 block">生成数量</label>
                            <select value={count} onChange={e => setCount(Number(e.target.value))} className="w-full rounded-xl border border-black/10 bg-gray-50 px-3 py-2 text-sm focus:outline-none">
                                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} 个</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">补充说明（可选）</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder={`为「${world.name}」描述需要的配角类型、背景故事等…`}
                            rows={2}
                            className="w-full rounded-xl border border-black/10 bg-gray-50 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#007aff]/30"
                        />
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-sm">
                            <AlertCircle size={16} /><span>{error}</span>
                        </div>
                    )}

                    {candidates && (
                        <div className="flex flex-col gap-2">
                            <p className="text-xs text-gray-500">选择要添加的配角：</p>
                            {candidates.map((c, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => setSelected(prev => {
                                        const next = new Set(prev);
                                        if (next.has(i)) next.delete(i); else next.add(i);
                                        return next;
                                    })}
                                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                                        selected.has(i) ? "border-[#007aff] bg-[#007aff]/5" : "border-black/8 bg-white"
                                    }`}
                                >
                                    <div className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${
                                        selected.has(i) ? "border-[#007aff] bg-[#007aff]" : "border-gray-300"
                                    }`}>
                                        {selected.has(i) && <Check size={11} className="text-white" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-sm text-[#111]">{c.name}</div>
                                        <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{c.persona}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="p-4 border-t border-black/8 flex gap-2">
                    {!candidates ? (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={handleGenerate}
                            className="flex-1 h-11 rounded-xl bg-[#007aff] text-white font-semibold disabled:opacity-50 active:scale-[0.98] transition-all"
                        >
                            {busy ? "生成中…" : "开始生成"}
                        </button>
                    ) : (
                        <>
                            <button type="button" onClick={() => setCandidates(null)} className="flex-1 h-11 rounded-xl border border-black/10 font-semibold text-gray-700 active:scale-[0.98]">重新生成</button>
                            <button
                                type="button"
                                disabled={selected.size === 0}
                                onClick={handleConfirm}
                                className="flex-1 h-11 rounded-xl bg-[#007aff] text-white font-semibold disabled:opacity-50 active:scale-[0.98] transition-all"
                            >
                                添加 {selected.size > 0 ? `${selected.size} 个` : ""}配角
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export function WorldInteriorView({
    world,
    characters,
    onSelectChar,
    onBack,
    onCharsChanged,
    onNotice,
    onAddChar,
    onImportChar,
}: {
    world: CharacterWorldGroup;
    characters: Character[];
    onSelectChar: (char: Character) => void;
    onBack: () => void;
    onCharsChanged: () => void;
    onNotice: (msg: string) => void;
    onAddChar: () => void;
    onImportChar: () => void;
}) {
    const [showNpcGen, setShowNpcGen] = useState(false);
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [showRelations, setShowRelations] = useState(false);

    const worldChars = characters.filter(c => world.memberIds.includes(c.id));
    const charById = new Map(characters.map(c => [c.id, c]));

    const handleNpcDone = useCallback((newChars: Character[]) => {
        // save is handled by parent via onCharsChanged
        setShowNpcGen(false);
        if (newChars.length > 0) {
            onNotice(`已生成 ${newChars.length} 个配角，请在世界内查看`);
            onCharsChanged();
        }
    }, [onCharsChanged, onNotice]);

    return (
        <div className="char-view-enter flex flex-col h-full bg-[#f7f9fb] dark:bg-[#161a1e]">
            {/* 顶栏 */}
            <div className="char-view-header grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 px-4 pb-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="char-glass-control relative z-[3] w-11 h-11 rounded-full flex items-center justify-center text-gray-700 active:scale-95 shrink-0"
                    aria-label="返回"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <div className="min-w-0 text-center pointer-events-none">
                    <h2 className="text-[16px] font-semibold text-[#111] truncate">{world.name}</h2>
                    {world.description ? <p className="text-xs text-gray-400 truncate">{world.description}</p> : null}
                </div>
                <button
                    type="button"
                    onClick={() => setShowRelations(v => !v)}
                    aria-label="查看角色关系"
                    className={`char-glass-control relative z-[3] w-11 h-11 rounded-full flex items-center justify-center text-[12px] font-medium transition-all ${
                        showRelations ? "text-[#007aff]" : "text-gray-600"
                    }`}
                >
                    <Link2 size={18} />
                </button>
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto px-4 pb-28">
                {worldChars.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Users size={48} className="text-gray-300" />
                        <p className="text-sm text-gray-400 text-center">这个世界还没有角色</p>
                        <button
                            type="button"
                            onClick={onAddChar}
                            className="flex items-center gap-2 h-10 px-4 rounded-xl bg-[#007aff] text-white text-sm font-semibold active:scale-95"
                        >
                            <Plus size={16} /><span>添加角色</span>
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {/* 关系视图 */}
                        {showRelations && world.relations.length > 0 && (
                            <div className="mb-2 p-3 rounded-2xl bg-[#f2f3f7] border border-black/8">
                                <h3 className="text-xs font-semibold text-gray-500 mb-2">角色关系 ({world.relations.length})</h3>
                                <div className="flex flex-col gap-1.5">
                                    {world.relations.map(r => {
                                        const from = charById.get(r.fromCharacterId);
                                        const to = charById.get(r.toCharacterId);
                                        if (!from || !to) return null;
                                        return (
                                            <div key={r.id} className="flex items-center gap-2 text-sm">
                                                <span className="font-medium text-[#111] truncate max-w-[80px]">{from.name}</span>
                                                <span className="text-xs text-gray-400 bg-white px-2 py-0.5 rounded-full border border-black/8 shrink-0">{r.label}</span>
                                                <span className="font-medium text-[#111] truncate max-w-[80px]">{to.name}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {showRelations && world.relations.length === 0 && (
                            <div className="mb-2 p-3 rounded-2xl bg-[#f2f3f7] border border-black/8 text-center">
                                <p className="text-xs text-gray-400">暂无角色关系记录</p>
                            </div>
                        )}

                        {/* 角色卡列表 */}
                        {worldChars.map(char => (
                            <CharCard
                                key={char.id}
                                char={char}
                                relations={world.relations}
                                allChars={charById}
                                onOpen={() => onSelectChar(char)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* 底部 Dock */}
            <div className="fixed bottom-0 left-0 right-0 z-30 flex justify-center pb-[max(20px,env(safe-area-inset-bottom))] pt-3 pointer-events-none">
                <div className="relative pointer-events-auto">
                    {showAddMenu && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 min-w-[150px] bg-white/95 backdrop-blur-xl rounded-2xl border border-black/8 shadow-xl overflow-hidden">
                                <button
                                    type="button"
                                    className="flex items-center gap-2.5 px-4 py-3 text-[13px] font-medium text-[#111] hover:bg-black/5 w-full text-left active:bg-black/10"
                                    onClick={() => { setShowAddMenu(false); onAddChar(); }}
                                >
                                    <Plus size={15} /><span>新建角色</span>
                                </button>
                                <div className="h-px bg-black/6 mx-3" />
                                <button
                                    type="button"
                                    className="flex items-center gap-2.5 px-4 py-3 text-[13px] font-medium text-[#111] hover:bg-black/5 w-full text-left active:bg-black/10"
                                    onClick={() => { setShowAddMenu(false); onImportChar(); }}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                    <span>导入角色</span>
                                </button>
                            </div>
                        </>
                    )}
                    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-full bg-white/85 backdrop-blur-xl border border-black/10 shadow-lg">
                        <button
                            type="button"
                            className="flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[13px] font-semibold text-[#111] hover:bg-black/6 active:scale-95 transition-all"
                            onClick={() => setShowAddMenu(v => !v)}
                        >
                            <Plus size={14} /><span>添加</span>
                        </button>
                        <div className="w-px h-5 bg-black/12" />
                        <button
                            type="button"
                            className="flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[13px] font-semibold text-[#007aff] hover:bg-[#007aff]/8 active:scale-95 transition-all"
                            onClick={() => setShowNpcGen(true)}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                            <span>生成配角</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* NPC 生成弹窗 */}
            {showNpcGen && (
                <NpcGenSheet
                    world={world}
                    characters={characters}
                    onDone={handleNpcDone}
                    onCancel={() => setShowNpcGen(false)}
                    onNotice={onNotice}
                />
            )}
        </div>
    );
}
