import { Container, getContainer } from "@cloudflare/containers";
import { allowed } from "./access.ts";

// One container serves the UI and the API. sleepAfter stops it when idle, the
// way the socket unit's idle exit does on a host.
export class Ream extends Container {
  defaultPort = 8086;
  sleepAfter = "5m";
}

export default {
  async fetch(request, env) {
    if (!(await allowed(request, env)))
      return new Response(
        "Forbidden: ream only answers through its Cloudflare Access application (see the README).",
        { status: 403 },
      );
    return getContainer(env.REAM).fetch(request);
  },
} satisfies ExportedHandler<Env>;
