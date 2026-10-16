/*! Physiotherapy Treatment at Home — embeddable chat widget.
 * Usage on the clinic website:
 *   <script src="https://YOUR-APP-DOMAIN/widget.js" defer></script>
 */
(function () {
  if (window.__physioChatLoaded) return;
  window.__physioChatLoaded = true;
  var script = document.currentScript;
  var origin = (script && script.src) ? new URL(script.src).origin : window.location.origin;

  var css = "" +
    ".ptc-btn{position:fixed;right:20px;bottom:20px;z-index:2147483000;border:0;border-radius:999px;padding:14px 20px;" +
    "background:linear-gradient(135deg,#0b6e99,#0f7f78);color:#fff;font:600 15px system-ui,sans-serif;box-shadow:0 10px 30px rgba(19,41,61,.25);cursor:pointer}" +
    ".ptc-btn:focus-visible{outline:3px solid #6cb7d9;outline-offset:2px}" +
    ".ptc-frame{position:fixed;right:20px;bottom:84px;z-index:2147483000;width:380px;height:620px;max-height:calc(100vh - 110px);border:0;" +
    "border-radius:18px;box-shadow:0 18px 50px rgba(19,41,61,.3);background:#fff;display:none}" +
    ".ptc-open .ptc-frame{display:block}" +
    "@media (max-width:480px){.ptc-frame{right:0;bottom:0;width:100vw;height:100dvh;max-height:none;border-radius:0}.ptc-open .ptc-btn{bottom:auto;top:10px;right:10px;padding:8px 14px}}";
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var wrap = document.createElement("div");
  var btn = document.createElement("button");
  btn.className = "ptc-btn";
  btn.type = "button";
  btn.setAttribute("aria-expanded", "false");
  btn.textContent = "Book a home visit";
  var frame = null;

  btn.addEventListener("click", function () {
    var open = !wrap.classList.contains("ptc-open");
    if (open && !frame) {
      frame = document.createElement("iframe");
      frame.className = "ptc-frame";
      frame.title = "Physiotherapy Treatment at Home appointment assistant";
      frame.src = origin + "/chat";
      wrap.appendChild(frame);
    }
    wrap.classList.toggle("ptc-open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "Close chat" : "Book a home visit";
  });

  wrap.appendChild(btn);
  document.body.appendChild(wrap);
})();
