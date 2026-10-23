"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  Building2,
  CircleUserRound,
  LogOut,
  Plus,
  Settings2,
  ShieldCheck,
  Menu,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { clearPortalToken } from '@/lib/portal-session';

const navigation = [
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/schools', label: 'Schools', icon: Building2 },
  { href: '/schools/new', label: 'Onboard School', icon: Plus },
  { href: '/settings', label: 'Settings', icon: Settings2 },
] as const;

export function AppShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await fetch('/api/session/logout', { method: 'POST' });
    await clearPortalToken();
    router.push('/login');
    router.refresh();
  }

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-8 py-10">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <ShieldCheck className="size-5" />
          </div>
          <h1 className="font-[var(--font-space-grotesk)] text-2xl font-bold tracking-tight text-[#1a1c21]">
            YFT<span className="text-primary font-black">!</span>
          </h1>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(false)}
          className="lg:hidden text-[#7c8b9a] hover:text-[#1a1c21]"
        >
          <X className="size-6" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-4">
        {navigation.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-3 rounded-2xl px-5 py-3.5 text-sm font-semibold transition-all',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-[#7c8b9a] hover:bg-slate-50 hover:text-[#1a1c21]'
              )}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 h-6 w-1 rounded-r-full bg-primary"
                />
              )}
              <Icon className={cn('size-5', active ? 'text-primary' : 'text-[#7c8b9a] group-hover:text-[#1a1c21]')} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-6">
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#7c8b9a]">Global Status</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
            <p className="text-sm font-bold text-[#1a1c21]">All Systems Go</p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="mt-4 w-full justify-start rounded-xl px-4 text-[#7c8b9a] hover:bg-rose-50 hover:text-rose-600"
          onClick={handleLogout}
        >
          <LogOut className="mr-3 size-4" />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] selection:bg-primary/10">
      {/* Desktop Sidebar */}
      <aside className="premium-sidebar fixed left-0 top-0 z-40 hidden h-screen w-72 lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence mode="wait">
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="premium-sidebar absolute left-0 top-0 h-full w-[280px] shadow-2xl"
            >
              <SidebarContent />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="transition-all duration-300 lg:pl-72">
        <div className="flex min-h-screen flex-col">
          {/* Topbar */}
          <header className="sticky top-0 z-30 w-full bg-white/90 shadow-sm backdrop-blur-2xl px-4 sm:px-8">
            <div className="flex h-[72px] items-center justify-between pt-[env(safe-area-inset-top,0px)] sm:h-20 sm:pt-0">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="group flex size-11 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition-all hover:ring-primary/20 active:scale-90 lg:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="size-6 text-[#1a1c21] transition-colors group-hover:text-primary" />
                </button>
                
                <div className="relative hidden w-full max-w-sm sm:block md:max-w-md">
                  <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[#7c8b9a]">
                    <Plus className="size-4 rotate-45" />
                  </div>
                  <input
                    type="text"
                    placeholder="Quick search..."
                    className="h-11 w-full rounded-2xl border-none bg-slate-50 px-11 text-sm ring-1 ring-slate-100 transition-all focus:bg-white focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 sm:gap-6">
                <button className="relative hidden rounded-xl p-2.5 text-[#7c8b9a] transition-all hover:bg-slate-50 hover:text-[#1a1c21] sm:flex">
                  <Settings2 className="size-5" />
                  <span className="absolute right-2.5 top-2.5 size-2 rounded-full border-2 border-white bg-rose-500" />
                </button>

                <div className="hidden h-8 w-px bg-slate-200 sm:block" />

                <div className="flex items-center gap-3">
                  <div className="hidden text-right min-[480px]:block">
                    <p className="text-sm font-bold text-[#1a1c21]">Super Admin</p>
                    <p className="text-[11px] font-medium text-[#7c8b9a]">Master Control</p>
                  </div>
                  <div className="flex size-10 items-center justify-center rounded-xl bg-[#f4f2ff] text-primary transition-transform hover:scale-105 sm:size-11 sm:rounded-2xl">
                    <CircleUserRound className="size-6" />
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="flex-1 px-4 pb-8 pt-2 sm:px-8 sm:pt-4">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
