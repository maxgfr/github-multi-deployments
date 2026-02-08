import {DeploymentContext} from './context'

/**
 * Result of deactivating deployments for an environment
 */
interface DeactivateResult {
  environment: string
  count: number
}

/**
 * Deactivates all existing deployments for a given environment.
 * Sets the deployment status to 'inactive' for all active deployments.
 *
 * @param context - The deployment context containing GitHub client and repository info
 * @param environment - The name of the environment to deactivate
 * @returns Promise that resolves when all deployments are deactivated
 *
 * @example
 * ```typescript
 * await deactivateEnvironment(context, 'production')
 * // Output: "found 3 existing deployments for env production - marking as inactive"
 * ```
 */
async function deactivateEnvironment(
  {github: client, owner, repo}: DeploymentContext,
  environment: string
): Promise<DeactivateResult> {
  const deployments = await client.rest.repos.listDeployments({
    owner,
    repo,
    environment
  })

  const existing = deployments.data.length
  if (existing < 1) {
    console.log(`found no existing deployments for env ${environment}`)
    return {environment, count: 0}
  }

  const deadState = 'inactive'
  console.log(
    `found ${existing} existing deployments for env ${environment} - marking as ${deadState}`
  )

  // Deactivate all deployments in parallel for better performance
  const deactivationPromises = deployments.data.map((deployment) => {
    console.log(
      `setting deployment '${environment}.${deployment.id}' (${deployment.sha}) state to "${deadState}"`
    )
    return client.rest.repos.createDeploymentStatus({
      owner,
      repo,
      deployment_id: deployment.id,
      state: deadState
    })
  })

  await Promise.all(deactivationPromises)

  console.log(`${existing} deployments updated`)
  return {environment, count: existing}
}

export default deactivateEnvironment
