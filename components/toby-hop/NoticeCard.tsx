import type { Notice } from '@/lib/toby-hop-ui';
export function NoticeCard({ notice, onDismiss }: { notice: Notice | null; onDismiss: () => void }) {
  if (!notice) return null;
  return <div className={['error-card', `notice-${notice.kind}`].join(' ')} role={notice.kind === 'error' ? 'alert' : 'status'} aria-live={notice.kind === 'error' ? 'assertive' : 'polite'}><span>{notice.message}</span><button type="button" onClick={onDismiss} aria-label="Dismiss message">×</button></div>;
}
