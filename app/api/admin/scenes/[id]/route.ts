import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabase } from '@/lib/supabase'

const patchSchema = z
  .object({
    grid_cols:   z.number().int().min(1).optional(),
    grid_rows:   z.number().int().min(1).optional(),
    cell_px:     z.number().int().min(8).optional(),
    origin_x_px: z.number().int().optional(),
    origin_y_px: z.number().int().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field required' })

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('scenes')
    .update(parsed.data)
    .eq('id', id)
    .select('id, name, grid_cols, grid_rows, cell_px, origin_x_px, origin_y_px')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Scene not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
