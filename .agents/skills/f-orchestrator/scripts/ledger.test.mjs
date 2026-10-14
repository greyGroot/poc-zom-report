import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const cli = fileURLToPath(new URL('./ledger.mjs', import.meta.url));
function fixture(t, candidate = false) {
  const cwd = mkdtempSync(join(tmpdir(), 'orchestration-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const write = (path, value) => writeFileSync(join(cwd, path), typeof value === 'string' ? value : JSON.stringify(value));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
  const git = (...args) => execFileSync('git', ['-C', join(cwd, 'candidate'), ...args], { encoding: 'utf8' }).trim();
  write('plan.md', 'Approved architecture A');
  const input = { paths: ['plan.md'] };
  if (candidate) {
    mkdirSync(join(cwd, 'candidate'));
    git('init', '-q');
    git('config', 'user.name', 'Ledger Test');
    git('config', 'user.email', 'ledger@example.invalid');
    write('candidate/source.txt', 'initial');
    git('add', '.');
    git('commit', '-qm', 'baseline');
    input.candidateDir = 'candidate';
    input.candidateBaseRevision = git('rev-parse', 'HEAD');
  }
  write('input.json', input);
  const capture = run('snapshot', 'input.json');
  assert.equal(capture.status, 0, capture.stderr);
  const approvedInputs = JSON.parse(capture.stdout);
  const state = {
    storyId: 'DEMO-07', status: 'IN_PROGRESS', phase: 'EXECUTION', currentRole: 'f-verificator',
    artifacts: { policyDigest: 'preserve-me' }, factory: { runId: 'previous-run' }, history: [{ status: 'EXISTING' }],
    gateState: {
      architecture: { name: 'Architecture Gate', status: 'APPROVED', signedBy: 'user', timestamp: '2026-10-13T10:00:00Z', approvedInputs },
      testContract: { status: 'APPROVED' },
    },
  };
  const save = () => { write('state.json', state); write('current.json', { architecture: input }); };
  save();
  return { cwd, write, run, git, input, state, save, ledger: () => JSON.parse(readFileSync(join(cwd, 'state.json'), 'utf8')) };
}

test('an approval without a human signer cannot authorize resume', t => {
  const f = fixture(t);
  delete f.state.gateState.architecture.signedBy;
  f.save();
  assert.equal(f.run('check', 'state.json', 'current.json', 'architecture').status, 1);
});

test('unchanged reviewed inputs retain approval and history without a ledger write', t => {
  const f = fixture(t);
  const before = readFileSync(join(f.cwd, 'state.json'), 'utf8');
  assert.equal(f.run('check', 'state.json', 'current.json', 'architecture').status, 0);
  assert.equal(readFileSync(join(f.cwd, 'state.json'), 'utf8'), before);
});

for (const scenario of ['changed plan', 'deleted artifact', 'legacy evidence', 'missing current inputs']) {
  test(`${scenario} blocks resume and preserves prior decisions`, t => {
    const f = fixture(t);
    if (scenario === 'changed plan') f.write('plan.md', 'Revised architecture B');
    if (scenario === 'deleted artifact') rmSync(join(f.cwd, 'plan.md'));
    if (scenario === 'legacy evidence') { delete f.state.gateState.architecture.approvedInputs; f.save(); }
    if (scenario === 'missing current inputs') f.write('current.json', {});
    assert.equal(f.run('check', 'state.json', 'current.json', 'architecture').status, 1);
    const state = f.ledger();
    assert.equal(state.gateState.architecture.status, 'PENDING');
    assert.equal(state.gateState.testContract.status, 'NOT_STARTED');
    assert.equal(state.history[1].priorGateState.architecture.status, 'APPROVED');
    assert.equal(state.history[0].status, 'EXISTING');
    assert.equal(state.factory.runId, 'previous-run');
    assert.equal(state.artifacts.policyDigest, 'preserve-me');
    assert.equal(state.phase, 'PLANNING');
  });
}

for (const scenario of ['candidate commit', 'dirty candidate', 'untracked candidate']) {
  test(`${scenario} changes invalidate approval`, t => {
    const f = fixture(t, true);
    f.write(scenario === 'untracked candidate' ? 'candidate/new.txt' : 'candidate/source.txt', 'changed');
    if (scenario === 'candidate commit') { f.git('add', '.'); f.git('commit', '-qm', 'implementation'); }
    assert.equal(f.run('check', 'state.json', 'current.json', 'architecture').status, 1);
    assert.equal(f.ledger().gateState.architecture.status, 'PENDING');
  });
}

test('directory additions change the complete artifact manifest', t => {
  const f = fixture(t);
  mkdirSync(join(f.cwd, 'views'));
  f.input.paths.push('views');
  f.write('input.json', f.input);
  f.state.gateState.architecture.approvedInputs = JSON.parse(f.run('snapshot', 'input.json').stdout);
  f.save();
  f.write('views/extra.svg', '<svg/>');
  assert.equal(f.run('check', 'state.json', 'current.json', 'architecture').status, 1);
});

test('changed selection, digest, and run identity block reuse', t => {
  const f = fixture(t);
  for (const metadata of [{ selection: 'B' }, { policyDigest: 'a'.repeat(64) }, { runId: 'other-run' }]) {
    f.save();
    f.write('current.json', { architecture: { ...f.input, ...metadata } });
    assert.equal(f.run('check', 'state.json', 'current.json', 'architecture').status, 1);
  }
});

test('candidate executable permission changes invalidate approval', t => {
  const f = fixture(t, true);
  chmodSync(join(f.cwd, 'candidate/source.txt'), 0o755);
  assert.equal(f.run('check', 'state.json', 'current.json', 'architecture').status, 1);
});

test('candidate capture rejects a subtree that omits other worktree files', t => {
  const f = fixture(t, true);
  mkdirSync(join(f.cwd, 'candidate/partial'));
  f.write('candidate/partial/inside.txt', 'inside');
  f.write('candidate/outside.txt', 'outside');
  f.git('add', '.');
  f.git('commit', '-qm', 'complete worktree');
  f.input.candidateDir = 'candidate/partial';
  f.write('input.json', f.input);
  const result = f.run('snapshot', 'input.json');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /candidate worktree root/i);
});

test('control executable permission changes invalidate approval', t => {
  const f = fixture(t);
  mkdirSync(join(f.cwd, 'control'));
  f.write('control/evaluate.sh', '#!/bin/sh\nexit 0\n');
  chmodSync(join(f.cwd, 'control/evaluate.sh'), 0o644);
  f.input.controlDir = 'control';
  f.input.policyDigest = 'a'.repeat(64);
  f.write('input.json', f.input);
  const captured = f.run('snapshot', 'input.json');
  assert.equal(captured.status, 0, captured.stderr);
  f.state.gateState.architecture.approvedInputs = JSON.parse(captured.stdout);
  f.save();
  chmodSync(join(f.cwd, 'control/evaluate.sh'), 0o755);
  assert.equal(f.run('check', 'state.json', 'current.json', 'architecture').status, 1);
  assert.equal(f.ledger().gateState.architecture.status, 'PENDING');
});
