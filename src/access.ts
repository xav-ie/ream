import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export interface AccessEnv {
  REAM_ACCESS_TEAM_DOMAIN?: string;
  REAM_ACCESS_AUD?: string;
}

let remote: JWTVerifyGetKey | undefined;

/**
 * Every request must carry a Cloudflare Access token for this application, so
 * a deploy without Access in front (or a stray *.workers.dev URL) refuses
 * instead of running LibreOffice for anyone. Fails closed when unconfigured;
 * only `wrangler dev` on localhost is let through. `keys` is injectable for
 * tests.
 */
export async function allowed(
  request: Request,
  env: AccessEnv,
  keys?: JWTVerifyGetKey,
): Promise<boolean> {
  const team = env.REAM_ACCESS_TEAM_DOMAIN;
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!team || !env.REAM_ACCESS_AUD)
    return new URL(request.url).hostname === "localhost";
  if (!token) return false;
  remote ??= createRemoteJWKSet(
    new URL(`https://${team}/cdn-cgi/access/certs`),
  );
  try {
    await jwtVerify(token, keys ?? remote, {
      issuer: `https://${team}`,
      audience: env.REAM_ACCESS_AUD,
      algorithms: ["RS256"],
    });
    return true;
  } catch {
    return false;
  }
}
