import assert from "node:assert/strict";
import { createConnection, createServer } from "node:net";
import test from "node:test";
import { pinnedPublicLookup } from "./publication-manifest.js";

test("pinned HTTPS lookup supports both callback shapes for IPv4 and IPv6", () => {
  for (const resolved of [
    { address: "8.8.8.8", family: 4 },
    { address: "2001:4860:4860::8888", family: 6 },
  ]) {
    const lookup = pinnedPublicLookup(resolved);
    let all;
    lookup("must-not-resolve.invalid", { all: true }, (...args) => { all = args; });
    assert.deepEqual(all, [null, [resolved]]);
    let single;
    lookup("must-not-resolve.invalid", { all: false }, (...args) => { single = args; });
    assert.deepEqual(single, [null, resolved.address, resolved.family]);
  }
});

test("Node automatic address-family selection accepts the pinned lookup without DNS", async () => {
  // A loopback fixture exercises Node's real callback contract, not the
  // publication URL validator; production still rejects private addresses.
  const server = createServer(socket => socket.end());
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  let socket;
  try {
    socket = createConnection({
      host: "must-not-resolve.invalid",
      port: server.address().port,
      autoSelectFamily: true,
      lookup: pinnedPublicLookup({ address: "127.0.0.1", family: 4 }),
    });
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
  } finally {
    socket?.destroy();
    await new Promise((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve()));
  }
});