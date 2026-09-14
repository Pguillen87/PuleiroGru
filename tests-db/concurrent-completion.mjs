// Run only against our network-isolated local test container after migrations.
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';

const docker = process.env.DOCKER_BIN || 'docker';
const container = 'puleiro-review-postgres-20260913';
const inspection = JSON.parse(execFileSync(docker, ['inspect', container], { encoding: 'utf8' }))[0];
assert.equal(inspection.HostConfig.NetworkMode, 'none', 'Only isolated local PostgreSQL is permitted');
const user = '00000000-0000-4000-8000-000000000099';
const base = ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq', '-c'];
const sql = (statement) => execFileSync(docker, [...base, statement], { encoding: 'utf8' });
assert.equal(sql(`select count(*) from auth.users where id='${user}'`).trim(), '0', 'Fixture already exists; inspect before reusing');
try {
  sql(`insert into auth.users(id) values('${user}');
    insert into public.mascot_attempts(user_id,attempt_id,modal_job_id,workflow_mode,hatched_at)
    values('${user}','local-concurrent-attempt','local-concurrent-job','async_incubator_v1',now());
    insert into public.mascot_post_birth_profiles(user_id,attempt_id,modal_job_id)
    values('${user}','local-concurrent-attempt','local-concurrent-job');`);
  const request = `begin; set local role service_role;
    set local request.jwt.claim.role='service_role';
    set local request.jwt.claims='{"role":"service_role"}';
    select public.complete_post_birth_profile('${user}','local-concurrent-attempt',0,
      'Pipoca','{"version":1}','local-concurrent-job','master-1','GRU-RACE-0001',
      '[{"role":"normal"},{"role":"listening"},{"role":"transcribing"}]');
    select pg_sleep(0.3); commit;`;
  const results = await Promise.all([1, 2].map(() => promisify(execFile)(docker, [...base, request])));
  const receipts = results.map(({ stdout }) => JSON.parse(stdout.split('\n').find((line) => line.startsWith('{'))));
  assert.equal(receipts[0].library_item.id, receipts[1].library_item.id);
  assert.deepEqual(receipts.map((r) => r.idempotent_replay).sort(), [false, true]);
  assert.equal(sql(`select count(*) from public.mascot_library_items where user_id='${user}'`).trim(), '1');
  console.log('PASS: two concurrent confirmations produced one item and one idempotent replay');
} finally {
  sql(`delete from auth.users where id='${user}';`);
}
