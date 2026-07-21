import {DeploymentContext} from './context'
import {withRetry} from './retry'

/**
 * Result of deactivating deployments for an environment
 */
interface DeactivateResult {
  environment: string
  count: number
}

/**
 * Deactivates all existing deployments for a given environment.
 * Uses pagination to handle environments with many deployments.
 * Sets the deployment status to 'inactive' for all active deployments.
 *
 * @param context - The deployment context containing GitHub client and repository info
 * @param environment - The name of the environment to deactivate
 * @returns Promise that resolves when all deployments are deactivated
 */
async function deactivateEnvironment(
  context: DeploymentContext,
  environment: string
): Promise<DeactivateResult> {
  const {github: client, owner, repo} = context
  const {dryRun} = context.coreArgs

  const deployments = await withRetry(() =>
    client.paginate(client.rest.repos.listDeployments, {
      owner,
      repo,
      environment
    })
  )

  const existing = deployments.length
  if (existing < 1) {
    console.log(`found no existing deployments for env ${environment}`)
    return {environment, count: 0}
  }

  const deadState = 'inactive'

  const latestStatuses = await Promise.all(
    deployments.map(deployment =>
      withRetry(() =>
        client.rest.repos.listDeploymentStatuses({
          owner,
          repo,
          deployment_id: deployment.id,
          per_page: 1
        })
      )
    )
  )

  const activeDeployments = deployments.filter((deployment, index) => {
    const latestState = latestStatuses[index].data[0]?.state
    if (latestState === deadState) {
      console.log(
        `deployment '${environment}.${deployment.id}' is already ${deadState} - skipping`
      )
      return false
    }
    return true
  })

  const active = activeDeployments.length
  if (active < 1) {
    console.log(
      `found ${existing} existing deployments for env ${environment} - all already ${deadState}`
    )
    return {environment, count: 0}
  }

  console.log(
    `found ${active} active deployments for env ${environment} - marking as ${deadState}`
  )

  if (dryRun) {
    console.log(
      `[dry-run] would deactivate ${active} deployments for env ${environment}`
    )
    return {environment, count: active}
  }

  const results = await Promise.allSettled(
    activeDeployments.map(deployment => {
      console.log(
        `setting deployment '${environment}.${deployment.id}' (${deployment.sha}) state to "${deadState}"`
      )
      return withRetry(() =>
        client.rest.repos.createDeploymentStatus({
          owner,
          repo,
          deployment_id: deployment.id,
          state: deadState
        })
      )
    })
  )

  const failures = results.filter(r => r.status === 'rejected')
  if (failures.length > 0) {
    console.log(
      `${failures.length}/${active} deployments failed to deactivate for env ${environment}`
    )
    throw new Error(
      `Failed to deactivate ${failures.length}/${active} deployments for env ${environment}`
    )
  }

  console.log(`${active} deployments updated`)
  return {environment, count: active}
}

export default deactivateEnvironment
