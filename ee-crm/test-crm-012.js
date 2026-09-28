import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  normalizeMappedEmail,
  normalizeEventTimestamp,
  normalizeUsersSnapshot,
  normalizeInvitationAcceptedEvent,
  createBaselineActivation,
  resolveTeacherMembership,
  hasMaterialMembershipChange,
  CRM_012_BASELINE_ISO
} from './lib/domain/zoom-membership.js';
import { InMemoryRedis, setRedisClient, resetRedisClient } from './lib/infrastructure/redis.js';
import {
  saveMembershipSnapshot,
  getMembershipSnapshot,
  upsertMembershipActivation,
  getMembershipActivation,
  saveBaselineManifest
} from './lib/infrastructure/zoom-membership-store.js';
import { fetchUsersByStatus, ZoomSourceError } from './lib/infrastructure/zoom.js';
import {
  getZoomMembershipSnapshot,
  enrichTeachersWithZoomMembership,
  ZOOM_MEMBERSHIP_STALE_MAX_MS
} from './lib/services/zoom-membership-service.js';
import handler, { ingestMembershipEvent } from './lib/infrastructure/zoom-webhook-handler.js';
import { planBaselineSeed, applyBaselineSeed } from './scripts/crm-012/seed-current-member-baseline.js';
import { formatKyivLongDate, formatKyivDateTime } from './lib/utils/timezone.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`✅ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`❌ ${name}`);
    console.error(error);
  }
}

const checkedAt = '2026-09-28T12:00:00.000Z';
const baseSnapshot = normalizeUsersSnapshot({
  accountId: 'account-1',
  checkedAt,
  activeUsers: [{ id: 'z-active', email: 'ZOOM@example.com' }],
  pendingUsers: [{ id: 'z-pending', email: 'pending@example.com' }]
});

function snapshotResult(snapshot = baseSnapshot, state = 'fresh') {
  return {
    snapshot,
    freshness: {
      state,
      checkedAt,
      lastSuccessfulAt: checkedAt
    },
    failureCategory: state === 'fresh' ? null : 'transport'
  };
}

await test('normalizes mapped email and rejects non-strings', () => {
  assert.equal(normalizeMappedEmail('  USER@Example.COM '), 'user@example.com');
  assert.equal(normalizeMappedEmail(null), '');
});

await test('accepts epoch milliseconds and rejects epoch seconds', () => {
  const eventMs = Date.UTC(2026, 8, 27, 20, 30);
  assert.equal(normalizeEventTimestamp(eventMs, eventMs + 1000), '2026-09-27T20:30:00.000Z');
  assert.equal(normalizeEventTimestamp(Math.floor(eventMs / 1000), eventMs + 1000), null);
});

await test('normalizes only the approved invitation accepted event fields', () => {
  const eventMs = Date.UTC(2026, 8, 27, 20, 30);
  const normalized = normalizeInvitationAcceptedEvent({
    event: 'user.invitation_accepted',
    event_ts: eventMs,
    payload: { account_id: 'account-1', object: { id: 'z-1', email: 'USER@example.com', created_at: 'ignored' } }
  }, eventMs + 1000);
  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.acceptedAt, '2026-09-27T20:30:00.000Z');
  assert.equal(normalized.value.email, 'user@example.com');
  assert.equal(normalizeInvitationAcceptedEvent({
    event: 'user.invitation_accepted',
    payload: { account_id: 'account-1', object: { id: 'z-1', email: 'user@example.com', created_at: checkedAt } }
  }).reason, 'invalid_event_ts');
});

await test('creates the approved 28 September Kyiv baseline with provenance', () => {
  const activation = createBaselineActivation({ accountId: 'account-1', zoomUserId: 'z-1', email: 'USER@example.com' });
  assert.equal(activation.acceptedAt, CRM_012_BASELINE_ISO);
  assert.equal(activation.baselineLocalDate, '2026-09-28');
  assert.equal(activation.sourceKind, 'approved_current_member_baseline');
});

