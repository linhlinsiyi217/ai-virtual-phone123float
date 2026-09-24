
.sv2-page{height:100%;display:flex;flex-direction:column;min-height:0;background:var(--sv-bg)}
.sv2-header{flex:0 0 auto;padding:0 16px;background:color-mix(in srgb,var(--sv-bg) 86%,transparent);backdrop-filter:blur(22px) saturate(145%);-webkit-backdrop-filter:blur(22px) saturate(145%);z-index:2;border-bottom:1px solid var(--sv-line)}
.sv2-safe-top{height:env(safe-area-inset-top,0px)}
.sv2-nav{height:50px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center}
.sv2-nav-side{display:flex;align-items:center}
.sv2-nav-right{justify-content:flex-end}
.sv2-nav-btn{border:0;background:transparent;color:var(--sv-blue);display:inline-flex;align-items:center;padding:7px 0;font:inherit;cursor:pointer}
.sv2-title{font-size:17px;font-weight:650;margin:0;white-space:nowrap}
.sv2-body{flex:1;overflow-y:auto;padding:0 16px calc(32px + env(safe-area-inset-bottom,0px))}
.sv2-search{height:36px;display:flex;align-items:center;gap:7px;border-radius:10px;background:var(--sv-card);border:1px solid var(--sv-line);padding:0 10px;margin:12px 0;color:var(--sv-muted)}
.sv2-search input{border:0;background:transparent;outline:0;flex:1;color:var(--sv-text)}
.sv2-group{margin:20px 0 0}
.sv2-group-title{font-size:13px;color:var(--sv-muted);font-weight:600;margin:0 0 7px 16px}
.sv2-list{background:var(--sv-card);border:1px solid var(--sv-line);border-radius:13px;overflow:hidden}
.sv2-cell{min-height:51px;display:flex;align-items:center;gap:10px;padding:9px 14px;border:0;width:100%;text-align:left;color:inherit;background:transparent}
.sv2-cell+.sv2-cell{border-top:1px solid var(--sv-line)}
.sv2-cell-icon{width:28px;height:28px;border-radius:8px;background:color-mix(in srgb,var(--sv-text) 9%,transparent);display:grid;place-items:center}
.sv2-cell-copy{flex:1;display:flex;flex-direction:column}
.sv2-cell-label{font-size:15px}
.sv2-cell-desc{font-size:12px;color:var(--sv-muted)}
