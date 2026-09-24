/**
 * @file Types & Schema Contracts for Yatrai API
 * Phase 0 architectural declarations. Future phases (Phase 1+) will bind ORM/DB entities.
 */

/**
 * @typedef {Object} SystemHealth
 * @property {string} service - Service identifier
 * @property {'healthy'|'degraded'|'unhealthy'} status - Health status
 * @property {string} environment - Runtime environment
 * @property {number} uptimeSeconds - Process uptime in seconds
 * @property {string} timestamp - ISO timestamp
 */

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} success - Operation success flag
 * @property {string} [message] - Human-readable message
 * @property {*} [data] - Response payload
 * @property {Object} [error] - Error details if success is false
 */

export {};
