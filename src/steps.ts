import {getInput, setOutput, error, setFailed} from '@actions/core'
import {DeploymentContext} from './context'
import deactivateEnvironment from './deactivate'
import getEnvByRef from './get-env'
import {isValidUrl} from './url'
import {withRetry} from './retry'
import {
  isValidDeploymentStatus,
  type DeploymentData,
  type DeploymentStatus,
  type FinishStepArgs,
  type GetEnvStepArgs,
  type StartStepArgs,
  type EnvStepArgs
} from './types'

export enum Step {
  Start = 'start',
  Finish = 'finish',
  DeactivateEnv = 'deactivate-env',
  DeleteEnv = 'delete-env',
  GetEnv = 'get-env'
}

/**
 * Safely parse a JSON string that may be an array or a single value
 * @param input - The JSON string to parse
 * @returns The parsed value as an array, or the original string if parsing fails
 */
export function parseArrayOrString(input: string): string[] {
  try {
    const parsed = JSON.parse(input)
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
    }
    // If it's an empty array or not an array, return as single element
    return [input]
  } catch {
    // If parsing fails, treat as single string value
    return [input]
  }
}

/**
 * Convert an unknown value to DeploymentData with validation
 */
function toDeploymentData(dep: unknown): DeploymentData {
  if (typeof dep === 'string' || typeof dep === 'number') {
    return {id: String(dep), deployment_url: ''}
  }
  if (typeof dep === 'object' && dep !== null) {
    const obj = dep as Record<string, unknown>
    if (!('id' in obj)) {
      throw new Error(
        `Deployment object missing required 'id' field: ${JSON.stringify(dep)}`
      )
    }
    return {
      id: String(obj.id),
      deployment_url:
        typeof obj.deployment_url === 'string' ? obj.deployment_url : ''
    }
  }
  throw new Error(`Invalid deployment data: ${JSON.stringify(dep)}`)
}

/**
 * Safely parse deployment_id input
 * @param input - The deployment_id JSON string
 * @returns Array of deployment data objects
 */
export function parseDeploymentIds(input: string): DeploymentData[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  } catch {
    throw new Error(`Failed to parse deployment_id as JSON: ${input}`)
  }

  // Handle single value (string or number)
  if (typeof parsed === 'string' || typeof parsed === 'number') {
    return [{id: String(parsed), deployment_url: ''}]
  }

  // Handle array of deployment objects
  if (Array.isArray(parsed)) {
    return parsed.map(toDeploymentData)
  }

  // Handle single deployment object
  if (typeof parsed === 'object' && parsed !== null) {
    return [toDeploymentData(parsed)]
  }

  throw new Error(`Invalid deployment_id format: ${input}`)
}

/**
 * Report results from Promise.allSettled, throwing if any failed
 */
function reportSettledResults(
  results: PromiseSettledResult<unknown>[],
  label: string
): void {
  const failures = results.filter(
    (r): r is PromiseRejectedResult => r.status === 'rejected'
  )
  const successes = results.filter(r => r.status === 'fulfilled')

  if (successes.length > 0) {
    console.log(`${label}: ${successes.length} succeeded`)
  }
  if (failures.length > 0) {
    failures.forEach((f, i) => {
      error(`${label} failure ${i + 1}: ${f.reason}`)
    })
    throw new Error(`${label}: ${failures.length}/${results.length} failed`)
  }
}

