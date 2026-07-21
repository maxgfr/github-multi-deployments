/**
 * Type representing a deployment returned by GitHub API
 */
export interface GitHubDeployment {
  id: number
  sha: string
  ref: string
  environment: string
  description?: string
  created_at: string
  updated_at: string
  statuses_url: string
  repository_url: string
  transient_environment?: boolean
  production_environment?: boolean
}

/**
 * Type representing a deployment with URL information
 */
export interface DeploymentWithUrl extends GitHubDeployment {
  deployment_url: string
}

/**
 * Type representing deployment data used internally
 */
export interface DeploymentData {
  id: string
  deployment_url: string
}

/**
 * Deployment status values supported by the GitHub deployment status API
 */
export type GitHubApiDeploymentStatus =
  | 'success'
  | 'failure'
  | 'error'
  | 'inactive'
  | 'in_progress'
  | 'queued'
  | 'pending'

/**
 * Status values accepted as input by this action.
 * 'cancelled' is not a GitHub API status: it is accepted for backward
 * compatibility and mapped to 'inactive' before calling the API.
 */
export type DeploymentStatus = GitHubApiDeploymentStatus | 'cancelled'

/**
 * Core arguments shared across all steps
 */
export interface CoreArgs {
  logsURL: string
  desc?: string
  isDebug: boolean
  dryRun: boolean
  payload?: string
  autoInactive: boolean
  transientEnvironment: boolean
  productionEnvironment: boolean
  continueOnError: boolean
}

/**
 * Response from GitHub API createDeployment
 */
export interface CreateDeploymentResponse {
  data: {
    id: number
    sha: string
    ref: string
    environment: string
    description?: string
    [key: string]: unknown
  }
}

/**
 * Arguments for the start step
 */
export interface StartStepArgs extends CoreArgs {
  environment: string
  gitRef: string
}

/**
 * Arguments for the finish step
 */
export interface FinishStepArgs extends CoreArgs {
  status: DeploymentStatus
  deployment: string
  envURL?: string
}

/**
 * Arguments for environment operations (deactivate/delete)
 */
export interface EnvStepArgs extends CoreArgs {
  environment: string
}

/**
 * Arguments for get-env step
 */
export interface GetEnvStepArgs extends CoreArgs {
  gitRef: string
}

/**
 * Helper function to check if a value is a valid deployment status
 */
export function isValidDeploymentStatus(
  status: string
): status is DeploymentStatus {
  return [
    'success',
    'failure',
    'cancelled',
    'error',
    'inactive',
    'in_progress',
    'queued',
    'pending'
  ].includes(status)
}

/**
 * Maps an accepted input status to a status supported by the GitHub API.
 * 'cancelled' is kept for backward compatibility and mapped to 'inactive';
 * every other accepted status is already a valid API status.
 */
export function toApiDeploymentStatus(
  status: DeploymentStatus
): GitHubApiDeploymentStatus {
  return status === 'cancelled' ? 'inactive' : status
}
