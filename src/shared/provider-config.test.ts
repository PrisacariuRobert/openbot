import test from "node:test";
import assert from "node:assert/strict";
import {
  apiConnectionSchema,
  apiRuntimeEnvironment,
  configuredModels,
  isFreeTierModel,
  modelBelongsToConnection,
  providerInput,
} from "./provider-config.js";
import type { ProviderInstance } from "./types.js";

const connection: ProviderInstance = {
  id: "test-provider",
  ownerId: "owner",
  name: "Local models",
  provider: "custom",
  authMode: "api_key",
  runtime: "opencode",
  envName: null,
  hasSecret: false,
  createdAt: "",
  updatedAt: "",
  apiConfig: {
    baseUrl: "http://127.0.0.1:11434/v1",
    protocol: "openai-compatible",
    modelIds: ["qwen3:8b", "org/my-model"],
  },
};

test("custom connections require an endpoint and model; only loopback can omit HTTPS and a key", () => {
  assert.equal(
    providerInput.safeParse({
      name: "Incomplete",
      authMode: "api_key",
      envName: "PROVIDER_API_KEY",
      secret: "key",
    }).success,
    false,
  );
  const local = providerInput.parse({
    name: "Ollama",
    authMode: "api_key",
    apiConfig: connection.apiConfig,
  });
  assert.equal(local.apiConfig?.modelIds[0], "qwen3:8b");
  for (const baseUrl of [
    "http://example.com/v1",
    "https://user:secret@example.com/v1",
    "https://example.com/v1?key=secret",
    "file:///tmp/models",
  ]) {
    assert.equal(
      apiConnectionSchema.safeParse({ ...connection.apiConfig, baseUrl })
        .success,
      false,
      baseUrl,
    );
  }
  assert.equal(
    providerInput.safeParse({
      name: "Hosted",
      authMode: "api_key",
      apiConfig: { ...connection.apiConfig, baseUrl: "https://example.com/v1" },
    }).success,
    false,
  );
});

test("connection configuration cannot inject arbitrary child-process environment variables", () => {
  for (const envName of [
    "NODE_OPTIONS",
    "PATH",
    "OPENBOT_INTERNAL_TOKEN",
    "LD_PRELOAD",
    "OPENCODE_CONFIG_CONTENT",
  ]) {
    assert.equal(
      providerInput.safeParse({
        name: "Key",
        authMode: "api_key",
        secret: "value",
        envName,
      }).success,
      false,
    );
  }
  assert.equal(
    providerInput.safeParse({
      name: "Key",
      authMode: "api_key",
      secret: "value",
      envName: "OPENAI_API_KEY",
    }).success,
    true,
  );
});

test("keeps custom models scoped to the exact saved connection, including local tags", () => {
  assert.deepEqual(configuredModels(connection), [
    "openbot-test-provider/qwen3:8b",
    "openbot-test-provider/org/my-model",
  ]);
  assert.equal(
    modelBelongsToConnection("openbot-test-provider/qwen3:8b", connection),
    true,
  );
  assert.equal(modelBelongsToConnection("openai/anything", connection), false);
  assert.equal(
    modelBelongsToConnection("openbot-other/qwen3:8b", connection),
    false,
  );
  assert.equal(
    modelBelongsToConnection("openrouter/org/model", {
      ...connection,
      apiConfig: null,
      envName: "OPENROUTER_API_KEY",
    }),
    true,
  );
  assert.equal(
    modelBelongsToConnection("openai/model", {
      ...connection,
      apiConfig: null,
      envName: "OPENROUTER_API_KEY",
    }),
    false,
  );
});

test("passes endpoint and model configuration to the real runtime without putting keys in JSON", () => {
  const env = apiRuntimeEnvironment(connection, "only-this-key");
  const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT!);
  assert.deepEqual(config.enabled_providers, ["openbot-test-provider"]);
  assert.equal(
    config.provider["openbot-test-provider"].npm,
    "@ai-sdk/openai-compatible",
  );
  assert.equal(
    config.provider["openbot-test-provider"].options.baseURL,
    connection.apiConfig?.baseUrl,
  );
  assert.equal(env.OPENBOT_MODEL_API_KEY, "only-this-key");
  assert.equal(env.OPENCODE_CONFIG_CONTENT?.includes("only-this-key"), false);
  assert.equal(
    apiRuntimeEnvironment(connection, null).OPENBOT_MODEL_API_KEY,
    undefined,
  );
  assert.deepEqual(
    apiRuntimeEnvironment(
      { ...connection, apiConfig: null, envName: "NODE_OPTIONS" },
      "--inject",
    ),
    {},
  );
});

test("free-tier suffix detection names the tier without judging other models", () => {
  assert.equal(isFreeTierModel("opencode/muse-spark-1.3-contributor-free"), true);
  assert.equal(isFreeTierModel("opencode-go/mimo-v2.5-free"), true);
  assert.equal(isFreeTierModel("custom/free"), true);
  assert.equal(isFreeTierModel("opencode-go/deepseek-v4.1-flash"), false);
  assert.equal(isFreeTierModel("opencode-go/glm-5.3-flash"), false);
  assert.equal(isFreeTierModel("opencode-go/muse-spark-1.3-contributor"), false);
  assert.equal(isFreeTierModel("local/freezer-model"), false);
  assert.equal(isFreeTierModel(""), false);
});
