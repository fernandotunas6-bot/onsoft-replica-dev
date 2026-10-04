"use client"

import { useEffect, useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sparkles, Check } from "lucide-react"
import { cn } from '@/lib/utils'
import { fetchSaasPlans, formatAoaPrice, planLimitFeatures } from '@/lib/saas-api'

export interface PricingPlan {
  id: string
  name: string
  description: string
  price: string
  frequency: string
  features: string[]
  popular?: boolean
  current?: boolean
}

interface PricingPlansProps {
  plans?: PricingPlan[]
  mode?: 'pricing' | 'billing'
  /** Alterna entre mensal e anual quando os planos vêm do catálogo real (ambos os preços existem no plano). */
  billingPeriod?: 'monthly' | 'yearly'
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
  const [fetchedPlans, setFetchedPlans] = useState<PricingPlan[] | null>(null)

  useEffect(() => {
    if (plans) return // o chamador já trouxe os planos (ex.: contexto de facturação real)
    let cancelled = false
    void fetchSaasPlans().then((list) => {
      if (cancelled || !list.length) return
      setFetchedPlans(
        list.map((plan) => {
          const priceValue =
            billingPeriod === 'yearly' ? plan.price_aoa_yearly : plan.price_aoa_monthly
          return {
            id: plan.code,
            name: plan.name,
            description: plan.description ?? '',
            price: formatAoaPrice(priceValue) ?? 'Sob consulta',
            frequency: billingPeriod === 'yearly' ? '/ano' : '/mês',
            features: planLimitFeatures(plan),
            popular: plan.code === POPULAR_PLAN_CODE,
          }
        }),
      )
    })
    return () => {
      cancelled = true
    }
  }, [plans, billingPeriod])

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
  )
}
