"use client";

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRight, ArrowUpRight, Search, School2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SchoolSummary } from '@/lib/worker';
import { getMediaUrl } from '@/lib/media';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  MoreHorizontal,
  ChevronRight,
  MapPin,
  Users2,
  CalendarDays,
} from 'lucide-react';

type SchoolsTableProps = {
  schools: SchoolSummary[];
};

export function SchoolsTable({ schools }: SchoolsTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [pendingSchoolId, setPendingSchoolId] = useState<string | null>(null);
  const [detailsSchool, setDetailsSchool] = useState<SchoolSummary | null>(null);

  const filteredSchools = useMemo(() => {
    const needle = query.toLowerCase().trim();
    if (!needle) {
      return schools;
    }

    return schools.filter((school) =>
      [school.name, school.location ?? '', school.id].some((value) => value.toLowerCase().includes(needle))
    );
  }, [query, schools]);

  async function toggleSchool(school: SchoolSummary) {
    setPendingSchoolId(school.id);
    try {
      const response = await fetch(`/api/super-admin/schools/${school.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !school.is_active }),
      });

      if (!response.ok) {
        throw new Error('Unable to update school status');
      }

      toast.success(`${school.name} updated`);
      
      // Update local state if modal is open
      if (detailsSchool?.id === school.id) {
        setDetailsSchool({ ...school, is_active: !school.is_active });
      }

      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Status update failed');
    } finally {
      setPendingSchoolId(null);
    }
  }

  return (
    <>
      <Card className="rounded-[2.5rem] border-none bg-white p-4 premium-shadow min-h-[600px]">
        <CardHeader className="pb-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-2xl font-bold text-[#1a1c21]">Manage Schools</CardTitle>
              <CardDescription className="text-sm font-medium text-[#7c8b9a]">
                Search and manage your onboarded tenants.
              </CardDescription>
            </div>
            <Button asChild className="rounded-xl px-6 bg-primary hover:bg-primary/90">
              <a href="/schools/new" className="flex items-center gap-2">
                Onboard school
                <ArrowRight className="size-4" />
              </a>
            </Button>
          </div>

          <div className="relative mt-8 max-w-lg">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#7c8b9a]" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search school name, location, or ID..."
              className="h-11 w-full rounded-2xl border-none bg-slate-50 px-11 text-sm ring-1 ring-slate-100 focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Compact Mobile List View (Zero Scroll) */}
          <div className="flex flex-col sm:hidden">
            {filteredSchools.map((school) => (
              <div
                key={school.id}
                className="flex items-center justify-between border-b border-slate-50 px-6 py-4 transition-colors active:bg-slate-50"
              >
                <div 
                  className="flex min-w-0 flex-1 items-center gap-3 cursor-pointer"
                  onClick={() => router.push(`/schools/${school.id}`)}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#f4f2ff] text-[#6a5ae0] overflow-hidden">
                    {school.logo_url ? (
                      <Image src={getMediaUrl(school.logo_url)} alt="" width={36} height={36} className="size-full object-contain" unoptimized />
                    ) : (
                      <School2 className="size-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[#1a1c21]">{school.name}</p>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-[9px] font-black uppercase tracking-wider",
                        school.is_active ? "text-emerald-500" : "text-rose-500"
                      )}>
                        {school.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={() => setDetailsSchool(school)}
                  className="ml-4 flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-[#7c8b9a] transition-all active:scale-90"
                >
                  <MoreHorizontal className="size-5" />
                </button>
              </div>
            ))}
            {filteredSchools.length === 0 && (
              <div className="py-24 text-center text-sm font-medium text-[#7c8b9a]">No matches found.</div>
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-50 hover:bg-transparent">
                  <TableHead className="px-8 text-[10px] font-bold uppercase tracking-widest text-[#7c8b9a]">School</TableHead>
                  <TableHead className="hidden px-4 text-[10px] font-bold uppercase tracking-widest text-[#7c8b9a] md:table-cell">System</TableHead>
                  <TableHead className="px-4 text-[10px] font-bold uppercase tracking-widest text-[#7c8b9a]">Counts</TableHead>
                  <TableHead className="px-4 text-[10px] font-bold uppercase tracking-widest text-[#7c8b9a]">Status</TableHead>
                  <TableHead className="px-8 text-right text-[10px] font-bold uppercase tracking-widest text-[#7c8b9a]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSchools.map((school) => (
                  <TableRow
                    key={school.id}
                    className="group cursor-pointer border-b border-slate-50 transition-colors hover:bg-slate-50/50"
                    onClick={() => router.push(`/schools/${school.id}`)}
                  >
                    <TableCell className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#f4f2ff] text-[#6a5ae0] overflow-hidden">
                          {school.logo_url ? (
                            <Image src={getMediaUrl(school.logo_url)} alt="" width={44} height={44} className="size-full object-contain" unoptimized />
                          ) : (
                            <School2 className="size-5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-bold text-[#1a1c21]">{school.name}</p>
                          <p className="truncate text-xs font-semibold text-[#7c8b9a]">{school.location ?? 'Global Tenant'}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden px-4 py-5 md:table-cell">
                      <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">
                        {school.term_system === 3 ? 'Trimester' : 'Semester'}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-5">
                      <div className="flex items-center gap-4 text-xs font-bold text-[#7c8b9a]">
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          <ArrowUpRight className="size-3 text-emerald-500" />
                          {school.student_count}
                        </span>
                        <span className="h-3 w-px bg-slate-200" />
                        <span className="whitespace-nowrap">{school.user_count} users</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-5">
                      <span className={cn(
                        "inline-flex rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider",
                        school.is_active ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                      )}>
                        {school.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </TableCell>
                    <TableCell className="px-8 py-5 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          void toggleSchool(school);
                        }}
                        disabled={pendingSchoolId === school.id}
                        className={cn(
                          "rounded-xl font-bold transition-all",
                          school.is_active 
                            ? "text-rose-600 hover:bg-rose-50" 
                            : "text-emerald-600 hover:bg-emerald-50"
                        )}
                      >
                        {school.is_active ? 'Suspend' : 'Activate'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredSchools.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-24 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="rounded-full bg-slate-50 p-4">
                          <Search className="size-8 text-slate-200" />
                        </div>
                        <p className="text-sm font-bold text-[#7c8b9a]">No schools match your search.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!detailsSchool} onOpenChange={(open) => !open && setDetailsSchool(null)}>
        <DialogContent className="max-w-sm rounded-[2.5rem] p-0 border-none premium-shadow bg-white">
          {detailsSchool && (
            <div className="flex flex-col">
              <div className="p-8">
                <DialogHeader>
                    <div className="flex items-center gap-4 mb-6">
                    <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#f4f2ff] text-[#6a5ae0] overflow-hidden">
                      {detailsSchool.logo_url ? (
                        <Image src={getMediaUrl(detailsSchool.logo_url)} alt="" width={56} height={56} className="size-full object-contain" unoptimized />
                      ) : (
                        <School2 className="size-7" />
                      )}
                    </div>
                    <div>
                      <DialogTitle className="text-xl font-bold text-[#1a1c21] leading-tight text-left">
                        {detailsSchool.name}
                      </DialogTitle>
                      <DialogDescription className="text-sm font-medium text-[#7c8b9a] text-left">
                        School Administration Panel
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
                    <div className="flex size-8 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm">
                      <MapPin className="size-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Location</p>
                      <p className="text-sm font-bold text-[#1a1c21]">{detailsSchool.location ?? 'Global Tenant'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Users2 className="size-4 text-primary" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total Students</span>
                      </div>
                      <p className="text-lg font-bold text-[#1a1c21]">{detailsSchool.student_count}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <CalendarDays className="size-4 text-emerald-500" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">System</span>
                      </div>
                      <p className="text-lg font-bold text-[#1a1c21]">{detailsSchool.term_system === 3 ? 'Trimester' : 'Semester'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50/50 p-8 pt-6">
                <div className="flex flex-col gap-3">
                  <Button 
                    variant={detailsSchool.is_active ? 'destructive' : 'default'}
                    className={cn(
                      "h-12 w-full rounded-2xl font-bold shadow-lg transition-all",
                      !detailsSchool.is_active && "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20"
                    )}
                    onClick={() => void toggleSchool(detailsSchool)}
                    disabled={pendingSchoolId === detailsSchool.id}
                  >
                    {pendingSchoolId === detailsSchool.id ? 'Processing...' : (detailsSchool.is_active ? 'Suspend Access' : 'Activate Access')}
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="h-12 w-full rounded-2xl font-bold text-[#7c8b9a]"
                    onClick={() => router.push(`/schools/${detailsSchool.id}`)}
                  >
                    Go to Dashboard
                    <ChevronRight className="ml-2 size-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
