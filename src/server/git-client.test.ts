import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GitDiffParser } from './git-diff.js';

// Git hooks export GIT_DIR and GIT_INDEX_FILE; strip GIT_* so setup commands
// cannot touch the repository that is running this suite.
const setupEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
);

function createRepo(root: string, name: string): { path: string; head: string } {
  const path = join(root, name);
  mkdirSync(path);
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=difit',
        '-c',
        'user.email=difit@example.com',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      { cwd: path, env: setupEnv, encoding: 'utf8' },
    ).trim();
  git('init', '--quiet');
  writeFileSync(join(path, 'file.txt'), `${name}\n`);
  git('add', 'file.txt');
  git('commit', '--quiet', '--no-verify', '--message', name);
  return { path, head: git('rev-parse', 'HEAD').slice(0, 7) };
}

describe('git client repository environment', () => {
  let root: string;

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it('reads the repository named by GIT_DIR and GIT_WORK_TREE', async () => {
    root = mkdtempSync(join(tmpdir(), 'difit-git-env-'));
    const cwdRepo = createRepo(root, 'cwd-repo');
    const envRepo = createRepo(root, 'env-repo');
    vi.stubEnv('GIT_DIR', join(envRepo.path, '.git'));
    vi.stubEnv('GIT_WORK_TREE', envRepo.path);

    const parser = new GitDiffParser(cwdRepo.path);

    await expect(parser.resolveCommitish('HEAD')).resolves.toBe(envRepo.head);
  });
});
