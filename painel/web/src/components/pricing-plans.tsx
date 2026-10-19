"use client"

import { useEffect, useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sparkles, Check, ChevronDown } from "lucide-react"
import { cn } from '@/lib/utils'
import { fetchSaasCatalog, formatAoaPrice, planLimitFeatures, type SaasPlan } from '@/lib/saas-api'
import {
  BILLING_PERIOD_LABEL,
  BILLING_PERIOD_UNIT,
  DEFAULT_BILLING,
  enabledPeriods,
  periodPrice,
  type BillingPeriodCode,
  type BillingSettings,
} from '@/lib/billing-periods'
import { PLAN_MODULES, planDetail } from '@/lib/plan-details'

export interface PricingPlan {
  id: string
  name: string
  description: string
  price: string
  frequency: string
  features: string[]
  popular?: boolean
  current?: boolean
  /** Linha por baixo do preço: «1 200 000 Kz cobrado anualmente · poupa 240 000 Kz». */
  billedNote?: string
}

interface PricingPlansProps {
  plans?: PricingPlan[]
  mode?: 'pricing' | 'billing'
  /** Periodicidade inicial; com o catálogo real, o visitante muda-a no selector. */
  billingPeriod?: BillingPeriodCode
  currentPlanId?: string
  onPlanSelect?: (planId: string) => void
}

const POPULAR_PLAN_CODE = 'professional'

