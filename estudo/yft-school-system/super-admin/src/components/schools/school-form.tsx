"use client";

import { useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ChevronLeft, ChevronRight, ImagePlus, Loader2, School2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type OnboardSuccess = {
  school: {
    id: string;
    name: string;
    location: string | null;
    term_system: number;
    logo_url: string | null;
    student_id_prefix: string;
    teacher_id_prefix: string;
  };
  admin: {
    uid: string;
    email: string;
    temp_password: string;
  };
};

const initialState = {
  schoolName: '',
  location: '',
  termSystem: '3',
  schoolMotto: '',
  schoolPhone: '',
  schoolEmail: '',
  schoolAddress: '',
  defaultPassword: 'Welcome@123',
  studentIdPrefix: 'STU',
  teacherIdPrefix: 'TCH',
  adminName: '',
  adminPhone: '',
  adminEmail: '',
};

export function SchoolForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<OnboardSuccess | null>(null);
  const [form, setForm] = useState(initialState);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleLogoSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      toast.error('Please select a PNG, JPEG, WebP, or SVG image');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2 MB');
      return;
    }

    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  function clearLogo() {
    setLogoFile(null);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step < 4) {
      setStep((s) => s + 1);
      return;
    }

    setSubmitting(true);
    try {
      let logoUrl: string | null = null;

      if (logoFile) {
        setUploadingLogo(true);
        const fd = new FormData();
        fd.append('logo', logoFile);

        const uploadRes = await fetch('/api/super-admin/upload-logo', {
          method: 'POST',
          body: fd,
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => null);
          throw new Error(err?.error ?? 'Logo upload failed');
        }

        const { key } = (await uploadRes.json()) as { key: string };
        logoUrl = key;
        setUploadingLogo(false);
      }

      const response = await fetch('/api/super-admin/onboard-school', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school: {
            name: form.schoolName,
            location: form.location || null,
            term_system: Number(form.termSystem),
            logo_url: logoUrl,
            motto: form.schoolMotto || null,
            phone: form.schoolPhone || null,
            email: form.schoolEmail || null,
            address: form.schoolAddress || null,
            default_password: form.defaultPassword || 'Welcome@123',
            student_id_prefix: form.studentIdPrefix || 'STU',
            teacher_id_prefix: form.teacherIdPrefix || 'TCH',
          },
          admin: {
            name: form.adminName,
            phone: form.adminPhone,
            email: form.adminEmail,
          },
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? 'Unable to onboard school');
      }

      const payload = (await response.json()) as OnboardSuccess;
      setSuccess(payload);
      toast.success('School onboarded');
      setForm(initialState);
      clearLogo();
      setStep(1);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Onboarding failed');
    } finally {
      setSubmitting(false);
      setUploadingLogo(false);
    }
  }

  return (
    <>
      <Card className="w-full max-w-full min-w-0 overflow-hidden rounded-[2.5rem] border-none bg-white p-4 premium-shadow">
        <CardHeader className="pb-8">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-[#f4f2ff] text-[#6a5ae0]">
              <School2 className="size-7" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-[#1a1c21]">Onboard a school</CardTitle>
              <CardDescription className="text-sm font-medium text-[#7c8b9a]">
                Provision the tenant and create the primary administrator.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <form className="space-y-8" onSubmit={handleSubmit}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 pb-2">
              <div className={cn(
                "flex h-9 min-w-0 max-w-full items-center gap-2 rounded-xl px-3 text-xs font-black uppercase tracking-widest transition-colors sm:px-4",
                step >= 1 ? "bg-primary/10 text-primary" : "bg-slate-50 text-slate-400"
              )}>
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px]">1</span>
                <span className="truncate">School</span>
              </div>
              <ChevronRight className="hidden size-4 shrink-0 text-slate-200 sm:block" />
              <div className={cn(
                "flex h-9 min-w-0 max-w-full items-center gap-2 rounded-xl px-3 text-xs font-black uppercase tracking-widest transition-colors sm:px-4",
                step >= 2 ? "bg-primary/10 text-primary" : "bg-slate-50 text-slate-400"
              )}>
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px]">2</span>
                <span className="truncate">Details</span>
              </div>
              <ChevronRight className="hidden size-4 shrink-0 text-slate-200 sm:block" />
              <div className={cn(
                "flex h-9 min-w-0 max-w-full items-center gap-2 rounded-xl px-3 text-xs font-black uppercase tracking-widest transition-colors sm:px-4",
                step >= 3 ? "bg-primary/10 text-primary" : "bg-slate-50 text-slate-400"
              )}>
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px]">3</span>
                <span className="truncate">Config</span>
              </div>
              <ChevronRight className="hidden size-4 shrink-0 text-slate-200 sm:block" />
              <div className={cn(
                "flex h-9 min-w-0 max-w-full items-center gap-2 rounded-xl px-3 text-xs font-black uppercase tracking-widest transition-colors sm:px-4",
                step >= 4 ? "bg-primary/10 text-primary" : "bg-slate-50 text-slate-400"
              )}>
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px]">4</span>
                <span className="truncate">Admin</span>
              </div>
            </div>

            {step === 1 ? (
              <div className="grid gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="space-y-2">
                  <Label htmlFor="schoolName" className="text-xs font-bold uppercase tracking-widest text-[#7c8b9a]">School name</Label>
                  <Input
                    id="schoolName"
                    value={form.schoolName}
                    onChange={(event) => setForm((current) => ({ ...current, schoolName: event.target.value }))}
                    placeholder="e.g. Bright Horizon Academy"
                    required
                    className="h-12 rounded-xl border-none bg-slate-50 px-4 ring-1 ring-slate-100 focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="location" className="text-xs font-bold uppercase tracking-widest text-[#7c8b9a]">Location</Label>
                    <Input
                      id="location"
                      value={form.location}
                      onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
                      placeholder="Accra, Ghana"
                      className="h-12 rounded-xl border-none bg-slate-50 px-4 ring-1 ring-slate-100 focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="termSystem" className="text-xs font-bold uppercase tracking-widest text-[#7c8b9a]">Term system</Label>
                    <Select
                      id="termSystem"
                      value={form.termSystem}
                      onChange={(event) => setForm((current) => ({ ...current, termSystem: event.target.value }))}
                      options={[
                        { value: '3', label: 'Trimester' },
                        { value: '2', label: 'Semester' },
                      ]}
                      className="h-12 rounded-xl border-none bg-slate-50 px-4 ring-1 ring-slate-100 focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </div>
            ) : step === 2 ? (
              <div className="grid gap-6 md:grid-cols-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="space-y-2 col-span-full">
                  <Label className="text-xs font-bold uppercase tracking-widest text-[#7c8b9a]">School Logo</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleLogoSelect}
                    className="hidden"
                  />
                  {logoPreview ? (
                    <div className="relative inline-block">
                      <div className="size-28 rounded-2xl overflow-hidden border-2 border-dashed border-primary/30 bg-slate-50">
                        <Image src={logoPreview} alt="Logo preview" width={112} height={112} className="size-full object-contain" unoptimized />
                      </div>
                      <button
                        type="button"
                        onClick={clearLogo}
                        className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-rose-500 text-white shadow-md hover:bg-rose-600"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex size-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 transition-colors hover:border-primary/30 hover:text-primary"
                    >
                      <ImagePlus className="size-6" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Upload</span>
                    </button>
                  )}
                  <p className="text-[11px] text-slate-400">PNG, JPG, WebP, or SVG. Max 2 MB.</p>
                </div>
                <div className="space-y-2 col-span-full">
                  <Label htmlFor="schoolMotto" className="text-xs font-bold uppercase tracking-widest text-[#7c8b9a]">School Motto</Label>
                  <Input
                    id="schoolMotto"
                    value={form.schoolMotto}
                    onChange={(event) => setForm((current) => ({ ...current, schoolMotto: event.target.value }))}
                    placeholder="Knowledge is Power"
                    className="h-12 rounded-xl border-none bg-slate-50 px-4 ring-1 ring-slate-100 focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schoolPhone" className="text-xs font-bold uppercase tracking-widest text-[#7c8b9a]">Primary Phone</Label>
                  <Input
                    id="schoolPhone"
                    value={form.schoolPhone}
                    onChange={(event) => setForm((current) => ({ ...current, schoolPhone: event.target.value }))}
                    placeholder="+233..."
                    className="h-12 rounded-xl border-none bg-slate-50 px-4 ring-1 ring-slate-100 focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schoolEmail" className="text-xs font-bold uppercase tracking-widest text-[#7c8b9a]">Primary Email</Label>
                  <Input
                    id="schoolEmail"
                    type="email"
                    value={form.schoolEmail}
                    onChange={(event) => setForm((current) => ({ ...current, schoolEmail: event.target.value }))}
                    placeholder="info@school.edu"
                    className="h-12 rounded-xl border-none bg-slate-50 px-4 ring-1 ring-slate-100 focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-2 col-span-full">
                  <Label htmlFor="schoolAddress" className="text-xs font-bold uppercase tracking-widest text-[#7c8b9a]">Physical Address</Label>
                  <Input
                    id="schoolAddress"
                    value={form.schoolAddress}
                    onChange={(event) => setForm((current) => ({ ...current, schoolAddress: event.target.value }))}
                    placeholder="123 Education Street"
                    className="h-12 rounded-xl border-none bg-slate-50 px-4 ring-1 ring-slate-100 focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            ) : step === 3 ? (
              <div className="grid gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
                  <p className="text-sm font-semibold text-amber-800">Defaults &amp; ID Configuration</p>
                  <p className="text-xs text-amber-600 mt-1">
                    Set the default password and ID prefixes for all teachers and students registered under this school.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultPassword" className="text-xs font-bold uppercase tracking-widest text-[#7c8b9a]">Default Password</Label>
                  <Input
                    id="defaultPassword"
                    value={form.defaultPassword}
                    onChange={(event) => setForm((current) => ({ ...current, defaultPassword: event.target.value }))}
                    placeholder="Welcome@123"
                    required
                    minLength={6}
                    className="h-12 rounded-xl border-none bg-slate-50 px-4 ring-1 ring-slate-100 focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="text-[11px] text-slate-400">Minimum 6 characters. Used for all newly registered teachers and parents.</p>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="studentIdPrefix" className="text-xs font-bold uppercase tracking-widest text-[#7c8b9a]">Student ID Prefix</Label>
                    <Input
                      id="studentIdPrefix"
                      value={form.studentIdPrefix}
                      onChange={(event) => setForm((current) => ({ ...current, studentIdPrefix: event.target.value.toUpperCase() }))}
                      placeholder="STU"
                      required
                      maxLength={10}
                      className="h-12 rounded-xl border-none bg-slate-50 px-4 ring-1 ring-slate-100 focus:ring-2 focus:ring-primary/20 uppercase"
                    />
                    <p className="text-[11px] text-slate-400">e.g. STU &rarr; STU_a1b2c3d4e5f6</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="teacherIdPrefix" className="text-xs font-bold uppercase tracking-widest text-[#7c8b9a]">Teacher ID Prefix</Label>
                    <Input
                      id="teacherIdPrefix"
                      value={form.teacherIdPrefix}
                      onChange={(event) => setForm((current) => ({ ...current, teacherIdPrefix: event.target.value.toUpperCase() }))}
                      placeholder="TCH"
                      required
                      maxLength={10}
                      className="h-12 rounded-xl border-none bg-slate-50 px-4 ring-1 ring-slate-100 focus:ring-2 focus:ring-primary/20 uppercase"
                    />
                    <p className="text-[11px] text-slate-400">e.g. TCH &rarr; TCH_a1b2c3d4e5f6</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="space-y-2">
                  <Label htmlFor="adminName" className="text-xs font-bold uppercase tracking-widest text-[#7c8b9a]">Admin name</Label>
                  <Input
                    id="adminName"
                    value={form.adminName}
                    onChange={(event) => setForm((current) => ({ ...current, adminName: event.target.value }))}
                    placeholder="Ama Mensah"
                    required
                    className="h-12 rounded-xl border-none bg-slate-50 px-4 ring-1 ring-slate-100 focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminPhone" className="text-xs font-bold uppercase tracking-widest text-[#7c8b9a]">Admin phone</Label>
                  <Input
                    id="adminPhone"
                    value={form.adminPhone}
                    onChange={(event) => setForm((current) => ({ ...current, adminPhone: event.target.value }))}
                    placeholder="+233..."
                    required
                    className="h-12 rounded-xl border-none bg-slate-50 px-4 ring-1 ring-slate-100 focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="adminEmail" className="text-xs font-bold uppercase tracking-widest text-[#7c8b9a]">Admin email</Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    value={form.adminEmail}
                    onChange={(event) => setForm((current) => ({ ...current, adminEmail: event.target.value }))}
                    placeholder="principal@school.edu"
                    required
                    className="h-12 rounded-xl border-none bg-slate-50 px-4 ring-1 ring-slate-100 focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep((current) => Math.max(current - 1, 1))}
                disabled={step === 1}
                className="rounded-xl px-6 text-[#7c8b9a] hover:bg-slate-50 hover:text-[#1a1c21]"
              >
                <ChevronLeft className="mr-2 size-4" />
                Back
              </Button>

              <Button type="submit" disabled={submitting} className="rounded-xl bg-primary px-8 hover:bg-primary/90 shadow-lg shadow-primary/20">
                {submitting ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : step < 4 ? (
                  <ChevronRight className="mr-2 size-4" />
                ) : (
                  <Sparkles className="mr-2 size-4" />
                )}
                {step < 4 ? 'Continue' : uploadingLogo ? 'Uploading logo...' : 'Complete Setup'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog open={Boolean(success)} onOpenChange={(open) => !open && setSuccess(null)}>
        <DialogContent className="p-0 border-none rounded-[2.5rem] overflow-hidden w-[min(32rem,calc(100vw-2rem))] max-w-lg">
          <div className="bg-[#6a5ae0] p-10 text-white flex flex-col items-center">
            <div className="size-20 bg-white/20 rounded-full flex items-center justify-center mb-6 backdrop-blur-md">
              <Sparkles className="size-10" />
            </div>
            <DialogTitle className="text-2xl font-bold">School Created!</DialogTitle>
            <DialogDescription className="text-white/80 mt-2 text-center">
              The school tenant is now provisioned and the first administrator has been registered.
            </DialogDescription>
          </div>

          {success ? (
            <div className="p-10 space-y-8 bg-white">
              <div className="grid gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#7c8b9a]">School identifier</p>
                  <p className="mt-1 font-mono text-sm font-bold text-[#1a1c21]">{success.school.id}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#7c8b9a]">Administrator</p>
                  <p className="mt-1 font-bold text-[#1a1c21]">{success.admin.email}</p>
                </div>
                <div className="bg-[#fff8f0] p-4 rounded-2xl border border-orange-100">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600">Admin Temp Password</p>
                  <p className="mt-1 font-black text-xl text-orange-700">{success.admin.temp_password}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 p-3 rounded-2xl">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#7c8b9a]">Student ID Prefix</p>
                    <p className="mt-1 font-mono text-xs font-bold text-[#1a1c21]">{success.school.student_id_prefix}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-2xl">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#7c8b9a]">Teacher ID Prefix</p>
                    <p className="mt-1 font-mono text-xs font-bold text-[#1a1c21]">{success.school.teacher_id_prefix}</p>
                  </div>
                </div>
              </div>

              <Button className="w-full h-12 rounded-xl bg-[#1a1c21] text-white hover:bg-[#2d313a]" onClick={() => setSuccess(null)}>
                Got it, take me back
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
