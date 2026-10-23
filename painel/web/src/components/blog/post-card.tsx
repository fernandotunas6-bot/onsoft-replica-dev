import { Link } from "react-router-dom"
import { ArrowRight, Newspaper } from "lucide-react"
import type { BlogPostSummary } from "@/lib/site-content"

export function PostCard({ post, date }: { post: BlogPostSummary; date: string | null }) {
  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group bg-card hover:border-primary/40 focus-visible:ring-ring flex flex-col overflow-hidden rounded-2xl border transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="bg-muted aspect-video overflow-hidden">
        {post.coverUrl ? (
          <img
            src={post.coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="from-primary/15 via-primary/5 grid size-full place-items-center bg-gradient-to-br to-transparent">
            <Newspaper className="text-primary/60 size-10" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-6">
        <p className="text-muted-foreground text-xs">
          {post.category}
          {date ? ` · ${date}` : ""}
        </p>
        <h3 className="group-hover:text-primary mt-2 text-lg font-semibold transition-colors">{post.title}</h3>
        {post.excerpt ? <p className="text-muted-foreground mt-2 flex-1 text-sm">{post.excerpt}</p> : null}
        <span className="text-primary mt-4 inline-flex items-center gap-1.5 text-sm font-medium">
          Ler artigo
          <ArrowRight className="size-4" aria-hidden="true" />
        </span>
      </div>
    </Link>
  )
}
