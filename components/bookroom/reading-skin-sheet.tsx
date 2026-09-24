"use client";

import { useState } from "react";
import { ChevronRight, Copy, Download, FileJson, Plus, Trash2, Upload } from "lucide-react";
import { BottomSheet, BrToast } from "./bookroom-ui";
import {
  DEFAULT_SKIN,
  deleteReadingSkin,
  duplicateReadingSkin,
  exportReadingSkin,
  importReadingSkin,
  listReadingSkins,
  loadActiveSkinId,
  saveReadingSkin,
  setActiveSkinId,
  type ReadingSkin,
} from "@/lib/bookroom-reading-skins";

type Props = {
  onClose: () => void;
};

type Tab = "list" | "editor" | "css";

type EditorSection = "background" | "typography" | "chapter" | "page" | "tools" | "overlay" | "css";

function defaultNewSkin(): Omit<ReadingSkin, "id" | "createdAt" | "updatedAt"> {
  return {
    version: 1,
    name: "新皮肤",
    background: { type: "solid", value: "#FFFFFF" },
    typography: { ...DEFAULT_SKIN.typography },
    chapter: { ...DEFAULT_SKIN.chapter },
    page: { ...DEFAULT_SKIN.page },
    tools: { ...DEFAULT_SKIN.tools },
    overlay: { ...DEFAULT_SKIN.overlay },
    customCss: "",
  };
}

