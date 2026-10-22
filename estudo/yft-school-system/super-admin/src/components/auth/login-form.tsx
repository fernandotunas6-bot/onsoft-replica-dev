"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { getFirebaseAuth } from '@/lib/firebase';
import { storePortalToken } from '@/lib/portal-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const auth = getFirebaseAuth();
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const tokenResult = await credential.user.getIdTokenResult(true);
      const token = tokenResult.token;
      const claims = tokenResult.claims as { super_admin?: boolean; role?: string };
      const isSuperAdmin = claims.super_admin === true || claims.role === 'super_admin';

      if (!isSuperAdmin) {
        throw new Error('This account does not have super admin access.');
      }

      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          detail?: string;
        } | null;
        const serverMsg = body?.error ?? 'Unable to establish a session.';
        const hint =
          body?.detail && process.env.NODE_ENV === 'development'
            ? ` (${body.detail})`
            : '';
        throw new Error(`${serverMsg}${hint}`);
      }

      await storePortalToken(token);
      toast.success('Welcome back');
      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign in failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-10 text-left">
        <h1 className="text-3xl font-bold tracking-tight text-[#1a2b3b]">
          Log in to the Admin Dashboard
        </h1>
        <p className="mt-2 text-sm text-[#7c8b9a]">
          Sign in with your credentials to access the dashboard
        </p>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email" className="text-[11px] font-semibold uppercase tracking-wider text-[#7c8b9a]">
            Email address
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="admin@school-system.com"
            required
            className="slick-input h-12 px-4 shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-[11px] font-semibold uppercase tracking-wider text-[#7c8b9a]">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            required
            className="slick-input h-12 px-4 shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="remember"
            className="size-4 rounded border-[#eef1f5] text-[#e56464] focus:ring-[#e56464]/20"
          />
          <Label htmlFor="remember" className="text-xs font-medium text-[#7c8b9a]">
            Remember this computer
          </Label>
        </div>

        <Button
          type="submit"
          className="coral-btn h-12 w-full rounded-xl text-base font-semibold shadow-none"
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="mr-2 size-5 animate-spin" />
          ) : (
            "Log In"
          )}
        </Button>

        <div className="text-left">
          <a href="#" className="text-xs font-medium text-[#e56464] transition-opacity hover:opacity-80">
            Unable to login?
          </a>
        </div>
      </form>
    </div>
  );
}
