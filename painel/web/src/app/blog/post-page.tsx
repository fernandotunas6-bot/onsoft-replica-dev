import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/blog/markdown"
import { fetchBlogPost, formatPostDate, type BlogPost } from "@/lib/site-content"

export default function BlogPostPage() {
  const { slug = "" } = useParams()
  // O artigo carregado e de que endereço veio: ao mudar de artigo, volta a «a carregar».
  const [loaded, setLoaded] = useState<{ slug: string; post: BlogPost | null; failed: boolean }>()

  useEffect(() => {
    let active = true
    void fetchBlogPost(slug).then((result) => {
      if (active) setLoaded({ slug, post: result ?? null, failed: result === null })
    })
    return () => {
      active = false
    }
  }, [slug])

  const post = loaded?.slug === slug ? loaded.post : undefined
  const failed = loaded?.slug === slug && loaded.failed

  useEffect(() => {
    if (post) document.title = `${post.title} · SIGA Plus`
  }, [post])

  const date = post ? formatPostDate(post.publishedAt) : null

  return (
    <MarketingLayout variant="fullBleed">
      <article className="container mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        <Button variant="ghost" size="sm" asChild className="-ml-3 mb-6">
          <Link to="/blog" className="gap-1.5">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Todos os artigos
          </Link>
        </Button>
        {post === undefined ? (
          <p role="status" className="text-muted-foreground text-sm">
            A carregar o artigo…
          </p>
        ) : post === null ? (
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {failed ? "Não foi possível abrir o artigo" : "Artigo não encontrado"}
            </h1>
            <p className="text-muted-foreground">
              {failed
                ? "Verifique a ligação e tente de novo daqui a pouco."
                : "O endereço pode estar errado ou o artigo já não está publicado."}
            </p>
          </div>
        ) : (
          <>
            <header className="space-y-3">
              <p className="text-primary text-sm font-medium">
                {post.category}
                {date ? ` · ${date}` : ""}
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{post.title}</h1>
              {post.excerpt ? <p className="text-muted-foreground text-lg">{post.excerpt}</p> : null}
              {post.authorName ? <p className="text-muted-foreground text-sm">Por {post.authorName}</p> : null}
            </header>
            {post.coverUrl ? (
              <img
                src={post.coverUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="mt-8 aspect-video w-full rounded-2xl border object-cover"
              />
            ) : null}
            <div className="mt-8">
              <Markdown text={post.body} />
            </div>
          </>
        )}
      </article>
    </MarketingLayout>
  )
}
