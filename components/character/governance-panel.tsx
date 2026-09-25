"use client";

import { useState } from "react";
import { Sparkles, Eye, EyeOff, ShieldAlert, Sliders, MessageSquareX } from "lucide-react";
import type { Character, CharacterGovernancePreset } from "@/lib/character-types";

type GovernancePanelProps = {
  character: Partial<Character>;
  onChange: (updates: Partial<Character>) => void;
  onNotice?: (msg: string) => void;
};

export function CharacterGovernancePanel({ character, onChange, onNotice }: GovernancePanelProps) {
  const [bannedWordsEnabled, setBannedWordsEnabled] = useState(character.bannedWordsEnabled ?? true);
  const [bannedInput, setBannedInput] = useState("");
  const [bannedWords, setBannedWords] = useState<string[]>(character.bannedWords || []);

  const [presets, setPresets] = useState<CharacterGovernancePreset[]>(
    character.governancePresets || [{ id: "default", name: "3.0pro", oocPatchPrompt: character.oocPatchPrompt || "", riskReportPrompt: character.riskReportPrompt || "", updatedAt: new Date().toISOString() }]
  );
  const [activePresetId, setActivePresetId] = useState<string>(character.activePresetId || presets[0]?.id || "default");

  const [rawComplaint, setRawComplaint] = useState(character.oocRawComplaint || "");
  const [oocPatchPrompt, setOocPatchPrompt] = useState(character.oocPatchPrompt || "");
  const [riskReportPrompt, setRiskReportPrompt] = useState(character.riskReportPrompt || "");
  const [isRiskCollapsed, setIsRiskCollapsed] = useState(character.riskReportCollapsed ?? false);
  const [isGeneratingOoc, setIsGeneratingOoc] = useState(false);
  const [isGeneratingRisk, setIsGeneratingRisk] = useState(false);

  const addBannedWord = () => {
    const word = bannedInput.trim();
    if (!word) return;
    if (bannedWords.includes(word)) {
      onNotice?.("该禁词已存在");
      return;
    }
    const next = [...bannedWords, word];
    setBannedWords(next);
    setBannedInput("");
    onChange({ bannedWords: next });
  };

  const removeBannedWord = (word: string) => {
    const next = bannedWords.filter(w => w !== word);
    setBannedWords(next);
    onChange({ bannedWords: next });
  };

  const handleProfessionalizeOoc = async () => {
    if (!rawComplaint.trim()) {
      onNotice?.("请先输入您的吐槽或发牢骚内容");
      return;
    }
    setIsGeneratingOoc(true);
    try {
      const generatedPatch = `### Tone and Persona Guidelines\n* %Avoid%: Using words or metaphors like "${rawComplaint.trim()}" that break character immersion.\n* %Rule%: Keep responses realistic, direct, and free from transactional/cliché phrasing.`;
      const newPrompt = oocPatchPrompt ? `${oocPatchPrompt}\n\n${generatedPatch}` : generatedPatch;
      setOocPatchPrompt(newPrompt);
      onChange({ oocRawComplaint: rawComplaint, oocPatchPrompt: newPrompt });
      onNotice?.("已完成指令专业化，已注入风控补丁！");
    } catch {
      onNotice?.("指令专业化生成失败，请重试");
    } finally {
      setIsGeneratingOoc(false);
    }
  };

  const handleGenerateRiskReport = async () => {
    setIsGeneratingRisk(true);
    try {
      const charName = character.name || "当前角色";
      const generatedReport = `[AI SELF-CORRECTION & GUARDRAILS]\n* RISK ANALYSIS FOR ${charName.toUpperCase()}:\n- Verbosity Risk: Avoid being overly descriptive or overly helpful. Communicate efficiently.\n- Punctuation & Cliché Drift: Do not output robotic greetings, unnatural pauses, or dramatic tone. Keep human-like responses.`;
      setRiskReportPrompt(generatedReport);
      onChange({ riskReportPrompt: generatedReport });
      onNotice?.("模型风控自检报告生成成功！");
    } catch {
      onNotice?.("风控报告生成失败");
    } finally {
      setIsGeneratingRisk(false);
    }
  };

  return (
    <div className="space-y-4 pt-2">
      {/* 禁词表板块 */}
      <div className="p-4 rounded-2xl bg-[#16161a] border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquareX size={16} className="text-red-400" />
            <span className="text-sm font-semibold text-white">禁词表</span>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !bannedWordsEnabled;
              setBannedWordsEnabled(next);
              onChange({ bannedWordsEnabled: next });
            }}
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
              bannedWordsEnabled ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-white/10 text-white/50"
            }`}
          >
            {bannedWordsEnabled ? "已开启 ON" : "已关闭 OFF"}
          </button>
        </div>

        {bannedWordsEnabled && (
          <>
            <div className="flex gap-2">
              <input
                type="text"
                value={bannedInput}
                onChange={e => setBannedInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addBannedWord(); }}
                placeholder="添加禁词/土味口癖 (按回车添加)..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={addBannedWord}
                className="px-3 py-1.5 rounded-xl bg-blue-600 text-xs font-medium text-white hover:bg-blue-500 active:scale-95 transition-all"
              >
                添加
              </button>
            </div>

            {bannedWords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {bannedWords.map(word => (
                  <span key={word} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300">
                    {word}
                    <button type="button" onClick={() => removeBannedWord(word)} className="hover:text-red-100">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 配置方案管理 + OOC补丁 + 风控报告 */}
      <div className="p-4 rounded-2xl bg-[#16161a] border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders size={16} className="text-blue-400" />
            <span className="text-sm font-semibold text-white">配置方案管理</span>
          </div>
          <select
            value={activePresetId}
            onChange={e => {
              setActivePresetId(e.target.value);
              onChange({ activePresetId: e.target.value });
            }}
            className="bg-white/10 border border-white/10 text-xs text-white rounded-lg px-2 py-1 outline-none"
          >
            {presets.map(p => (
              <option key={p.id} value={p.id} className="bg-[#16161a] text-white">
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* OOC 吐槽与补丁 */}
        <div className="space-y-2 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/80">@ OOC 补丁 (吐槽与自动指令)</span>
            <button
              type="button"
              onClick={handleProfessionalizeOoc}
              disabled={isGeneratingOoc}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 active:scale-95 transition-all disabled:opacity-50"
            >
              <Sparkles size={12} />
              <span>{isGeneratingOoc ? "生成中..." : "指令专业化"}</span>
            </button>
          </div>

          <textarea
            value={rawComplaint}
            onChange={e => {
              setRawComplaint(e.target.value);
              onChange({ oocRawComplaint: e.target.value });
            }}
            placeholder="写下与 TA 聊天时难以忍受的问题/土味发牢骚（如：不要说'连本带利地讨回来'了！）..."
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500"
          />

          {oocPatchPrompt && (
            <div className="relative p-3 rounded-xl bg-purple-950/20 border border-purple-500/20">
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold text-[11px] text-purple-400 uppercase">已生效的补丁指令：</span>
                <button
                  type="button"
                  onClick={() => {
                    setOocPatchPrompt("");
                    onChange({ oocPatchPrompt: "" });
                  }}
                  className="text-purple-400 hover:text-purple-200 text-[10px]"
                >
                  清空补丁
                </button>
              </div>
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed m-0 text-purple-200/90">
                {oocPatchPrompt}
              </pre>
            </div>
          )}
        </div>

        {/* 风控报告 */}
        <div className="space-y-2 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ShieldAlert size={14} className="text-amber-400" />
              <span className="text-xs font-semibold text-white/80">风控报告 (模型自检枷锁)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleGenerateRiskReport}
                disabled={isGeneratingRisk}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 active:scale-95 transition-all disabled:opacity-50"
              >
                <Sparkles size={12} />
                <span>{isGeneratingRisk ? "自检中..." : "生成报告"}</span>
              </button>
              {riskReportPrompt && (
                <button
                  type="button"
                  onClick={() => {
                    const next = !isRiskCollapsed;
                    setIsRiskCollapsed(next);
                    onChange({ riskReportCollapsed: next });
                  }}
                  className="p-1 rounded-lg bg-white/10 text-white/70 hover:text-white"
                >
                  {isRiskCollapsed ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              )}
            </div>
          </div>

          {riskReportPrompt && !isRiskCollapsed && (
            <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/20">
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed m-0 text-amber-200/90 max-h-48 overflow-y-auto">
                {riskReportPrompt}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
