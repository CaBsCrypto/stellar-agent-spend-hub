import { randomUUID, createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import { readUpstashConfig } from "./upstashConfig.mjs";
import { assertNoSensitiveData } from "./sensitiveDataGuard.mjs";

const PREFIX = "spendhub:feedback:";
const LIST_KEY = `${PREFIX}items`;
const TTL_SECONDS = 90 * 24 * 60 * 60;
const MAX_TEXT = 700;
const allowedRoles = new Set(["builder", "founder", "investor", "provider", "stellar", "other"]);
const allowedRatings = new Set(["clear", "somewhat-clear", "confusing"]);

export class FeedbackRepository {
  constructor({ env = process.env, redis = undefined } = {}) {
    this.redis = redis === undefined ? createRedis(env) : redis;
    this.memory = [];
  }

  async create(input, { ip = "local", userAgent = "" } = {}) {
    const record = sanitizeFeedback(input, { ip, userAgent });
    if (!this.redis) {
      this.memory.unshift(record);
      this.memory = this.memory.slice(0, 50);
      return publicReceipt(record, "memory-local");
    }
    await this.redis.set(itemKey(record.id), JSON.stringify(record), { ex: TTL_SECONDS });
    await this.redis.lpush(LIST_KEY, record.id);
    await this.redis.ltrim(LIST_KEY, 0, 199);
    await this.redis.expire(LIST_KEY, TTL_SECONDS);
    return publicReceipt(record, "upstash");
  }

  async summary() {
    if (!this.redis) return { status: "memory-local", count: this.memory.length };
    const count = await this.redis.llen(LIST_KEY).catch(() => 0);
    return { status: "upstash", count: Number(count || 0) };
  }
}

export function feedbackReadiness(env = process.env) {
  const configured = readUpstashConfig(env).configured;
  return { configured, status: configured ? "upstash" : env.NODE_ENV === "production" ? "blocked" : "memory-local" };
}

export function sanitizeFeedback(input = {}, { ip = "local", userAgent = "" } = {}) {
  const role = allowedRoles.has(String(input.role || "").toLowerCase()) ? String(input.role).toLowerCase() : "other";
  const clarity = allowedRatings.has(String(input.clarity || "").toLowerCase()) ? String(input.clarity).toLowerCase() : "somewhat-clear";
  const trust = allowedRatings.has(String(input.trust || "").toLowerCase()) ? String(input.trust).toLowerCase() : "somewhat-clear";
  const confusing = cleanText(input.confusing || "");
  const next = cleanText(input.next || "");
  const useful = cleanText(input.useful || "");
  const payload = { role, clarity, trust, confusing, next, useful };
  const scan = assertNoSensitiveData(payload, "feedback");
  if (!scan.allowed) throw httpError(400, "Please remove personal data, secrets, account numbers, emails or phone numbers from feedback.");
  if (!confusing && !next && !useful) throw httpError(400, "Add at least one short feedback note.");
  return {
    id: `fb_${randomUUID()}`,
    createdAt: new Date().toISOString(),
    role,
    clarity,
    trust,
    confusing,
    next,
    useful,
    source: "production-pilot",
    page: cleanText(input.page || "/", 120),
    visitorHash: createHash("sha256").update(`${ip}|${String(userAgent).slice(0, 120)}`).digest("hex").slice(0, 16),
  };
}

function cleanText(value, max = MAX_TEXT) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function publicReceipt(record, store) {
  return { id: record.id, status: "received", storedIn: store, createdAt: record.createdAt };
}

function createRedis(env) {
  const config = readUpstashConfig(env);
  if (!config.configured) {
    if (env.NODE_ENV === "production") throw httpError(503, "Feedback store is not configured");
    return null;
  }
  return new Redis({ url: config.url, token: config.token, automaticDeserialization: false });
}

function itemKey(id) {
  return `${PREFIX}item:${id}`;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
