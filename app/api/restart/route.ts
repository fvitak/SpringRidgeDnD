import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function DELETE(req: NextRequest) {
  let body: { session_id?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { session_id } = body
  if (!session_id) {
    return Response.json({ error: 'session_id is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('event_log')
    .delete()
    .eq('session_id', session_id)

  if (error) {
    console.error('Failed to delete event log:', error)
    return Response.json({ error: 'Failed to delete event log' }, { status: 500 })
  }

  return Response.json({ success: true })
}
