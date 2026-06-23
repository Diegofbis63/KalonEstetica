import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Auto-reload on chunk load errors (common when a new deployment goes live on Vercel)
const handleChunkError = (errorMsg: string) => {
  const isChunkError = 
    errorMsg.includes("dynamically imported module") || 
    errorMsg.includes("Failed to fetch dynamically imported module") ||
    errorMsg.toLowerCase().includes("chunkloaderror") ||
    errorMsg.includes("importing a module");

  if (isChunkError) {
    const lastReload = sessionStorage.getItem("kalon_chunk_reload");
    const now = Date.now();
    // Prevent infinite reload loop (wait at least 10s between auto-reloads)
    if (!lastReload || now - parseInt(lastReload) > 10000) {
      sessionStorage.setItem("kalon_chunk_reload", now.toString());
      console.warn("Chunk load error detected. Reloading page to fetch the new deployment...");
      window.location.reload();
    }
  }
};

window.addEventListener("error", (e) => {
  handleChunkError(e.message || "");
}, true);

window.addEventListener("unhandledrejection", (e) => {
  handleChunkError(e.reason?.toString() || "");
});

createRoot(document.getElementById("root")!).render(<App />);
