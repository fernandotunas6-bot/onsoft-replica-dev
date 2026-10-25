"use client";

import { useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ImagePlus, Loader2, Save, Trash2, UserCog, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { getMediaUrl } from '@/lib/media';
import Link from 'next/link';
import type { SchoolDetail } from '@/lib/worker';

type Props = {
  school: SchoolDetail;
};

export function SchoolDetailEditor({ school }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: school.name,
    location: school.location ?? '',
    termSystem: String(school.term_system),
    motto: school.motto ?? '',
    phone: school.phone ?? '',
    email: school.email ?? '',
    address: school.address ?? '',
    defaultPassword: '',
    studentIdPrefix: school.student_id_prefix,
    teacherIdPrefix: school.teacher_id_prefix,
  });

  const [adminForm, setAdminForm] = useState({
    name: school.admin?.name ?? '',
    phone: school.admin?.phone ?? '',
    email: school.admin?.email ?? '',
  });

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

  function clearNewLogo() {
    setLogoFile(null);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const currentLogoUrl = logoPreview ?? (school.logo_url ? getMediaUrl(school.logo_url) : null);

  async function handleDeleteSchool() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/super-admin/schools/${school.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error ?? 'Failed to delete school');
      }
      toast.success('School deleted');
      router.push('/schools');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  async function handleSaveAdmin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAdmin(true);
    try {
      const response = await fetch(`/api/super-admin/schools/${school.id}/admin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminForm),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error ?? 'Failed to update admin');
      }
      toast.success('Admin details updated');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setSavingAdmin(false);
    }
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    try {
      let logoUrl: string | null | undefined = undefined;

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

      const payload: Record<string, unknown> = {
        name: form.name,
        location: form.location || null,
        term_system: Number(form.termSystem),
        motto: form.motto || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        student_id_prefix: form.studentIdPrefix || 'STU',
        teacher_id_prefix: form.teacherIdPrefix || 'TCH',
      };

      if (logoUrl !== undefined) {
        payload.logo_url = logoUrl;
      }

      if (form.defaultPassword.trim().length >= 6) {
        payload.default_password = form.defaultPassword.trim();
      }

      const response = await fetch(`/api/super-admin/schools/${school.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error ?? 'Failed to update school');
      }

      toast.success('School details updated');
      clearNewLogo();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setSaving(false);
      setUploadingLogo(false);
    }
  }

  const inputClass = "h-12 rounded-xl border border-white/10 bg-white/5 px-4 text-white placeholder:text-white/30 focus:border-primary/40 focus:ring-1 focus:ring-primary/20";
  const labelClass = "text-xs font-bold uppercase tracking-widest text-white/50";

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-4">
        <Button asChild variant="secondary">
          <Link href="/schools">
            <ArrowLeft className="size-4" />
            Back to schools
          </Link>
        </Button>
      </div>

      <form onSubmit={handleSave}>
        <div className="grid gap-6">

          {/* School Identity */}
          <Card className="border-white/10 bg-[#0f1319]/80">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg text-white">School Identity</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="flex items-start gap-6">
                <div className="shrink-0">
                  <Label className={labelClass}>Logo</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleLogoSelect}
                    className="hidden"
                  />
                  <div className="mt-2">
                    {currentLogoUrl ? (
                      <div className="relative inline-block">
                        <div className="size-24 rounded-2xl overflow-hidden border border-white/10 bg-white/5">
                          <Image src={currentLogoUrl} alt="Logo" width={96} height={96} className="size-full object-contain" unoptimized />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (logoFile) {
                              clearNewLogo();
                            } else {
                              fileInputRef.current?.click();
                            }
                          }}
                          className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-primary text-black shadow-md hover:bg-primary/80"
                        >
                          {logoFile ? <X className="size-3.5" /> : <ImagePlus className="size-3" />}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex size-24 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/20 bg-white/5 text-white/40 transition-colors hover:border-primary/30 hover:text-primary"
                      >
                        <ImagePlus className="size-5" />
                        <span className="text-[9px] font-bold uppercase tracking-wider">Upload</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className={labelClass}>School Name</Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                      required
                      className={inputClass}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="location" className={labelClass}>Location</Label>
                      <Input
                        id="location"
                        value={form.location}
                        onChange={(e) => setForm((c) => ({ ...c, location: e.target.value }))}
                        placeholder="Accra, Ghana"
                        className={inputClass}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="termSystem" className={labelClass}>Term System</Label>
                      <Select
                        id="termSystem"
                        value={form.termSystem}
                        onChange={(e) => setForm((c) => ({ ...c, termSystem: e.target.value }))}
                        options={[
                          { value: '3', label: 'Trimester (3 terms)' },
                          { value: '2', label: 'Semester (2 terms)' },
                        ]}
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contact & Branding */}
          <Card className="border-white/10 bg-[#0f1319]/80">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg text-white">Contact &amp; Branding</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 col-span-full">
                <Label htmlFor="motto" className={labelClass}>Motto</Label>
                <Input
                  id="motto"
                  value={form.motto}
                  onChange={(e) => setForm((c) => ({ ...c, motto: e.target.value }))}
                  placeholder="Knowledge is Power"
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className={labelClass}>Primary Phone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))}
                  placeholder="+233..."
                  className={inputClass}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className={labelClass}>Primary Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
                  placeholder="info@school.edu"
                  className={inputClass}
                />
              </div>
              <div className="space-y-2 col-span-full">
                <Label htmlFor="address" className={labelClass}>Physical Address</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => setForm((c) => ({ ...c, address: e.target.value }))}
                  placeholder="123 Education Street"
                  className={inputClass}
                />
              </div>
            </CardContent>
          </Card>

          {/* Defaults & ID Configuration */}
          <Card className="border-white/10 bg-[#0f1319]/80">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg text-white">Defaults &amp; ID Configuration</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="defaultPassword" className={labelClass}>Default Password</Label>
                <Input
                  id="defaultPassword"
                  value={form.defaultPassword}
                  onChange={(e) => setForm((c) => ({ ...c, defaultPassword: e.target.value }))}
                  placeholder="Leave blank to keep current"
                  className={inputClass}
                />
                <p className="text-[11px] text-white/30">Only fill this to change the default password. Min 6 characters.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="studentIdPrefix" className={labelClass}>Student ID Prefix</Label>
                  <Input
                    id="studentIdPrefix"
                    value={form.studentIdPrefix}
                    onChange={(e) => setForm((c) => ({ ...c, studentIdPrefix: e.target.value.toUpperCase() }))}
                    placeholder="STU"
                    required
                    maxLength={10}
                    className={`${inputClass} uppercase`}
                  />
                  <p className="text-[11px] text-white/30">e.g. {form.studentIdPrefix.toLowerCase() || 'stu'}_a1b2c3d4e5f6</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="teacherIdPrefix" className={labelClass}>Teacher ID Prefix</Label>
                  <Input
                    id="teacherIdPrefix"
                    value={form.teacherIdPrefix}
                    onChange={(e) => setForm((c) => ({ ...c, teacherIdPrefix: e.target.value.toUpperCase() }))}
                    placeholder="TCH"
                    required
                    maxLength={10}
                    className={`${inputClass} uppercase`}
                  />
                  <p className="text-[11px] text-white/30">e.g. {form.teacherIdPrefix.toLowerCase() || 'tch'}_a1b2c3d4e5f6</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Meta Info (read-only) */}
          <Card className="border-white/10 bg-[#0f1319]/80">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg text-white">System Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">School ID</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-white">{school.id}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Status</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`inline-block size-2 rounded-full ${school.is_active ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    <p className="text-sm font-semibold text-white">{school.is_active ? 'Active' : 'Suspended'}</p>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Created</p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {new Date(school.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex items-center justify-end gap-4 pt-2">
            <Button
              type="submit"
              disabled={saving}
              className="h-12 rounded-xl bg-primary px-10 text-black font-bold hover:bg-primary/90 shadow-lg shadow-primary/20"
            >
              {saving ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : uploadingLogo ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              {uploadingLogo ? 'Uploading logo...' : saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>

        </div>
      </form>

      {/* Admin Account — separate form */}
      <form onSubmit={handleSaveAdmin}>
        <Card className="border-white/10 bg-[#0f1319]/80">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <UserCog className="size-5 text-primary" />
              <CardTitle className="text-lg text-white">School Admin Account</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            {school.admin ? (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="adminName" className={labelClass}>Admin Name</Label>
                    <Input
                      id="adminName"
                      value={adminForm.name}
                      onChange={(e) => setAdminForm((c) => ({ ...c, name: e.target.value }))}
                      required
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adminPhone" className={labelClass}>Admin Phone</Label>
                    <Input
                      id="adminPhone"
                      value={adminForm.phone}
                      onChange={(e) => setAdminForm((c) => ({ ...c, phone: e.target.value }))}
                      required
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adminEmail" className={labelClass}>Admin Email</Label>
                    <Input
                      id="adminEmail"
                      type="email"
                      value={adminForm.email}
                      onChange={(e) => setAdminForm((c) => ({ ...c, email: e.target.value }))}
                      required
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Admin UID</p>
                  <p className="mt-0.5 font-mono text-xs text-white/60">{school.admin.uid}</p>
                </div>
                <div className="flex justify-end pt-1">
                  <Button
                    type="submit"
                    disabled={savingAdmin}
                    className="h-10 rounded-xl bg-primary px-8 text-black font-bold hover:bg-primary/90"
                  >
                    {savingAdmin ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
                    {savingAdmin ? 'Saving...' : 'Update Admin'}
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-white/20 p-6 text-center">
                <p className="text-sm text-white/40">No admin account found for this school.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </form>

      {/* Danger Zone */}
      <Card className="border-rose-500/20 bg-[#0f1319]/80">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg text-rose-400">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
            <div>
              <p className="text-sm font-semibold text-white">Delete this school</p>
              <p className="mt-0.5 text-xs text-white/40">
                This will permanently remove the school, all users, students, classes, and transactions.
              </p>
            </div>
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="secondary"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="h-10 rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteSchool}
                  disabled={deleting}
                  className="h-10 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700"
                >
                  {deleting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
                  {deleting ? 'Deleting...' : 'Confirm Delete'}
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => setShowDeleteConfirm(true)}
                className="h-10 shrink-0 rounded-xl border border-rose-500/30 bg-transparent text-rose-400 font-bold hover:bg-rose-500/10"
              >
                <Trash2 className="mr-2 size-4" />
                Delete School
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
