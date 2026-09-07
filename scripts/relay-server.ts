import { createRelayService } from "../src/server/relay-service.js";

// Run on the operator's host behind HTTPS + WebSocket support. One hostname
// suffices, including the hosting provider's included address.
// This is server infrastructure; Mac and iPhone users install only OpenBot.
const enrollmentToken = process.env.OPENBOT_RELAY_ENROLLMENT_TOKEN || "";
const database = process.env.OPENBOT_RELAY_DATABASE;
if (!database) throw new Error("Set OPENBOT_RELAY_DATABASE to a durable database path.");
const relay = createRelayService({ enrollmentToken, database });
relay.server.listen(Number(process.env.PORT || 8080), process.env.OPENBOT_RELAY_BIND || "127.0.0.1", () => console.log("OpenBot relay is listening. Configure HTTPS before connecting studios."));
const stop = () => { void relay.close().then(() => process.exit(0)); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
