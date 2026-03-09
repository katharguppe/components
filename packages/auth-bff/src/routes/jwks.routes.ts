/**
 * JWKS Routes
 * Exposes public key for JWT verification
 * Architecture Spec Section 6.2
 */

import { Router, Response } from 'express';
import { getJwks } from '../services/token.service';

const router = Router();

/**
 * GET /.well-known/jwks.json
 * Returns the JSON Web Key Set for JWT verification
 */
router.get('/jwks.json', (_, res: Response) => {
  try {
    const jwks = getJwks();
    res.status(200).json(jwks);
  } catch (error) {
    console.error('JWKS error:', error);
    res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Failed to retrieve JWKS',
    });
  }
});

/**
 * GET /.well-known/openid-configuration
 * Returns OpenID Connect discovery document
 */
router.get('/openid-configuration', (_, res: Response) => {
  const issuer = process.env['JWT_ISSUER'] || 'https://auth.yoursaas.com';
  const config = {
    issuer,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    response_types_supported: ['code', 'token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'profile', 'email'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    claims_supported: ['sub', 'tid', 'role', 'iss', 'aud', 'iat', 'exp'],
  };

  res.status(200).json(config);
});

export default router;
