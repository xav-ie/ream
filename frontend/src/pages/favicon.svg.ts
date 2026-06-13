import type { APIRoute } from 'astro';
import { springMark } from '../lib/brand';

// Emits /favicon.svg at build time from the shared spring mark (transparent
// background). Keeps the favicon in lockstep with the wordmark.
export const GET: APIRoute = () =>
  new Response(springMark(), {
    headers: { 'Content-Type': 'image/svg+xml' },
  });
