"use client";

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type Props = {
  schoolId: string;
  isActive: boolean;
};

export function SchoolStatusToggle({ schoolId, isActive }: Props) {
  const router = useRouter();

  async function handleToggle() {
    const response = await fetch(`/api/super-admin/schools/${schoolId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !isActive }),
    });

    if (!response.ok) {
      toast.error('Unable to change school status');
      return;
    }

    toast.success(isActive ? 'School suspended' : 'School reactivated');
    router.refresh();
  }

  return (
    <Button variant={isActive ? 'secondary' : 'default'} onClick={handleToggle}>
      {isActive ? 'Suspend school' : 'Reactivate school'}
    </Button>
  );
}
