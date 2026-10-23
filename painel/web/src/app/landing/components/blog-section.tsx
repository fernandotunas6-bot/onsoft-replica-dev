import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatPostDate, type BlogPostSummary } from "@/lib/site-content"
import { PostCard } from "@/components/blog/post-card"

/** Últimos artigos publicados no ADMIN. Sem artigos, a secção não aparece. */
export function BlogSection({ posts }: { posts: BlogPostSummary[] | null | undefined }) {
  if (!posts?.length) return null
  return (
    <section id="blog" aria-labelledby="blog-title" className="py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <Badge variant="outline" className="mb-4">
            Blog
          </Badge>
          <h2 id="blog-title" className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Novidades do SIGA Plus
          </h2>
          <p className="text-muted-foreground text-lg">
            O que mudou no sistema e boas práticas para a secretaria, a tesouraria e os professores.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} date={formatPostDate(post.publishedAt)} />
          ))}
        </div>
        <div className="mt-10 text-center">
          <Button variant="outline" asChild>
            <Link to="/blog" className="gap-2">
              Ver todos os artigos
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
