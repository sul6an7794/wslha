process.env.MAFIA_REVEAL_MS = '10000';
process.env.MAFIA_NIGHT_MS = '10000';
process.env.MAFIA_DEATH_REVEAL_MS = '10000';
process.env.MAFIA_DAY_MS = '10000';
process.env.MAFIA_VOTE_MS = '10000';
process.env.MAFIA_DEFENSE_MS = '10000';

const test = require('node:test');
const assert = require('node:assert');
const { io: ioClient } = require('socket.io-client');
const { startServer } = require('../src/server');
const roomsMod = require('../src/rooms');

function clearAllRooms() {
  for (const [code, room] of roomsMod.rooms) {
    if (room.phaseTimer) clearTimeout(room.phaseTimer);
    roomsMod.rooms.delete(code);
  }
}

function emitAck(socket, event, payload = {}) {
  return new Promise((resolve) => socket.emit(event, payload, (res) => resolve(res || {})));
}

function waitFor(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

function waitForRoomUpdate(socket, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('roomUpdate', onUpdate);
      reject(new Error('Timed out waiting for roomUpdate'));
    }, timeoutMs);

    function onUpdate(state) {
      if (!predicate(state)) return;
      clearTimeout(timeout);
      socket.off('roomUpdate', onUpdate);
      resolve(state);
    }

    socket.on('roomUpdate', onUpdate);
  });
}

test('تدفق الواجهة الأساسي: إنشاء غرفة، انضمام، بدء، انقطاع، وإعادة اتصال', async () => {
  const server = startServer(0);
  const sockets = [];

  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://localhost:${server.address().port}`;
    const makeClient = (deviceId) => {
      const socket = ioClient(baseUrl, { path: '/mafia/socket.io/', auth: { deviceId }, reconnection: false });
      sockets.push(socket);
      return socket;
    };

    const host = makeClient('ui-host');
    await waitFor(host, 'connect');
    let latestHostState = null;
    host.on('roomUpdate', (state) => { latestHostState = state; });
    const waitForHostState = (predicate) => {
      if (latestHostState && predicate(latestHostState)) return Promise.resolve(latestHostState);
      return waitForRoomUpdate(host, predicate);
    };

    const createResult = await emitAck(host, 'createRoom', { name: 'القائد' });
    assert.ok(createResult.ok, createResult.error);
    assert.match(createResult.roomCode, /^\d{6}$/);

    const guests = [];
    for (let i = 1; i <= 5; i++) {
      const socket = makeClient(`ui-player-${i}`);
      await waitFor(socket, 'connect');
      const joinResult = await emitAck(socket, 'joinRoom', {
        roomCode: createResult.roomCode,
        name: `لاعب ${i}`,
      });
      assert.ok(joinResult.ok, joinResult.error);
      guests.push(socket);
    }

    const lobbyState = await waitForHostState((state) => state.players.length === 6);
    assert.strictEqual(lobbyState.phase, 'lobby');
    assert.strictEqual(lobbyState.hostId, 'ui-host');

    guests[1].close();
    const disconnectedState = await waitForHostState((state) => {
      const player = state.players.find((p) => p.id === 'ui-player-2');
      return player && !player.connected;
    });
    assert.strictEqual(disconnectedState.players.find((p) => p.id === 'ui-player-2').connected, false);

    const reconnectedBeforeStart = makeClient('ui-player-2');
    await waitFor(reconnectedBeforeStart, 'connect');
    const rejoinBeforeStart = await emitAck(reconnectedBeforeStart, 'joinRoom', {
      roomCode: createResult.roomCode,
      name: 'لاعب 2',
    });
    assert.ok(rejoinBeforeStart.ok, rejoinBeforeStart.error);

    const restoredLobbyState = await waitForHostState((state) => {
      const player = state.players.find((p) => p.id === 'ui-player-2');
      return player && player.connected && state.players.length === 6;
    });
    assert.strictEqual(restoredLobbyState.phase, 'lobby');

    const rolePromises = [host, guests[0], reconnectedBeforeStart, guests[2], guests[3], guests[4]]
      .map((socket) => waitFor(socket, 'roleAssigned'));

    const startResult = await emitAck(host, 'startGame');
    assert.ok(startResult.ok, startResult.error);

    const roles = await Promise.all(rolePromises);
    assert.strictEqual(roles.length, 6);
    roles.forEach(({ role, card, presentCards }) => {
      assert.ok(role.id);
      assert.ok(card.endsWith('.png'));
      assert.ok(Array.isArray(presentCards));
    });

    reconnectedBeforeStart.close();
    await waitForHostState((state) => {
      const player = state.players.find((p) => p.id === 'ui-player-2');
      return state.phase === 'reveal' && player && !player.connected;
    });

    const roleAgainPromise = new Promise((resolve) => {
      const reconnectedDuringGame = makeClient('ui-player-2');
      reconnectedDuringGame.once('connect', async () => {
        const rejoinDuringGame = await emitAck(reconnectedDuringGame, 'joinRoom', {
          roomCode: createResult.roomCode,
          name: 'لاعب 2',
        });
        assert.ok(rejoinDuringGame.ok, rejoinDuringGame.error);
      });
      reconnectedDuringGame.once('roleAssigned', resolve);
    });

    const roleAgain = await Promise.race([
      roleAgainPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('لم يستعد اللاعب دوره بعد إعادة الاتصال')), 3000)),
    ]);

    assert.strictEqual(roleAgain.role.id, roles[2].role.id);
    assert.ok(roleAgain.card.endsWith('.png'));
  } finally {
    sockets.forEach((socket) => socket.close());
    clearAllRooms();
    server.io.close();
    server.close();
    server.unref();
  }
});
