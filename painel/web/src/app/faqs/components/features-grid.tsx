import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from '@/components/ui/button'
import { ArrowRight, Sparkles, Shield, Truck, Clock } from 'lucide-react'
import { getDocsUrl } from '@/lib/ecosystem-urls'

interface FeatureItem {
  id: number
  title: string
  description: string
  icon: string
  /** Caminho do site, ou `docs:/…` para um manual do DOC. */
  href: string
}

interface FeaturesGridProps {
  features: FeatureItem[]
}

const iconMap = {
  Sparkles,
  Shield,
  Truck,
  Clock,
}

export function FeaturesGrid({ features }: FeaturesGridProps) {
  return (
    <div className='grid gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4 mt-8'>
      {features.map(feature => {
        const IconComponent = iconMap[feature.icon as keyof typeof iconMap]
        return (
          <article key={feature.id} className='group'>
            <Card className='relative h-full overflow-hidden transition-all hover:shadow-md'>
              <CardContent className='px-6'>
                <Badge variant='secondary' className='mb-4 inline-flex size-12 items-center justify-center'>
                  <IconComponent className='!size-5' aria-hidden='true' />
                </Badge>
                <h3 className='mb-2 text-lg font-semibold'>{feature.title}</h3>
                <p className='text-muted-foreground mb-4 text-sm'>{feature.description}</p>

                <Button
                  variant='link'
                  size='sm'
                  className='text-muted-foreground hover:text-foreground h-auto cursor-pointer !p-0 text-sm'
                  asChild
                >
                  <a
                    href={
                      feature.href.startsWith('docs:')
                        ? getDocsUrl(feature.href.slice('docs:'.length))
                        : feature.href
                    }
                  >
                    Saber mais
                    <span className='sr-only'>: {feature.title}</span>
                    <ArrowRight className='ms-1.5 size-4' aria-hidden='true' />
                  </a>
                </Button>
              </CardContent>
            </Card>
          </article>
        )
      })}
    </div>
  )
}
