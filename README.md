# kasyanov-app-updates

Публичный источник обновлений для офлайн-приложения ИП Касьянов.

- `updates/manifest.json` — манифест версии
- `updates/app.js` / `app.css` — код интерфейса
- `updates/quotes_public.json` — рыночные ставки **без** ФИО/телефонов/клиентов
- `updates/mail_public.json` — лента запросов/заявок (компания, маршрут, ставка; без ПДн)

**Не публикуется:** перевозчики (реквизиты), водители (паспорта, телефоны), заявки, рейсы, печать.

Приложение читает манифест сначала с jsDelivr (`cdn.jsdelivr.net/gh/...@main/...`), затем с raw.githubusercontent.com (CORS `*`).
Репозиторий должен быть **public**. После каждого push очищайте кэш jsDelivr (~12 ч):
`https://purge.jsdelivr.net/gh/kasianov992-debug/kasyanov-app-updates@main/updates/manifest.json`
и аналогично для `app.js`, `app.css`, `quotes_public.json`, `mail_public.json`.
