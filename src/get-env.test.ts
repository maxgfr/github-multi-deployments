/// <reference types="@types/jest" />

jest.mock('./retry', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withRetry: jest.fn((fn: () => Promise<any>) => fn())
}))

import getEnvByRef from './get-env'
import type {DeploymentContext} from './context'

function createMockContext(): DeploymentContext {
  return {
    ref: 'refs/heads/main',
    sha: 'abc123',
    owner: 'test-owner',
    repo: 'test-repo',
    github: {
      rest: {
        repos: {
          listDeployments: jest.fn()
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
      autoInactive: false
    }
  }
}

describe('getEnvByRef', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return empty array when no deployments', async () => {
    const context = createMockContext()
    const result = await getEnvByRef(context, 'main')
    expect(result).toEqual([])
  })

  it('should return unique environment names', async () => {
    const context = createMockContext()
    ;(context.github.paginate as unknown as jest.Mock).mockResolvedValue([
      {environment: 'staging'},
      {environment: 'production'},
      {environment: 'staging'} // duplicate
    ])

    const result = await getEnvByRef(context, 'main')
    expect(result).toEqual(['staging', 'production'])
  })

  it('should call paginate with correct parameters', async () => {
    const context = createMockContext()
    await getEnvByRef(context, 'feature-branch')

    expect(context.github.paginate).toHaveBeenCalledWith(
      context.github.rest.repos.listDeployments,
      {owner: 'test-owner', repo: 'test-repo', ref: 'feature-branch'}
    )
  })

  it('should return single environment when only one exists', async () => {
    const context = createMockContext()
    ;(context.github.paginate as unknown as jest.Mock).mockResolvedValue([
      {environment: 'production'}
    ])

    const result = await getEnvByRef(context, 'main')
    expect(result).toEqual(['production'])
  })

  it('should handle many environments with duplicates', async () => {
    const context = createMockContext()
    ;(context.github.paginate as unknown as jest.Mock).mockResolvedValue([
      {environment: 'a'},
      {environment: 'b'},
      {environment: 'c'},
      {environment: 'a'},
      {environment: 'b'},
      {environment: 'd'}
    ])

    const result = await getEnvByRef(context, 'main')
    expect(result).toEqual(['a', 'b', 'c', 'd'])
  })
})
