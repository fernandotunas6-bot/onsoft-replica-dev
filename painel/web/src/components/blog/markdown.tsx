import type { ReactNode } from "react"

/**
 * Texto dos artigos (escrito no ADMIN) em elementos React, sem `innerHTML`: o que vem da
 * base nunca é interpretado como HTML. Aceita o essencial: parágrafos, «## Título»,
 * listas com «- » ou «1. », **negrito**, *itálico* e [ligações](https://…).
 */
const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\))/g

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const match of text.matchAll(INLINE)) {
    const token = match[0]
    const at = match.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    const key = `${keyPrefix}-${i++}`
    if (token.startsWith("**")) out.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith("*")) out.push(<em key={key}>{token.slice(1, -1)}</em>)
    else {
      const label = token.slice(1, token.indexOf("]"))
      const href = match[2] ?? "#"
      const external = href.startsWith("http")
      out.push(
        <a
          key={key}
          href={href}
          className="text-primary underline underline-offset-4"
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {label}
        </a>,
      )
    }
    last = at + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/)
  return (
    <div className="space-y-5 text-base leading-7">
      {blocks.map((block, index) => {
        const lines = block.split("\n").filter((line) => line.trim())
        if (!lines.length) return null
        const key = `b${index}`
        const heading = /^(#{2,3})\s+(.*)$/.exec(lines[0])
        if (heading && lines.length === 1) {
          return heading[1] === "##" ? (
            <h2 key={key} className="pt-4 text-2xl font-bold tracking-tight">
              {inline(heading[2], key)}
            </h2>
          ) : (
            <h3 key={key} className="pt-2 text-xl font-semibold">
              {inline(heading[2], key)}
            </h3>
          )
        }
        if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
          return (
            <ul key={key} className="list-disc space-y-1.5 pl-6">
              {lines.map((line, j) => (
                <li key={j}>{inline(line.replace(/^\s*[-*]\s+/, ""), `${key}-${j}`)}</li>
              ))}
            </ul>
          )
        }
        if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line))) {
          return (
            <ol key={key} className="list-decimal space-y-1.5 pl-6">
              {lines.map((line, j) => (
                <li key={j}>{inline(line.replace(/^\s*\d+[.)]\s+/, ""), `${key}-${j}`)}</li>
              ))}
            </ol>
          )
        }
        return (
          <p key={key}>
            {lines.map((line, j) => (
              <span key={j}>
                {j > 0 ? <br /> : null}
                {inline(line, `${key}-${j}`)}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}
