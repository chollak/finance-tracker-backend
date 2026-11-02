# Иконки Kapelka

Знак — две капли «∞» из полосок голоса (FT-169). Правила — [`docs/pastel/design-system.md`](../../../docs/pastel/design-system.md),
раздел «Знак»; исходники — [`docs/pastel/logo/`](../../../docs/pastel/logo/).

| Файл | Где | Что на нём |
|---|---|---|
| `icon.svg` | вкладка браузера (`index.html`) | белый сплошной силуэт на скруглённом квадрате `#141416` (`rx="22.5"`): в 16–32 px полоски сливаются |
| `icon-192x192.png`, `icon-512x512.png` | PWA (`manifest.json`, `vite.config.ts`), `any maskable` | белые полоски на квадрате `#141416`, в безопасной зоне maskable — из `kapelka-avatar.svg` |
| `apple-touch-icon.png`, 180×180 | «На экран Домой» в Safari (`index.html`) | то же, что PWA |

## Как сделаны PNG

PNG руками не правят. После правки SVG в `docs/pastel/logo/` их рисует заново скрипт:

```bash
scripts/nvm-exec.sh node scripts/render-sign-png.js
```

Он открывает каждый SVG в Chrome через Playwright проекта (его Chromium, а если он не скачан — установленный
Google Chrome или браузер из `CHROMIUM_PATH`), на своей странице ровно нужного размера, 1x, и пишет PNG заново как
8-битный RGB без альфа-канала (`scripts/png-pixels.js`). Тем же проходом рисуются иконка iOS
(`ios/Kapelka/Assets.xcassets/AppIcon.appiconset/AppIcon.png`, 1024) и аватар бота
(`docs/pastel/logo/kapelka-avatar-640.png`). Проверка — `npm test -- kapelkaSign`: геометрия SVG как в задаче, размеры
PNG, нет альфы, и каждый пиксель на месте: центр каждой полоски белый, всё дальше 1 px от полосок — `#141416`.
