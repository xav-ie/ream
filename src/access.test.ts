import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { allowed } from "./access.ts";

const team = "team.cloudflareaccess.com";
const env = { REAM_ACCESS_TEAM_DOMAIN: team, REAM_ACCESS_AUD: "aud-tag" };
const { publicKey, privateKey } = await generateKeyPair("RS256");
const keys = createLocalJWKSet({
  keys: [{ ...(await exportJWK(publicKey)), kid: "k", alg: "RS256" }],
});

const token = (claims: { aud?: string; iss?: string } = {}) =>
  new SignJWT({ email: "me@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "k" })
    .setIssuer(claims.iss ?? `https://${team}`)
    .setAudience(claims.aud ?? env.REAM_ACCESS_AUD)
    .setExpirationTime("5m")
    .sign(privateKey);

const request = (jwt?: string, url = "https://pdf.example.com/") =>
  new Request(url, {
    headers: jwt ? { "cf-access-jwt-assertion": jwt } : {},
  });

test("accepts a valid Access token", async () => {
  assert.equal(await allowed(request(await token()), env, keys), true);
});

test("rejects a missing, foreign or forged token", async () => {
  assert.equal(await allowed(request(), env, keys), false);
  assert.equal(
    await allowed(request(await token({ aud: "other" })), env, keys),
    false,
  );
  assert.equal(
    await allowed(request(await token({ iss: "https://evil" })), env, keys),
    false,
  );
  assert.equal(await allowed(request("not.a.jwt"), env, keys), false);
});

test("fails closed when unconfigured, except on localhost", async () => {
  assert.equal(await allowed(request(await token()), {}, keys), false);
  assert.equal(
    await allowed(request(undefined, "http://localhost:8787/"), {}, keys),
    true,
  );
});