await test('mapped Zoom host email takes precedence over teacher email', () => {
  const membership = resolveTeacherMembership({
    teacher: { email: 'pending@example.com', zoomHostEmail: 'zoom@example.com' },
    snapshotResult: snapshotResult(),
    activation: createBaselineActivation({ accountId: 'account-1', zoomUserId: 'z-active', email: 'zoom@example.com' })
  });
  assert.equal(membership.status, 'member');
  assert.equal(membership.matchedEmail, 'zoom@example.com');
  assert.equal(membership.memberSince.state, 'available');
});

await test('active member without an activation remains member with unavailable date', () => {
  const membership = resolveTeacherMembership({
    teacher: { email: 'zoom@example.com' },
    snapshotResult: snapshotResult()
  });
  assert.equal(membership.status, 'member');
  assert.deepEqual(membership.memberSince, { state: 'unavailable', value: null, sourceKind: null });
});

await test('pending and confirmed absence never expose a membership date', () => {
  const pending = resolveTeacherMembership({ teacher: { email: 'pending@example.com' }, snapshotResult: snapshotResult() });
  const absent = resolveTeacherMembership({ teacher: { email: 'absent@example.com' }, snapshotResult: snapshotResult() });
  assert.equal(pending.status, 'pending');
  assert.equal(absent.status, 'not_invited');
  assert.equal(pending.memberSince.value, null);
  assert.equal(absent.memberSince.value, null);
});

await test('source failure without a snapshot is unavailable, never not invited', () => {
  const membership = resolveTeacherMembership({
    teacher: { email: 'absent@example.com' },
    snapshotResult: {
      snapshot: null,
      freshness: { state: 'unavailable', checkedAt, lastSuccessfulAt: null },
      failureCategory: 'transport'
    }
  });
  assert.equal(membership.status, 'unavailable');
});

await test('ambiguous normalized email is unavailable', () => {
  const snapshot = normalizeUsersSnapshot({
    accountId: 'account-1', checkedAt,
    activeUsers: [{ id: 'one', email: 'same@example.com' }, { id: 'two', email: 'SAME@example.com' }]
  });
  const membership = resolveTeacherMembership({ teacher: { email: 'same@example.com' }, snapshotResult: snapshotResult(snapshot) });
  assert.equal(membership.status, 'unavailable');
  assert.equal(membership.failureCategory, 'ambiguous');
});

await test('material change includes status, date, and freshness', () => {
  const previous = resolveTeacherMembership({ teacher: { email: 'pending@example.com' }, snapshotResult: snapshotResult() });
  const next = resolveTeacherMembership({ teacher: { email: 'zoom@example.com' }, snapshotResult: snapshotResult() });
  assert.equal(hasMaterialMembershipChange(previous, next), true);
  assert.equal(hasMaterialMembershipChange(next, structuredClone(next)), false);
});

await test('snapshot persistence round-trips complete normalized data', async () => {
  const redis = new InMemoryRedis();
  await saveMembershipSnapshot(baseSnapshot, redis);
  assert.deepEqual(await getMembershipSnapshot('account-1', redis), baseSnapshot);
});

await test('activation upsert keeps newest accepted event and ignores replay/older event', async () => {
  const redis = new InMemoryRedis();
  const baseline = createBaselineActivation({ accountId: 'account-1', zoomUserId: 'z-active', email: 'zoom@example.com' });
  assert.equal((await upsertMembershipActivation(baseline, redis)).disposition, 'inserted');
  const newer = { ...baseline, sourceKind: 'zoom_invitation_accepted', acceptedAt: '2026-10-01T10:00:00.000Z' };
  assert.equal((await upsertMembershipActivation(newer, redis)).disposition, 'updated');
  assert.equal((await upsertMembershipActivation(newer, redis)).disposition, 'preserved');
  const older = { ...newer, acceptedAt: '2026-09-30T10:00:00.000Z' };
  assert.equal((await upsertMembershipActivation(older, redis)).disposition, 'preserved');
  assert.equal((await getMembershipActivation('account-1', 'z-active', redis)).acceptedAt, newer.acceptedAt);
});

