/** Shared TypeScript types */
export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  role: string
  department: string | null
  is_active: boolean
  is_superuser: boolean
  photo_url: string | null
  has_2fa: boolean
  preferred_language: string
  hospital_id: number | null
  employee_id: string | null
  full_name: string
}

export interface TokenOut {
  access_token: string
  token_type: string
  user_id: number
  username: string
  role: string
  full_name: string
}

export type ModuleKey =
  | 'dashboard' | 'patients' | 'laboratory' | 'ai_nexus' | 'billing'
  | 'inventory' | 'audit' | 'notifications' | 'documents'
