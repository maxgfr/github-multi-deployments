import {getInput, setOutput, error, setFailed} from '@actions/core'
import {DeploymentContext} from './context'
import deactivateEnvironment from './deactivate'
import getEnvByRef from './get-env'
import {isValidUrl} from './url'
import type {
  DeploymentData,
  DeploymentStatus,
  FinishStepArgs,
  GetEnvStepArgs,
  StartStepArgs,
  EnvStepArgs
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
function parseArrayOrString(input: string): string[] {
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
 * Safely parse deployment_id input
 * @param input - The deployment_id JSON string
 * @returns Array of deployment data objects
 */
function parseDeploymentIds(input: string): DeploymentData[] {
  try {
    const parsed = JSON.parse(input)

    // Handle single value (string or number)
    if (typeof parsed === 'string' || typeof parsed === 'number') {
      return [{id: String(parsed), deployment_url: ''}]
    }

    // Handle array of deployment objects
    if (Array.isArray(parsed)) {
      return parsed.map((dep: unknown) => {
        if (typeof dep === 'string' || typeof dep === 'number') {
          return {id: String(dep), deployment_url: ''}
        }
        if (typeof dep === 'object' && dep !== null) {
          return dep as DeploymentData
        }
        throw new Error(`Invalid deployment data: ${JSON.stringify(dep)}`)
      })
    }

    // Handle single deployment object
    if (typeof parsed === 'object' && parsed !== null) {
      return [parsed as DeploymentData]
    }

    throw new Error(`Invalid deployment_id format: ${input}`)
  } catch (err) {
    throw new Error(`Failed to parse deployment_id: ${err}`)
  }
}

/**
 * Validate deployment status
 * @param status - The status to validate
 * @returns true if valid, false otherwise
 */
function validateStatus(status: string): status is DeploymentStatus {
  const validStatuses: DeploymentStatus[] = [
    'success',
    'failure',
    'cancelled',
    'error',
    'inactive',
    'in_progress',
    'queued',
    'pending'
  ]
  return validStatuses.includes(status as DeploymentStatus)
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

        // Deactivate existing deployments and create new ones
        const deactivatePromises = environments.map((env) =>
          deactivateEnvironment(context, env)
        )

        const deploymentPromises = environments.map((env) =>
          github.rest.repos.createDeployment({
            owner: context.owner,
            repo: context.repo,
            ref: args.gitRef,
            required_contexts: [],
            environment: env,
            auto_merge: false,
            description: args.desc,
            transient_environment: true
          })
        )

        let deploymentsData: any[]

        try {
          await Promise.all(deactivatePromises)
          deploymentsData = await Promise.all(deploymentPromises)
        } catch (err) {
          error(`Cannot generate deployments: ${err}`)
          throw err
        }

        if (args.isDebug) {
          console.log('Deployments data')
          console.log(deploymentsData)
        }

        // Create deployment status for each deployment
        const statusPromises = deploymentsData.map((deployment: any) =>
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

        try {
          await Promise.all(statusPromises)
          setOutput(
            'deployment_id',
            JSON.stringify(
              deploymentsData.map((deployment: any, index: number) => ({
                ...deployment.data,
                deployment_url: environments[index]
              }))
            )
          )
          setOutput('env', args.environment)
        } catch (err) {
          console.log(err)
          error(`Cannot generate deployment status: ${err}`)
          throw err
        }
        break
      }

      case Step.Finish: {
        const args: FinishStepArgs = {
          ...context.coreArgs,
          status: getInput('status', {required: true}).toLowerCase() as DeploymentStatus,
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

        if (!validateStatus(args.status)) {
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

        const promises = deployments.map(async (dep, i) =>
          github.rest.repos.createDeploymentStatus({
            owner: context.owner,
            repo: context.repo,
            deployment_id: parseInt(dep.id, 10),
            state: newStatus,
            ref: context.ref,
            description: args.desc,
            environment_url:
              newStatus === 'success'
                ? environmentsUrl
                  ? environmentsUrl[i]
                  : isValidUrl(dep.deployment_url)
                  ? dep.deployment_url
                  : ''
                : '',
            log_url: args.logsURL
          })
        )

        try {
          await Promise.all(promises)
        } catch (err) {
          console.log(err)
          error(`Cannot generate deployment status: ${err}`)
          throw err
        }
        break
      }

      case Step.DeactivateEnv: {
        const args: EnvStepArgs = {
          ...context.coreArgs,
          environment: getInput('env', {required: false})
        }

        if (args.isDebug) {
          console.log(`'${step}' arguments`, args)
        }

        const environments = parseArrayOrString(args.environment)

        const promises = environments.map((env) =>
          deactivateEnvironment(context, env)
        )

        try {
          await Promise.all(promises)
        } catch (err) {
          console.log(err)
          error(`Cannot deactivate deployment status: ${err}`)
          throw err
        }
        break
      }

      case Step.DeleteEnv: {
        const args: EnvStepArgs = {
          ...context.coreArgs,
          environment: getInput('env', {required: false})
        }

        if (args.isDebug) {
          console.log(`'${step}' arguments`, args)
        }

        const environments = parseArrayOrString(args.environment)

        const promises = environments.map((env) =>
          github.rest.repos.deleteAnEnvironment({
            owner: context.owner,
            repo: context.repo,
            environment_name: env
          })
        )

        try {
          await Promise.all(promises)
        } catch (err) {
          console.log(err)
          error(`Cannot delete env: ${err}`)
          throw err
        }
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

        try {
          setOutput('env', JSON.stringify(env))
        } catch (err) {
          console.log(err)
          error(`Cannot generate deployment status: ${err}`)
          throw err
        }
        break
      }

      default:
        setFailed(`unknown step type ${step}`)
    }
  } catch (err) {
    setFailed(`unexpected error encountered: ${err}`)
  }
}