await test('baseline never overwrites an event-derived activation', async () => {
  const redis = new InMemoryRedis();
  const event = {
    ...createBaselineActivation({ accountId: 'account-1', zoomUserId: 'z-active', email: 'zoom@example.com' }),
    sourceKind: 'zoom_invitation_accepted',
    acceptedAt: '2026-09-20T10:00:00.000Z'
  };
  await upsertMembershipActivation(event, redis);
  await upsertMembershipActivation(createBaselineActivation({ accountId: 'account-1', zoomUserId: 'z-active', email: 'zoom@example.com' }), redis);
  assert.equal((await getMembershipActivation('account-1', 'z-active', redis)).sourceKind, 'zoom_invitation_accepted');
});

await test('baseline manifest is immutable', async () => {
  const redis = new InMemoryRedis();
  const first = { accountId: 'account-1', cutoff: '2026-09-28', zoomUserIds: ['z-active'] };
  assert.equal((await saveBaselineManifest(first, redis)).disposition, 'inserted');
  assert.equal((await saveBaselineManifest({ ...first, zoomUserIds: ['changed'] }, redis)).disposition, 'preserved');
});

await test('complete Zoom pagination returns all pages', async () => {
  let calls = 0;
  const users = await fetchUsersByStatus('token', 'active', {
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, json: async () => calls === 1
        ? { users: [{ id: '1', email: 'one@example.com' }], next_page_token: 'next' }
        : { users: [{ id: '2', email: 'two@example.com' }], next_page_token: '' } };
    }
  });
  assert.equal(users.length, 2);
});

await test('failed later Zoom page rejects the whole snapshot branch', async () => {
  let calls = 0;
  await assert.rejects(
    fetchUsersByStatus('token', 'active', {
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? { ok: true, json: async () => ({ users: [], next_page_token: 'next' }) }
          : { ok: false, status: 500 };
      }
    }),
    error => error instanceof ZoomSourceError && error.category === 'partial_page'
  );
});

await test('fresh service snapshot is persisted and marked fresh', async () => {
  let saved = null;
  const result = await getZoomMembershipSnapshot({
    nowMs: Date.parse(checkedAt),
    zoomOptions: { accountId: 'account-1' },
    fetchSnapshot: async () => baseSnapshot,
    saveSnapshot: async snapshot => { saved = snapshot; }
  });
  assert.deepEqual(saved, baseSnapshot);
  assert.equal(result.freshness.state, 'fresh');
});

await test('failed refresh uses a snapshot up to 24 hours old as stale', async () => {
  const nowMs = Date.parse(checkedAt) + ZOOM_MEMBERSHIP_STALE_MAX_MS;
  const result = await getZoomMembershipSnapshot({
    nowMs,
    zoomOptions: { accountId: 'account-1' },
    fetchSnapshot: async () => { throw new ZoomSourceError('offline', 'transport'); },
    loadSnapshot: async () => baseSnapshot
  });
  assert.equal(result.freshness.state, 'stale');
  assert.equal(result.snapshot.accountId, 'account-1');
});

await test('failed refresh rejects a snapshot older than 24 hours', async () => {
  const result = await getZoomMembershipSnapshot({
    nowMs: Date.parse(checkedAt) + ZOOM_MEMBERSHIP_STALE_MAX_MS + 1,
    zoomOptions: { accountId: 'account-1' },
    fetchSnapshot: async () => { throw new ZoomSourceError('offline', 'transport'); },
    loadSnapshot: async () => baseSnapshot
  });
  assert.equal(result.freshness.state, 'unavailable');
  assert.equal(result.snapshot, null);
});

await test('batch enrichment returns compatibility zoomStatus and activation date', async () => {
  const activation = createBaselineActivation({ accountId: 'account-1', zoomUserId: 'z-active', email: 'zoom@example.com' });
  const [teacher] = await enrichTeachersWithZoomMembership([
    { id: 'teacher-1', email: 'other@example.com', zoomHostEmail: 'zoom@example.com' }
  ], {
    snapshotResult: snapshotResult(),
    loadActivation: async () => activation
  });
  assert.equal(teacher.zoomStatus, 'member');
  assert.equal(teacher.zoomMembership.memberSince.value, CRM_012_BASELINE_ISO);
});

