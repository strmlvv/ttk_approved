# Карта пространства - модуль посетителя

Демо-модуль React + TypeScript + Tailwind для `/m/:slug` и `/embed/:slug`.

## Запуск

```bash
npm install
npm run dev
```

Демо-адрес: `/m/central` или `/embed/central`.

## UI-kit

```tsx
import { BottomSheet, Button, Card, Input, Select, Spinner } from './components/ui';
```

`BottomSheet` поддерживает закрытие по кнопке, клику по backdrop и корректно учитывает safe area. Компонент карты демонстрирует поиск, фильтрацию, выбор POI, масштабирование/панорамирование и вызов `findRoute`.

## Интеграционные точки

- `getPublishedMapBySlug` и `findRoute` расположены в `src/lib/api.ts` как демонстрационные заглушки и готовы к замене API-слоем.
- 3D/2D панорама подключается в обработчик действия выбранного POI.
- Обработаны состояния loading и map_not_found; map_access_restricted можно добавить как отдельный статус API.
