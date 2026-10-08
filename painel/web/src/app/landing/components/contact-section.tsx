"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { BookOpen, CircleHelp, Mail } from 'lucide-react'
import { getDocsUrl } from '@/lib/ecosystem-urls'
import { SUPPORT_EMAIL, supportMailto } from '@/lib/support-contact'
import { sendContactMessage } from '@/lib/site-content'

const contactFormSchema = z.object({
  name: z.string().trim().min(2, {
    message: "Escreva o seu nome.",
  }),
  email: z.string().trim().email({ message: "Introduza um e-mail válido." }).max(254),
  school: z.string().trim().max(160).optional(),
  subject: z.string().trim().min(5, {
    message: "O assunto precisa de pelo menos 5 caracteres.",
  }).max(160, { message: "O assunto tem no máximo 160 caracteres." }),
  message: z.string().trim().min(10, {
    message: "A mensagem precisa de pelo menos 10 caracteres.",
  }).max(5000, { message: "A mensagem tem no máximo 5000 caracteres." }),
  /** Campo escondido contra robôs (não aparece a pessoas nem a leitores de ecrã). */
  website: z.string().optional(),
})

type ContactForm = z.infer<typeof contactFormSchema>

export function ContactSection() {
  type Status =
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "sent" }
    | { kind: "error"; message: string }
    | { kind: "email"; message: string }
  const [status, setStatus] = useState<Status>({ kind: "idle" })
  const form = useForm<ContactForm>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: { name: "", email: "", school: "", subject: "", message: "", website: "" },
  })

  // A mensagem fica guardada para a equipa (ADMIN → Mensagens de contacto). Se o SIGA
  // não responder, prepara o mesmo texto no programa de e-mail, para não se perder.
  async function onSubmit(values: ContactForm) {
    setStatus({ kind: "sending" })
    const result = await sendContactMessage(values)
    if (result.ok) {
      setStatus({ kind: "sent" })
      form.reset()
      return
    }
    if (result.retryByEmail) {
      setStatus({ kind: "email", message: result.error })
      window.location.assign(supportMailto(values))
      return
    }
    setStatus({ kind: "error", message: result.error })
  }

  return (
    <section id="contact" className="py-24 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <Badge variant="outline" className="mb-4">Contacto</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Precisa de ajuda ou tem perguntas?
          </h2>
          <p className="text-lg text-muted-foreground">
            Escreva-nos sobre planos, demonstrações ou a criação da escola. Respondemos por e-mail.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Contact Options */}
          <div className="space-y-6 order-2 lg:order-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
                  E-mail
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-3">
                  Prefere escrever directamente? O suporte do SIGA Plus responde a partir deste endereço.
                </p>
                <Button variant="outline" size="sm" className="cursor-pointer" asChild>
                  <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
                  Manuais
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-3">
                  Guias em português por área: primeiros passos, pedagógica, tesouraria e acessos.
                </p>
                <Button variant="outline" size="sm" className="cursor-pointer" asChild>
                  <a href={getDocsUrl('/siga/primeiros-passos.html')}>Abrir manuais</a>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CircleHelp className="h-5 w-5 text-primary" aria-hidden="true" />
                  Perguntas frequentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-3">
                  Avaliação, planos, pagamentos e segurança, respondidos num minuto.
                </p>
                <Button variant="outline" size="sm" className="cursor-pointer" asChild>
                  <a href="/faqs">Ver perguntas</a>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-2 order-1 lg:order-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" aria-hidden="true" />
                  Escreva-nos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="relative space-y-6" noValidate>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nome</FormLabel>
                            <FormControl>
                              <Input autoComplete="name" placeholder="Maria Santos" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="school"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Escola (opcional)</FormLabel>
                            <FormControl>
                              <Input autoComplete="organization" placeholder="Colégio…" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>E-mail para a resposta</FormLabel>
                          <FormControl>
                            <Input type="email" autoComplete="email" placeholder="secretaria@escola.ao" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                      <label>
                        Não preencher
                        <input type="text" tabIndex={-1} autoComplete="off" {...form.register("website")} />
                      </label>
                    </div>
                    <FormField
                      control={form.control}
                      name="subject"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assunto</FormLabel>
                          <FormControl>
                            <Input placeholder="Pedido de plano, demonstração, suporte..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="message"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mensagem</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Como podemos ajudar a sua escola com o SIGA Plus?"
                              rows={10}
                              className="min-h-50"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full cursor-pointer" disabled={status.kind === "sending"}>
                      {status.kind === "sending" ? "A enviar…" : "Enviar mensagem"}
                    </Button>
                    <p
                      className={
                        status.kind === "error" ? "text-destructive text-center text-sm" : "text-muted-foreground text-center text-sm"
                      }
                      role="status"
                    >
                      {status.kind === "sent"
                        ? "Mensagem enviada. Respondemos para o seu e-mail."
                        : status.kind === "error"
                          ? status.message
                          : status.kind === "email"
                            ? `${status.message} Abrimos o seu programa de e-mail com a mensagem pronta para ${SUPPORT_EMAIL}: só falta enviar.`
                            : `Respondemos por e-mail. Também pode escrever para ${SUPPORT_EMAIL}.`}
                    </p>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  )
}
