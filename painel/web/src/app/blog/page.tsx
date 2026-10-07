import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { BookOpen } from "lucide-react"
import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { Button } from "@/components/ui/button"
import { PostCard } from "@/components/blog/post-card"
import { fetchBlogPosts, formatPostDate, type BlogPostSummary } from "@/lib/site-content"
import { getDocsUrl } from "@/lib/ecosystem-urls"

export default function BlogPage() {
  // undefined: a carregar; null: o SIGA não respondeu.
  const [posts, setPosts] = useState<BlogPostSummary[] | null>()

  useEffect(() => {
    let active = true
    void fetchBlogPosts().then((list) => active && setPosts(list))
    return () => {
      active = false
    }
  }, [])

  return (
    <MarketingLayout
      title="Blog do SIGA Plus"
      description="Novidades do sistema e boas práticas para a secretaria, a tesouraria e os professores."
      eyebrow="Blog"
    >
      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {posts === undefined ? (
          <p role="status" className="text-muted-foreground text-center text-sm">
            A carregar artigos…
          </p>
        ) : posts && posts.length ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} date={formatPostDate(post.publishedAt)} />
            ))}
          </div>
        ) : (
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
            <BookOpen className="text-primary size-10" aria-hidden="true" />
            <p className="text-muted-foreground">
              {posts === null
                ? "Não foi possível mostrar os artigos agora. Tente daqui a pouco."
                : "Ainda não há artigos publicados. Entretanto, os manuais explicam cada área do SIGA."}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <a href={getDocsUrl("/siga/primeiros-passos.html")}>Ler os manuais</a>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/">Voltar ao início</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </MarketingLayout>
  )
}
