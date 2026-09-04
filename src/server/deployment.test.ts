import assert from "node:assert/strict";
import test from "node:test";
import { callbackUrl, deploymentStatus, readDeploymentConfig } from "./deployment.js";
import type { RunnerHealth } from "../shared/types.js";

const runner = (status: RunnerHealth["status"]): RunnerHealth => ({
  status, mode: "foreground", instanceId: null, startedAt: null, heartbeatAt: null,
  leaseExpiresAt: null, lastCycleAt: null, recoveredRuns: 0, dispatchedRuns: 0,
  queuedRuns: 0, runningRuns: 0, waitingRuns: 0, nextRoutineAt: null, lastError: null,
  backgroundService: "unsupported", backgroundServiceDetail: "",
});

test("local deployment keeps the development URL and Mac data boundary", () => {
  const config = readDeploymentConfig({}, { port: 4311, production: false });
  assert.deepEqual(config, { mode: "local", appUrl: "http://127.0.0.1:4310/", callbackBaseUrl: "http://127.0.0.1:4311/", dataDir: null, trustProxy: false });
  assert.equal(callbackUrl(config, "/api/connectors/google/callback"), "http://127.0.0.1:4311/api/connectors/google/callback");
  assert.equal(deploymentStatus(config, runner("online")).dataLocation, "this_mac");
});

test("private runner requires HTTPS and absolute durable storage", () => {
  assert.throws(() => readDeploymentConfig({ OPENBOT_DEPLOYMENT_MODE: "private_runner", OPENBOT_APP_URL: "http://studio.example.com", OPENBOT_DATA_DIR: "/data" }, { port: 4311, production: true }), /HTTPS/);
  assert.throws(() => readDeploymentConfig({ OPENBOT_DEPLOYMENT_MODE: "private_runner", OPENBOT_APP_URL: "https://studio.example.com", OPENBOT_DATA_DIR: "data" }, { port: 4311, production: true }), /absolute/);
});

test("private runner normalizes the URL and builds public OAuth callbacks", () => {
  const config = readDeploymentConfig({ OPENBOT_DEPLOYMENT_MODE: "private_runner", OPENBOT_APP_URL: "https://studio.example.com", OPENBOT_DATA_DIR: "/var/lib/openbot" }, { port: 4311, production: true });
  assert.equal(config.appUrl, "https://studio.example.com/");
  assert.equal(callbackUrl(config, "/api/connectors/google/callback"), "https://studio.example.com/api/connectors/google/callback");
  const status = deploymentStatus(config, runner("online"));
  assert.equal(status.alwaysOn, true);
  assert.equal(status.publicUrl, "https://studio.example.com/");
  assert.ok(status.checks.every((check) => check.status === "ready"));
});

test("deployment URLs reject embedded credentials and invalid modes", () => {
  assert.throws(() => readDeploymentConfig({ OPENBOT_APP_URL: "https://me:secret@example.com" }, { port: 4311, production: true }), /username or password/);
  assert.throws(() => readDeploymentConfig({ OPENBOT_DEPLOYMENT_MODE: "cloud" }, { port: 4311, production: true }), /local or private_runner/);
  assert.throws(() => readDeploymentConfig({ OPENBOT_DEPLOYMENT_MODE: "private_runner", OPENBOT_APP_URL: "https://example.com/openbot", OPENBOT_DATA_DIR: "/data" }, { port: 4311, production: true }), /domain root/);
});
