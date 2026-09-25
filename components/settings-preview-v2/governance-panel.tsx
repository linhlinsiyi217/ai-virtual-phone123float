"use client";

import { useState } from "react";
import { Sparkles, Eye, EyeOff, Plus, Trash2, ShieldAlert, Sliders, MessageSquareX } from "lucide-react";
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
    character.governancePresets || [{ id: "default", name: "3.0pro 方案", oocPatchPrompt: character.oocPatchPrompt || "", riskReportPrompt: character.riskReportPrompt || "", updatedAt: new Date().toISOString() }]
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
      const generatedPatch = `### 说话偏好与语气管控规则 (OOC Guardrails)\n* %禁止句式与暗喻%: 严禁使用如 "${rawComplaint.trim()}" 等缺乏真诚感或脱离人设背景的套话/土味台词。\n* %沟通要求%: 保持自然流畅、符合角色身份的表述，拒绝任何黑话、金融借贷暗喻或机械复读。`;
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
      const generatedReport = `[模型自检与风控约束方案 - ${charName.toUpperCase()}]\n* 风险排查 (Model Self-Inspection):\n- 冗余回复风险 (Verbosity Risk): 避免过于罗嗦或死板的主动引导。对话应保持简练、克制。\n- 标点与腔调漂移 (Punctuation & Tone Drift): 严禁输出机械化问候或浮夸的舞台剧强调语。`;
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
    <div className="space-y-4 pt-3 border-t border-white/10 mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">人格治理系统 (活人感与风控)</h3>
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

      {/* 1. 禁词表 */}
      <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquareX size={16} className="text-red-400" />
            <span className="text-xs font-semibold text-white">禁词表规则</span>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !bannedWordsEnabled;
              setBannedWordsEnabled(next);
              onChange({ bannedWordsEnabled: next });
            }}
            className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium transition-colors ${
              bannedWordsEnabled ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-white/10 text-white/50"
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
                placeholder="输入讨厌的口癖/违禁词..."
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
                    <button type="button" onClick={() => removeBannedWord(word)} className="hover:text-red-100 font-bold ml-1">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 2. OOC 吐槽与指令专业化 */}
      <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white/80">OOC 吐槽与自动管控指令</span>
          <button
            type="button"
            onClick={handleProfessionalizeOoc}
            disabled={isGeneratingOoc}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 active:scale-95 transition-all"
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
          placeholder="写下跟 TA 聊天时让你难受的话（如：不要说'连本带利地讨回来'了！你是男朋友不是放高利贷的）..."
          rows={2}
          className="w-full bg-white/5 border border-white/10 rounded-xl p-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500"
        />

        {oocPatchPrompt && (
          <div className="relative p-3 rounded-xl bg-purple-950/30 border border-purple-500/20 text-xs text-purple-200">
            <div className="flex justify-between items-center mb-1">
              <span className="font-semibold text-[11px] text-purple-300">已注入的专业补丁指令：</span>
              <button
                type="button"
                onClick={() => {
                  setOocPatchPrompt("");
                  onChange({ oocPatchPrompt: "" });
                }}
                className="text-purple-400 hover:text-purple-200 text-[10px]"
              >
                清除补丁
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed m-0 text-purple-200/90">
              {oocPatchPrompt}
            </pre>
          </div>
        )}
      </div>

      {/* 3. 风控报告自检 */}
      <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ShieldAlert size={14} className="text-amber-400" />
            <span className="text-xs font-semibold text-white/80">模型风控自检报告</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGenerateRiskReport}
              disabled={isGeneratingRisk}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 active:scale-95 transition-all"
            >
              <Sparkles size={12} />
              <span>{isGeneratingRisk ? "分析中..." : "生成报告"}</span>
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
                title={isRiskCollapsed ? "展开报告" : "折叠报告"}
              >
                {isRiskCollapsed ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            )}
          </div>
        </div>

        {riskReportPrompt && !isRiskCollapsed && (
          <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/20 text-xs text-amber-200">
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed m-0 text-amber-200/90 max-h-48 overflow-y-auto">
              {riskReportPrompt}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
