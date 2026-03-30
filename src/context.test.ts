/// <reference types="@types/jest" />

const mockOctokit = {
  rest: {repos: {}},
  paginate: jest.fn()
}

jest.mock('@actions/core', () => ({
  getInput: jest.fn()
}))

jest.mock('@actions/github', () => ({
  context: {
    sha: 'test-sha-123',
    repo: {
      owner: 'default-owner',
      repo: 'default-repo'
    }
  },
  getOctokit: jest.fn().mockReturnValue(mockOctokit)
}))

import {getInput} from '@actions/core'
import {collectDeploymentContext} from './context'

const mockGetInput = getInput as jest.Mock

function setupInputs(inputs: Record<string, string>) {
  mockGetInput.mockImplementation(
    (name: string, options?: {required?: boolean}) => {
      const value = inputs[name] || ''
      if (options?.required && !value) {
        throw new Error(`Input required and not supplied: ${name}`)
      }
      return value
    }
  )
}

describe('collectDeploymentContext', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.GITHUB_HEAD_REF = ''
    process.env.GITHUB_REF = 'refs/heads/main'
  })

  it('should collect context with default repository', () => {
    setupInputs({token: 'test-token'})

    const ctx = collectDeploymentContext()

    expect(ctx.owner).toBe('default-owner')
    expect(ctx.repo).toBe('default-repo')
    expect(ctx.sha).toBe('test-sha-123')
    expect(ctx.ref).toBe('refs/heads/main')
  })

  it('should use custom repository when provided', () => {
    setupInputs({
      token: 'test-token',
      repository: 'custom-owner/custom-repo'
    })

    const ctx = collectDeploymentContext()

    expect(ctx.owner).toBe('custom-owner')
    expect(ctx.repo).toBe('custom-repo')
  })

  it('should throw for invalid repository format', () => {
    setupInputs({token: 'test-token', repository: 'invalid'})

    expect(() => collectDeploymentContext()).toThrow(
      'invalid target repository'
    )
  })

  it('should handle repository with extra path segments', () => {
    setupInputs({
      token: 'test-token',
      repository: 'my-org/my-repo/extra'
    })

    const ctx = collectDeploymentContext()

    expect(ctx.owner).toBe('my-org')
    expect(ctx.repo).toBe('my-repo')
  })

  it('should throw for repository with trailing slash', () => {
    setupInputs({token: 'test-token', repository: 'owner/'})

    expect(() => collectDeploymentContext()).toThrow(
      'invalid target repository'
    )
  })

  it('should throw for repository with leading slash', () => {
    setupInputs({token: 'test-token', repository: '/repo'})

    expect(() => collectDeploymentContext()).toThrow(
      'invalid target repository'
    )
  })

  it('should parse continue_on_error flag', () => {
    setupInputs({token: 'test-token', continue_on_error: 'true'})

    const ctx = collectDeploymentContext()

    expect(ctx.coreArgs.continueOnError).toBe(true)
  })

  it('should default continue_on_error to false', () => {
    setupInputs({token: 'test-token'})

    const ctx = collectDeploymentContext()

    expect(ctx.coreArgs.continueOnError).toBe(false)
  })

  it('should prefer GITHUB_HEAD_REF over GITHUB_REF', () => {
    process.env.GITHUB_HEAD_REF = 'feature-branch'
    process.env.GITHUB_REF = 'refs/heads/main'
    setupInputs({token: 'test-token'})

    const ctx = collectDeploymentContext()

    expect(ctx.ref).toBe('feature-branch')
  })

  it('should fall back to empty string when no ref env vars', () => {
    process.env.GITHUB_HEAD_REF = ''
    process.env.GITHUB_REF = ''
    setupInputs({token: 'test-token'})

    const ctx = collectDeploymentContext()

    expect(ctx.ref).toBe('')
  })

  it('should parse debug flag correctly', () => {
    setupInputs({token: 'test-token', debug: 'true'})

    const ctx = collectDeploymentContext()

    expect(ctx.coreArgs.isDebug).toBe(true)
  })

  it('should default debug to false', () => {
    setupInputs({token: 'test-token'})

    const ctx = collectDeploymentContext()

    expect(ctx.coreArgs.isDebug).toBe(false)
  })

  it('should parse dry_run flag correctly', () => {
    setupInputs({token: 'test-token', dry_run: 'true'})

    const ctx = collectDeploymentContext()

    expect(ctx.coreArgs.dryRun).toBe(true)
  })

  it('should parse auto_inactive flag correctly', () => {
    setupInputs({token: 'test-token', auto_inactive: 'true'})

    const ctx = collectDeploymentContext()

    expect(ctx.coreArgs.autoInactive).toBe(true)
  })

  it('should parse payload input', () => {
    setupInputs({
      token: 'test-token',
      payload: '{"version": "1.0.0"}'
    })

    const ctx = collectDeploymentContext()

    expect(ctx.coreArgs.payload).toBe('{"version": "1.0.0"}')
  })

  it('should set payload to undefined when empty', () => {
    setupInputs({token: 'test-token'})

    const ctx = collectDeploymentContext()

    expect(ctx.coreArgs.payload).toBeUndefined()
  })

  it('should construct correct logsURL', () => {
    setupInputs({token: 'test-token'})

    const ctx = collectDeploymentContext()

    expect(ctx.coreArgs.logsURL).toBe(
      'https://github.com/default-owner/default-repo/commit/test-sha-123/checks'
    )
  })

  it('should use custom log_url when provided', () => {
    setupInputs({
      token: 'test-token',
      log_url: 'https://my-dashboard.com/logs/123'
    })

    const ctx = collectDeploymentContext()

    expect(ctx.coreArgs.logsURL).toBe('https://my-dashboard.com/logs/123')
  })

  it('should default transient_environment to true', () => {
    setupInputs({token: 'test-token'})

    const ctx = collectDeploymentContext()

    expect(ctx.coreArgs.transientEnvironment).toBe(true)
  })

  it('should set transient_environment to false when explicitly set', () => {
    setupInputs({
      token: 'test-token',
      transient_environment: 'false'
    })

    const ctx = collectDeploymentContext()

    expect(ctx.coreArgs.transientEnvironment).toBe(false)
  })

  it('should default production_environment to false', () => {
    setupInputs({token: 'test-token'})

    const ctx = collectDeploymentContext()

    expect(ctx.coreArgs.productionEnvironment).toBe(false)
  })

  it('should set production_environment to true when explicitly set', () => {
    setupInputs({
      token: 'test-token',
      production_environment: 'true'
    })

    const ctx = collectDeploymentContext()

    expect(ctx.coreArgs.productionEnvironment).toBe(true)
  })

  it('should construct logsURL with custom repository', () => {
    setupInputs({
      token: 'test-token',
      repository: 'other-owner/other-repo'
    })

    const ctx = collectDeploymentContext()

    expect(ctx.coreArgs.logsURL).toBe(
      'https://github.com/other-owner/other-repo/commit/test-sha-123/checks'
    )
  })
})