export async function run(
  step: Step,
  context: DeploymentContext
): Promise<void> {
  const {github} = context
  try {
    switch (step) {
      case Step.Start: {
        const args: StartStepArgs = {
          ...context.coreArgs,
          environment: getInput('env', {required: true}),
          override: getInput('override'),
          gitRef: getInput('ref') || context.ref
        }

        if (args.isDebug) {
          console.log(`'${step}' arguments`, args)
        }

        const environments = parseArrayOrString(args.environment)

        if (args.isDebug) {
          console.log(`Environment(s) : ${environments}`)
        }

        if (args.dryRun) {
          console.log(
            `[dry-run] would create deployments for environments: ${environments.join(', ')}`
          )
          const mockOutput = environments.map((env, i) => ({
            id: `dry-run-${i}`,
            deployment_url: env
          }))
          setOutput('deployment_id', JSON.stringify(mockOutput))
          setOutput('env', args.environment)
          break
        }

        // Deactivate existing deployments unless auto_inactive is enabled
        if (!args.autoInactive) {
          const deactivateResults = await Promise.allSettled(
            environments.map(env => deactivateEnvironment(context, env))
          )
          reportSettledResults(deactivateResults, 'Deactivate environments')
        }

        // Create new deployments
        const deploymentResults = await Promise.allSettled(
          environments.map(env =>
            withRetry(() =>
              github.rest.repos.createDeployment({
                owner: context.owner,
                repo: context.repo,
                ref: args.gitRef,
                required_contexts: [],
                environment: env,
                auto_merge: false,
                description: args.desc,
                transient_environment: true,
                payload: args.payload || '',
                ...(args.autoInactive && {auto_inactive: true})
              })
            )
          )
        )

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const deploymentsData: any[] = []
        const failedEnvs: string[] = []

        deploymentResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            deploymentsData.push(result.value)
          } else {
            failedEnvs.push(environments[index])
            error(
              `Failed to create deployment for env ${environments[index]}: ${result.reason}`
            )
          }
        })

        if (failedEnvs.length > 0) {
          throw new Error(
            `Failed to create deployments for: ${failedEnvs.join(', ')}`
          )
        }

        if (args.isDebug) {
          console.log('Deployments data')
          console.log(deploymentsData)
        }

        // Create deployment status for each deployment
        const statusResults = await Promise.allSettled(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          deploymentsData.map((deployment: any) =>
            withRetry(() =>
              github.rest.repos.createDeploymentStatus({
                owner: context.owner,
                repo: context.repo,
                deployment_id: parseInt(String(deployment.data.id), 10),
                state: 'in_progress',
                ref: context.ref,
                description: args.desc,
                log_url: args.logsURL
              })
            )
          )
        )

        reportSettledResults(statusResults, 'Create deployment statuses')

        setOutput(
          'deployment_id',
          JSON.stringify(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            deploymentsData.map((deployment: any, index: number) => ({
              ...deployment.data,
              deployment_url: environments[index]
            }))
          )
        )
        setOutput('env', args.environment)
        break
      }

      case Step.Finish: {
        const args: FinishStepArgs = {
          ...context.coreArgs,
          status: getInput('status', {
            required: true
          }).toLowerCase() as DeploymentStatus,
          deployment: getInput('deployment_id', {required: true}),
          envURL: getInput('env_url', {required: false})
        }

        if (args.isDebug) {
          console.log(`'${step}' arguments`, args)
        }

        let environmentsUrl: string[] | undefined

        if (args.envURL) {
          environmentsUrl = parseArrayOrString(args.envURL)
        }

        if (!isValidDeploymentStatus(args.status)) {
          error(`unexpected status ${args.status}`)
          throw new Error(`Invalid status: ${args.status}`)
        }

        if (args.isDebug) {
          console.log(
            `finishing deployment for ${args.deployment} with status ${args.status}`
          )
        }

        const newStatus: DeploymentStatus =
          args.status === 'cancelled' ? 'inactive' : args.status

        const deployments = parseDeploymentIds(args.deployment)

        if (environmentsUrl && deployments.length !== environmentsUrl.length) {
          error('deployment_id and env_url must have the same length')
          throw new Error(
            `Length mismatch: deployment_id has ${deployments.length} items, env_url has ${environmentsUrl.length} items`
          )
        }

        if (args.dryRun) {
          console.log(
            `[dry-run] would set status "${newStatus}" for ${deployments.length} deployment(s)`
          )
          setOutput(
            'deployment_id',
            JSON.stringify(
              deployments.map(dep => ({id: dep.id, status: newStatus}))
            )
          )
          break
        }

        const results = await Promise.allSettled(
          deployments.map((dep, i) =>
            withRetry(() =>
              github.rest.repos.createDeploymentStatus({
                owner: context.owner,
                repo: context.repo,
                deployment_id: parseInt(dep.id, 10),
                state: newStatus,
                ref: context.ref,
                description: args.desc,
                environment_url:
                  newStatus === 'success' && environmentsUrl
                    ? environmentsUrl[i]
                    : newStatus === 'success' && isValidUrl(dep.deployment_url)
                      ? dep.deployment_url
                      : '',
                log_url: args.logsURL
              })
            )
          )
        )

        reportSettledResults(results, 'Update deployment statuses')

        setOutput(
          'deployment_id',
          JSON.stringify(
            deployments.map(dep => ({id: dep.id, status: newStatus}))
          )
        )
        break
      }

      case Step.DeactivateEnv: {
        const args: EnvStepArgs = {
          ...context.coreArgs,
          environment: getInput('env', {required: true})
        }

        if (args.isDebug) {
          console.log(`'${step}' arguments`, args)
        }

        const environments = parseArrayOrString(args.environment)

        if (args.dryRun) {
          console.log(
            `[dry-run] would deactivate environments: ${environments.join(', ')}`
          )
          break
        }

        const results = await Promise.allSettled(
          environments.map(env => deactivateEnvironment(context, env))
        )

        reportSettledResults(results, 'Deactivate environments')
        break
      }

      case Step.DeleteEnv: {
        const args: EnvStepArgs = {
          ...context.coreArgs,
          environment: getInput('env', {required: true})
        }

        if (args.isDebug) {
          console.log(`'${step}' arguments`, args)
        }

        const environments = parseArrayOrString(args.environment)

        if (args.dryRun) {
          console.log(
            `[dry-run] would delete environments: ${environments.join(', ')}`
          )
          break
        }

        const results = await Promise.allSettled(
          environments.map(env =>
            withRetry(() =>
              github.rest.repos.deleteAnEnvironment({
                owner: context.owner,
                repo: context.repo,
                environment_name: env
              })
            )
          )
        )

        reportSettledResults(results, 'Delete environments')
        break
      }

      case Step.GetEnv: {
        const args: GetEnvStepArgs = {
          ...context.coreArgs,
          gitRef: getInput('ref') || context.ref
        }

        if (args.isDebug) {
          console.log(`'${step}' arguments`, args)
        }

        const env = await getEnvByRef(context, args.gitRef)

        if (args.isDebug) {
          console.log(`Deployment by environment for ${args.gitRef} branch :`)
          console.log(env)
        }

        setOutput('env', JSON.stringify(env))
        break
      }

      default:
        setFailed(`unknown step type ${step}`)
    }
  } catch (err) {
    setFailed(`unexpected error encountered: ${err}`)
  }
}
