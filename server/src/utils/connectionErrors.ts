import axios from 'axios';

export interface ClassifiedError {
  code: string;
  message: string;
}

// Maps a raw error (axios, Node.js network, or internal) to a safe
// {code, message} pair suitable for exposing to the admin UI for ANY node
// type (AGENT, PROXMOX, DOCKER, REMOTE). Never includes secrets, auth
// headers, or raw ciphertext — only a human-readable, actionable reason.
//
// This exists because every node-type client (ProxmoxClient.connect(),
// DockerClient.connect(), NodeSystemService.health()) used to catch its own
// connection error, log it, and return `false` — throwing the specific
// reason away entirely. That is the single biggest reason admins would see
// "OFFLINE" for a node that was actually reachable but failing for a
// specific, fixable reason (wrong credentials, wrong port, TLS mismatch,
// firewall, etc).
export function classifyConnectionError(error: unknown): ClassifiedError {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      const status = error.response.status;
      if (status === 401) return { code: 'AUTH_FAILED', message: 'Authentication was rejected (check the configured credentials)' };
      if (status === 403) return { code: 'FORBIDDEN', message: 'Authenticated but not authorized for this request' };
      if (status === 503) return { code: 'AUTH_NOT_CONFIGURED', message: 'Remote service reported authentication is not configured' };
      if (status === 404) return { code: 'NOT_FOUND', message: 'Remote API endpoint was not found (check host/port and node type)' };
      if (status === 429) return { code: 'RATE_LIMITED', message: 'Remote service is rate-limiting requests' };
      return { code: `HTTP_${status}`, message: `Remote service returned HTTP ${status}` };
    }
    switch (error.code) {
      case 'ECONNREFUSED':
        return { code: 'ECONNREFUSED', message: 'Connection refused — is the service running and listening on that port?' };
      case 'ETIMEDOUT':
      case 'ECONNABORTED':
        return { code: 'ETIMEDOUT', message: 'Connection timed out — check firewall/security group rules for that host and port' };
      case 'ENOTFOUND':
      case 'EAI_AGAIN':
        return { code: 'ENOTFOUND', message: 'Host could not be resolved — check the configured hostname/IP' };
      case 'EHOSTUNREACH':
        return { code: 'EHOSTUNREACH', message: 'Host is unreachable' };
      case 'ENETUNREACH':
        return { code: 'ENETUNREACH', message: 'Network is unreachable' };
      case 'ECONNRESET':
        return { code: 'ECONNRESET', message: 'Connection was reset by the remote host' };
      case 'CERT_HAS_EXPIRED':
      case 'DEPTH_ZERO_SELF_SIGNED_CERT':
      case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
      case 'ERR_TLS_CERT_ALTERNATIVE_NAME_INVALID':
        return { code: 'TLS_ERROR', message: 'TLS/SSL negotiation failed (certificate or protocol mismatch)' };
      default:
        return { code: error.code || 'UNKNOWN', message: error.message || 'Connection failed' };
    }
  }
  if (error instanceof Error) {
    if (/decrypt/i.test(error.message)) {
      return { code: 'DECRYPT_FAILED', message: 'Credentials could not be decrypted. Verify ENCRYPTION_KEY.' };
    }
    if (/https/i.test(error.message) && /not support|reject|mismatch/i.test(error.message)) {
      return { code: 'PROTOCOL_MISMATCH', message: error.message };
    }
    return { code: 'CONFIG_ERROR', message: error.message };
  }
  return { code: 'UNKNOWN', message: 'Unknown connection error' };
}
