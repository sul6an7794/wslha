function renderRevealScreen(state, actions) {
  const wrap = el('div', 'reveal-wrap rise');
  wrap.appendChild(el('div', 'kicker', 'YOUR ROLE'));
  wrap.appendChild(el('div', 'reveal-title', 'دورك هو'));

  const scene = el('div', 'flip-scene');
  const inner = el('div', `flip-inner${state.flipped ? ' flipped' : ''}`);

  const back = el('div', 'flip-back');
  const backInner = el('div', 'flip-back-inner');
  ['c-tr', 'c-tl', 'c-br', 'c-bl'].forEach((c) => backInner.appendChild(el('div', `corner ${c}`, '◆')));
  const brandRow = el('div', 'flip-brand-row');
  brandRow.appendChild(el('span', 'line-r'));
  brandRow.appendChild(el('span', 'txt', 'M A F I A'));
  brandRow.appendChild(el('span', 'line-l'));
  backInner.appendChild(brandRow);
  const logo = el('div', 'logo-box flip-logo');
  logo.appendChild(el('div', 'dot r'));
  logo.appendChild(el('div', 'dot l'));
  logo.appendChild(el('div', 'logo-ar', 'مافيا'));
  backInner.appendChild(logo);
  const hint = el('div');
  hint.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px';
  hint.appendChild(el('div', 'flip-hint-title', 'بطاقة الدور'));
  hint.appendChild(el('div', 'flip-hint-line'));
  hint.appendChild(el('div', 'flip-hint-sub', 'اضغط لكشف دورك'));
  backInner.appendChild(hint);
  back.appendChild(backInner);
  inner.appendChild(back);

  const alignment = state.role && (state.role.alignment || (state.role.team === 'شر' ? 'evil' : 'good'));
  const evil = alignment === 'evil';
  const neutral = alignment === 'neutral';
  const teamChipClass = neutral ? 'neutral' : (evil ? 'evil' : 'good');
  const teamChipLabel = neutral ? 'دور محايد' : (evil ? 'فريق الشر' : 'فريق الخير');
  const face = el('div', 'flip-face');
  face.style.boxShadow = `0 24px 60px rgba(0,0,0,0.7), 0 0 30px ${evil ? 'rgba(255,45,45,0.4)' : 'rgba(0,183,240,0.4)'}`;
  face.appendChild(RoleCard(state.myCard));
  inner.appendChild(face);

  scene.appendChild(inner);
  wrap.appendChild(scene);

  const chipRow = el('div', 'team-chip-row');
  if (state.flipped) {
    const row = el('div', 'rise');
    row.style.cssText = 'display:flex;align-items:center;gap:10px';
    row.appendChild(el('span', `team-chip ${teamChipClass}`, teamChipLabel));
    row.appendChild(el('span', 'muted-note', 'لا ترِ شاشتك لأحد'));
    chipRow.appendChild(row);
  }
  wrap.appendChild(chipRow);

  const btn = el('button', `big-btn ${state.flipped && !state.revealSent ? 'blue' : 'idle'}`, state.revealSent ? 'بانتظار بقية اللاعبين…' : 'فهمت — بدء الليل');
  btn.disabled = !state.flipped || state.revealSent;
  btn.addEventListener('click', () => actions.revealDone());
  wrap.appendChild(btn);

  scene.addEventListener('click', () => {
    if (state.flipped) return;
    state.flipped = true;
    inner.classList.add('flipped');
    const row = el('div', 'rise');
    row.style.cssText = 'display:flex;align-items:center;gap:10px';
    row.appendChild(el('span', `team-chip ${teamChipClass}`, teamChipLabel));
    row.appendChild(el('span', 'muted-note', 'لا ترِ شاشتك لأحد'));
    chipRow.appendChild(row);
    btn.className = 'big-btn blue';
    btn.disabled = false;
    actions.flipCard();
  });

  return wrap;
}
