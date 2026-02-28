import fp from "fastify-plugin";
import client from "prom-client";

import { config } from "../config.js";

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry, prefix: "gateway_" });

const httpRequestDuration = new client.Histogram({
  name: "gateway_http_request_duration_ms",
  help: "HTTP request duration in milliseconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2000],
  registers: [registry],
});

export const wsMessagesAccepted = new client.Counter({
  name: "gateway_ws_messages_accepted_total",
  help: "Total accepted websocket chat messages",
  registers: [registry],
});

export const wsMessagesRejected = new client.Counter({
  name: "gateway_ws_messages_rejected_total",
  help: "Total rejected websocket chat messages",
  labelNames: ["reason"],
  registers: [registry],
});

export const metricsPlugin = fp(async (fastify) => {
  if (!config.metrics.enabled) return;

  fastify.addHook("onRequest", async (request) => {
    (request as { __metricStart?: number }).__metricStart = Date.now();
  });

  fastify.addHook("onResponse", async (request, reply) => {
    const start = (request as { __metricStart?: number }).__metricStart ?? Date.now();
    const duration = Date.now() - start;
    const route = request.routeOptions.url || request.url;
    httpRequestDuration.labels(request.method, route, String(reply.statusCode)).observe(duration);
  });
});
