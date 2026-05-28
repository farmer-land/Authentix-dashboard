/**
 * API GUARDS & SAFETY MECHANISMS
 *
 * Prevents production-only actions from running in test/dev environments.
 * Provides runtime safety checks and structured logging.
 */

import { Environment, getRuntimeEnvironment, getEnvironmentName } from './environment';

/**
 * Production-only action types
 *
 * These actions should NEVER run in dev/test unless explicitly allowed.
 */
export type ProductionAction =
  | 'billing:charge'
  | 'billing:refund'
  | 'billing:subscription'
  | 'payment:process'
  | 'payment:capture'
  | 'webhook:razorpay'
  | 'webhook:external'
  | 'email:transactional'
  | 'sms:send'
  | 'whatsapp:send'
  | 'api:rate_limit_enforce'
  | 'data:export_production'
  | 'certificate:revoke_bulk';

/**
 * Safety flags configuration
 *
 * These must be explicitly enabled via environment variables.
 * Default: ALL FALSE in dev/test.
 */
interface SafetyFlags {
  ALLOW_REAL_PAYMENTS: boolean;
  ALLOW_EXTERNAL_WEBHOOKS: boolean;
  ALLOW_BILLING_ACTIONS: boolean;
  ALLOW_TRANSACTIONAL_EMAIL: boolean;
  ALLOW_SMS_SEND: boolean;
  ALLOW_WHATSAPP_SEND: boolean;
}

/**
 * Get current safety flags
 *
 * CRITICAL: Defaults to false for all flags.
 * Must be explicitly enabled via environment variables.
 */
export function getSafetyFlags(): SafetyFlags {
  const env = getRuntimeEnvironment();

  // In dev/test, ALL flags are false by default
  if (env === 'dev' || env === 'test') {
    return {
      ALLOW_REAL_PAYMENTS: process.env.ALLOW_REAL_PAYMENTS === 'true',
      ALLOW_EXTERNAL_WEBHOOKS: process.env.ALLOW_EXTERNAL_WEBHOOKS === 'true',
      ALLOW_BILLING_ACTIONS: process.env.ALLOW_BILLING_ACTIONS === 'true',
      ALLOW_TRANSACTIONAL_EMAIL: process.env.ALLOW_TRANSACTIONAL_EMAIL === 'true',
      ALLOW_SMS_SEND: process.env.ALLOW_SMS_SEND === 'true',
      ALLOW_WHATSAPP_SEND: process.env.ALLOW_WHATSAPP_SEND === 'true',
    };
  }

  // In beta/prod, flags can be enabled but still require explicit setting
  return {
    ALLOW_REAL_PAYMENTS: process.env.ALLOW_REAL_PAYMENTS === 'true',
    ALLOW_EXTERNAL_WEBHOOKS: process.env.ALLOW_EXTERNAL_WEBHOOKS === 'true',
    ALLOW_BILLING_ACTIONS: process.env.ALLOW_BILLING_ACTIONS === 'true',
    ALLOW_TRANSACTIONAL_EMAIL: process.env.ALLOW_TRANSACTIONAL_EMAIL === 'true',
    ALLOW_SMS_SEND: process.env.ALLOW_SMS_SEND === 'true',
    ALLOW_WHATSAPP_SEND: process.env.ALLOW_WHATSAPP_SEND === 'true',
  };
}

/**
 * Environment Guard Error
 *
 * Thrown when an action is attempted in a disallowed environment.
 */
export class EnvironmentGuardError extends Error {
  constructor(
    public action: string,
    public currentEnv: Environment,
    public allowedEnvs: Environment[]
  ) {
    super(
      `Action "${action}" is not allowed in ${currentEnv} environment. ` +
      `Allowed environments: ${allowedEnvs.join(', ')}`
    );
    this.name = 'EnvironmentGuardError';
  }
}

/**
 * Assert that current environment is allowed for an action
 *
 * Throws EnvironmentGuardError if environment is not allowed.
 *
 * @param action - Description of the action being performed
 * @param allowedEnvs - List of environments where action is permitted
 *
 * @example
 * assertEnvironmentAllowed('billing:charge', ['prod']);
 * // Throws in dev/test/beta, passes in prod
 *
 * @example
 * assertEnvironmentAllowed('feature:testing', ['dev', 'test']);
 * // Throws in beta/prod, passes in dev/test
 */
export function assertEnvironmentAllowed(
  action: string,
  allowedEnvs: Environment[]
): void {
  const currentEnv = getRuntimeEnvironment();

  if (!allowedEnvs.includes(currentEnv)) {
    // Log the blocked attempt
    console.warn(
      `[Guard] Blocked action in ${currentEnv}:`,
      {
        action,
        currentEnv,
        allowedEnvs,
        timestamp: new Date().toISOString(),
      }
    );

    throw new EnvironmentGuardError(action, currentEnv, allowedEnvs);
  }

  // Log successful guard pass (info level)
  console.info(
    `[Guard] Allowed action in ${currentEnv}:`,
    { action, currentEnv }
  );
}

/**
 * Check if action is allowed (non-throwing)
 *
 * @returns true if allowed, false otherwise
 */
export function isActionAllowed(
  action: string,
  allowedEnvs: Environment[]
): boolean {
  const currentEnv = getRuntimeEnvironment();
  return allowedEnvs.includes(currentEnv);
}

/**
 * Guard for production-only actions
 *
 * Convenience wrapper for common prod-only checks.
 */
export function assertProductionOnly(action: ProductionAction): void {
  assertEnvironmentAllowed(action, ['prod']);
}

/**
 * Guard for non-production actions (dev/test only)
 *
 * Use for testing/debugging features that should never reach prod.
 */
export function assertNonProduction(action: string): void {
  assertEnvironmentAllowed(action, ['dev', 'test']);
}

/**
 * Guard for beta+ environments
 *
 * Use for features being tested in beta before production.
 */
export function assertBetaOrHigher(action: string): void {
  assertEnvironmentAllowed(action, ['beta', 'prod']);
}

/**
 * Structured logging for environment-aware operations
 */
export function logEnvironmentAction(
  action: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details: Record<string, any> = {}
): void {
  const env = getRuntimeEnvironment();
  const timestamp = new Date().toISOString();

  console.log(
    `[${env.toUpperCase()}] ${action}`,
    {
      environment: env,
      environmentName: getEnvironmentName(),
      timestamp,
      ...details,
    }
  );
}

/**
 * Warning for unsafe operations
 */
export function warnUnsafeOperation(
  action: string,
  reason: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details: Record<string, any> = {}
): void {
  const env = getRuntimeEnvironment();

  console.warn(
    `[Guard] UNSAFE OPERATION in ${env}:`,
    {
      action,
      reason,
      environment: env,
      timestamp: new Date().toISOString(),
      ...details,
    }
  );
}

/**
 * Get action metadata for logging
 */
export function getActionMetadata(action: string) {
  return {
    action,
    environment: getRuntimeEnvironment(),
    environmentName: getEnvironmentName(),
    safetyFlags: getSafetyFlags(),
    timestamp: new Date().toISOString(),
  };
}
