import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy singleton so the client is not instantiated at module load time.
// This prevents Next.js build-time crashes when env vars are absent.
let _supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'
      )
    }
    _supabase = createClient(supabaseUrl, supabaseKey)
  }
  return _supabase
}

// Backwards-compatible named export used by existing code.
// Accessing this getter property defers client creation until first use.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
