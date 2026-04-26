/**
 * SSRF protection: block internal/private hosts, validate DNS resolution.
 */
import * as dns from 'node:dns/promises';
import * as net from 'node:net';

interface SafetyError extends Error {
  status: number;
  code: string;
}

function makeError(status: number, code: string, message: string): SafetyError {
  const err = new Error(message) as SafetyError;
  err.status = status;
  err.code = code;
  return err;
}

const PRIVATE_IPV4_RANGES: Array<[string, number]> = [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['100.64.0.0', 10],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
  ['0.0.0.0', 8],
];

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  return PRIVATE_IPV4_RANGES.some(([range, bits]) => {
    const rangeInt = ipv4ToInt(range);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipInt & mask) === (rangeInt & mask);
  });
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (/^f[cd]/.test(lower)) return true;
  if (/^fe[89ab]/.test(lower)) return true;
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice(7);
    if (net.isIPv4(v4)) return isPrivateIPv4(v4);
  }
  if (lower.startsWith('ff')) return true;
  return false;
}

function isPrivateHost(host: string): boolean {
  if (!host) return true;
  const h = host.toLowerCase();
  if (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.lan')
  )
    return true;
  if (net.isIPv4(h)) return isPrivateIPv4(h);
  if (net.isIPv6(h)) return isPrivateIPv6(h);
  return false;
}

export async function validateUrlSafety(urlString: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw makeError(400, 'INVALID_URL', 'URL không hợp lệ.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw makeError(400, 'INVALID_PROTOCOL', 'Chỉ chấp nhận http:// hoặc https://.');
  }
  if (isPrivateHost(parsed.hostname)) {
    throw makeError(403, 'BLOCKED_HOST', 'URL nội bộ hoặc private không được phép.');
  }

  // DNS rebinding defence: re-check resolved IPs
  try {
    const records = await dns.lookup(parsed.hostname, { all: true });
    for (const r of records) {
      if (isPrivateHost(r.address)) {
        throw makeError(403, 'BLOCKED_HOST', 'Hostname trỏ về IP nội bộ — bị chặn.');
      }
    }
  } catch (e: unknown) {
    const err = e as { code?: string; status?: number };
    if (err.status) throw e; // re-throw our own
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      throw makeError(404, 'DNS_FAIL', 'Không phân giải được tên miền.');
    }
    // Other DNS issues — let fetch fail naturally
  }
  return parsed;
}
