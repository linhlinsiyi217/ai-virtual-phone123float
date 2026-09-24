"use client";

import { ChevronRight, Search, X } from "lucide-react";
import type { ChangeEvent, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function IosGroup({ title, children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) {
  return <section className="sv2-group">{title ? <h2 className="sv2-group-title">{title}</h2> : null}<div className="sv2-list">{children}</div>{footer ? <p className="sv2-footer">{footer}</p> : null}</section>;
}

export function IosCell({ label, desc, icon, right, onClick, danger = false, disabled = false, chevron = true }: { label: string; desc?: string; icon?: ReactNode; right?: ReactNode; onClick?: () => void; danger?: boolean; disabled?: boolean; chevron?: boolean }) {
  const content = <>{icon ? <span className="sv2-cell-icon">{icon}</span> : null}<span className="sv2-cell-copy"><span className="sv2-cell-label">{label}</span>{desc ? <span className="sv2-cell-desc">{desc}</span> : null}</span>{right}{onClick && chevron ? <ChevronRight size={17} className="sv2-chevron" /> : null}</>;
  if (!onClick) return <div className={`sv2-cell${danger ? " sv2-danger" : ""}`}>{content}</div>;
  return <button className={`sv2-cell${danger ? " sv2-danger" : ""}`} type="button" onClick={onClick} disabled={disabled}>{content}</button>;
}

export function IosSwitch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label?: string }) {
  return <button className="sv2-switch-row" type="button" onClick={() => onChange(!checked)} aria-label={label} role="switch" aria-checked={checked}><span className={`sv2-switch${checked ? " is-on" : ""}`}><span /></span></button>;
}

export function IosInput({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <label className="sv2-field"><span>{label}</span><input {...props} /></label>;
}

export function IosTextarea({ label, ...props }: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <label className="sv2-field sv2-field-top"><span>{label}</span><textarea {...props} /></label>;
}

export function IosSelect({ label, children, ...props }: { label: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  return <label className="sv2-field"><span>{label}</span><select {...props}>{children}</select></label>;
}

export function SearchBox({ value, onChange, onClear, placeholder = "搜索设置" }: { value: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void; onClear: () => void; placeholder?: string }) {
  return <label className="sv2-search"><Search size={16} /><input value={value} onChange={onChange} placeholder={placeholder} />{value ? <button type="button" onClick={onClear} aria-label="清除"><X size={15} /></button> : null}</label>;
}

export function PreviewModal({ title, children, actions }: { title: string; children?: ReactNode; actions: ReactNode }) {
  return <div className="sv2-modal-backdrop" role="presentation"><section className="sv2-modal" role="dialog" aria-modal="true" aria-label={title}><h2>{title}</h2>{children ? <div className="sv2-modal-body">{children}</div> : null}<div className="sv2-modal-actions">{actions}</div></section></div>;
}

export function Button({ children, onClick, danger = false, disabled = false }: { children: ReactNode; onClick?: () => void; danger?: boolean; disabled?: boolean }) {
  return <button className={`sv2-button${danger ? " sv2-button-danger" : ""}`} type="button" onClick={onClick} disabled={disabled}>{children}</button>;
}
