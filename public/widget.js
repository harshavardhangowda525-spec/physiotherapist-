/*!
 * Physiotherapy Treatment at Home — website chat launcher.
 * Add to any page:  <script src="https://YOUR-APP-DOMAIN/widget.js" defer></script>
 * The chat runs inside an iframe served by the app, so no patient data or keys touch the host page.
 * The host site's origin must be listed in CHAT_EMBED_ALLOWED_ORIGINS on the server.
 */
(function () {
  if (window.__pthWidget) return;
  window.__pthWidget = true;
  var script = document.currentScript;
  var origin = new URL(script.src).origin;
  var PHONE = "+917715877047";

  var css =
    ".pth-launch{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:flex;align-items:center;gap:10px;padding:12px 18px 12px 12px;border:0;border-radius:999px;cursor:pointer;color:#fff;font:600 15px/1.2 system-ui,-apple-system,'Segoe UI',sans-serif;background:linear-gradient(135deg,#0f766e,#0e7490 48%,#0369a1);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 14px 34px -10px rgba(13,148,136,.7);transition:transform .25s cubic-bezier(.22,1,.36,1)}" +
    ".pth-launch:hover{transform:translateY(-2px)}.pth-launch:focus-visible{outline:3px solid #0891b2;outline-offset:3px}" +
    ".pth-launch i{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.18)}" +
    ".pth-panel{position:fixed;right:20px;bottom:88px;z-index:2147483000;width:400px;height:min(680px,calc(100vh - 110px));border-radius:26px;overflow:hidden;box-shadow:0 40px 90px -30px rgba(8,72,94,.55),0 12px 32px -12px rgba(8,72,94,.25);opacity:0;transform:translateY(14px) scale(.98);pointer-events:none;transition:opacity .3s,transform .35s cubic-bezier(.22,1,.36,1);background:#f3fafb}" +
    ".pth-panel.open{opacity:1;transform:none;pointer-events:auto}.pth-panel iframe{width:100%;height:100%;border:0}" +
    ".pth-fallback{position:absolute;inset:auto 0 0 0;padding:10px;text-align:center;font:500 13px system-ui;background:#fff}" +
    "@media (max-width:560px){.pth-panel{right:0;left:0;bottom:0;width:100%;height:100svh;border-radius:0}.pth-launch.open{bottom:auto;top:12px;right:12px;padding:10px}.pth-launch.open span{display:none}}" +
    "@media (prefers-reduced-motion:reduce){.pth-launch,.pth-panel{transition:none}}";
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var btn = document.createElement("button");
  btn.className = "pth-launch";
  btn.type = "button";
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-controls", "pth-chat-panel");
  btn.innerHTML =
    '<i aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></i><span>Book a home visit</span>';

  var panel = document.createElement("div");
  panel.className = "pth-panel";
  panel.id = "pth-chat-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Physiotherapy Treatment at Home appointment assistant");

  var loaded = false;
  function open() {
    if (!loaded) {
      var f = document.createElement("iframe");
      f.src = origin + "/chat";
      f.title = "Appointment assistant";
      f.allow = "clipboard-write";
      f.referrerPolicy = "strict-origin-when-cross-origin";
      panel.appendChild(f);
      var fb = document.createElement("div");
      fb.className = "pth-fallback";
      fb.innerHTML = 'Chat not loading? Call <a href="tel:' + PHONE + '">077158 77047</a>';
      panel.appendChild(fb);
      f.addEventListener("load", function () { fb.remove(); });
      loaded = true;
    }
    panel.classList.add("open");
    btn.classList.add("open");
    btn.setAttribute("aria-expanded", "true");
    btn.querySelector("span").textContent = "Close chat";
  }
  function close() {
    panel.classList.remove("open");
    btn.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
    btn.querySelector("span").textContent = "Book a home visit";
  }
  btn.addEventListener("click", function () {
    if (panel.classList.contains("open")) close();
    else open();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel.classList.contains("open")) { close(); btn.focus(); } });

  document.body.appendChild(panel);
  document.body.appendChild(btn);
})();
