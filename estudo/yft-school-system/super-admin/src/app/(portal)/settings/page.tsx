import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { LogOut, Shield, Sparkles, Workflow, Settings, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const checkpoints = [
  'Firebase login + middleware verification',
  'Worker API proxy with API key isolation',
  'School onboarding flow and temporary password handoff',
  'Route guards for dashboard, schools, and settings',
];

export default function SettingsPage() {
  return (
    <div className="grid gap-8 xl:grid-cols-[1.4fr_0.6fr]">
      <Card className="rounded-[2.5rem] border-none bg-white p-4 premium-shadow">
        <CardHeader className="pb-10">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#3b82f6]">
              <Settings className="size-7" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-[#1a1c21]">Portal Operations</CardTitle>
              <CardDescription className="text-sm font-medium text-[#7c8b9a]">
                Global management and architectural overview.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-10">
          <div className="grid gap-6 md:grid-cols-2">
            {[
              { icon: Shield, title: 'Security', text: 'Hardened by middleware and Firebase super admin session boundaries.', color: 'bg-indigo-50 text-indigo-600' },
              { icon: Workflow, title: 'Architecture', text: 'Reads use direct Worker D1 access; writes are proxied via Next handlers.', color: 'bg-emerald-50 text-emerald-600' },
              { icon: Sparkles, title: 'Visual Engine', text: 'Premium Behance-inspired aesthetic with soft shadows and Jakarta Sans.', color: 'bg-purple-50 text-purple-600' },
              { icon: LogOut, title: 'Session Control', text: 'Full browser and cookie clearance logic implemented for security.', color: 'bg-rose-50 text-rose-600' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="group rounded-3xl bg-slate-50/50 p-6 transition-colors hover:bg-slate-50">
                  <div className={cn("flex size-11 items-center justify-center rounded-2xl font-bold transition-transform group-hover:scale-110", item.color)}>
                    <Icon className="size-5" />
                  </div>
                  <p className="mt-5 font-bold text-[#1a1c21]">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[#7c8b9a] font-medium">{item.text}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[2.5rem] border-none bg-white p-4 premium-shadow">
        <CardHeader className="pb-8">
          <CardTitle className="text-xl font-bold text-[#1a1c21]">Onboarding Stack</CardTitle>
          <CardDescription className="text-sm font-medium text-[#7c8b9a]">Verified system capabilities.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            {checkpoints.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-5 py-4 text-sm font-bold text-[#7c8b9a]">
                <div className="size-1.5 rounded-full bg-primary" />
                {item}
              </div>
            ))}
          </div>
          
          <Separator className="bg-slate-50" />
          
          <div className="space-y-4">
            <Button asChild className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20">
              <Link href="/schools/new" className="flex items-center gap-2">
                <Plus className="size-4" />
                Onboard new school
              </Link>
            </Button>
            
            <div className="flex items-center justify-center gap-2 rounded-xl bg-orange-100/50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-orange-600">
              <Shield className="size-3" />
              Portal Access Restricted
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
