import { NextRequest } from 'next/server'
import { getEventLog } from '@/lib/db/event-log'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('session_id')

  if (!sessionId) {
    return Response.json({ error: 'session_id is required' }, { status: 400 })
  }

  try {
    const log = await getEventLog(sessionId)
    return Response.json(log)
  } catch (err) {
    console.error('Failed to fetch event log:', err)
    return Response.json({ error: 'Failed to fetch event log' }, { status: 500 })
  }
}
