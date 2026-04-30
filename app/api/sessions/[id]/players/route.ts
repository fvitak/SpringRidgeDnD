import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return Response.json({ error: 'Session id is required' }, { status: 400 })
  }

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('characters')
      .select('id, slot, character_name')
      .eq('session_id', id)
      .order('slot')

    if (error) throw error

    return Response.json(data ?? [])
  } catch (err) {
    console.error('Failed to fetch players:', err)
    return Response.json({ error: 'Failed to fetch players' }, { status: 500 })
  }
}