/** 阅读皮肤工作室 */
export function ReadingSkinSheet({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>("list");
  const [skins, setSkins] = useState<ReadingSkin[]>(() => listReadingSkins());
  const [activeId, setActiveId] = useState<string | null>(() => loadActiveSkinId());
  const [editing, setEditing] = useState<ReadingSkin | null>(null);
  const [editorSection, setEditorSection] = useState<EditorSection>("background");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 1500);
  };

  const handleCreate = () => {
    const skin = saveReadingSkin(defaultNewSkin());
    setSkins(listReadingSkins());
    setEditing(skin);
    setTab("editor");
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("确定删除这个皮肤吗？")) return;
    deleteReadingSkin(id);
    setSkins(listReadingSkins());
    if (activeId === id) setActiveId(null);
    showToast("已删除");
  };

  const handleDuplicate = (id: string) => {
    duplicateReadingSkin(id);
    setSkins(listReadingSkins());
    showToast("已复制");
  };

  const handleExport = (skin: ReadingSkin) => {
    const blob = new Blob([exportReadingSkin(skin)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${skin.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("已导出");
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const skin = importReadingSkin(text);
        if (skin) {
          setSkins(listReadingSkins());
          showToast("导入成功");
        } else {
          showToast("导入失败，文件格式不正确");
        }
      } catch {
        showToast("导入失败");
      }
    };
    input.click();
  };

  const handleActivate = (id: string) => {
    setActiveSkinId(id);
    setActiveId(id);
    showToast("已启用");
  };

  const handleSaveEdit = () => {
    if (!editing) return;
    saveReadingSkin({ ...editing, id: editing.id });
    setSkins(listReadingSkins());
    showToast("已保存");
  };

  return (
    <BottomSheet title="阅读皮肤" onClose={onClose} panelClassName="br-sheet-tall">
      {tab === "list" && (
        <>
          <div className="br-skin-actions">
            <button type="button" className="br-skin-action-btn book-pressable" onClick={handleCreate}>
              <Plus size={16} />
              新建皮肤
            </button>
            <button type="button" className="br-skin-action-btn book-pressable" onClick={handleImport}>
              <Upload size={16} />
              导入
            </button>
          </div>
          <div className="br-skin-list">
            {skins.length === 0 && (
              <div className="br-skin-empty">
                <p>还没有阅读皮肤</p>
                <p className="br-skin-empty-sub">新建一个皮肤来美化你的阅读体验。</p>
              </div>
            )}
            {skins.map(skin => (
              <div key={skin.id} className={`br-skin-card book-glass ${activeId === skin.id ? "is-active" : ""}`}>
                <div className="br-skin-card-header">
                  <span className="br-skin-card-name">{skin.name}</span>
                  {activeId === skin.id && <span className="br-skin-active-badge">已启用</span>}
                </div>
                <div className="br-skin-card-preview" style={{ background: skin.background.type === "solid" ? skin.background.value : undefined }}>
                  <span className="br-skin-card-typo" style={{ fontSize: `${skin.typography.fontSize}px` }}>
                    Aa
                  </span>
                </div>
                <div className="br-skin-card-actions">
                  <button type="button" className="br-skin-card-btn book-pressable" onClick={() => handleActivate(skin.id)}>
                    启用
                  </button>
                  <button type="button" className="br-skin-card-btn book-pressable" onClick={() => { setEditing(skin); setTab("editor"); }}>
                    编辑
                  </button>
                  <button type="button" className="br-skin-card-btn book-pressable" onClick={() => handleDuplicate(skin.id)}>
                    <Copy size={14} />
                  </button>
                  <button type="button" className="br-skin-card-btn book-pressable" onClick={() => handleExport(skin)}>
                    <Download size={14} />
                  </button>
                  <button type="button" className="br-skin-card-btn is-danger book-pressable" onClick={() => handleDelete(skin.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "editor" && editing && (
        <SkinEditor
          skin={editing}
          section={editorSection}
          onSectionChange={setEditorSection}
          onChange={setEditing}
          onSave={handleSaveEdit}
          onBack={() => setTab("list")}
        />
      )}

      <BrToast text={toast} />
    </BottomSheet>
  );
}

function SkinEditor({
  skin,
  section,
  onSectionChange,
  onChange,
  onSave,
  onBack,
}: {
  skin: ReadingSkin;
  section: EditorSection;
  onSectionChange: (s: EditorSection) => void;
  onChange: (s: ReadingSkin) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const sections: { key: EditorSection; label: string }[] = [
    { key: "background", label: "背景" },
    { key: "typography", label: "排版" },
    { key: "chapter", label: "章节" },
    { key: "page", label: "翻页" },
    { key: "tools", label: "工具" },
    { key: "overlay", label: "装饰" },
  ];

  const patch = <K extends keyof ReadingSkin>(key: K, value: ReadingSkin[K]) => {
    onChange({ ...skin, [key]: value });
  };

  return (
    <div className="br-skin-editor">
      <div className="br-skin-editor-header">
        <button type="button" className="book-icon-btn book-pressable" onClick={onBack}>
          <ChevronRight size={18} className="br-icon-back" />
        </button>
        <input
          className="br-skin-name-input"
          value={skin.name}
          onChange={e => patch("name", e.target.value)}
        />
        <button type="button" className="br-btn-primary book-pressable" onClick={onSave}>
          保存
        </button>
      </div>

      <div className="br-skin-section-tabs">
        {sections.map(s => (
          <button
            key={s.key}
            type="button"
            className={`br-skin-section-tab ${section === s.key ? "is-active" : ""}`}
            onClick={() => onSectionChange(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="br-skin-form">
        {section === "background" && (
          <>
            <label className="br-profile-field">
              <span className="br-field-label">背景类型</span>
              <select
                className="br-field-select"
                value={skin.background.type}
                onChange={e => patch("background", { ...skin.background, type: e.target.value as ReadingSkin["background"]["type"] })}
              >
                <option value="solid">纯色</option>
                <option value="gradient">渐变</option>
                <option value="image">图片</option>
                <option value="texture">纹理</option>
                <option value="custom">自定义 CSS</option>
              </select>
            </label>
            {skin.background.type === "custom" ? (
              <label className="br-profile-field">
                <span className="br-field-label">CSS 背景</span>
                <textarea
                  className="br-field-textarea"
                  value={skin.background.cssValue ?? ""}
                  onChange={e => patch("background", { ...skin.background, cssValue: e.target.value })}
                  rows={3}
                />
              </label>
            ) : (
              <label className="br-profile-field">
                <span className="br-field-label">背景值</span>
                <input
                  className="br-field-input"
                  value={skin.background.value}
                  onChange={e => patch("background", { ...skin.background, value: e.target.value })}
                  placeholder={skin.background.type === "gradient" ? "linear-gradient(...)" : "#FFFFFF"}
                />
              </label>
            )}
          </>
        )}

        {section === "typography" && (
          <>
            <label className="br-slider-row">
              <span>字号</span>
              <input type="range" min={12} max={32} step={1} value={skin.typography.fontSize}
                onChange={e => patch("typography", { ...skin.typography, fontSize: Number(e.target.value) })} />
              <span>{skin.typography.fontSize}</span>
            </label>
            <label className="br-slider-row">
              <span>字重</span>
              <input type="range" min={300} max={900} step={50} value={skin.typography.fontWeight}
                onChange={e => patch("typography", { ...skin.typography, fontWeight: Number(e.target.value) })} />
              <span>{skin.typography.fontWeight}</span>
            </label>
            <label className="br-slider-row">
              <span>行距</span>
              <input type="range" min={1.2} max={3} step={0.1} value={skin.typography.lineHeight}
                onChange={e => patch("typography", { ...skin.typography, lineHeight: Number(e.target.value) })} />
              <span>{skin.typography.lineHeight}</span>
            </label>
            <label className="br-slider-row">
              <span>字距</span>
              <input type="range" min={0} max={2} step={0.1} value={skin.typography.letterSpacing}
                onChange={e => patch("typography", { ...skin.typography, letterSpacing: Number(e.target.value) })} />
              <span>{skin.typography.letterSpacing}</span>
            </label>
            <label className="br-slider-row">
              <span>页边距</span>
              <input type="range" min={8} max={64} step={4} value={skin.typography.paddingHorizontal}
                onChange={e => patch("typography", { ...skin.typography, paddingHorizontal: Number(e.target.value) })} />
              <span>{skin.typography.paddingHorizontal}</span>
            </label>
            <label className="br-profile-field">
              <span className="br-field-label">对齐方式</span>
              <select
                className="br-field-select"
                value={skin.typography.textAlign}
                onChange={e => patch("typography", { ...skin.typography, textAlign: e.target.value as ReadingSkin["typography"]["textAlign"] })}
              >
                <option value="left">左对齐</option>
                <option value="justify">两端对齐</option>
                <option value="center">居中</option>
              </select>
            </label>
          </>
        )}

        {section === "chapter" && (
          <>
            <label className="br-slider-row">
              <span>标题字号</span>
              <input type="range" min={16} max={40} step={1} value={skin.chapter.titleSize}
                onChange={e => patch("chapter", { ...skin.chapter, titleSize: Number(e.target.value) })} />
              <span>{skin.chapter.titleSize}</span>
            </label>
            <label className="br-slider-row">
              <span>标题字重</span>
              <input type="range" min={400} max={900} step={50} value={skin.chapter.titleWeight}
                onChange={e => patch("chapter", { ...skin.chapter, titleWeight: Number(e.target.value) })} />
              <span>{skin.chapter.titleWeight}</span>
            </label>
            <label className="br-profile-field">
              <span className="br-field-label">分割线</span>
              <select
                className="br-field-select"
                value={skin.chapter.dividerStyle}
                onChange={e => patch("chapter", { ...skin.chapter, dividerStyle: e.target.value as ReadingSkin["chapter"]["dividerStyle"] })}
              >
                <option value="none">无</option>
                <option value="line">直线</option>
                <option value="dots">省略号</option>
              </select>
            </label>
            <label className="br-profile-field">
              <span className="br-field-label">首字样式</span>
              <select
                className="br-field-select"
                value={skin.chapter.firstCharStyle}
                onChange={e => patch("chapter", { ...skin.chapter, firstCharStyle: e.target.value as ReadingSkin["chapter"]["firstCharStyle"] })}
              >
                <option value="none">无</option>
                <option value="large">大写</option>
                <option value="drop-cap">下沉</option>
              </select>
            </label>
          </>
        )}

        {section === "page" && (
          <>
            <label className="br-profile-field">
              <span className="br-field-label">翻页模式</span>
              <select
                className="br-field-select"
                value={skin.page.mode}
                onChange={e => patch("page", { ...skin.page, mode: e.target.value as ReadingSkin["page"]["mode"] })}
              >
                <option value="scroll">上下滚动</option>
                <option value="page">左右翻页</option>
              </select>
            </label>
            <label className="br-slider-row">
              <span>动效强度</span>
              <input type="range" min={0} max={100} value={skin.page.animationIntensity}
                onChange={e => patch("page", { ...skin.page, animationIntensity: Number(e.target.value) })} />
              <span>{skin.page.animationIntensity}</span>
            </label>
            <label className="br-field-row">
              <span>减少动效</span>
              <input type="checkbox" checked={skin.page.reducedMotion}
                onChange={e => patch("page", { ...skin.page, reducedMotion: e.target.checked })} className="br-field-check" />
            </label>
          </>
        )}

        {section === "tools" && (
          <>
            <label className="br-profile-field">
              <span className="br-field-label">标注样式</span>
              <select
                className="br-field-select"
                value={skin.tools.annotationStyle}
                onChange={e => patch("tools", { ...skin.tools, annotationStyle: e.target.value as ReadingSkin["tools"]["annotationStyle"] })}
              >
                <option value="minimal">极简</option>
                <option value="card">卡片</option>
                <option value="underline">下划线</option>
              </select>
            </label>
            <label className="br-slider-row">
              <span>菜单圆角</span>
              <input type="range" min={0} max={24} step={1} value={skin.tools.menuRadius}
                onChange={e => patch("tools", { ...skin.tools, menuRadius: Number(e.target.value) })} />
              <span>{skin.tools.menuRadius}</span>
            </label>
          </>
        )}

        {section === "overlay" && (
          <>
            <label className="br-profile-field">
              <span className="br-field-label">装饰纹理</span>
              <select
                className="br-field-select"
                value={skin.overlay.type}
                onChange={e => patch("overlay", { ...skin.overlay, type: e.target.value as ReadingSkin["overlay"]["type"] })}
              >
                <option value="none">无</option>
                <option value="grid">网格</option>
                <option value="rain">雨滴</option>
                <option value="paper">纸张</option>
                <option value="custom">自定义 PNG</option>
              </select>
            </label>
            {skin.overlay.type === "custom" && (
              <label className="br-profile-field">
                <span className="br-field-label">PNG 地址</span>
                <input className="br-field-input" value={skin.overlay.customSrc ?? ""}
                  onChange={e => patch("overlay", { ...skin.overlay, customSrc: e.target.value })} placeholder="https://..." />
              </label>
            )}
            <label className="br-slider-row">
              <span>透明度</span>
              <input type="range" min={0} max={100} value={skin.overlay.opacity}
                onChange={e => patch("overlay", { ...skin.overlay, opacity: Number(e.target.value) })} />
              <span>{skin.overlay.opacity}</span>
            </label>
          </>
        )}

        <div className="br-skin-advanced-link">
          <button type="button" className="br-skin-card-btn book-pressable" onClick={() => onSectionChange("css")}>
            <FileJson size={14} />
            高级 CSS 模式
          </button>
        </div>
      </div>

      {section === "css" && (
        <div className="br-skin-form">
          <label className="br-profile-field">
            <span className="br-field-label">自定义 CSS（只作用于阅读器）</span>
            <textarea
              className="br-field-textarea br-css-editor"
              value={skin.customCss}
              onChange={e => patch("customCss", e.target.value)}
              rows={12}
              placeholder="/* 自定义阅读器样式 */\n.reading-article {\n  /* ... */\n}"
            />
          </label>
          <p className="br-sheet-note">CSS 仅作用于 .bookroom-reader-skin-root 内，不影响 Dock 或全局界面。</p>
        </div>
      )}
    </div>
  );
}
