import {DeploymentContext} from './context'
import {withRetry} from './retry'

/**
 * Gets all unique environments for deployments on a specific git ref.
 * Uses pagination to handle refs with many deployments.
 *
 * @param context - The deployment context containing GitHub client and repository info
 * @param ref - The git ref (branch, tag, or commit SHA) to query deployments for
 * @returns Promise that resolves to an array of unique environment names
 */
async function getEnvByRef(
  context: DeploymentContext,
  ref: string
): Promise<string[]> {
  const {github: client, owner, repo} = context

  const deployments = await withRetry(() =>
    client.paginate(client.rest.repos.listDeployments, {
      owner,
      repo,
      ref
    })
  )

  if (context.coreArgs.isDebug) {
    console.log('Deployments data')
    console.log(deployments)
  }

  const envs = deployments.map(dep => dep.environment)

  // Remove duplicates using Set
  return [...new Set(envs)]
}

export default getEnvByRef
