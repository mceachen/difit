import { simpleGit, type SimpleGit } from 'simple-git';

// simple-git 4 strips ambient GIT_* variables from the git processes it spawns.
// Keep the two that select the repository so these calls agree with difit's
// direct `git` invocations (getGitRoot, getBlobContent).
const REPOSITORY_ENVIRONMENT = ['GIT_DIR', 'GIT_WORK_TREE'];

export function createGitClient(baseDir?: string): SimpleGit {
  return simpleGit(baseDir, { allowEnvironment: REPOSITORY_ENVIRONMENT });
}
