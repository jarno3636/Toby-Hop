import { FALLBACK_PFP } from '@/lib/toby-hop-ui';
export type TobyHopView = 'hop' | 'leaders' | 'me';
export function BottomNav({ view, pfpUrl, onChange }: { view: TobyHopView; pfpUrl?: string | null; onChange: (view: TobyHopView) => void }) {
  return <nav className="nav" aria-label="Toby Hop navigation">
    <button type="button" className={view === 'hop' ? 'active' : ''} onClick={() => onChange('hop')}><span aria-hidden="true">🐸</span><span>Hop</span></button>
    <button type="button" className={view === 'leaders' ? 'active' : ''} onClick={() => onChange('leaders')}><span aria-hidden="true">🏆</span><span>Leaders</span></button>
    <button type="button" className={view === 'me' ? 'active' : ''} onClick={() => onChange('me')}><img src={pfpUrl || FALLBACK_PFP} alt="" aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 999, objectFit: 'cover', flex: '0 0 auto' }} /><span>Me</span></button>
  </nav>;
}
