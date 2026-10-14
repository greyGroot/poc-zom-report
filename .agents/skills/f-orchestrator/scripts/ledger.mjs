import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const gates = ['requirements', 'design', 'architecture', 'testContract', 'factoryDispatch', 'review', 'release'];
// Return the lowercase SHA-256 fingerprint of the supplied bytes or text.
const digest = value => createHash('sha256').update(value).digest('hex');
// Read a UTF-8 JSON file and return its parsed value.
const read = path => JSON.parse(readFileSync(path, 'utf8'));
// Serialize JSON with sorted object keys so key order does not affect comparisons.
const canonical = value => JSON.stringify(value, (_, item) => {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
  }
  return item;
});

// Check repository containment and reject symbolic links, then return a relative path.
function local(path) {
  if (typeof path !== 'string' || !path) throw new Error('A nonempty artifact path is required.');
  const absolute = resolve(path);
  const name = relative(process.cwd(), absolute);
  if (!name || name === '..' || name.startsWith(`..${sep}`)) throw new Error(`Artifact is outside the story repository: ${path}`);
  // Reject symlinks in ancestors as well as at the final file.
  let current = process.cwd();
  for (const part of name.split(sep)) {
    current = resolve(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error(`Symbolic link is unverifiable: ${current}`);
  }
  return name.split(sep).join('/');
}

// Add file fingerprints, executable permissions, and complete directory membership to the supplied manifests.
function collect(path, files, directories, fileModes) {
  const name = local(path);
  const stat = lstatSync(name);
  if (stat.isDirectory()) {
    directories.push(name);
    for (const child of readdirSync(name).sort()) collect(`${name}/${child}`, files, directories, fileModes);
  } else if (stat.isFile()) {
    files[name] = digest(readFileSync(name));
    fileModes[name] = stat.mode & 0o111;
  } else {
    throw new Error(`Artifact is not a regular file or directory: ${name}`);
  }
}

// Capture reviewed artifacts, workflow identities, and candidate content for approval comparison.
function snapshot(input) {
  if (!Array.isArray(input.paths) || input.paths.length === 0) throw new Error('Reviewed artifact paths are required.');
  const artifacts = {};
  const artifactFileModes = {};
  const directories = [];
  const roots = [...new Set(input.paths.map(local))].sort();
  for (const path of roots) collect(path, artifacts, directories, artifactFileModes);
  const result = {
    roots, artifacts, artifactFileModes, directories: [...new Set(directories)].sort(),
    selection: input.selection ?? null,
    candidateRevision: null,
    candidateBaseRevision: input.candidateBaseRevision ?? null,
    candidateDir: input.candidateDir ? local(input.candidateDir) : null,
    controlDir: input.controlDir ? local(input.controlDir) : null,
    policyDigest: input.policyDigest ?? null,
    runId: input.runId ?? null,
  };
  if (result.policyDigest && !/^[a-f0-9]{64}$/.test(result.policyDigest)) throw new Error('Invalid policy digest.');
  if (result.controlDir) collect(result.controlDir, artifacts, directories, artifactFileModes);
  if (result.candidateDir) {
    // Run a Git query in the candidate and return its trimmed output.
    const git = args => execFileSync('git', ['-C', result.candidateDir, ...args], { encoding: 'utf8' }).trim();
    if (resolve(git(['rev-parse', '--show-toplevel'])) !== resolve(result.candidateDir)) {
      throw new Error('Candidate directory must identify the candidate worktree root.');
    }
    result.candidateRevision = git(['rev-parse', '--verify', 'HEAD']);
    if (!result.candidateBaseRevision) throw new Error('Candidate base revision is required.');
    const base = git(['rev-parse', '--verify', `${result.candidateBaseRevision}^{commit}`]);
    if (base !== result.candidateBaseRevision) throw new Error('Candidate base must be an immutable commit ID.');
    const names = execFileSync('git', ['-C', result.candidateDir, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' });
    const candidateFiles = {};
    const candidateFileModes = {};
    // Deleted tracked files remain explicit in the manifest.
    for (const name of [...new Set(names.split('\0').filter(Boolean))].sort()) {
      const path = `${result.candidateDir}/${name}`;
      try {
        collect(path, candidateFiles, [], candidateFileModes);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        candidateFiles[path] = null;
      }
    }
    result.candidateFiles = candidateFiles;
    result.candidateFileModes = candidateFileModes;
    result.candidateContentFingerprint = digest(canonical({ candidateFiles, candidateFileModes }));
  }
  result.directories = [...new Set(directories)].sort();
  return JSON.parse(canonical(result));
}

// Check requested approvals and preserve prior records before invalidating stale gates.
function check(statePath, inputsPath, requested) {
  if (!requested.length || requested.some(gate => !gates.includes(gate))) throw new Error('Specify valid prerequisite gate keys.');
  const state = read(statePath);
  const inputs = read(inputsPath);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(state.storyId)) throw new Error('Invalid ledger story ID.');
  if (state.status !== 'IN_PROGRESS' || !Array.isArray(state.history) || !state.gateState) throw new Error('Ledger cannot resume.');
  const failures = [];
  for (const gate of gates.filter(key => requested.includes(key))) {
    const record = state.gateState[gate];
    try {
      if (record?.status !== 'APPROVED') throw new Error('Human approval is required.');
      if (record.signedBy !== 'user' || !Number.isFinite(Date.parse(record.timestamp))) throw new Error('Human decision evidence is missing.');
      if (!record.approvedInputs) throw new Error('Legacy approval has no snapshot.');
      if (!inputs[gate]) throw new Error('Current input specification is missing.');
      if (canonical(record.approvedInputs) !== canonical(snapshot(inputs[gate]))) throw new Error('Reviewed inputs changed.');
    } catch (error) {
      failures.push({ gate, reason: error.message });
    }
  }
  if (failures.length) {
    const first = gates.indexOf(failures[0].gate);
    const timestamp = new Date().toISOString();
    state.history.push({ status: 'APPROVAL_INVALIDATED', timestamp, failures, priorGateState: structuredClone(state.gateState) });
    for (const [index, gate] of gates.entries()) {
      if (index < first) continue;
      state.gateState[gate] = {
        ...state.gateState[gate], status: index === first ? 'PENDING' : 'NOT_STARTED',
        timestamp: null, signedBy: null,
      };
      delete state.gateState[gate].approvedInputs;
    }
    const roles = ['f-ba', 'f-ux', 'f-architect', 'f-verificator', 'f-operator', 'f-review', 'f-runner'];
    state.currentRole = roles[first];
    state.phase = first < 3 ? 'PLANNING' : 'EXECUTION';
    const temporary = `${statePath}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx' });
    renameSync(temporary, statePath);
  }
  return { verified: failures.length === 0, failures };
}

try {
  const [command, ...args] = process.argv.slice(2);
  let result;
  if (command === 'snapshot' && args.length === 1) result = snapshot(read(args[0]));
  else if (command === 'check' && args.length >= 3) result = check(args[0], args[1], args.slice(2));
  else throw new Error('Use snapshot <inputs.json> or check <state.json> <current-inputs.json> <gate-key>...');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.verified === false) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
