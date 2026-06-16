import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import App from "./App";

// Surface uncaught errors on screen — there's no devtools console on a phone.
function showFatal(msg: string) {
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#7a2418;color:#fff;" +
    "font:12px/1.4 monospace;padding:10px 14px;white-space:pre-wrap;word-break:break-word";
  el.textContent = msg;
  document.body.appendChild(el);
}
window.addEventListener("error", (e) => showFatal(`Error: ${e.message}\n${e.filename}:${e.lineno}`));
window.addEventListener("unhandledrejection", (e) =>
  showFatal(`Unhandled: ${e.reason instanceof Error ? `${e.reason.name}: ${e.reason.message}` : String(e.reason)}`),
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
