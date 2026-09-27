// api/lib/zoom-signature.js
// Pure ESM Zoom Webhook Signature & Security Verification
// Implements HMAC-SHA256 verification and CRC challenge generation per Zoom Webhook specs.

import crypto from 'node:crypto';

/**
 * Extract a header value case-insensitively from either Node.js req or Web Fetch Request.
 * @param {object|Request} reqOrHeaders
 * @param {string} headerName
 * @returns {string|null}
 */
export function getHeader(reqOrHeaders, headerName) {
  if (!reqOrHeaders) return null;

  const target = headerName.toLowerCase();

  // If it's a Web Fetch Request or Headers instance
  if (typeof reqOrHeaders.headers?.get === 'function') {
    return reqOrHeaders.headers.get(target);
  }

  // If it's a Node.js IncomingMessage or plain object
  const headers = reqOrHeaders.headers || reqOrHeaders;
  if (typeof headers === 'object' && headers !== null) {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === target) {
        if (Array.isArray(value)) return value[0] || null;
        return typeof value === 'string' ? value : String(value);
      }
    }
  }

  return null;
}

/**
 * Generate Zoom URL validation response for endpoint.url_validation CRC challenge.
 * @param {string} plainToken
 * @param {string} secret
 * @returns {{ plainToken: string, encryptedToken: string }}
 */
export function generateCrcResponse(plainToken, secret) {
  if (plainToken === undefined || plainToken === null) {
    throw new Error('plainToken is required for CRC response');
  }
  const tokenStr = String(plainToken);
  const secretStr = String(secret || '').trim();
  if (!secretStr) {
    throw new Error('ZOOM_WEBHOOK_SECRET_TOKEN is required for CRC response');
  }

  const encryptedToken = crypto
    .createHmac('sha256', secretStr)
    .update(tokenStr)
    .digest('hex');

  return {
    plainToken: tokenStr,
    encryptedToken
  };
}

/**
 * Compute the expected Zoom webhook signature for a given timestamp and raw body.
 * @param {string|number} timestamp
 * @param {string} rawBody
 * @param {string} secret
 * @returns {string} Expected signature format: "v0=<hex_hmac>"
 */
export function computeZoomSignature(timestamp, rawBody, secret) {
  const message = `v0:${timestamp}:${rawBody}`;
  const hash = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');
  return `v0=${hash}`;
}

/**
 * Verify incoming Zoom webhook request signature and timestamp freshness.
 * @param {object} params
 * @param {object|Request} params.req - Node req or Web Fetch Request
 * @param {string} params.rawBody - Raw unparsed request body string
 * @param {string} [params.secret] - Zoom webhook secret token
 * @param {number} [params.maxTimestampDiffSeconds=300] - Allowed drift window in seconds (default 5 min)
 * @returns {{ valid: boolean, reason?: string, timestamp?: number }}
 */
export function verifyZoomWebhookSignature({
  req,
  rawBody,
  secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN,
  maxTimestampDiffSeconds = 300
}) {
  const secretStr = (secret || '').trim();
  if (!secretStr) {
    return { valid: false, reason: 'missing_secret' };
  }

  const signatureHeader = getHeader(req, 'x-zm-signature');
  const timestampHeader = getHeader(req, 'x-zm-request-timestamp');

  if (!signatureHeader) {
    return { valid: false, reason: 'missing_signature' };
  }
  if (!timestampHeader) {
    return { valid: false, reason: 'missing_timestamp' };
  }

  const timestampNum = Number(timestampHeader);
  if (Number.isNaN(timestampNum) || timestampNum <= 0) {
    return { valid: false, reason: 'invalid_timestamp' };
  }

  // Verify timestamp freshness (seconds)
  const currentEpochSeconds = Math.floor(Date.now() / 1000);
  const diff = Math.abs(currentEpochSeconds - timestampNum);
  if (diff > maxTimestampDiffSeconds) {
    return { valid: false, reason: 'stale_timestamp' };
  }

  const expectedSignature = computeZoomSignature(timestampHeader, rawBody || '', secretStr);

  const sigBuffer = Buffer.from(signatureHeader, 'utf-8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');

  if (sigBuffer.length !== expectedBuffer.length) {
    return { valid: false, reason: 'invalid_signature' };
  }

  const matches = crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  if (!matches) {
    return { valid: false, reason: 'invalid_signature' };
  }

  return { valid: true, timestamp: timestampNum };
}
