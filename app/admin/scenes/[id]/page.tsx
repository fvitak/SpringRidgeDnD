import { getSupabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import SceneAlignEditor from './SceneAlignEditor'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ secret?: string }>
}

export default async function SceneEditorPage({ params, searchParams }: Props) {
  const { id } = await params
  const { secret } = await searchParams
  const adminSecret = process.env.ADMIN_SECRET
  if (adminSecret && secret !== adminSecret) {
    return <p style={{ fontFamily: 'monospace', padding: '2rem' }}>Forbidden</p>
  }

  const supabase = getSupabase()
  const { data: scene, error } = await supabase
    .from('scenes')
    .select('id, name, image_path, grid_cols, grid_rows, cell_px, origin_x_px, origin_y_px')
    .eq('id', id)
    .single()

  if (error || !scene) notFound()

  const backHref = adminSecret && secret === adminSecret
    ? `/admin/scenes?secret=${secret}`
    : '/admin/scenes'

  return (
    <main style={{ fontFamily: 'monospace', padding: '1rem' }}>
      <p style={{ marginBottom: '1rem' }}>
        <a href={backHref} style={{ color: '#2563eb', textDecoration: 'underline' }}>← Back to scenes</a>
        {' · '}
        <strong>{scene.name}</strong>
        {' · '}
        <span style={{ color: '#666', fontSize: '0.85rem' }}>{scene.id}</span>
      </p>
      <SceneAlignEditor scene={{ ...scene, cell_w_px: null }} />
    </main>
  )
}
