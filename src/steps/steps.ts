import {getInput, setOutput, error, setFailed} from '@actions/core'
import {DeploymentContext} from '../lib/context'
import deactivateEnvironment from '../lib/deactivate'

export enum Step {
  Start = 'start',
  Finish = 'finish',
  DeactivateEnv = 'deactivate-env',
  DeleteEnv = 'delete-env'
}

export async function run(
  step: Step,
  context: DeploymentContext
): Promise<void> {
  const {github} = context
  try {
    switch (step) {
      case Step.Start:
        {
          const args = {
            ...context.coreArgs,
            environment: getInput('env', {required: true}),
            override: getInput('override'),
            gitRef: getInput('ref') || context.ref
          }

          if (args.logArgs) {
            console.log(`'${step}' arguments`, args)
          }

          let environments: any

          const isMulti = args.environment.split(',').length > 1

          if (args.logArgs) {
            console.log(`Is a multi environment : ${isMulti}`)
          }

          if (isMulti) {
            environments = JSON.parse(args.environment)
          } else {
            environments = [args.environment]
          }

          if (args.logArgs) {
            console.log(`Environment(s) : ${environments}`)
          }

          const promises: any = []
          const deactivatePromises: any = []
          for (const environment of environments) {
            deactivatePromises.push(deactivateEnvironment(context, environment))
            promises.push(
              github.rest.repos.createDeployment({
                owner: context.owner,
                repo: context.repo,
                ref: args.gitRef,
                required_contexts: [],
                environment,
                auto_merge: false,
                description: args.description
              })
            )
          }

          let deploymentsData: any = []

          try {
            await Promise.all(deactivatePromises)
            deploymentsData = await Promise.all(promises)
          } catch {
            error('Cannot generate deployments')
          }

          if (args.logArgs) {
            console.log('Deployments data')
            console.log(deploymentsData)
          }

          const secondPromises: any = []

          deploymentsData.map((deployment: any) => {
            secondPromises.push(
              github.rest.repos.createDeploymentStatus({
                owner: context.owner,
                repo: context.repo,
                deployment_id: parseInt(deployment.data.id, 10),
                state: 'in_progress',
                ref: context.ref,
                description: args.description
              })
            )
          })

          try {
            await Promise.all(secondPromises)
            setOutput(
              'deployment_id',
              isMulti
                ? JSON.stringify(
                    deploymentsData.map((deployment: any, index: number) => ({
                      ...deployment.data,
                      deployment_url: environments[index]
                    }))
                  )
                : deploymentsData[0].data.id
            )
            setOutput('env', args.environment)
          } catch (e) {
            console.log(e)
            error('Cannot generate deployment status')
          }
        }
        break

      case Step.Finish:
        {
          const args = {
            ...context.coreArgs,
            status: getInput('status', {required: true}).toLowerCase(),
            deployment: getInput('deployment_id', {required: true}),
            envURL: getInput('env_url', {required: false})
          }

          if (args.logArgs) {
            console.log(`'${step}' arguments`, args)
          }

          let environmentsUrl: any

          if (args.envURL) {
            const isMulti = args.envURL.split(',').length > 1

            if (args.logArgs) {
              console.log(`Is a multi environment : ${isMulti}`)
            }

            if (isMulti) {
              environmentsUrl = JSON.parse(args.envURL)
            } else {
              environmentsUrl = [args.envURL]
            }
          }

          if (
            args.status !== 'success' &&
            args.status !== 'failure' &&
            args.status !== 'cancelled' &&
            args.status !== 'error' &&
            args.status !== 'inactive' &&
            args.status !== 'in_progress' &&
            args.status !== 'queued' &&
            args.status !== 'pending'
          ) {
            error(`unexpected status ${args.status}`)
            return
          }

          if (args.logArgs) {
            console.log(
              `finishing deployment for ${args.deployment} with status ${args.status}`
            )
          }

          const newStatus =
            args.status === 'cancelled' ? 'inactive' : args.status

          const deployments: {id: string; deployment_url: string}[] =
            JSON.parse(args.deployment)

          if (
            environmentsUrl &&
            deployments.length !== environmentsUrl.length
          ) {
            error('deployment_id and env_url must have the same length')
          }

          const promises = deployments.map(async (dep, i) =>
            github.rest.repos.createDeploymentStatus({
              owner: context.owner,
              repo: context.repo,
              deployment_id: parseInt(dep.id, 10),
              state: newStatus,
              ref: context.ref,
              description: args.description,
              environment_url:
                newStatus === 'success'
                  ? environmentsUrl
                    ? environmentsUrl[i]
                    : dep.deployment_url
                  : ''
            })
          )

          try {
            await Promise.all(promises)
          } catch (e) {
            console.log(e)
            error('Cannot generate deployment status')
          }
        }
        break

      case Step.DeactivateEnv:
        {
          const args = {
            ...context.coreArgs,
            environment: getInput('env', {required: false})
          }

          if (args.logArgs) {
            console.log(`'${step}' arguments`, args)
          }

          let environments: any

          const isMulti = args.environment.split(',').length > 1

          if (isMulti) {
            environments = JSON.parse(args.environment)
          } else {
            environments = [args.environment]
          }

          const promises: any = []

          environments.map((env: string) => {
            promises.push(deactivateEnvironment(context, env))
          })

          try {
            await Promise.all(promises)
          } catch (e) {
            console.log(e)
            error('Cannot deactivate deployment status')
          }
        }
        break

      case Step.DeleteEnv:
        {
          const args = {
            ...context.coreArgs,
            environment: getInput('env', {required: false})
          }

          if (args.logArgs) {
            console.log(`'${step}' arguments`, args)
          }

          let environments: any

          const isMulti = args.environment.split(',').length > 1

          if (isMulti) {
            environments = JSON.parse(args.environment)
          } else {
            environments = [args.environment]
          }

          const promises: any = []

          environments.map((env: string) => {
            promises.push(
              github.rest.repos.deleteAnEnvironment({
                owner: context.owner,
                repo: context.repo,
                environment_name: env
              })
            )
          })

          try {
            await Promise.all(promises)
          } catch (e) {
            console.log(e)
            error('Cannot delete env')
          }
        }
        break

      default:
        setFailed(`unknown step type ${step}`)
    }
  } catch (error) {
    setFailed(`unexpected error encountered: ${error}`)
  }
}
