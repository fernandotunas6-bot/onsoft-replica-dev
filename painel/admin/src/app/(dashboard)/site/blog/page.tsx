"use client"

import { useCallback, useEffect, useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { SitePage } from "@/components/site/site-page"
import { formatDate, siteApi, type BlogPostDraft, type BlogPostRow, type BlogStatus } from "@/lib/site-api"

const STATUS_LABEL: Record<BlogStatus, string> = {
  draft: "Rascunho",
  published: "Publicado",
  archived: "Arquivado",
}

const EMPTY: BlogPostDraft = {
  title: "",
  slug: "",
  excerpt: "",
  body: "",
  category: "Novidades",
  coverUrl: "",
  authorName: "",
  status: "draft",
}

export default function SiteBlogPage() {
  const [posts, setPosts] = useState<BlogPostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [draft, setDraft] = useState<BlogPostDraft | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await siteApi.posts()
    setLoading(false)
    if (!result.ok) {
      setNeedsAuth(result.needsAuth)
      setError(result.needsAuth ? null : result.error)
      return
    }
    setNeedsAuth(false)
    setError(null)
    setPosts(result.data.posts)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft) return
    setSaving(true)
    const result = await siteApi.savePost({ ...draft, slug: draft.slug?.trim() || undefined })
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setDraft(null)
    await load()
  }

  async function remove(post: BlogPostRow) {
    if (!window.confirm(`Apagar «${post.title}»? Não dá para desfazer.`)) return
    const result = await siteApi.deletePost(post.id)
    if (!result.ok) setError(result.error)
    await load()
  }

  const edit = (post: BlogPostRow) =>
    setDraft({
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      body: post.body,
      category: post.category,
      coverUrl: post.coverUrl ?? "",
      authorName: post.authorName ?? "",
      status: post.status,
    })

  return (
    <SitePage
      title="Blog do site"
      description="Artigos do site SIGA Plus. Só os publicados aparecem em /blog e na página inicial."
      sitePath="/blog"
      next="/site/blog"
      needsAuth={needsAuth}
      error={error}
      actions={
        <Button size="sm" className="gap-1.5" onClick={() => setDraft({ ...EMPTY })} disabled={needsAuth}>
          <Plus className="size-4" aria-hidden="true" />
          Novo artigo
        </Button>
      }
    >
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Publicado</TableHead>
                <TableHead className="text-right">Acções</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    A carregar…
                  </TableCell>
                </TableRow>
              ) : posts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    Ainda não há artigos. Escreva o primeiro em «Novo artigo».
                  </TableCell>
                </TableRow>
              ) : (
                posts.map((post) => (
                  <TableRow key={post.id}>
                    <TableCell>
                      <div className="font-medium">{post.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {post.category} · /blog/{post.slug}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={post.status === "published" ? "default" : "secondary"}>
                        {STATUS_LABEL[post.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(post.publishedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => edit(post)} aria-label={`Editar ${post.title}`}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void remove(post)}
                        aria-label={`Apagar ${post.title}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {draft ? (
            <form onSubmit={(event) => void save(event)} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{draft.id ? "Editar artigo" : "Novo artigo"}</DialogTitle>
                <DialogDescription>
                  O texto aceita parágrafos, **negrito**, listas com «- » e ligações [texto](https://…).
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="post-title">Título</Label>
                  <Input
                    id="post-title"
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    required
                    minLength={3}
                    maxLength={160}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="post-slug">Endereço (opcional)</Label>
                  <Input
                    id="post-slug"
                    value={draft.slug ?? ""}
                    onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                    placeholder="gerado a partir do título"
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="post-category">Categoria</Label>
                  <Input
                    id="post-category"
                    value={draft.category}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                    required
                    maxLength={60}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="post-excerpt">Resumo</Label>
                  <Textarea
                    id="post-excerpt"
                    value={draft.excerpt}
                    onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })}
                    rows={2}
                    maxLength={400}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="post-body">Texto</Label>
                  <Textarea
                    id="post-body"
                    value={draft.body}
                    onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                    rows={12}
                    maxLength={60000}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="post-cover">Imagem de capa (https, opcional)</Label>
                  <Input
                    id="post-cover"
                    type="url"
                    value={draft.coverUrl}
                    onChange={(e) => setDraft({ ...draft, coverUrl: e.target.value })}
                    placeholder="https://…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="post-author">Autor (opcional)</Label>
                  <Input
                    id="post-author"
                    value={draft.authorName}
                    onChange={(e) => setDraft({ ...draft, authorName: e.target.value })}
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="post-status">Estado</Label>
                  <Select
                    value={draft.status}
                    onValueChange={(value) => setDraft({ ...draft, status: value as BlogStatus })}
                  >
                    <SelectTrigger id="post-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABEL) as BlogStatus[]).map((status) => (
                        <SelectItem key={status} value={status}>
                          {STATUS_LABEL[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "A guardar…" : draft.status === "published" ? "Guardar e publicar" : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </SitePage>
  )
}
