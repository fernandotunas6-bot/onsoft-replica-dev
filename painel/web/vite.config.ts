import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    warmup: {
      clientFiles: ["./src/main.tsx", "./src/app/landing/page.tsx", "./src/app/pricing/page.tsx"],
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom"],
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return
          if (id.includes("recharts") || id.includes("d3-")) return "charts"
          if (id.includes("@radix-ui")) return "radix"
          if (id.includes("react-dom") || id.includes("/react/")) return "react-vendor"
          return "vendor"
        },
      },
    },
  },
  define: {
    "import.meta.env.VITE_BASENAME": JSON.stringify(process.env.VITE_BASENAME || ""),
  },
})
