/// <reference types="@types/jest" />

import type {
  DeploymentData,
  DeploymentStatus,
  GitHubDeployment,
  DeploymentWithUrl
} from './types'
import {isValidDeploymentStatus} from './types'

describe('types', () => {
  describe('isValidDeploymentStatus', () => {
    it('should return true for valid deployment statuses', () => {
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

      validStatuses.forEach((status) => {
        expect(isValidDeploymentStatus(status)).toBe(true)
      })
    })

    it('should return false for invalid deployment statuses', () => {
      expect(isValidDeploymentStatus('invalid')).toBe(false)
      expect(isValidDeploymentStatus('')).toBe(false)
      expect(isValidDeploymentStatus('SUCCESS')).toBe(false)
      expect(isValidDeploymentStatus('running')).toBe(false)
    })
  })

  describe('Type definitions', () => {
    it('should have correct DeploymentData structure', () => {
      const deployment: DeploymentData = {
        id: '123',
        deployment_url: 'https://example.com'
      }

      expect(deployment.id).toBe('123')
      expect(deployment.deployment_url).toBe('https://example.com')
    })

    it('should have correct GitHubDeployment structure', () => {
      const deployment: GitHubDeployment = {
        id: 123,
        sha: 'abc123',
        ref: 'main',
        environment: 'production',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        statuses_url: 'https://api.github.com/.../statuses',
        repository_url: 'https://api.github.com/.../repository'
      }

      expect(deployment.id).toBe(123)
      expect(deployment.environment).toBe('production')
    })

    it('should have correct DeploymentWithUrl structure', () => {
      const deployment: DeploymentWithUrl = {
        id: 123,
        sha: 'abc123',
        ref: 'main',
        environment: 'production',
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        statuses_url: 'https://api.github.com/.../statuses',
        repository_url: 'https://api.github.com/.../repository',
        deployment_url: 'https://example.com'
      }

      expect(deployment.deployment_url).toBe('https://example.com')
    })
  })
})
