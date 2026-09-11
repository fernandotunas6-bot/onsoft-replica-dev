"use client"

import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useEffect, useState } from 'react'
import { getCreateSchoolUrl } from '@/lib/ecosystem-urls'
import { fetchSaasPlans, formatAoaPrice, planLimitFeatures, type SaasPlan } from '@/lib/saas-api'

const POPULAR_PLAN_CODE = 'professional'

export function PricingSection() {
  const [isYearly, setIsYearly] = useState(false)
  const [plans, setPlans] = useState<SaasPlan[]>([])

  useEffect(() => {
    void fetchSaasPlans().then((list) => {
      if (list.length) setPlans(list)
    })
  }, [])

  return (
    <section id="pricing" className="py-24 sm:py-32 bg-muted/40">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-12">
          <Badge variant="outline" className="mb-4">Planos</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Escolha o plano da sua escola
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Comece com 14 dias de período experimental e evolua quando a escola crescer.
          </p>

          <div className="flex items-center justify-center mb-2">
            <ToggleGroup
              type="single"
              value={isYearly ? "yearly" : "monthly"}
              onValueChange={(value) => setIsYearly(value === "yearly")}
              className="bg-secondary text-secondary-foreground border-none rounded-full p-1 cursor-pointer shadow-none"
            >
              <ToggleGroupItem
                value="monthly"
                className="data-[state=on]:bg-background data-[state=on]:border-border border-transparent border px-6 !rounded-full data-[state=on]:text-foreground hover:bg-transparent cursor-pointer transition-colors duration-100"
              >
                Mensal
              </ToggleGroupItem>
              <ToggleGroupItem
                value="yearly"
                className="data-[state=on]:bg-background data-[state=on]:border-border border-transparent border px-6 !rounded-full data-[state=on]:text-foreground hover:bg-transparent cursor-pointer transition-colors duration-100"
              >
                Anual
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <div className="mx-auto max-w-6xl">
          <div className="rounded-xl border">
            <div className={`grid ${plans.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
              {plans.map((plan) => {
                const popular = plan.code === POPULAR_PLAN_CODE
                const priceValue = isYearly ? plan.price_aoa_yearly : plan.price_aoa_monthly
                return (
                  <div
                    key={plan.code}
                    className={`p-8 grid grid-rows-subgrid row-span-4 gap-6 ${
                      popular
                        ? 'my-2 mx-4 rounded-xl bg-card border-transparent shadow-xl ring-1 ring-foreground/10 backdrop-blur'
                        : ''
                    }`}
                  >
                    <div>
                      <div className="text-lg font-medium tracking-tight mb-2">{plan.name}</div>
                      <div className="text-muted-foreground text-balance text-sm">
                        {plan.description}
                      </div>
                    </div>

                    <div>
                      <div className="text-4xl font-bold mb-1">
                        {formatAoaPrice(priceValue) ?? 'Sob consulta'}
                      </div>
                      <div className="text-muted-foreground text-sm">
                        {isYearly ? 'Por ano' : 'Por mês'}
                      </div>
                    </div>

                    <div>
                      <Button
                        className={`w-full cursor-pointer my-2 ${
                          popular
                            ? 'shadow-md border-[0.5px] border-white/25 shadow-black/20 bg-primary ring-1 ring-primary/15 text-primary-foreground hover:bg-primary/90'
                            : 'shadow-sm shadow-black/15 border border-transparent bg-background ring-1 ring-foreground/10 hover:bg-muted/50'
                        }`}
                        variant={popular ? 'default' : 'secondary'}
                        asChild
                      >
                        <a href={getCreateSchoolUrl(plan.code)}>Começar</a>
                      </Button>
                    </div>

                    <div>
                      <ul role="list" className="space-y-3 text-sm">
                        {planLimitFeatures(plan).map((feature) => (
                          <li key={feature} className="flex items-center gap-3">
                            <Check
                              className="text-muted-foreground size-4 flex-shrink-0"
                              strokeWidth={2.5}
                            />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-16 text-center">
          <p className="text-muted-foreground">
            Precisa de um plano à medida?{' '}
            <Button variant="link" className="p-0 h-auto cursor-pointer" asChild>
              <a href="#contact">
                Fale connosco
              </a>
            </Button>
          </p>
        </div>
      </div>
    </section>
  )
}
