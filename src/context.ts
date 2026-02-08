import {getInput} from '@actions/core'
import {context, getOctokit} from '@actions/github'
import {GitHub} from '@actions/github/lib/utils'

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
  coreArgs: {
    /** URL to the commit checks page for logging */
    logsURL: string
    /** Optional description for the deployment */
    desc?: string
    /** Whether debug mode is enabled */
    isDebug: boolean
  }
}

/**
 * Collects and validates deployment context from GitHub Actions environment.
 *
 * @returns Deployment context with GitHub client and repository information
 * @throws Error if repository format is invalid
 *
 * @example
 * ```typescript
 * const context = collectDeploymentContext()
 * console.log(`targeting ${context.owner}/${context.repo}`)
 * ```
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
      logsURL: `https://github.com/${owner}/${repo}/commit/${sha}/checks`,
      desc: getInput('desc'),
      isDebug: getInput('debug') === 'true'
    }
  }
}