await test('membership ingestion accepts latest event and is replay-idempotent', async () => {
  const redis = new InMemoryRedis();
  const nowMs = Date.UTC(2026, 8, 28, 12);
  const body = {
    event: 'user.invitation_accepted', event_ts: nowMs - 1000,
    payload: { account_id: 'account-1', object: { id: 'z-active', email: 'zoom@example.com' } }
  };
  assert.equal((await ingestMembershipEvent(body, { redisClient: redis, nowMs })).disposition, 'inserted');
  assert.equal((await ingestMembershipEvent(body, { redisClient: redis, nowMs })).disposition, 'preserved');
});

await test('signed webhook persists invitation acceptance before returning 200', async () => {
  const redis = new InMemoryRedis();
  setRedisClient(redis);
  const previousSecret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.ZOOM_WEBHOOK_SECRET_TOKEN = 'crm-012-test-secret';
  process.env.NODE_ENV = 'test';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    event: 'user.invitation_accepted',
    event_ts: Date.now(),
    payload: { account_id: 'account-1', object: { id: 'z-signed', email: 'signed@example.com' } }
  });
  const signature = `v0=${crypto.createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN).update(`v0:${timestamp}:${body}`).digest('hex')}`;
  const response = await handler(new Request('http://localhost/api/webhooks/zoom', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-zm-request-timestamp': timestamp, 'x-zm-signature': signature },
    body
  }));
  assert.equal(response.status, 200);
  assert.equal((await getMembershipActivation('account-1', 'z-signed', redis)).sourceKind, 'zoom_invitation_accepted');
  process.env.ZOOM_WEBHOOK_SECRET_TOKEN = previousSecret;
  process.env.NODE_ENV = previousNodeEnv;
  resetRedisClient();
});

await test('baseline plan selects only active users and preserves event records', async () => {
  const event = { sourceKind: 'zoom_invitation_accepted' };
  const plan = await planBaselineSeed({
    snapshot: baseSnapshot,
    loadActivation: async (_accountId, userId) => userId === 'z-active' ? event : null
  });
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].action, 'preserve_event');
});

await test('baseline apply is guarded and idempotent', async () => {
  const redis = new InMemoryRedis();
  const plan = await planBaselineSeed({ snapshot: baseSnapshot, loadActivation: async () => null });
  await assert.rejects(applyBaselineSeed(plan, { redisClient: redis }), /confirmation/);
  const first = await applyBaselineSeed(plan, { redisClient: redis, confirmation: 'CRM-012-2026-09-28' });
  const second = await applyBaselineSeed(plan, { redisClient: redis, confirmation: 'CRM-012-2026-09-28' });
  assert.equal(first.manifestDisposition, 'inserted');
  assert.equal(second.manifestDisposition, 'preserved');
});

await test('Kyiv formatting crosses the UTC day boundary and uses 24-hour time', () => {
  assert.match(formatKyivLongDate(CRM_012_BASELINE_ISO, 'en'), /28 September 2026/);
  assert.match(formatKyivLongDate(CRM_012_BASELINE_ISO, 'uk'), /28 вересня 2026/);
  assert.match(formatKyivLongDate(CRM_012_BASELINE_ISO, 'pl'), /28 września 2026/);
  assert.match(formatKyivDateTime('2026-09-28T12:05:00.000Z', 'en'), /15:05/);
});

await test('all three UI surfaces use the shared membership component', () => {
  const directory = fs.readFileSync(new URL('./app/page.js', import.meta.url), 'utf8');
  const overview = fs.readFileSync(new URL('./app/teachers/[id]/TeacherScheduleClient.js', import.meta.url), 'utf8');
  const day = fs.readFileSync(new URL('./app/teachers/[id]/[date]/TeacherDayDetailsClient.js', import.meta.url), 'utf8');
  for (const source of [directory, overview, day]) {
    assert.match(source, /ZoomMembershipContext/);
  }
  assert.doesNotMatch(directory, /teacher\.zoomStatus \|\| 'not_invited'/);
});

console.log(`\nCRM-012: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
