import {DeploymentContext} from './context'

async function getEnvByRef(
  {github: client, owner, repo}: DeploymentContext,
  ref: string
): Promise<string[]> {
  const deployments = await client.rest.repos.listDeployments({
    owner,
    repo,
    ref
  })
  return deployments.data.map(dep => dep.environment)
}

export default getEnvByRef
