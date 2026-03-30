import {getInput} from '@actions/core'
import {context, getOctokit} from '@actions/github'
import {GitHub} from '@actions/github/lib/utils'
import type {CoreArgs} from './types'

/**
 * Deployment context containing all necessary information for deployment operations
 */
export interface DeploymentContext {
  /** Git reference (branch, tag, or SHA) */
  ref: string
  /** Commit SHA */
  sha: string
  /** Repository owner/organization */
  owner: string
  /** Repository name */
  repo: string
  /** Authenticated GitHub API client */
  github: InstanceType<typeof GitHub>
  /** Core arguments shared across all steps */
  coreArgs: CoreArgs
}

/**
 * Collects and validates deployment context from GitHub Actions environment.
 *
 * @returns Deployment context with GitHub client and repository information
 * @throws Error if repository format is invalid
 */
export function collectDeploymentContext(): DeploymentContext {
  const {sha} = context

  const customRepository = getInput('repository', {required: false})

  const [owner, repo] = customRepository
    ? customRepository.split('/')
    : [context.repo.owner, context.repo.repo]

  if (!owner || !repo) {
    throw new Error(`invalid target repository: ${owner}/${repo}`)
  }

  const github = getOctokit(getInput('token', {required: true}), {
    previews: ['ant-man-preview', 'flash-preview']
  })

  return {
    ref: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF || '',
    sha,
    owner,
    repo,
    github,
    coreArgs: {
      logsURL:
        getInput('log_url') ||
        `https://github.com/${owner}/${repo}/commit/${sha}/checks`,
      desc: getInput('desc'),
      isDebug: getInput('debug') === 'true',
      dryRun: getInput('dry_run') === 'true',
      payload: getInput('payload') || undefined,
      autoInactive: getInput('auto_inactive') === 'true',
      transientEnvironment: getInput('transient_environment') !== 'false',
      productionEnvironment: getInput('production_environment') === 'true'
    }
  }
}
