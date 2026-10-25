export type EditorIcon = { value: string; label: string; glyph: string; tone: string };
export const editorIcons: EditorIcon[] = [
  { value: 'mall-shop', label: 'Магазин', glyph: '🛍️', tone: 'bg-violet-50 text-violet-700' },
  { value: 'mall-foodcourt', label: 'Фуд-корт', glyph: '🍴', tone: 'bg-amber-50 text-amber-700' },
  { value: 'mall-cinema', label: 'Кинотеатр', glyph: '🎬', tone: 'bg-indigo-50 text-indigo-700' },
  { value: 'mall-kids', label: 'Детская зона', glyph: '🧸', tone: 'bg-pink-50 text-pink-700' },
  { value: 'mall-beauty', label: 'Красота', glyph: '💄', tone: 'bg-rose-50 text-rose-700' },
  { value: 'mall-pharmacy', label: 'Аптека', glyph: '💊', tone: 'bg-red-50 text-red-700' },
  { value: 'mall-atm', label: 'Банкомат', glyph: '💳', tone: 'bg-emerald-50 text-emerald-700' },
  { value: 'mall-parking', label: 'Парковка', glyph: '🅿️', tone: 'bg-slate-100 text-slate-700' },
  { value: 'mall-entrance', label: 'Вход', glyph: '🚪', tone: 'bg-blue-50 text-blue-700' },
  { value: 'mall-info', label: 'Инфоцентр', glyph: 'ℹ️', tone: 'bg-sky-50 text-sky-700' },
  { value: 'mall-toilet', label: 'Туалет', glyph: '🚻', tone: 'bg-teal-50 text-teal-700' },
  { value: 'mall-accessible', label: 'Доступная среда', glyph: '♿', tone: 'bg-blue-50 text-blue-700' },
  { value: 'mall-elevator', label: 'Лифт', glyph: '🛗', tone: 'bg-blue-50 text-blue-700' },
  { value: 'mall-escalator', label: 'Эскалатор', glyph: '⬆️', tone: 'bg-indigo-50 text-indigo-700' },
  { value: 'mall-stairs', label: 'Лестница', glyph: '🪜', tone: 'bg-orange-50 text-orange-700' },
  { value: 'mall-wifi', label: 'Wi-Fi', glyph: '📶', tone: 'bg-cyan-50 text-cyan-700' },
  { value: 'mall-security', label: 'Охрана', glyph: '🛡️', tone: 'bg-slate-100 text-slate-700' },
  { value: 'mall-charger', label: 'Зарядка', glyph: '⚡', tone: 'bg-yellow-50 text-yellow-700' },
  { value: 'route-node', label: 'Узел маршрута', glyph: '✦', tone: 'bg-neutral-100 text-ink' },
];
export const iconByValue = (value?: string) => editorIcons.find((icon) => icon.value === value) ?? editorIcons[0];
