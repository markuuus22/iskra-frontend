# Искра — Telegram Mini App (скелет)

Игра «Правда или Действие» для пары. Три уровня жара, задания генерит LLM
на лету. Бэкенд-прокси прячет ключ; фронт — статика на GitHub Pages.

```
iskra/
├── backend/      # FastAPI-прокси к LLM (Railway)
│   ├── main.py           ← системный промпт живёт здесь
│   ├── requirements.txt
│   ├── Procfile
│   └── .env.example
└── frontend/     # Mini App (GitHub Pages)
    ├── index.html
    ├── style.css
    └── app.js            ← впиши API_BASE (строка 4)
```

## Как это связано
Mini App (фронт) → твой эндпоинт `/generate` на Railway → LLM. Ключ к модели
виден только бэкенду. Фронт кэширует задания батчами и догенерирует в фоне,
поэтому карты выходят без задержек.

## 1. Бэкенд на Railway
1. Залей папку `backend/` в репозиторий, подключи его к Railway (New → Deploy
   from GitHub). Railway сам поднимет по `Procfile`.
2. В Variables впиши:
   - `LLM_API_KEY` — твой ключ
   - `LLM_BASE_URL` — по умолчанию OpenRouter (доступен из РФ). Можно свой
     прокси или GigaChat-совместимый шлюз.
   - `LLM_MODEL` — например `openai/gpt-4o-mini`
   - `ALLOWED_ORIGINS` — `https://ТВОЙ_ЛОГИН.github.io`
3. Получишь URL вида `https://iskra-xxxx.up.railway.app`. Проверь — открой его,
   должно ответить `{"ok": true}`.

## 2. Фронт на GitHub Pages
1. В `frontend/app.js` впиши свой Railway-URL в `API_BASE` (строка 4).
2. Залей `frontend/` в репозиторий, включи Pages (Settings → Pages → ветка).
3. Получишь `https://ТВОЙ_ЛОГИН.github.io/iskra/`.

## 3. Привязка к боту
1. У @BotFather: `/newbot` → получи токен.
2. `/newapp` (или Bot Settings → Menu Button → Web App) → укажи URL фронта.
3. Открываешь бота → кнопка запускает Mini App.

## Что осознанно НЕ сделано в скелете (следующие шаги)
- **Валидация `initData`.** Сейчас бэкенд принимает любой запрос. Перед
  монетизацией добавь проверку HMAC-подписи Telegram — иначе эндпоинт дёргают
  в обход.
- **Stars / пейволл.** Уровни 2–3 за платный пак. Заводится после initData.
- **Кэш на бэке.** Сейчас каждый батч — новый вызов модели. Можно копить
  «общий пул» заданий по уровням и подмешивать к персональным, чтобы резать
  расходы.

## Локальный запуск бэка
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # впиши ключ
uvicorn main:app --reload
```
