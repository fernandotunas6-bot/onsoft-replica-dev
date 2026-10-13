import { resolveBearerSession } from '@/features/saas/platform-guard';
import { loadMobileV4AcademicCatalog } from './operations-core.server';
import { MobileApiError } from './errors';
import {
  handleInstitutionalExtension,
  ApiFailure,
  type Catalog,
} from '../../../mobile-flutter/backend/api';

/** Uses the canonical authorization path, never a second roster or schema. */
export function handleMobileInstitutionalExtension(request: Request) {
  return handleInstitutionalExtension(request, {
    authenticate: resolveBearerSession,
    async academicCatalog(userId, scope) {
      try {
        return await loadMobileV4AcademicCatalog(userId, scope) as Catalog;
      } catch (error) {
        if (error instanceof MobileApiError) throw new ApiFailure(error.status, error.code);
        throw error;
      }
    },
  });
}
