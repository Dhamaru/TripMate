use tauri::{WebviewUrl, WebviewWindowBuilder};

const SITE_URL: &str = "https://tripmate-ylt6.onrender.com";

// Injected into the remote page (which we can't edit) on every load/navigation.
// Draws a slim custom title bar since the window is frameless (decorations: false).
const TITLEBAR_JS: &str = r#"
(function () {
  if (window.__tmBarInit) return;
  window.__tmBarInit = true;
  var BAR_H = 32;
  function build() {
    if (!document.body || document.getElementById('__tm_titlebar')) return;
    var style = document.createElement('style');
    style.textContent =
      'html{margin-top:' + BAR_H + 'px !important}' +
      '#__tm_titlebar{position:fixed;top:0;left:0;right:0;height:' + BAR_H + 'px;z-index:2147483647;' +
      'display:flex;align-items:center;justify-content:space-between;padding-left:12px;' +
      'background:#0a121c;color:#e8e6df;font:600 12px/1 system-ui,-apple-system,Segoe UI,sans-serif;' +
      'letter-spacing:.04em;-webkit-user-select:none;user-select:none;' +
      'border-bottom:1px solid rgba(255,255,255,.08)}' +
      '#__tm_titlebar .__tm_title{pointer-events:none;opacity:.85}' +
      '#__tm_btns{display:flex;height:100%}' +
      '#__tm_btns button{width:46px;height:100%;border:0;background:transparent;color:inherit;' +
      'font-family:system-ui,sans-serif;font-size:14px;cursor:pointer}' +
      '#__tm_btns button:hover{background:rgba(255,255,255,.12)}' +
      '#__tm_close:hover{background:#e81123;color:#fff}';
    document.documentElement.appendChild(style);

    var bar = document.createElement('div');
    bar.id = '__tm_titlebar';
    bar.setAttribute('data-tauri-drag-region', '');
    bar.innerHTML =
      '<span class="__tm_title" data-tauri-drag-region>TripMate</span>' +
      '<div id="__tm_btns">' +
      '<button id="__tm_min" title="Minimize" aria-label="Minimize">–</button>' +
      '<button id="__tm_max" title="Maximize" aria-label="Maximize">□</button>' +
      '<button id="__tm_close" title="Close" aria-label="Close">✕</button>' +
      '</div>';
    document.body.appendChild(bar);
    wire(bar);
  }
  function wire(bar) {
    var T = window.__TAURI__;
    if (!T || !T.window) { setTimeout(function () { wire(bar); }, 150); return; }
    var w = T.window.getCurrentWindow();
    document.getElementById('__tm_min').onclick = function () { w.minimize(); };
    document.getElementById('__tm_max').onclick = function () { w.toggleMaximize(); };
    document.getElementById('__tm_close').onclick = function () { w.close(); };
    // Drag + double-click-to-maximize (not when the buttons are the target).
    bar.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || e.target.closest('#__tm_btns')) return;
      if (e.detail === 2) { w.toggleMaximize(); } else { w.startDragging(); }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
  // Re-inject if the SPA wipes the DOM on route change.
  new MutationObserver(build).observe(document.documentElement, { childList: true, subtree: true });
})();
"#;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(SITE_URL.parse().unwrap()),
            )
            .title("TripMate")
            .inner_size(1200.0, 800.0)
            .min_inner_size(360.0, 600.0)
            .resizable(true)
            .decorations(false)
            .initialization_script(TITLEBAR_JS)
            .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