export function PricingPlans({
  plans,
  mode = 'pricing',
  billingPeriod = 'monthly',
  currentPlanId,
  onPlanSelect,
}: PricingPlansProps) {
  const [catalog, setCatalog] = useState<{ plans: SaasPlan[]; billing: BillingSettings } | null>(
    null,
  )
  const [period, setPeriod] = useState<BillingPeriodCode>(billingPeriod)

  useEffect(() => {
    if (plans) return // o chamador já trouxe os planos (ex.: contexto de facturação real)
    let cancelled = false
    void fetchSaasCatalog().then((result) => {
      if (!cancelled && result.plans.length) setCatalog(result)
    })
    return () => {
      cancelled = true
    }
  }, [plans])

  const billing = catalog?.billing ?? DEFAULT_BILLING
  const periods = enabledPeriods(billing)
  const activePeriod = periods.some((p) => p.code === period) ? period : (periods[0]?.code ?? 'monthly')
  const fetchedPlans: PricingPlan[] | null = catalog
    ? catalog.plans.map((plan) => {
        const price = periodPrice(plan.price_aoa_monthly, activePeriod, billing)
        return {
          id: plan.code,
          name: plan.name,
          description: planDetail(plan.code)?.pitch ?? plan.description ?? '',
          // Como no Claude: preço por mês em destaque e o total do período por baixo.
          price: price ? (formatAoaPrice(price.perMonth) ?? 'Sob consulta') : 'Sob consulta',
          frequency: '/mês',
          billedNote:
            price && price.months > 1
              ? `${formatAoaPrice(price.total)} cobrado ${BILLING_PERIOD_UNIT[activePeriod]}${
                  price.savingsKz > 0 ? ` · poupa ${formatAoaPrice(price.savingsKz)}` : ''
                }`
              : undefined,
          features: planLimitFeatures(plan),
          popular: plan.code === POPULAR_PLAN_CODE,
        }
      })
    : null

  const resolvedPlans = plans ?? fetchedPlans ?? []

  const getButtonText = (plan: PricingPlan) => {
    if (mode === 'billing') {
      if (currentPlanId === plan.id) {
        return 'Plano actual'
      }
      const currentIndex = resolvedPlans.findIndex((p) => p.id === currentPlanId)
      const planIndex = resolvedPlans.findIndex((p) => p.id === plan.id)

      if (planIndex > currentIndex) {
        return 'Subir de plano'
      } else if (planIndex < currentIndex) {
        return 'Descer de plano'
      }
    }
    return 'Começar'
  }

  const getButtonVariant = (plan: PricingPlan) => {
    if (mode === 'billing' && currentPlanId === plan.id) {
      return 'outline' as const
    }
    return plan.popular ? ('default' as const) : ('outline' as const)
  }

  const isButtonDisabled = (plan: PricingPlan) => {
    return mode === 'billing' && currentPlanId === plan.id
  }

  if (resolvedPlans.length === 0) {
    return (
      <p className="text-muted-foreground text-center text-sm">A carregar planos…</p>
    )
  }

  return (
    <div className='space-y-10'>
    {catalog && periods.length > 1 ? (
      <div className='flex justify-center'>
        <div
          role='group'
          aria-label='Periodicidade do pagamento'
          className='bg-background/80 inline-flex flex-wrap justify-center gap-1 rounded-full border p-1 text-sm shadow-sm backdrop-blur'
        >
          {periods.map((p) => (
            <button
              key={p.code}
              type='button'
              aria-pressed={activePeriod === p.code}
              onClick={() => setPeriod(p.code)}
              className={cn(
                'text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors',
                activePeriod === p.code && 'bg-primary text-primary-foreground',
              )}
            >
              {BILLING_PERIOD_LABEL[p.code]}
              {p.discountPct > 0 ? (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[11px] font-semibold',
                    activePeriod === p.code
                      ? 'bg-primary-foreground/20'
                      : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
                  )}
                >
                  −{Math.round(p.discountPct)}%
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    ) : null}
    <div className={cn('grid gap-8', resolvedPlans.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
      {resolvedPlans.map((tier) => (
        <Card
          key={tier.id}
          className={cn('flex flex-col pt-0', {
            // Destaque único da página: contorno em gradiente animado (index.css).
            'aurora-ring border-transparent relative shadow-lg': tier.popular && mode === 'pricing',
            'border-primary relative shadow-lg': tier.popular && mode !== 'pricing',
            'border-primary': currentPlanId === tier.id && mode === 'billing',
          })}
          aria-labelledby={`${tier.id}-title`}
        >
          {tier.popular && (
            <div className='absolute start-0 -top-3 w-full'>
              <Badge className='mx-auto flex w-fit gap-1.5 rounded-full font-medium'>
                <Sparkles className='!size-4' />
                {mode === 'pricing' && (
                <span>Mais popular</span>
                )}
                {currentPlanId === tier.id && mode === 'billing' && (
                  <span>Plano actual</span>
                )}
              </Badge>
            </div>
          )}
          <CardHeader className='space-y-2 pt-8 text-center'>
            <CardTitle id={`${tier.id}-title`} className='text-2xl'>
              {tier.name}
            </CardTitle>
            <p className='text-muted-foreground text-sm text-balance'>{tier.description}</p>
          </CardHeader>
          <CardContent className='flex flex-1 flex-col space-y-6'>
            <div className='flex flex-wrap items-baseline justify-center gap-x-1'>
              <span className='text-3xl font-bold tabular-nums xl:text-4xl'>{tier.price}</span>
              <span className='text-muted-foreground text-sm'>{tier.frequency}</span>
              {tier.billedNote ? (
                <p className='text-muted-foreground w-full text-center text-xs'>{tier.billedNote}</p>
              ) : null}
            </div>
            <div className='space-y-2'>
              {tier.features.map(feature => (
                <div key={feature} className='flex items-center gap-2'>
                  <div className='bg-muted rounded-full p-1'>
                    <Check className='size-3.5' />
                  </div>
                  <span className='text-sm'>{feature}</span>
                </div>
              ))}
            </div>
            <PlanMore code={tier.id} />
          </CardContent>
          <CardFooter>
            <Button
              className='w-full cursor-pointer'
              size='lg'
              variant={getButtonVariant(tier)}
              disabled={isButtonDisabled(tier)}
              onClick={() => onPlanSelect?.(tier.id)}
              aria-label={`${getButtonText(tier)} - ${tier.name} plan`}
            >
              {getButtonText(tier)}
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
    </div>
  )
}

/** «Ver mais»: para quem é, o que distingue o pacote e os módulos de todos. */
function PlanMore({ code }: { code: string }) {
  const [open, setOpen] = useState(false)
  const detail = planDetail(code)
  if (!detail) return null
  const id = `plan-more-${code}`
  return (
    <div className='text-sm'>
      <button
        type='button'
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className='text-primary inline-flex items-center gap-1 font-medium hover:underline'
      >
        {open ? 'Ver menos' : 'Ver mais'}
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div id={id} className='bg-muted/50 text-muted-foreground mt-3 space-y-3 rounded-lg p-3 text-xs'>
          <p>
            <span className='text-foreground font-medium'>Ideal para: </span>
            {detail.idealFor}
          </p>
          <ul className='space-y-1'>
            {detail.highlights.map((item) => (
              <li key={item} className='flex items-start gap-1.5'>
                <Check className='text-primary mt-0.5 size-3.5 shrink-0' />
                {item}
              </li>
            ))}
          </ul>
          {PLAN_MODULES.map((group) => (
            <div key={group.title}>
              <p className='text-foreground font-medium'>{group.title}</p>
              <p>{group.items.join(' · ')}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
