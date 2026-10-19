"use client"

import { useCallback, useEffect, useState } from "react"
import { Pencil, Plus, Star, Trash2 } from "lucide-react"
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
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { SitePage } from "@/components/site/site-page"
import { siteApi, type FaqDraft, type FaqRow } from "@/lib/site-api"

export default function SiteFaqsPage() {
  const [faqs, setFaqs] = useState<FaqRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [draft, setDraft] = useState<FaqDraft | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await siteApi.faqs()
    setLoading(false)
    if (!result.ok) {
      setNeedsAuth(result.needsAuth)
      setError(result.needsAuth ? null : result.error)
      return
    }
    setNeedsAuth(false)
    setError(null)
    setFaqs(result.data.faqs)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const nextOrder = () => (faqs.length ? Math.max(...faqs.map((f) => f.sortOrder)) + 10 : 10)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft) return
    setSaving(true)
    const result = await siteApi.saveFaq(draft)
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setDraft(null)
    await load()
  }

  async function remove(faq: FaqRow) {
    if (!window.confirm(`Apagar a pergunta «${faq.question}»?`)) return
    const result = await siteApi.deleteFaq(faq.id)
    if (!result.ok) setError(result.error)
    await load()
  }

  return (
    <SitePage
      title="Perguntas frequentes do site"
      description="As marcadas com estrela aparecem na página inicial; todas as publicadas aparecem em /faqs."
      sitePath="/faqs"
      next="/site/faqs"
      needsAuth={needsAuth}
      error={error}
      actions={
        <Button
          size="sm"
          className="gap-1.5"
          disabled={needsAuth}
          onClick={() =>
            setDraft({
              question: "",
              answer: "",
              category: "Geral",
              featured: false,
              isPublished: true,
              sortOrder: nextOrder(),
            })
          }
        >
          <Plus className="size-4" aria-hidden="true" />
          Nova pergunta
        </Button>
      }
    >
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Ordem</TableHead>
                <TableHead>Pergunta</TableHead>
                <TableHead>Estado</TableHead>
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
              ) : faqs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    Sem perguntas: o site mostra as perguntas fixas até criar a primeira.
                  </TableCell>
                </TableRow>
              ) : (
                faqs.map((faq) => (
                  <TableRow key={faq.id}>
                    <TableCell className="text-sm text-muted-foreground">{faq.sortOrder}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 font-medium">
                        {faq.featured ? (
                          <Star className="size-3.5 fill-current text-amber-500" aria-label="Na página inicial" />
                        ) : null}
                        {faq.question}
                      </div>
                      <div className="text-xs text-muted-foreground">{faq.category}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={faq.isPublished ? "default" : "secondary"}>
                        {faq.isPublished ? "Publicada" : "Escondida"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDraft({ ...faq })}
                        aria-label={`Editar ${faq.question}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void remove(faq)}
                        aria-label={`Apagar ${faq.question}`}
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
        <DialogContent className="sm:max-w-2xl">
          {draft ? (
            <form onSubmit={(event) => void save(event)} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{draft.id ? "Editar pergunta" : "Nova pergunta"}</DialogTitle>
                <DialogDescription>Escreva para quem gere uma escola, sem termos técnicos.</DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="faq-question">Pergunta</Label>
                <Input
                  id="faq-question"
                  value={draft.question}
                  onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                  required
                  minLength={3}
                  maxLength={300}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="faq-answer">Resposta</Label>
                <Textarea
                  id="faq-answer"
                  value={draft.answer}
                  onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
                  rows={5}
                  required
                  minLength={3}
                  maxLength={4000}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="faq-category">Categoria</Label>
                  <Input
                    id="faq-category"
                    value={draft.category}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                    required
                    maxLength={60}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="faq-order">Ordem</Label>
                  <Input
                    id="faq-order"
                    type="number"
                    min={0}
                    value={draft.sortOrder}
                    onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={draft.isPublished}
                    onCheckedChange={(value) => setDraft({ ...draft, isPublished: value })}
                  />
                  Publicada
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={draft.featured}
                    onCheckedChange={(value) => setDraft({ ...draft, featured: value })}
                  />
                  Na página inicial
                </label>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "A guardar…" : "Guardar"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </SitePage>
  )
}
