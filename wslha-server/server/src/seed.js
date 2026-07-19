const db = require('./db');

// بيانات تجريبية افتراضية حتى تقدر تجرب اللعبة فورًا بدون تعبئة لوحة التحكم يدويًا أولاً.
async function seedDefaults() {
  if (db.getRoundsCount() > 0) return;

  const defaults = [
    {
      hint: 'حيوان أليف',
      answers: ['كلب', 'جرو', 'بوكسر'],
      images: [
        'https://picsum.photos/id/237/420/300',
        'https://picsum.photos/id/1025/420/300',
        'https://picsum.photos/id/1074/420/300',
      ],
    },
    {
      hint: 'ماء',
      answers: ['شاطئ', 'بحر', 'ساحل', 'رمال', 'موج'],
      images: [
        'https://picsum.photos/id/103/420/300',
        'https://picsum.photos/id/110/420/300',
        'https://picsum.photos/id/119/420/300',
      ],
    },
    {
      hint: 'طبيعة',
      answers: ['غابة', 'أشجار', 'شجر', 'طبيعة'],
      images: [
        'https://picsum.photos/id/10/420/300',
        'https://picsum.photos/id/15/420/300',
        'https://picsum.photos/id/28/420/300',
      ],
    },
    {
      hint: 'حضري',
      answers: ['مدينة', 'برج', 'ناطحة سحاب', 'عمارات'],
      images: [
        'https://picsum.photos/id/1018/420/300',
        'https://picsum.photos/id/164/420/300',
        'https://picsum.photos/id/180/420/300',
      ],
    },
  ];

  for (const r of defaults) {
    const round = await db.insertRound({ hint: r.hint, answers: r.answers });
    for (const url of r.images) await db.insertRoundImage(round.id, { filename: url, url });
  }
}

module.exports = { seedDefaults };
