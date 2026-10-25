export type PoiCategory = 'entrance' | 'food' | 'service' | 'shop' | 'toilet' | 'conference' | 'meeting' | 'exhibition' | 'cloakroom' | 'rest' | 'reception' | 'stairs' | 'wifi';
export type Poi = { id: string; name: string; category: PoiCategory; description: string; x: number; y: number; floor?: string; panoramaId?: string; icon?: string; };
export type MapData = { slug: string; name: string; description: string; imageUrl?: string; floorPlans?: Record<string, string>; planMode?: 'demo' | 'saved' | 'empty'; pois: Poi[]; };
const demoMap: MapData = { slug: 'central', name: 'Главный корпус', description: 'Интерактивная навигация по пространству', pois: [
 { id: 'p-main', name: 'Вход', category: 'entrance', description: 'Главный вход в здание со стороны площади.', x: 50, y: 91, floor: '1 этаж' },
 { id: 'p-east', name: 'Восточный вход', category: 'entrance', description: 'Дополнительный вход со стороны парковки.', x: 91, y: 72, floor: '1 этаж' },
 { id: 'p-conference', name: 'Конференц-зал', category: 'conference', description: 'Большой зал для лекций, выступлений и мероприятий. Вместимость — до 120 гостей.', x: 27, y: 17, floor: '1 этаж' },
 { id: 'p-meeting-1', name: 'Переговорная 1', category: 'meeting', description: 'Переговорная комната на 8 человек с экраном для презентаций.', x: 51, y: 17, floor: '1 этаж' },
 { id: 'p-meeting-2', name: 'Переговорная 2', category: 'meeting', description: 'Компактная переговорная на 6 человек.', x: 68, y: 23, floor: '1 этаж' },
 { id: 'p-cafe', name: 'Кафе', category: 'food', description: 'Кафе с горячими блюдами, напитками и зоной посадки.', x: 84, y: 28, floor: '1 этаж' },
 { id: 'p-toilet', name: 'Туалет', category: 'toilet', description: 'Санузел для посетителей.', x: 15, y: 42, floor: '1 этаж' },
 { id: 'p-access', name: 'Доступный туалет', category: 'toilet', description: 'Доступный санузел с широким проходом и поручнями.', x: 24, y: 42, floor: '1 этаж' },
 { id: 'p-exhibition', name: 'Выставочная зона', category: 'exhibition', description: 'Пространство для временных экспозиций и стендов.', x: 22, y: 61, floor: '1 этаж' },
 { id: 'p-info', name: 'Лобби', category: 'service', description: 'Центральное пространство корпуса и точка распределения потоков.', x: 49, y: 58, floor: '1 этаж' },
 { id: 'p-cloakroom', name: 'Гардероб', category: 'cloakroom', description: 'Гардероб для верхней одежды.', x: 77, y: 57, floor: '1 этаж' },
 { id: 'p-rest', name: 'Зона отдыха', category: 'rest', description: 'Тихое пространство с местами для отдыха.', x: 78, y: 73, floor: '1 этаж' },
 { id: 'p-shop', name: 'Сувенирный магазин', category: 'shop', description: 'Сувениры и товары с символикой пространства.', x: 23, y: 83, floor: '1 этаж' },
 { id: 'p-reception', name: 'Ресепшен', category: 'reception', description: 'Стойка регистрации и помощи посетителям.', x: 74, y: 88, floor: '1 этаж' },
 { id: 'p-stairs', name: 'Лестница', category: 'stairs', description: 'Лестница на верхние этажи.', x: 80, y: 44, floor: '1 этаж' },
 { id: 'p-wifi', name: 'Wi-Fi зона', category: 'wifi', description: 'Бесплатный Wi-Fi для посетителей.', x: 56, y: 40, floor: '1 этаж' },
] };
export async function getPublishedMapBySlug(slug: string): Promise<MapData | null> { await new Promise((resolve) => setTimeout(resolve, 250)); return slug === 'central' || slug === 'demo' ? { ...demoMap, slug, planMode: 'demo' } : null; }
export async function findRoute(fromId: string, toId: string, map: MapData): Promise<{ distance: number; points: Array<{ x: number; y: number }> } | null> { const from = map.pois.find((poi) => poi.id === fromId); const to = map.pois.find((poi) => poi.id === toId); if (!from || !to || from.id === to.id) return null; const points = [from, { x: from.x, y: from.y > 70 ? 68 : 48 }, { x: to.x, y: from.y > 70 ? 68 : 48 }, to]; return { distance: Math.round(points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0) * 2.1), points: points.map(({ x, y }) => ({ x, y })) }; }
