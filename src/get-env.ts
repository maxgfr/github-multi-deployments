import {DeploymentContext} from './context'

/**
 * Gets all unique environments for deployments on a specific git ref.
 *
 * @param context - The deployment context containing GitHub client and repository info
 * @param ref - The git ref (branch, tag, or commit SHA) to query deployments for
 * @returns Promise that resolves to an array of unique environment names
 *
 * @example
 * ```typescript
 * const environments = await getEnvByRef(context, 'main')
 * // Returns: ['production', 'staging']
 * ```
 */
async function getEnvByRef(
  {github: client, owner, repo}: DeploymentContext,
  ref: string
): Promise<string[]> {
  const deployments = await client.rest.repos.listDeployments({
    owner,
    repo,
    ref
  })

  console.log('Deployments data')
  console.log(deployments.data)

  const envs = deployments.data.map((dep) => dep.environment)

  // Remove duplicates using Set
  return [...new Set(envs)]
}

export default getEnvByRef
