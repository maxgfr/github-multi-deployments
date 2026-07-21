/// <reference types="@types/jest" />

jest.mock('./retry', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withRetry: jest.fn((fn: () => Promise<any>) => fn())
}))

import deactivateEnvironment from './deactivate'
import type {DeploymentContext} from './context'
import type {CoreArgs} from './types'

function createMockContext(
  coreArgsOverrides: Partial<CoreArgs> = {}
): DeploymentContext {
  return {
    ref: 'refs/heads/main',
    sha: 'abc123',
    owner: 'test-owner',
    repo: 'test-repo',
    github: {
      rest: {
        repos: {
          listDeployments: jest.fn(),
          listDeploymentStatuses: jest.fn().mockResolvedValue({data: []}),
          createDeploymentStatus: jest.fn().mockResolvedValue({})
        }
      },
      paginate: jest.fn().mockResolvedValue([])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    coreArgs: {
      logsURL: 'https://github.com/test-owner/test-repo/commit/abc123/checks',
      desc: 'test',
      isDebug: false,
      dryRun: false,
      payload: undefined,
      autoInactive: false,
      transientEnvironment: true,
      productionEnvironment: false,
      continueOnError: false,
      ...coreArgsOverrides
    }
  }
}

describe('deactivateEnvironment', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return count 0 when no deployments exist', async () => {
    const context = createMockContext()
    const result = await deactivateEnvironment(context, 'staging')

    expect(result).toEqual({environment: 'staging', count: 0})
    expect(
      context.github.rest.repos.createDeploymentStatus
    ).not.toHaveBeenCalled()
  })

  it('should deactivate all existing deployments', async () => {
    const context = createMockContext()
    ;(context.github.paginate as unknown as jest.Mock).mockResolvedValue([
      {id: 1, sha: 'sha1'},
      {id: 2, sha: 'sha2'},
      {id: 3, sha: 'sha3'}
    ])

    const result = await deactivateEnvironment(context, 'production')

    expect(result).toEqual({environment: 'production', count: 3})
    expect(
      context.github.rest.repos.createDeploymentStatus
    ).toHaveBeenCalledTimes(3)
    expect(
      context.github.rest.repos.createDeploymentStatus
    ).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      deployment_id: 1,
      state: 'inactive'
    })
    expect(
      context.github.rest.repos.createDeploymentStatus
    ).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      deployment_id: 2,
      state: 'inactive'
    })
    expect(
      context.github.rest.repos.createDeploymentStatus
    ).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      deployment_id: 3,
      state: 'inactive'
    })
  })

  it('should skip API calls in dry-run mode', async () => {
    const context = createMockContext({dryRun: true})
    ;(context.github.paginate as unknown as jest.Mock).mockResolvedValue([
      {id: 1, sha: 'sha1'}
    ])

    const result = await deactivateEnvironment(context, 'staging')

    expect(result).toEqual({environment: 'staging', count: 1})
    expect(
      context.github.rest.repos.createDeploymentStatus
    ).not.toHaveBeenCalled()
  })

  it('should call paginate with correct parameters', async () => {
    const context = createMockContext()
    await deactivateEnvironment(context, 'staging')

    expect(context.github.paginate).toHaveBeenCalledWith(
      context.github.rest.repos.listDeployments,
      {owner: 'test-owner', repo: 'test-repo', environment: 'staging'}
    )
  })

  it('should throw when some deactivations fail', async () => {
    const context = createMockContext()
    ;(context.github.paginate as unknown as jest.Mock).mockResolvedValue([
      {id: 1, sha: 'sha1'},
      {id: 2, sha: 'sha2'}
    ])
    ;(
      context.github.rest.repos.createDeploymentStatus as unknown as jest.Mock
    ).mockRejectedValueOnce(new Error('API error'))

    await expect(deactivateEnvironment(context, 'staging')).rejects.toThrow(
      'Failed to deactivate 1/2 deployments for env staging'
    )
  })

  it('should handle single deployment', async () => {
    const context = createMockContext()
    ;(context.github.paginate as unknown as jest.Mock).mockResolvedValue([
      {id: 42, sha: 'deadbeef'}
    ])

    const result = await deactivateEnvironment(context, 'preview')

    expect(result).toEqual({environment: 'preview', count: 1})
    expect(
      context.github.rest.repos.createDeploymentStatus
    ).toHaveBeenCalledTimes(1)
  })

  it('should check the latest status of each deployment', async () => {
    const context = createMockContext()
    ;(context.github.paginate as unknown as jest.Mock).mockResolvedValue([
      {id: 1, sha: 'sha1'},
      {id: 2, sha: 'sha2'}
    ])

    await deactivateEnvironment(context, 'staging')

    expect(
      context.github.rest.repos.listDeploymentStatuses
    ).toHaveBeenCalledTimes(2)
    expect(
      context.github.rest.repos.listDeploymentStatuses
    ).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      deployment_id: 1,
      per_page: 1
    })
    expect(
      context.github.rest.repos.listDeploymentStatuses
    ).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      deployment_id: 2,
      per_page: 1
    })
  })

  it('should skip deployments that are already inactive', async () => {
    const context = createMockContext()
    ;(context.github.paginate as unknown as jest.Mock).mockResolvedValue([
      {id: 1, sha: 'sha1'},
      {id: 2, sha: 'sha2'}
    ])
    ;(context.github.rest.repos.listDeploymentStatuses as unknown as jest.Mock)
      .mockResolvedValueOnce({data: [{state: 'inactive'}]})
      .mockResolvedValueOnce({data: [{state: 'success'}]})

    const result = await deactivateEnvironment(context, 'staging')

    expect(result).toEqual({environment: 'staging', count: 1})
    expect(
      context.github.rest.repos.createDeploymentStatus
    ).toHaveBeenCalledTimes(1)
    expect(
      context.github.rest.repos.createDeploymentStatus
    ).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      deployment_id: 2,
      state: 'inactive'
    })
  })

  it('should return count 0 when all deployments are already inactive', async () => {
    const context = createMockContext()
    ;(context.github.paginate as unknown as jest.Mock).mockResolvedValue([
      {id: 1, sha: 'sha1'},
      {id: 2, sha: 'sha2'}
    ])
    ;(
      context.github.rest.repos.listDeploymentStatuses as unknown as jest.Mock
    ).mockResolvedValue({data: [{state: 'inactive'}]})

    const result = await deactivateEnvironment(context, 'staging')

    expect(result).toEqual({environment: 'staging', count: 0})
    expect(
      context.github.rest.repos.createDeploymentStatus
    ).not.toHaveBeenCalled()
  })

  it('should treat deployments without statuses as active', async () => {
    const context = createMockContext()
    ;(context.github.paginate as unknown as jest.Mock).mockResolvedValue([
      {id: 7, sha: 'sha7'}
    ])
    ;(
      context.github.rest.repos.listDeploymentStatuses as unknown as jest.Mock
    ).mockResolvedValue({data: []})

    const result = await deactivateEnvironment(context, 'staging')

    expect(result).toEqual({environment: 'staging', count: 1})
    expect(
      context.github.rest.repos.createDeploymentStatus
    ).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      deployment_id: 7,
      state: 'inactive'
    })
  })

  it('should only count active deployments in dry-run mode', async () => {
    const context = createMockContext({dryRun: true})
    ;(context.github.paginate as unknown as jest.Mock).mockResolvedValue([
      {id: 1, sha: 'sha1'},
      {id: 2, sha: 'sha2'}
    ])
    ;(context.github.rest.repos.listDeploymentStatuses as unknown as jest.Mock)
      .mockResolvedValueOnce({data: [{state: 'inactive'}]})
      .mockResolvedValueOnce({data: [{state: 'in_progress'}]})

    const result = await deactivateEnvironment(context, 'staging')

    expect(result).toEqual({environment: 'staging', count: 1})
    expect(
      context.github.rest.repos.createDeploymentStatus
    ).not.toHaveBeenCalled()
  })
})
