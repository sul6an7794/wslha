/* بطاقة الدور: صورة الشخصية + إطار ذهبي + شارة الفريق + اسم + قدرة (نص DOM حقيقي) */
function RoleCard(cardKey, opts = {}) {
  const data = roleCardData(cardKey);
  const flipReveal = data.badgeLabel === 'تحوّل' && !opts.noFlipReveal;
  const card = el('div', `role-card${flipReveal ? ' role-card--flip-reveal' : ''}${opts.className ? ' ' + opts.className : ''}`);

  const photo = document.createElement('img');
  photo.className = 'role-card__photo';
  photo.src = `assets/characters/${data.photo}`;
  photo.alt = data.nameAr;
  photo.decoding = 'async';
  photo.loading = opts.loading || 'eager';
  card.appendChild(photo);

  card.appendChild(el('div', 'role-card__gradient'));
  card.appendChild(el('div', `role-card__frame role-card__frame--${data.faction}`));

  const badgeText = data.badgeLabel || (data.faction === 'evil' ? 'بطاقة شر' : data.faction === 'good' ? 'بطاقة خير' : 'بطاقة محايدة');
  card.appendChild(el('span', `role-card__badge role-card__badge--${data.faction}`, badgeText));

  const bottom = el('div', 'role-card__bottom');
  const titleRow = el('div', 'role-card__title-row');
  const nameClass = `role-card__name role-card__name--${data.faction}${data.nameAr.includes('ـ') ? ' role-card__name--kashida' : ''}`;
  titleRow.appendChild(el('span', nameClass, data.nameAr));
  if (data.nameEn) titleRow.appendChild(el('span', `role-card__name-en role-card__name-en--${data.faction}`, data.nameEn));
  bottom.appendChild(titleRow);

  if (!opts.hideAbility && data.ability) {
    bottom.appendChild(el('div', 'role-card__ability-label', 'القدره'));
    bottom.appendChild(el('div', 'role-card__ability', data.ability));
  }
  card.appendChild(bottom);

  return card;
}
