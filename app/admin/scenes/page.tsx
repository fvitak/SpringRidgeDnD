import { getSupabase } from '@/lib/supabase'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ secret?: string }>
}

export default async function SceneListPage({ searchParams }: Props) {
  const { secret } = await searchParams
  const adminSecret = process.env.ADMIN_SECRET
  if (adminSecret && secret !== adminSecret) {
    return <p style={{ fontFamily: 'monospace', padding: '2rem' }}>Forbidden</p>
  }

  const supabase = getSupabase()
  const { data: scenes, error } = await supabase
    .from('scenes')
    .select('id, name, scenario_id, grid_cols, grid_rows, cell_px')
    .order('scenario_id')

  if (error) {
    return <p style={{ fontFamily: 'monospace', padding: '2rem' }}>Error: {error.message}</p>
  }

  const secretSuffix = adminSecret && secret === adminSecret ? `?secret=${secret}` : ''

  return (
    <main style={{ fontFamily: 'monospace', padding: '2rem', maxWidth: 800 }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Scene Alignment Editor</h1>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
            <th style={{ padding: '0.5rem 1rem 0.5rem 0' }}>ID</th>
            <th style={{ padding: '0.5rem 1rem 0.5rem 0' }}>Name</th>
            <th style={{ padding: '0.5rem 1rem 0.5rem 0' }}>Grid</th>
            <th style={{ padding: '0.5rem 1rem 0.5rem 0' }}>Cell px</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(scenes ?? []).map((s) => (
            <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '0.5rem 1rem 0.5rem 0', color: '#666', fontSize: '0.85rem' }}>{s.id}</td>
              <td style={{ padding: '0.5rem 1rem 0.5rem 0' }}>{s.name}</td>
              <td style={{ padding: '0.5rem 1rem 0.5rem 0' }}>{s.grid_cols}×{s.grid_rows}</td>
              <td style={{ padding: '0.5rem 1rem 0.5rem 0' }}>{s.cell_px ?? '—'}</td>
              <td style={{ padding: '0.5rem 0' }}>
                <Link
                  href={`/admin/scenes/${s.id}${secretSuffix}`}
                  style={{ color: '#2563eb', textDecoration: 'underline' }}
                >
                  Edit →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
