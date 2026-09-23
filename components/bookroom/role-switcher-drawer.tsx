"use client";

import { Check } from "lucide-react";
import { ROLE_STATUS_LABEL, type CompanionRole, type CompanionStatus } from "@/lib/bookroom-mock";

type Props = {
  roles: CompanionRole[];
  selectedId: string;
  onSelect: (role: CompanionRole) => void;
  onClose: () => void;
};

/** 角色头像：有图用图，无图用名字首字的低对比圆底 */
function RoleAvatar({ role, size }: { role: CompanionRole; size: number }) {
  const style = { width: size, height: size } as React.CSSProperties;
  if (role.avatar) {
    return (
      <span className="br-role-avatar" style={style}>
        <img src={role.avatar} alt="" />
      </span>
    );
  }
  return (
    <span className="br-role-avatar br-role-avatar-fallback" style={style} aria-hidden>
      {role.name.slice(0, 1)}
    </span>
  );
}

/**
 * 角色侧栏：从右侧滑出。选择当前陪读 / 共读角色（本地角色卡 + mock 兜底），
 * 不接真实后端。
 */
export function RoleSwitcherDrawer({ roles, selectedId, onSelect, onClose }: Props) {
  return (
    <div className="br-drawer-root" role="dialog" aria-modal="true" aria-label="选择陪读角色">
      <button type="button" className="br-drawer-scrim" onClick={onClose} aria-label="关闭角色侧栏" tabIndex={-1} />
      <aside className="br-drawer">
        <header className="br-drawer-head">
          <div>
            <h3 className="br-drawer-title">陪读角色</h3>
            <p className="br-drawer-sub">选择此刻与你共读的人</p>
          </div>
          <RoleAvatar role={roles.find(r => r.id === selectedId) ?? roles[0]} size={42} />
        </header>

        <div className="br-drawer-list">
          {roles.map(role => {
            const active = role.id === selectedId;
            return (
              <button
                key={role.id}
                type="button"
                className={`br-role-item book-pressable ${active ? "is-active" : ""}`}
                onClick={() => onSelect(role)}
                aria-current={active ? "true" : undefined}
              >
                <span className="br-role-item-avatar">
                  <RoleAvatar role={role} size={46} />
                  <span className={`br-role-dot br-role-dot-${role.status}`} aria-hidden />
                </span>
                <span className="br-role-item-main">
                  <span className="br-role-item-name">{role.name}</span>
                  <span className="br-role-item-sub">{role.subtitle}</span>
                </span>
                <span className="br-role-item-side">
                  <span className="br-role-status">
                    <span className={`br-role-dot br-role-dot-${role.status}`} />
                    {ROLE_STATUS_LABEL[role.status as CompanionStatus]}
                  </span>
                  {active && <Check size={15} strokeWidth={2.4} className="br-role-check" />}
                </span>
              </button>
            );
          })}
        </div>

        <p className="br-drawer-foot">角色来自本机角色卡，仅在书房内作为陪读形象。</p>
      </aside>
    </div>
  );
}
