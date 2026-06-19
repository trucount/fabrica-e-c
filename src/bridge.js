import { BRIDGE_API_KEY, BRIDGE_ORIGIN, POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from './config.js';
import { FULL_SQL } from './sql.js';
import { openUrl } from './system.js';
import { spinner } from './ui.js';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function connectSupabase() {
  const spin = spinner('Posting secure schema job to Fabrica Connect');
  const response = await fetch(`${BRIDGE_ORIGIN}/api/public/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: BRIDGE_API_KEY, sql: FULL_SQL }) });
  if (!response.ok) throw new Error(`Bridge rejected job: ${response.status} ${await response.text()}`);
  const job = await response.json();
  spin.succeed('Bridge job created');
  console.log(`Open this URL if your browser does not start: ${job.connectUrl}`);
  await openUrl(job.connectUrl);
  const started = Date.now();
  const poll = spinner('Waiting for Supabase authorization and project selection');
  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const pollResponse = await fetch(job.pollUrl);
    if (pollResponse.ok) {
      const payload = await pollResponse.json();
      if (payload.status === 'done' && payload.url && payload.anonKey) { poll.succeed('Supabase project connected'); return { jobId: job.jobId, url: payload.url, anonKey: payload.anonKey }; }
      if (payload.status === 'error') throw new Error(payload.error || 'Bridge job failed');
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('Timed out waiting for Supabase bridge');
}
