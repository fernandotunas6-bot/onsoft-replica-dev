import fs from "fs"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

/**
 * Páginas carregadas à parte que costumam ser a porta de entrada: o build acrescenta
 * ao _headers do Cloudflare Pages um `Link: rel=modulepreload` com os pedaços de cada
 * uma, para o browser (e as Early Hints da Cloudflare) os descarregar em paralelo com
 * a página, em vez de esperar pelo arranque do React. /start recebe quem vem do
 * «Criar escola» do SIGA.
 */
const ENTRY_PAGES: Record<string, string> = {
  "/start": "src/app/start/page.tsx",
  "/pricing": "src/app/pricing/page.tsx",
}

function entryPageHints(): Plugin {
  let outDir = "dist"
  let base = "/"
  const hints = new Map<string, string[]>()
  return {
    name: "siga-web-entry-page-hints",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
      base = config.base
    },
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((item) => item.type === "chunk")
      const entryFiles = new Set(
        chunks.filter((chunk) => chunk.isEntry).flatMap((chunk) => [chunk.fileName, ...chunk.imports]),
      )
      for (const [route, source] of Object.entries(ENTRY_PAGES)) {
        const page = chunks.find((chunk) => chunk.facadeModuleId?.endsWith(source))
        if (!page) throw new Error(`entryPageHints: pedaço de ${source} não encontrado`)
        const files = [page.fileName, ...page.imports].filter((file) => !entryFiles.has(file))
        hints.set(route, [...new Set(files)])
      }
    },
    closeBundle() {
      const file = path.join(outDir, "_headers")
      if (!fs.existsSync(file) || hints.size === 0) return
      const rules = [...hints].map(([route, files]) => {
        const links = files.map((name) => `<${base}${name}>; rel=modulepreload`).join(", ")
        return `${route}\n  Link: ${links}\n`
      })
      fs.appendFileSync(
        file,
        `\n# Gerado no build (vite.config.ts, entryPageHints): pedaços das páginas de entrada.\n${rules.join("")}`,
      )
    },
  }
}

// https://vite.dev/config/
/**
 * Imagem das pré-visualizações (WhatsApp, redes sociais): o Open Graph exige um
 * endereço absoluto, que só se conhece no build (VITE_WEB_URL, definido pelo deploy).
 */
function socialPreview(): Plugin {
  return {
    name: "siga-web-social-preview",
    transformIndexHtml() {
      const domain = String(process.env.VITE_PLATFORM_DOMAIN || "portal-siga.com")
        .trim()
        .toLowerCase()
        .replace(/^\.+|\.+$/g, "")
      const origin = String(process.env.VITE_WEB_URL || `https://www.${domain}`).replace(/\/+$/, "")
      const meta = (attrs: Record<string, string>) => ({ tag: "meta", attrs, injectTo: "head" as const })
      return [
        meta({ property: "og:url", content: `${origin}/` }),
        meta({ property: "og:image", content: `${origin}/og-image.png` }),
        meta({ property: "og:image:width", content: "1200" }),
        meta({ property: "og:image:height", content: "630" }),
        meta({ property: "og:image:alt", content: "SIGA Plus — Gestão escolar para Angola" }),
        meta({ name: "twitter:image", content: `${origin}/og-image.png` }),
      ]
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), entryPageHints(), socialPreview()],
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
          // React, o DOM e o router mudam pouco entre publicações: num pedaço próprio
          // continuam em cache quando só o código das páginas muda.
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) {
            return "react"
          }
          // O resto vai com a página que o usa. Antes, um pedaço «vendor» com todo o
          // node_modules (590 KB) era descarregado em todas as páginas.
        },
      },
    },
  },
  define: {
    "import.meta.env.VITE_BASENAME": JSON.stringify(process.env.VITE_BASENAME || ""),
  },
})
