import { supabaseAdmin } from '@/lib/supabase/admin';
import type { EventProcessor } from '../dispatcher';

export const runAnalyticsProcessor: EventProcessor = {
  name: 'Analytics',

  async handle(event) {
    const db = supabaseAdmin();
    const occurredAt = (event.timestamp ?? new Date()).toISOString();

    const { error } = await db.from('toby_hop_events').insert({
      event_type: event.type,
      fid: event.fid,
      wallet_address: event.wallet ?? null,
      metadata: event.metadata ?? {},
      occurred_at: occurredAt,
    });

    if (error) {
      if (error.code === '42P01') {
        console.warn('toby_hop_events table is not installed; analytics event was not persisted.');
        return;
      }
      throw error;
    }
  },
};
