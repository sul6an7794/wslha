const MafiaSocket = (() => {
  function getDeviceId() {
    let id = localStorage.getItem('mafia_device_id');
    if (!id) {
      id = 'd-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('mafia_device_id', id);
    }
    return id;
  }

  const socket = io({ path: '/mafia/socket.io/', auth: { deviceId: getDeviceId() } });

  function emitAck(event, payload) {
    return new Promise((resolve) => {
      socket.emit(event, payload, (res) => resolve(res || { error: 'لا استجابة من الخادم' }));
    });
  }

  return { socket, deviceId: getDeviceId(), emitAck };
})();
