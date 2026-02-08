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
 * Valid deployment status values according to GitHub API
 */
export type DeploymentStatus =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'error'
  | 'inactive'
  | 'in_progress'
  | 'queued'
  | 'pending'

/**
 * Arguments for the start step
 */
export interface StartStepArgs {
  environment: string
  override?: string
  gitRef: string
  desc?: string
  logsURL: string
  isDebug: boolean
}

/**
 * Arguments for the finish step
 */
export interface FinishStepArgs {
  status: DeploymentStatus
  deployment: string
  envURL?: string
  desc?: string
  logsURL: string
  isDebug: boolean
}

/**
 * Arguments for environment operations (deactivate/delete)
 */
export interface EnvStepArgs {
  environment: string
  isDebug: boolean
}

/**
 * Arguments for get-env step
 */
export interface GetEnvStepArgs {
  gitRef: string
  isDebug: boolean
}

/**
 * Result of parsing environment input
 */
export type EnvironmentInput = string | string[]

/**
 * Helper function to check if a value is a valid deployment status
 */
export function isValidDeploymentStatus(status: string): status is DeploymentStatus {
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
