import { useEffect } from "react";

/**
 * Self-contained styles, injected once, so the kit works in any app without a CSS setup.
 * Paper and ink with one blue, from the network's design system. Override with the `uc-*` classes.
 */
const CSS = `
.uc-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 16px;border:0;border-radius:14px;background:#0066FF;color:#fff;font:500 15px/1 Onest,system-ui,sans-serif;cursor:pointer;transition:background-color .15s,box-shadow .15s}
.uc-btn:hover{background:#3385FF;box-shadow:0 2px 4px rgba(0,0,0,.16),0 12px 16px rgba(0,68,255,.24)}
.uc-btn:disabled{opacity:.5;pointer-events:none}
.uc-btn:focus-visible{outline:none;box-shadow:0 0 0 2px rgba(0,102,255,.4)}
.uc-btn-outline{background:#fff;color:#07081E;border:1px solid #C7D0DC}
.uc-btn-outline:hover{background:#F1F4F8;box-shadow:none}
.uc-pill{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border:1px solid #E3E8EF;border-radius:999px;background:#fff;color:#07081E;font:500 14px/1 Onest,system-ui,sans-serif;cursor:pointer;transition:background-color .15s}
.uc-pill:hover{background:#F8FAF9}
.uc-dot{width:8px;height:8px;border-radius:50%;background:#68ECBC;flex:none}
.uc-dot-off{background:#97A2B6}
.uc-muted{color:#6A6A72}
.uc-wrap{position:relative;display:inline-block}
.uc-menu{position:absolute;right:0;top:calc(100% + 8px);z-index:60;width:300px;padding:20px;border:1px solid #E3E8EF;border-radius:24px;background:#fff;color:#07081E;font:14px/1.5 Onest,system-ui,sans-serif;text-align:left;box-shadow:0 24px 70px -30px rgba(0,9,51,.35)}
.uc-label{font-size:13px;font-weight:500;color:#45464D}
.uc-big{margin-top:6px;font-size:36px;line-height:1;font-weight:300;color:#000}
.uc-row{display:flex;gap:8px;margin-top:16px}
.uc-row .uc-btn{flex:1;height:36px;font-size:14px}
.uc-lines{margin-top:16px;border-top:1px solid #E6E6EC}
.uc-line{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #E6E6EC;font-size:14px}
.uc-foot{margin-top:12px;font-size:12px;color:#6A6A72}
.uc-foot a{color:#0066FF;text-decoration:none}
.uc-foot a:hover{text-decoration:underline}
`;

export function useStyles() {
  useEffect(() => {
    if (document.getElementById("uc-styles")) return;
    const el = document.createElement("style");
    el.id = "uc-styles";
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
}
