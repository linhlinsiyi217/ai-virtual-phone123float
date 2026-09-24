"use client";

import { useState } from "react";
import { Camera, ImageIcon, Link2, RotateCcw, X } from "lucide-react";
import { BottomSheet, BrToast } from "./bookroom-ui";
import {
  fileToDataUrl,
  getAvatarFrameTransform,
  type AvatarFrameSettings,
  type BookroomProfile,
  type ProfileBackground,
} from "@/lib/bookroom-profile";

type Props = {
  profile: BookroomProfile;
  onSave: (patch: Partial<BookroomProfile>) => void;
  onClose: () => void;
};

type Tab = "profile" | "avatar" | "frame" | "background";

export function ProfileEditSheet({ profile, onSave, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("profile");
  const [name, setName] = useState(profile.name);
  const [handle, setHandle] = useState(profile.handle);
  const [bio, setBio] = useState(profile.bio);
  const [tags, setTags] = useState<string[]>(profile.tags.length ? profile.tags : ["", "", "", ""]);
  const [signature, setSignature] = useState(profile.signature ?? "");
  const [showMusic, setShowMusic] = useState(profile.showMusicCard);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [frame, setFrame] = useState<AvatarFrameSettings>(profile.avatarFrame);
  const [bg, setBg] = useState<ProfileBackground>(profile.background);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 1500);
  };

  const handleSave = () => {
    onSave({
      name: name.trim(),
      handle: handle.trim(),
      bio: bio.trim(),
      tags: tags.map(t => t.trim()).filter(Boolean).slice(0, 4),
      signature: signature.trim() || null,
      showMusicCard: showMusic,
      avatar,
      avatarFrame: frame,
      background: bg,
    });
    onClose();
  };

  const pickFile = async (accept: string, cb: (url: string) => void) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const url = await fileToDataUrl(file);
        cb(url);
      } catch {
        showToast("读取文件失败");
      }
    };
    input.click();
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "profile", label: "资料" },
    { key: "avatar", label: "头像" },
    { key: "frame", label: "头像框" },
    { key: "background", label: "背景" },
  ];

  return (
    <BottomSheet title="编辑个人主页" onClose={onClose} panelClassName="br-sheet-tall">
      <div className="br-profile-tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            className={`br-profile-tab ${tab === t.key ? "is-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <div className="br-profile-form">
          <label className="br-profile-field">
            <span className="br-field-label">昵称</span>
            <input
              className="br-field-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="你的名字"
              maxLength={16}
            />
          </label>
          <label className="br-profile-field">
            <span className="br-field-label">@账号</span>
            <input
              className="br-field-input"
              value={handle}
              onChange={e => setHandle(e.target.value)}
              placeholder="例如 @linhuai"
              maxLength={24}
            />
          </label>
          <label className="br-profile-field">
            <span className="br-field-label">简介</span>
            <textarea
              className="br-field-textarea"
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="写一句关于自己的话"
              rows={3}
              maxLength={120}
            />
          </label>
          <label className="br-profile-field">
            <span className="br-field-label">签名</span>
            <input
              className="br-field-input"
              value={signature}
              onChange={e => setSignature(e.target.value)}
              placeholder="页面底部签名（可留空）"
              maxLength={40}
            />
          </label>
          <div className="br-profile-field">
            <span className="br-field-label">标签（最多 4 个）</span>
            <div className="br-tag-inputs">
              {tags.map((tag, i) => (
                <input
                  key={i}
                  className="br-field-input br-tag-input"
                  value={tag}
                  onChange={e => {
                    const next = [...tags];
                    next[i] = e.target.value;
                    setTags(next);
                  }}
                  placeholder={`标签 ${i + 1}`}
                  maxLength={12}
                />
              ))}
            </div>
          </div>
          <label className="br-profile-field br-field-row">
            <span className="br-field-label">显示音乐卡片</span>
            <input
              type="checkbox"
              checked={showMusic}
              onChange={e => setShowMusic(e.target.checked)}
              className="br-field-check"
            />
          </label>
        </div>
      )}

      {tab === "avatar" && (
        <div className="br-profile-form">
          <div className="br-avatar-preview-wrap">
            <div className="br-avatar-preview-large">
              {avatar ? (
                <img src={avatar} alt="" />
              ) : (
                <span className="br-avatar-placeholder">?</span>
              )}
            </div>
          </div>
          <div className="br-avatar-actions">
            <button type="button" className="br-avatar-btn book-pressable" onClick={() => pickFile("image/*", setAvatar)}>
              <Camera size={16} />
              本地上传
            </button>
            <button type="button" className="br-avatar-btn book-pressable" onClick={() => pickFile("image/*", setAvatar)}>
              <ImageIcon size={16} />
              文件导入
            </button>
            <button
              type="button"
              className="br-avatar-btn book-pressable"
              onClick={() => {
                const url = window.prompt("输入图片 URL");
                if (url) setAvatar(url);
              }}
            >
              <Link2 size={16} />
              URL
            </button>
            {avatar && (
              <button type="button" className="br-avatar-btn is-danger book-pressable" onClick={() => setAvatar(null)}>
                <X size={16} />
                移除
              </button>
            )}
          </div>
        </div>
      )}

      {tab === "frame" && (
        <div className="br-profile-form">
          <div className="br-avatar-preview-wrap">
            <div className="br-avatar-preview-large">
              {avatar ? <img src={avatar} alt="" /> : <span className="br-avatar-placeholder">?</span>}
              {frame.enabled && frame.src && (
                <img
                  src={frame.src}
                  alt=""
                  className="br-avatar-frame-overlay"
                  style={{ transform: getAvatarFrameTransform(frame) }}
                />
              )}
            </div>
          </div>
          <div className="br-avatar-actions">
            <button type="button" className="br-avatar-btn book-pressable" onClick={() => pickFile("image/png", url => setFrame(prev => ({ ...prev, src: url, enabled: true })))}>
              <Camera size={16} />
              导入 PNG 头像框
            </button>
            <button
              type="button"
              className="br-avatar-btn is-danger book-pressable"
              onClick={() => setFrame({ src: null, scale: 1, offsetX: 0, offsetY: 0, rotation: 0, enabled: false })}
            >
              <RotateCcw size={16} />
              重置
            </button>
          </div>
          {frame.enabled && frame.src && (
            <div className="br-frame-sliders">
              <label className="br-slider-row">
                <span>缩放</span>
                <input type="range" min={0.3} max={2} step={0.05} value={frame.scale}
                  onChange={e => setFrame(prev => ({ ...prev, scale: Number(e.target.value) }))} />
              </label>
              <label className="br-slider-row">
                <span>水平偏移</span>
                <input type="range" min={-40} max={40} step={1} value={frame.offsetX}
                  onChange={e => setFrame(prev => ({ ...prev, offsetX: Number(e.target.value) }))} />
              </label>
              <label className="br-slider-row">
                <span>垂直偏移</span>
                <input type="range" min={-40} max={40} step={1} value={frame.offsetY}
                  onChange={e => setFrame(prev => ({ ...prev, offsetY: Number(e.target.value) }))} />
              </label>
              <label className="br-slider-row">
                <span>旋转</span>
                <input type="range" min={-180} max={180} step={5} value={frame.rotation}
                  onChange={e => setFrame(prev => ({ ...prev, rotation: Number(e.target.value) }))} />
              </label>
              <label className="br-field-row">
                <span>启用头像框</span>
                <input type="checkbox" checked={frame.enabled} onChange={e => setFrame(prev => ({ ...prev, enabled: e.target.checked }))} className="br-field-check" />
              </label>
            </div>
          )}
        </div>
      )}

      {tab === "background" && (
        <div className="br-profile-form">
          <div className="br-bg-preview">
            <div className="br-bg-preview-inner" style={getBgStylePreview(bg)}>
              <div className="br-bg-overlay" style={{ backgroundColor: `rgba(255,255,255,${(bg.overlay ?? 0) / 100})` }} />
            </div>
          </div>
          <label className="br-profile-field">
            <span className="br-field-label">类型</span>
            <select
              className="br-field-select"
              value={bg.type}
              onChange={e => setBg(prev => ({ ...prev, type: e.target.value as ProfileBackground["type"] }))}
            >
              <option value="default">默认</option>
              <option value="solid">纯色</option>
              <option value="gradient">渐变</option>
              <option value="url">图片 URL</option>
              <option value="image">本地上传</option>
            </select>
          </label>
          {(bg.type === "solid" || bg.type === "gradient") && (
            <label className="br-profile-field">
              <span className="br-field-label">颜色 / 渐变</span>
              <input className="br-field-input" value={bg.value} onChange={e => setBg(prev => ({ ...prev, value: e.target.value }))} placeholder={bg.type === "gradient" ? "linear-gradient(...)" : "#FFFFFF"} />
            </label>
          )}
          {bg.type === "url" && (
            <label className="br-profile-field">
              <span className="br-field-label">图片 URL</span>
              <input className="br-field-input" value={bg.value} onChange={e => setBg(prev => ({ ...prev, value: e.target.value }))} placeholder="https://..." />
            </label>
          )}
          {bg.type === "image" && (
            <div className="br-avatar-actions">
              <button type="button" className="br-avatar-btn book-pressable" onClick={() => pickFile("image/*", url => setBg(prev => ({ ...prev, value: url })))}>
                <Camera size={16} />
                选择图片
              </button>
            </div>
          )}
          {bg.type !== "default" && (
            <>
              <label className="br-profile-field">
                <span className="br-field-label">填充方式</span>
                <select className="br-field-select" value={bg.size} onChange={e => setBg(prev => ({ ...prev, size: e.target.value as "cover" | "contain" }))}>
                  <option value="cover">覆盖</option>
                  <option value="contain">包含</option>
                </select>
              </label>
              <label className="br-slider-row">
                <span>模糊</span>
                <input type="range" min={0} max={20} step={1} value={bg.blur ?? 0}
                  onChange={e => setBg(prev => ({ ...prev, blur: Number(e.target.value) }))} />
              </label>
              <label className="br-slider-row">
                <span>亮度</span>
                <input type="range" min={20} max={150} step={5} value={bg.brightness ?? 100}
                  onChange={e => setBg(prev => ({ ...prev, brightness: Number(e.target.value) }))} />
              </label>
              <label className="br-slider-row">
                <span>遮罩白度</span>
                <input type="range" min={0} max={80} step={5} value={bg.overlay ?? 0}
                  onChange={e => setBg(prev => ({ ...prev, overlay: Number(e.target.value) }))} />
              </label>
              <label className="br-slider-row">
                <span>饱和度</span>
                <input type="range" min={0} max={200} step={10} value={bg.saturation ?? 100}
                  onChange={e => setBg(prev => ({ ...prev, saturation: Number(e.target.value) }))} />
              </label>
              <label className="br-field-row">
                <span className="br-field-label">设为书房全局背景</span>
                <input type="checkbox" checked={bg.applyGlobal ?? false} onChange={e => setBg(prev => ({ ...prev, applyGlobal: e.target.checked }))} className="br-field-check" />
              </label>
            </>
          )}
        </div>
      )}

      <div className="br-sheet-actions">
        <button type="button" className="br-btn-primary book-pressable" onClick={handleSave}>
          保存
        </button>
      </div>
      <BrToast text={toast} />
    </BottomSheet>
  );
}

function getBgStylePreview(bg: ProfileBackground): React.CSSProperties {
  if (bg.type === "default" || !bg.value) return {};
  const style: React.CSSProperties = {
    backgroundSize: bg.size ?? "cover",
    backgroundPosition: "center",
  };
  if (bg.type === "solid") style.backgroundColor = bg.value;
  else if (bg.type === "gradient") style.backgroundImage = bg.value;
  else if (bg.type === "url" || bg.type === "image") style.backgroundImage = `url(${bg.value})`;
  return style;
}
