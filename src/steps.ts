import {
  getInput,
  setOutput,
  error,
  warning,
  setFailed,
  summary
} from '@actions/core'
import {DeploymentContext} from './context'
import deactivateEnvironment from './deactivate'
import getEnvByRef from './get-env'
import {isValidUrl} from './url'
import {withRetry} from './retry'
import {
  isValidDeploymentStatus,
  type CreateDeploymentResponse,
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
        `Deployment object missing required 'id' field: ${JSON.stringify(dep)}. Expected format: {"id": "123"} or {"id": "123", "deployment_url": "https://..."}`
      )
    }
    return {
      id: String(obj.id),
      deployment_url:
        typeof obj.deployment_url === 'string' ? obj.deployment_url : ''
    }
  }
  throw new Error(
    `Invalid deployment data: ${JSON.stringify(dep)}. Expected a number, string, or object with an 'id' field.`
  )
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
    throw new Error(
      `Failed to parse deployment_id as JSON: ${input}. Expected a number, JSON array, or JSON object.`
    )
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

  throw new Error(
    `Invalid deployment_id format: ${input}. Expected a number, JSON array, or JSON object.`
  )
}

/**
 * Report results from Promise.allSettled.
 * @param throwOnFailure - When true (default), throws if any failed. When false, logs warnings instead.
 * @returns true if all succeeded, false if some failed
 */
function reportSettledResults(
  results: PromiseSettledResult<unknown>[],
  label: string,
  throwOnFailure = true
): boolean {
  const failures = results.filter(
    (r): r is PromiseRejectedResult => r.status === 'rejected'
  )
  const successes = results.filter(r => r.status === 'fulfilled')

  if (successes.length > 0) {
    console.log(`${label}: ${successes.length} succeeded`)
  }
  if (failures.length > 0) {
    const msg = `${label}: ${failures.length}/${results.length} failed`
    failures.forEach((f, i) => {
      error(`${label} failure ${i + 1}: ${f.reason}`)
    })
    if (throwOnFailure) {
      throw new Error(msg)
    }
    warning(msg)
    return false
  }
  return true
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
          await summary
            .addHeading('[Dry Run] Deployment Started', 3)
            .addTable([
              [
                {data: 'Environment', header: true},
                {data: 'ID', header: true}
              ],
              ...environments.map((env, i) => [env, `dry-run-${i}`])
            ])
            .write()
          break
        }

        // Deactivate existing deployments unless auto_inactive is enabled
        if (!args.autoInactive) {
          const deactivateResults = await Promise.allSettled(
            environments.map(env => deactivateEnvironment(context, env))
          )
          reportSettledResults(
            deactivateResults,
            'Deactivate environments',
            !args.continueOnError
          )
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
                transient_environment: args.transientEnvironment,
                production_environment: args.productionEnvironment,
                payload: args.payload || '',
                ...(args.autoInactive && {auto_inactive: true})
              })
            )
          )
        )

        const deploymentsData: CreateDeploymentResponse[] = []
        const failedEnvs: string[] = []

        deploymentResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            deploymentsData.push(result.value as CreateDeploymentResponse)
          } else {
            failedEnvs.push(environments[index])
            error(
              `Failed to create deployment for env ${environments[index]}: ${result.reason}`
            )
          }
        })

        if (failedEnvs.length > 0) {
          if (args.continueOnError && deploymentsData.length > 0) {
            warning(
              `Partial failure: could not create deployments for: ${failedEnvs.join(', ')}`
            )
          } else {
            throw new Error(
              `Failed to create deployments for: ${failedEnvs.join(', ')}`
            )
          }
        }

        if (args.isDebug) {
          console.log('Deployments data')
          console.log(deploymentsData)
        }

        // Create deployment status for each deployment
        const statusResults = await Promise.allSettled(
          deploymentsData.map(deployment =>
            withRetry(() =>
              github.rest.repos.createDeploymentStatus({
                owner: context.owner,
                repo: context.repo,
                deployment_id: deployment.data.id,
                state: 'in_progress',
                description: args.desc,
                log_url: args.logsURL
              })
            )
          )
        )

        reportSettledResults(
          statusResults,
          'Create deployment statuses',
          !args.continueOnError
        )

        // Map successful deployments back to their environment names
        const successfulEnvs = environments.filter(
          env => !failedEnvs.includes(env)
        )

        setOutput(
          'deployment_id',
          JSON.stringify(
            deploymentsData.map((deployment, index) => ({
              ...deployment.data,
              deployment_url: successfulEnvs[index]
            }))
          )
        )
        setOutput('env', args.environment)
        await summary
          .addHeading('Deployment Started', 3)
          .addTable([
            [
              {data: 'Environment', header: true},
              {data: 'ID', header: true},
              {data: 'Ref', header: true}
            ],
            ...deploymentsData.map((d, i) => [
              successfulEnvs[i],
              String(d.data.id),
              args.gitRef
            ])
          ])
          .write()
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
          const invalidUrls = environmentsUrl.filter(url => !isValidUrl(url))
          if (invalidUrls.length > 0) {
            error(`Invalid environment URL(s): ${invalidUrls.join(', ')}`)
            throw new Error(
              `Invalid environment URL(s): ${invalidUrls.join(', ')}`
            )
          }
        }

        if (!isValidDeploymentStatus(args.status)) {
          error(`unexpected status ${args.status}`)
          throw new Error(
            `Invalid status: "${args.status}". Valid values: success, failure, cancelled, error, inactive, in_progress, queued, pending`
          )
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
          await summary
            .addHeading(`[Dry Run] Deployment Finished (${newStatus})`, 3)
            .addTable([
              [
                {data: 'ID', header: true},
                {data: 'Status', header: true}
              ],
              ...deployments.map(dep => [dep.id, newStatus])
            ])
            .write()
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

        reportSettledResults(
          results,
          'Update deployment statuses',
          !args.continueOnError
        )

        setOutput(
          'deployment_id',
          JSON.stringify(
            deployments.map(dep => ({id: dep.id, status: newStatus}))
          )
        )
        await summary
          .addHeading(`Deployment Finished (${newStatus})`, 3)
          .addTable([
            [
              {data: 'ID', header: true},
              {data: 'Status', header: true},
              {data: 'URL', header: true}
            ],
            ...deployments.map((dep, i) => [
              dep.id,
              newStatus,
              environmentsUrl?.[i] || '-'
            ])
          ])
          .write()
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
          await summary
            .addHeading('[Dry Run] Environments Deactivated', 3)
            .addRaw(environments.join(', '))
            .write()
          break
        }

        const results = await Promise.allSettled(
          environments.map(env => deactivateEnvironment(context, env))
        )

        reportSettledResults(
          results,
          'Deactivate environments',
          !args.continueOnError
        )
        await summary
          .addHeading('Environments Deactivated', 3)
          .addRaw(environments.join(', '))
          .write()
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
          await summary
            .addHeading('[Dry Run] Environments Deleted', 3)
            .addRaw(environments.join(', '))
            .write()
          break
        }

        const deleteResults = await Promise.allSettled(
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

        reportSettledResults(
          deleteResults,
          'Delete environments',
          !args.continueOnError
        )
        await summary
          .addHeading('Environments Deleted', 3)
          .addRaw(environments.join(', '))
          .write()
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
        await summary
          .addHeading('Environments Found', 3)
          .addRaw(
            env.length > 0
              ? env.join(', ')
              : `No environments found for ref \`${args.gitRef}\``
          )
          .write()
        break
      }

      default:
        setFailed(`unknown step type ${step}`)
    }
  } catch (err) {
    setFailed(`unexpected error encountered: ${err}`)
  }
}
