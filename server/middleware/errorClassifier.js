// ============================================================
// Error Classifier Middleware — Maps cloud SDK errors to HTTP responses
// NEVER returns HTTP 500 for known cloud API errors
// ============================================================

/**
 * Classify a cloud provider error into a structured HTTP response.
 * @param {Error} err — The raw error from Azure/AWS/GCP SDK
 * @param {string} provider — 'azure' | 'aws' | 'gcp'
 * @returns {{ status: number, body: object }}
 */
function classifyCloudError(err, provider = 'unknown') {
  const msg = err.message || String(err);
  const code = err.code || err.Code || err.name || '';
  const statusCode = err.statusCode || err.$metadata?.httpStatusCode || err.status || 0;

  // ── Azure Error Classification ──────────────────────────────
  if (provider === 'azure') {
    // Missing permissions
    if (code === 'AuthorizationFailed' || code === 'AuthorizationPermissionMismatch' ||
        msg.includes('does not have authorization') || msg.includes('AuthorizationFailed')) {
      return {
        status: 403,
        body: {
          code: 'InsufficientPermissions',
          provider: 'azure',
          message: `Azure permission denied: ${msg}`,
          resolution: 'Assign the required RBAC role (e.g., Reader, Cost Management Reader) to the service principal or user.',
          rawCode: code
        }
      };
    }

    // Missing billing/cost permissions
    if (code === 'BillingAccountNotFound' || msg.includes('Cost Management') ||
        msg.includes('billing') || code === 'IndirectCostDisabled') {
      return {
        status: 403,
        body: {
          code: 'MissingBillingPermission',
          provider: 'azure',
          message: 'The authenticated account does not have permission to access billing information.',
          resolution: 'Assign Cost Management Reader role to the service principal.',
          rawCode: code
        }
      };
    }

    // Subscription disabled/not found
    if (code === 'SubscriptionNotFound' || msg.includes('subscription was not found') ||
        code === 'InvalidSubscriptionId') {
      return {
        status: 404,
        body: {
          code: 'SubscriptionNotFound',
          provider: 'azure',
          message: `Azure subscription not found or disabled: ${msg}`,
          rawCode: code
        }
      };
    }

    // Defender disabled
    if (msg.includes('Defender') && (msg.includes('not enabled') || msg.includes('disabled'))) {
      return {
        status: 403,
        body: {
          code: 'DefenderDisabled',
          provider: 'azure',
          message: 'Microsoft Defender for Cloud is not enabled on this subscription.',
          resolution: 'Enable Defender for Cloud in the Azure Portal.',
          rawCode: code
        }
      };
    }

    // Rate limit
    if (statusCode === 429 || code === 'TooManyRequests' || msg.includes('429')) {
      return {
        status: 429,
        body: {
          code: 'RateLimitExceeded',
          provider: 'azure',
          message: 'Azure API rate limit exceeded. Please retry after a short delay.',
          retryAfter: err.retryAfterInSeconds || 30,
          rawCode: code
        }
      };
    }

    // Token expired
    if (code === 'ExpiredAuthenticationToken' || msg.includes('token has expired')) {
      return {
        status: 401,
        body: {
          code: 'TokenExpired',
          provider: 'azure',
          message: 'Azure authentication token has expired. Please re-authenticate.',
          rawCode: code
        }
      };
    }
  }

  // ── AWS Error Classification ────────────────────────────────
  if (provider === 'aws') {
    // Invalid credentials
    if (code === 'InvalidClientTokenId' || code === 'InvalidAccessKeyId' ||
        code === 'SignatureDoesNotMatch' || msg.includes('security token included in the request is invalid')) {
      return {
        status: 401,
        body: {
          code: 'InvalidCredentials',
          provider: 'aws',
          message: 'AWS credentials are invalid or expired.',
          resolution: 'Verify your Access Key ID and Secret Access Key, or refresh your session token.',
          rawCode: code
        }
      };
    }

    // Access denied
    if (code === 'AccessDeniedException' || code === 'AccessDenied' ||
        code === 'UnauthorizedAccess' || msg.includes('is not authorized to perform')) {
      return {
        status: 403,
        body: {
          code: 'AccessDenied',
          provider: 'aws',
          message: `AWS access denied: ${msg}`,
          resolution: 'Ensure the IAM user/role has the required permissions.',
          rawCode: code
        }
      };
    }

    // STS failure
    if (code === 'ExpiredTokenException' || code === 'ExpiredToken' ||
        msg.includes('AssumeRole') && msg.includes('denied')) {
      return {
        status: 401,
        body: {
          code: 'STSFailure',
          provider: 'aws',
          message: 'AWS STS token expired or AssumeRole denied.',
          resolution: 'Refresh your session token or verify the trust policy on the IAM role.',
          rawCode: code
        }
      };
    }

    // Cost Explorer disabled
    if (msg.includes('Cost Explorer') && (msg.includes('not enabled') || msg.includes('OptIn'))) {
      return {
        status: 403,
        body: {
          code: 'CostExplorerDisabled',
          provider: 'aws',
          message: 'AWS Cost Explorer is not enabled for this account.',
          resolution: 'Enable Cost Explorer in the AWS Billing Console.',
          rawCode: code
        }
      };
    }

    // Cost Explorer permission denied
    if ((code === 'AccessDeniedException' || code === 'AccessDenied') &&
        (msg.includes('ce:') || msg.includes('Cost') || msg.includes('billing'))) {
      return {
        status: 403,
        body: {
          code: 'MissingBillingPermission',
          provider: 'aws',
          message: 'The authenticated account does not have permission to access billing information.',
          resolution: 'Attach the AWS managed policy "AWSBillingReadOnlyAccess" or "ce:*" to the IAM entity.',
          rawCode: code
        }
      };
    }

    // Security Hub disabled
    if (msg.includes('Security Hub') && (msg.includes('not enabled') || msg.includes('not subscribed'))) {
      return {
        status: 403,
        body: {
          code: 'SecurityHubDisabled',
          provider: 'aws',
          message: 'AWS Security Hub is not enabled in this region.',
          resolution: 'Enable Security Hub in the AWS Console.',
          rawCode: code
        }
      };
    }

    // GuardDuty disabled
    if (msg.includes('GuardDuty') && (msg.includes('not enabled') || msg.includes('detector'))) {
      return {
        status: 403,
        body: {
          code: 'GuardDutyDisabled',
          provider: 'aws',
          message: 'AWS GuardDuty is not enabled in this region.',
          resolution: 'Enable GuardDuty in the AWS Console.',
          rawCode: code
        }
      };
    }

    // Region disabled
    if (msg.includes('not enabled') && msg.includes('region')) {
      return {
        status: 403,
        body: {
          code: 'RegionDisabled',
          provider: 'aws',
          message: `AWS region is not enabled: ${msg}`,
          rawCode: code
        }
      };
    }

    // Rate limit / throttling
    if (code === 'ThrottlingException' || code === 'Throttling' ||
        code === 'TooManyRequestsException' || statusCode === 429) {
      return {
        status: 429,
        body: {
          code: 'RateLimitExceeded',
          provider: 'aws',
          message: 'AWS API rate limit exceeded. Please retry after a short delay.',
          retryAfter: 30,
          rawCode: code
        }
      };
    }
  }

  // ── GCP Error Classification ────────────────────────────────
  if (provider === 'gcp') {
    // Billing disabled
    if (msg.includes('billing') && (msg.includes('disabled') || msg.includes('not enabled'))) {
      return {
        status: 403,
        body: {
          code: 'BillingDisabled',
          provider: 'gcp',
          message: 'GCP billing is not enabled for this project.',
          resolution: 'Enable billing in the Google Cloud Console.',
          rawCode: code
        }
      };
    }

    // Project not found
    if (code === 'NOT_FOUND' || msg.includes('project not found') || msg.includes('Project not found')) {
      return {
        status: 404,
        body: {
          code: 'ProjectNotFound',
          provider: 'gcp',
          message: `GCP project not found: ${msg}`,
          rawCode: code
        }
      };
    }

    // OAuth scope missing
    if (msg.includes('scope') || msg.includes('insufficient authentication scopes')) {
      return {
        status: 403,
        body: {
          code: 'OAuthScopeMissing',
          provider: 'gcp',
          message: 'GCP OAuth scope is insufficient for this operation.',
          resolution: 'Re-authenticate with the required OAuth scopes.',
          rawCode: code
        }
      };
    }

    // Permission denied
    if (code === 'PERMISSION_DENIED' || code === 7 || msg.includes('permission denied') ||
        msg.includes('Permission denied')) {
      return {
        status: 403,
        body: {
          code: 'PermissionDenied',
          provider: 'gcp',
          message: `GCP permission denied: ${msg}`,
          resolution: 'Grant the required IAM role to the service account.',
          rawCode: code
        }
      };
    }

    // Rate limit
    if (code === 'RESOURCE_EXHAUSTED' || statusCode === 429) {
      return {
        status: 429,
        body: {
          code: 'RateLimitExceeded',
          provider: 'gcp',
          message: 'GCP API rate limit exceeded.',
          retryAfter: 30,
          rawCode: code
        }
      };
    }
  }

  // ── Generic / Unknown Errors ────────────────────────────────
  // Network errors
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' ||
      msg.includes('getaddrinfo') || msg.includes('ECONNRESET')) {
    return {
      status: 503,
      body: {
        code: 'ServiceUnavailable',
        provider,
        message: `Cloud provider API is unreachable: ${msg}`,
        rawCode: code
      }
    };
  }

  // If we got an HTTP status code from the SDK, use it
  if (statusCode >= 400 && statusCode < 600) {
    return {
      status: statusCode,
      body: {
        code: code || 'CloudAPIError',
        provider,
        message: msg,
        rawCode: code
      }
    };
  }

  // True unknown error — still don't return 500
  return {
    status: 502,
    body: {
      code: 'UnclassifiedCloudError',
      provider,
      message: msg || 'An unexpected error occurred while communicating with the cloud provider.',
      rawCode: code
    }
  };
}

/**
 * Express middleware that wraps a route handler with cloud error classification.
 * @param {string} provider — Default provider for error classification
 * @returns {Function} Express middleware
 */
function withCloudErrorHandling(provider = 'azure') {
  return (handlerFn) => {
    return async (req, res, next) => {
      try {
        await handlerFn(req, res, next);
      } catch (err) {
        const detected = detectProvider(err, req, provider);
        const classified = classifyCloudError(err, detected);
        console.error(`[ErrorClassifier] ${detected.toUpperCase()} error → HTTP ${classified.status}: ${err.message}`);
        if (!res.headersSent) {
          res.status(classified.status).json(classified.body);
        }
      }
    };
  };
}

/**
 * Detect provider from error context or request.
 */
function detectProvider(err, req, fallback) {
  if (req?.query?.provider) return req.query.provider.toLowerCase();
  if (err.message?.includes('AWS') || err.code?.startsWith('AWS')) return 'aws';
  if (err.message?.includes('Azure') || err.code?.includes('Azure')) return 'azure';
  if (err.message?.includes('GCP') || err.message?.includes('Google')) return 'gcp';
  return fallback || 'unknown';
}

module.exports = { classifyCloudError, withCloudErrorHandling, detectProvider };
