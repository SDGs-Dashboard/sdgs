import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';

import { ADMIN_COOKIE_NAME, ADMIN_SESSION_DURATION_SECONDS } from './constants';
import { AdminSession } from './types';

const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME?.trim() || 'admin';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim() || 'NISR@10!';
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET?.trim() || 'local-dev-admin-secret';

interface SessionPayload {
  u: string;
  exp: number;
}

const base64UrlEncode = (value: string): string => Buffer.from(value, 'utf-8').toString('base64url');
const base64UrlDecode = (value: string): string => Buffer.from(value, 'base64url').toString('utf-8');

const sign = (payload: string): string => crypto.createHmac('sha256', ADMIN_SESSION_SECRET).update(payload).digest('base64url');

const safeCompare = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const validateAdminCredentials = (username: string, password: string): boolean =>
  username.trim() === DEFAULT_ADMIN_USERNAME && password === DEFAULT_ADMIN_PASSWORD;

export const createAdminSessionToken = (username: string): string => {
  const payload: SessionPayload = {
    u: username.trim(),
    exp: Date.now() + ADMIN_SESSION_DURATION_SECONDS * 1000
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
};

export const parseCookies = (cookieHeader: string | undefined): Record<string, string> =>
  String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, cookiePart) => {
      const separator = cookiePart.indexOf('=');
      if (separator === -1) {
        return accumulator;
      }
      const key = cookiePart.slice(0, separator).trim();
      const value = cookiePart.slice(separator + 1).trim();
      accumulator[key] = decodeURIComponent(value);
      return accumulator;
    }, {});

export const readAdminSession = (cookieHeader: string | undefined): AdminSession | null => {
  const token = parseCookies(cookieHeader)[ADMIN_COOKIE_NAME];
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  if (!safeCompare(sign(encodedPayload), signature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (!payload.u || !payload.exp || payload.exp < Date.now()) {
      return null;
    }
    return {
      username: payload.u,
      role: 'Admin',
      issuedAt: payload.exp - ADMIN_SESSION_DURATION_SECONDS * 1000,
      expiresAt: payload.exp
    };
  } catch {
    return null;
  }
};

export const getAdminSessionFromRequest = (request: NextApiRequest): AdminSession | null =>
  readAdminSession(request.headers.cookie);

export const setAdminSessionCookie = (response: NextApiResponse, token: string): void => {
  response.setHeader(
    'Set-Cookie',
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ADMIN_SESSION_DURATION_SECONDS}`
  );
};

export const clearAdminSessionCookie = (response: NextApiResponse): void => {
  response.setHeader('Set-Cookie', `${ADMIN_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
};

export const requireAdminApiSession = (request: NextApiRequest, response: NextApiResponse): AdminSession | null => {
  const session = getAdminSessionFromRequest(request);
  if (!session) {
    response.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  return session;
};
