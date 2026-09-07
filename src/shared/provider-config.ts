import { z } from "zod";
import type { ApiConnectionConfig, ProviderInstance } from "./types.js";

export const MODEL_KEY_ENV = "OPENBOT_MODEL_API_KEY";
export const isLocalModelUrl = (raw: string): boolean => {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(raw).hostname);
  } catch {
    return false;
  }
};

export const apiConnectionSchema = z.object({
  baseUrl: z
    .string()
    .trim()
    .max(2048)
    .url()
    .superRefine((value, ctx) => {
      const url = new URL(value);
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        (url.protocol !== "https:" &&
          !(url.protocol === "http:" && isLocalModelUrl(value)))
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "Use an HTTPS API address, or HTTP on localhost. Keep keys and query parameters out of the address.",
        });
      }
    })
    .transform((value) => value.replace(/\/+$/, "")),
  protocol: z.enum(["openai-compatible", "openai", "anthropic"]),
  modelIds: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(200)
        .regex(
          /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/,
          "Use the exact model ID from your provider.",
        ),
    )
    .min(1)
    .max(50)
    .transform((ids) => [...new Set(ids)]),
});

// Legacy native clients may still supply these three key-based presets. Do not
// allow arbitrary process variables (NODE_OPTIONS, PATH, internal tokens, etc.).
export const legacyApiProviderId = (env: string | null): string | null =>
  ({
    OPENAI_API_KEY: "openai",
    ANTHROPIC_API_KEY: "anthropic",
    OPENROUTER_API_KEY: "openrouter",
  })[env || ""] || null;

export const providerInput = z
  .object({
    id: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,80}$/)
      .optional(),
    name: z.string().trim().min(1).max(60),
    provider: z
      .enum([
        "opencode",
        "claude",
        "openai",
        "github-copilot",
        "gitlab",
        "xai",
        "custom",
      ])
      .optional(),
    authMode: z.enum(["cli", "subscription", "api_key"]),
    runtime: z.enum(["opencode", "claude_code"]).optional(),
    envName: z.string().nullable().optional(),
    secret: z.string().trim().max(10_000).nullable().optional(),
    apiConfig: apiConnectionSchema.nullable().optional(),
  })
  .superRefine((input, ctx) => {
    const error = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (input.authMode !== "api_key") return;
    if (input.runtime === "claude_code")
      error("API connections use the OpenCode runtime.");
    if (input.apiConfig) {
      if (
        !input.secret &&
        !input.id &&
        !isLocalModelUrl(input.apiConfig.baseUrl)
      )
        error("Add an API key for this hosted provider.");
    } else if (!legacyApiProviderId(input.envName || null))
      error("Add your provider’s API address and at least one model ID.");
    if (
      input.envName &&
      input.envName !== MODEL_KEY_ENV &&
      !legacyApiProviderId(input.envName)
    )
      error("That environment variable is not an API-key preset.");
  });

export type ProviderInput = z.infer<typeof providerInput>;
export const configuredProviderId = (
  instance: Pick<ProviderInstance, "id">,
): string => `openbot-${instance.id}`;
export function configuredModels(
  instance: Pick<ProviderInstance, "id" | "apiConfig">,
): string[] {
  return (
    instance.apiConfig?.modelIds.map(
      (model) => `${configuredProviderId(instance)}/${model}`,
    ) || []
  );
}

export function modelBelongsToConnection(
  model: string,
  instance: ProviderInstance,
): boolean {
  if (instance.apiConfig) return configuredModels(instance).includes(model);
  if (instance.runtime === "claude_code")
    return /^claude-code\/[a-z0-9][a-z0-9._:\[\]-]{0,199}$/i.test(model);
  if (instance.authMode === "api_key") {
    const prefix = legacyApiProviderId(instance.envName);
    return Boolean(prefix && model.startsWith(`${prefix}/`));
  }
  const prefixes: Record<ProviderInstance["provider"], string[]> = {
    opencode: ["opencode/", "opencode-go/"],
    claude: ["anthropic/"],
    openai: ["openai/"],
    "github-copilot": ["github-copilot/"],
    gitlab: ["gitlab/"],
    xai: ["xai/"],
    custom: [],
  };
  return prefixes[instance.provider].some((prefix) => model.startsWith(prefix));
}

export function apiRuntimeEnvironment(
  instance: ProviderInstance,
  secret: string | null,
): Record<string, string> {
  if (!instance.apiConfig) {
    return legacyApiProviderId(instance.envName) && secret
      ? { [instance.envName!]: secret }
      : {};
  }
  const config: ApiConnectionConfig = apiConnectionSchema.parse(
    instance.apiConfig,
  );
  const id = configuredProviderId(instance);
  const models = Object.fromEntries(
    config.modelIds.map((model) => [model, { name: model, tool_call: true }]),
  );
  return {
    ...(secret ? { [MODEL_KEY_ENV]: secret } : {}),
    OPENCODE_CONFIG_CONTENT: JSON.stringify({
      enabled_providers: [id],
      provider: {
        [id]: {
          npm: `@ai-sdk/${config.protocol}`,
          name: instance.name,
          options: {
            baseURL: config.baseUrl,
            apiKey: secret ? `{env:${MODEL_KEY_ENV}}` : "local-no-key",
          },
          models,
        },
      },
    }),
  };
}
