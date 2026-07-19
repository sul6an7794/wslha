function arNum(value) {
  return String(value).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function numberTicker(fromVal, toVal, className) {
  const span = document.createElement('span');
  if (className) span.className = className;
  if (fromVal === toVal) { span.textContent = arNum(toVal); return span; }
  const duration = 280;
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = Math.round(fromVal + (toVal - fromVal) * eased);
    span.textContent = arNum(val);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return span;
}

function clockLabel(seconds) {
  const s = Math.max(0, seconds);
  const mm = String(Math.floor(s / 60));
  const ss = String(s % 60).padStart(2, '0');
  return `0${mm}:${ss}`;
}
