import { createFileRoute } from "@tanstack/react-router";

const RESOURCES = ["leads", "customers", "contacts", "tasks", "quotes", "products"];

function pathsFor(name: string) {
  const Tag = name[0]!.toUpperCase() + name.slice(1);
  return {
    [`/api/public/v1/${name}`]: {
      get: {
        tags: [Tag],
        summary: `List ${name}`,
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "order", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
        ],
        responses: { "200": { description: "A page of records" }, "401": { description: "Invalid API key" } },
      },
      post: {
        tags: [Tag],
        summary: `Create a ${name.replace(/s$/, "")}`,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "201": { description: "Created" }, "403": { description: "Missing write scope" } },
      },
    },
    [`/api/public/v1/${name}/{id}`]: {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
      get: { tags: [Tag], summary: `Retrieve a ${name.replace(/s$/, "")}`, responses: { "200": { description: "OK" }, "404": { description: "Not found" } } },
      patch: {
        tags: [Tag],
        summary: `Update a ${name.replace(/s$/, "")}`,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "200": { description: "Updated" } },
      },
      delete: { tags: [Tag], summary: `Delete a ${name.replace(/s$/, "")}`, responses: { "200": { description: "Deleted" } } },
    },
  };
}

export const Route = createFileRoute("/api/public/v1/openapi[.]json")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const spec = {
          openapi: "3.1.0",
          info: {
            title: "Lavisho Time Tracker & CRM API",
            version: "1.0.0",
            description:
              "REST API for CRM and task data. Authenticate with an API key created in Settings → API & Webhooks, sent as `Authorization: Bearer ltt_...` or the `x-api-key` header. All data is automatically scoped to the key's workspace.",
          },
          servers: [{ url: origin }],
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          components: {
            securitySchemes: {
              ApiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" },
              BearerAuth: { type: "http", scheme: "bearer" },
            },
          },
          paths: RESOURCES.reduce((acc, r) => Object.assign(acc, pathsFor(r)), {} as Record<string, unknown>),
        };
        return new Response(JSON.stringify(spec, null, 2), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      },
    },
  },
});
