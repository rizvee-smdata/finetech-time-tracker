import { createFileRoute } from "@tanstack/react-router";
import { verifySsoToken } from "@/lib/sso.functions";

export const Route = createFileRoute("/api/sso/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const sig = typeof body?.sig === "string" ? body.sig : "";
          const result = await verifySsoToken({ data: { sig } });
          return Response.json(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Verification failed";
          return new Response(JSON.stringify({ error: message }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
