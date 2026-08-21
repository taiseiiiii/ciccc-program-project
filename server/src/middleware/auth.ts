import type { RequestHandler } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../config/env';
import { toLocale } from '../config/locales';
import { HttpError } from '../utils/HttpError';
import { userRepository, type User } from '../repositories/user.repository';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth: the app-side profile of the verified caller. */
      user?: User;
    }
  }
}

const ISSUER = `${env.supabaseUrl}/auth/v1`;

// Verification key: legacy projects sign access tokens with HS256 and a shared
// secret; current projects use asymmetric keys published at the JWKS endpoint
// (fetched lazily and cached by jose).
const hsKey = env.supabaseJwtSecret ? new TextEncoder().encode(env.supabaseJwtSecret) : null;
const jwks = hsKey ? null : createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

async function verifyToken(token: string): Promise<JWTPayload> {
  const options = { issuer: ISSUER, audience: 'authenticated' };
  const { payload } = hsKey
    ? await jwtVerify(token, hsKey, options)
    : await jwtVerify(token, jwks!, options);
  return payload;
}

/**
 * Require a valid Supabase access token (`Authorization: Bearer <jwt>`).
 * On success, loads — or provisions on first sight — the caller's `users` row
 * and attaches it as `req.user`. The internal user_id must always come from
 * here, never from request bodies or query params.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw HttpError.unauthorized('Missing bearer token');
    }

    let payload: JWTPayload;
    try {
      payload = await verifyToken(header.slice('Bearer '.length));
    } catch {
      throw HttpError.unauthorized('Invalid or expired token');
    }
    if (!payload.sub) {
      throw HttpError.unauthorized('Invalid token: missing sub claim');
    }

    let user = await userRepository.findByAuthId(payload.sub);
    if (!user) {
      // First authenticated request: create the profile from the JWT claims.
      // first/last name arrive via user_metadata, set by the frontend at sign-up.
      //
      // So does the language. It is the only moment the account's language can
      // be known before the account exists, and it decides what the AI coach
      // writes in — the interface picks its own language from the browser, but
      // the reports are generated here. toLocale falls back to the default for
      // anything unexpected, including accounts made before this was sent.
      const meta = (payload['user_metadata'] ?? {}) as Record<string, unknown>;
      user = await userRepository.provision({
        auth_user_id: payload.sub,
        email: typeof payload['email'] === 'string' ? payload['email'] : '',
        first_name: typeof meta['first_name'] === 'string' ? meta['first_name'] : null,
        last_name: typeof meta['last_name'] === 'string' ? meta['last_name'] : null,
        locale: toLocale(meta['locale']),
      });
    }
    if (user.status !== 'active') {
      throw HttpError.forbidden('Account is not active');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};
