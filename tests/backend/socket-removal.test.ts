/** @vitest-environment node */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import jwt from "jsonwebtoken";
import { io as connect, Socket } from "socket.io-client";
import { connectDB, closeDB } from "../helpers/db";
import { TripModel, SessionModel } from "@shared/schema";
import { config } from "../../server/config";
import { socketService } from "../../server/services/SocketService";

const once = (s: Socket, ev: string, ms = 2000) =>
  new Promise<any>((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    s.once(ev, (v: any) => {
      clearTimeout(t);
      resolve(v ?? true);
    });
  });

// Membership/session were only checked at connect and join, so a removed
// collaborator or revoked session kept receiving live trip data.
describe("socket access after removal or revocation", () => {
  let server: http.Server;
  let url: string;
  let tripId: string;
  const sockets: Socket[] = [];

  const client = async (userId: string, sid: string) => {
    await SessionModel.create({
      sessionId: sid,
      tokenHash: sid,
      userId,
      expiresAt: new Date(Date.now() + 60_000),
      revoked: false,
    });
    const token = jwt.sign({ sub: userId, sid }, config.JWT_SECRET);
    const s = connect(url, { auth: { token }, transports: ["websocket"], reconnection: false });
    sockets.push(s);
    await once(s, "connect");
    s.emit("join-trip", { tripId, userName: userId });
    await once(s, "presence-update");
    return s;
  };

  beforeAll(async () => {
    await connectDB();
    server = http.createServer();
    socketService.init(server);
    await new Promise<void>((r) => server.listen(0, () => r()));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const trip = await TripModel.create({
      userId: "owner",
      destination: "Goa",
      days: 1,
      groupSize: 2,
      collaborators: [{ userId: "partner", role: "editor" }],
    });
    tripId = String(trip._id);
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await new Promise((r) => server.close(r));
    await closeDB();
  });

  it("stops sending trip updates to a removed collaborator, not to others", async () => {
    const owner = await client("owner", "s-owner");
    const partner = await client("partner", "s-partner");

    socketService.removeFromTrip("partner", tripId);
    const ownerGot = once(owner, "trip-mutation");
    const partnerGot = once(partner, "trip-mutation", 500);
    socketService.broadcastMutation(tripId, { type: "trip-updated", data: { secret: 1 } });

    expect(await ownerGot).toBeTruthy();
    expect(await partnerGot).toBeNull();
  });

  it("disconnects only the revoked session", async () => {
    const a = await client("owner", "s-a");
    const b = await client("owner", "s-b");
    const aGone = once(a, "disconnect");
    socketService.disconnectSession("s-a");
    expect(await aGone).toBeTruthy();
    expect(b.connected).toBe(true);
  });

  it("ignores a malformed trip id instead of crashing", async () => {
    const s = await client("owner", "s-c");
    const err = once(s, "error");
    s.emit("join-trip", { tripId: "not-an-id" });
    expect(await err).toBeTruthy();
  });
});
