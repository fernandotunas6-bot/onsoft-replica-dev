export type AlumniVisibility = 'private' | 'school' | 'alumni' | 'public'
export type AlumniVerificationStatus = 'pending' | 'verified' | 'rejected'
export type AlumniOpportunityType =
  | 'job'
  | 'internship'
  | 'scholarship'
  | 'mentorship'
  | 'volunteer'
  | 'business'

export interface AlumniProfile {
  id: string
  schoolId: string
  personId: string
  graduationYear?: number | null
  courseName?: string | null
  className?: string | null
  currentCity?: string | null
  currentCountry?: string | null
  headline?: string | null
  employer?: string | null
  jobTitle?: string | null
  visibility: AlumniVisibility
  verificationStatus: AlumniVerificationStatus
}

export interface AlumniDashboardMetrics {
  totalAlumni: number
  verifiedAlumni: number
  graduationYears: number
  activeMentorships: number
  upcomingEvents: number
  openOpportunities: number
  engagementRate: number
}

export interface AlumniModuleCapability {
  id: 'directory' | 'events' | 'careers' | 'mentorship' | 'contributions' | 'analytics'
  label: string
  description: string
}

export const ALUMNI_CAPABILITIES: AlumniModuleCapability[] = [
  { id: 'directory', label: 'Diretório Alumni', description: 'Pesquisa, filtros, perfis verificados e networking.' },
  { id: 'events', label: 'Eventos & Reencontros', description: 'Agenda, inscrições, presença e comunidade.' },
  { id: 'careers', label: 'Carreiras & Oportunidades', description: 'Empregos, estágios, bolsas, negócios e voluntariado.' },
  { id: 'mentorship', label: 'Mentoria', description: 'Matching entre antigos alunos, carreira e desenvolvimento.' },
  { id: 'contributions', label: 'Contribuições', description: 'Doações, patrocínios, horas e contribuições em espécie.' },
  { id: 'analytics', label: 'Inteligência Alumni', description: 'Coortes, localização, carreira, engagement e impacto.' },
]
