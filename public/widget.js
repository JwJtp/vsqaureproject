/* V Square Projects — website chat widget. Usage:
   <script src="https://YOUR-APP-DOMAIN/widget.js" async></script>  */
(function () {
  if (window.__vsWidget) return;
  window.__vsWidget = true;
  var origin = new URL(document.currentScript.src).origin;
  var btn = document.createElement("button");
  btn.setAttribute("aria-label", "Chat with V Square Projects");
  btn.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#e9d6a7" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  btn.style.cssText = "position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;border:1px solid rgba(214,177,106,.5);background:linear-gradient(135deg,#1a2541,#070b16);box-shadow:0 10px 30px rgba(0,0,0,.3);cursor:pointer;z-index:2147483646;display:grid;place-items:center";
  var frame = document.createElement("iframe");
  frame.src = origin + "/chat";
  frame.title = "V Square Projects chat";
  frame.style.cssText = "position:fixed;right:20px;bottom:92px;width:min(380px,calc(100vw - 40px));height:min(600px,calc(100vh - 120px));border:0;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.35);z-index:2147483647;display:none;background:#fff";
  btn.onclick = function () { frame.style.display = frame.style.display === "none" ? "block" : "none"; };
  document.body.appendChild(frame);
  document.body.appendChild(btn);
})();
