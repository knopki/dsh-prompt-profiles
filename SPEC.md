# dsh-prompt-profiles — SPEC

Статус: решения согласованы в гриллинге 2026-09-24. Код не написан.
Пакет: `@knopki/dsh-prompt-profiles`, каталог: `~/.dsh/bundles/dsh-prompt-profiles`.
Целевая версия DSH: `0.1.7-rc.1`.

---

## 0. Зачем

Независимая от agent preset (mode) ось: именованные **профили системного промпта**. Один и тот же
mode (пресет агента) может работать в разных профилях — это даёт «light-режимы», когда меняется
персона, стиль и инструкции к инструментам, но состав тулов и композиция агента остаются теми же.

Профиль выбирается при создании сессии, запечатывается в системный промпт и в этой сессии больше
не меняется. Если профиль не выбран — системный промпт не модифицируется вообще.

---

## 1. Термины

| Термин | Значение |
|---|---|
| **section** | именованный markdown-фрагмент; отдельная loader-строка со своим id |
| **profile** | именованный упорядоченный набор ссылок на секции; отдельная loader-строка |
| **built-in section** | секция, которую регистрирует сам DSH (`tool:bash`, `plan:policy`, `deployment:persona-prefix`, …) |
| **mirror** | таблица `SECTION_ORDERS`, полученная парсингом установленного `@deepseek-ai/dsh-system-prompt` |
| **sealed snapshot** | зафиксированный при старте сессии набор `{profileId, sections[]}` с готовым текстом |

---

## 2. Зафиксированные решения

| # | Решение |
|---|---|
| 1 | Секция = отдельная loader-строка `prompt-section-<id>` с `name: '@knopki/dsh-prompt-profiles/section'`; профиль = строка `prompt-profile-<id>` с `name: '@knopki/dsh-prompt-profiles/profile'`. Домен `config.id` отделён от id строки |
| 2 | Бандл не везёт данных: только главную строку `prompt-profiles`. Любой другой бандл может вставить свои строки-секции и строки-профили под своими id |
| 3 | Секция: `{id, title, body}`. Заголовок хватает, `description`/`enabled`/`order`/`scope` в секции не хранятся |
| 4 | Профиль: `{id, title, sections: [{id, order, scope}]}`. `order` и `scope` — свойство записи в профиле, не секции |
| 5 | `scope ∈ {inherit, main-only, subagents-only}`, дефолт `inherit`. `subagent_fork` наследует всё; `subagents-only` применяется только к обычным детям |
| 6 | Профиль промпта — независимая ось от mode; выбор — второй контрол, не связанный с ростером пресетов |
| 7 | Позиция секции — свободное целое. UI показывает read-only зеркало built-in порядков; при совпадении order с built-in наша секция получает `+0.5` |
| 8 | Несколько отдельных секций, не одна агрегированная. Built-in секции не переопределяются и не выключаются |
| 9 | Запечатывание: config читается один раз при старте сессии, в состоянии сессии лежит снапшот собранного текста; правки конфига на идущую сессию не влияют |
| 10 | Рантайм-состояние: `lastByWorkspace` и `default` — volatile-поля главной строки; снапшот сессии — своя таблица в `ctx.storageDomain` |
| 11 | Цепочка разрешения: `lastByWorkspace[workspaceId]` → `default` → ничего. `lastByWorkspace` пишется **только** при явном выборе в пикере |
| 12 | Применяется на всех поверхностях, где есть воркспейс; пикер — лишь способ переопределить |
| 13 | Чип выбора — `conversation.input.left` (list, внутри тул-строки поля промпта, после `permission` и `plan`); виден только на пустой сессии, после старта рендерит `null` |
| 14 | Редактор — своя секция `settings.section` (id `prompt-profiles`, порядок 25): полный CRUD секций и профилей. Три таба — Profiles / Sections / Preview; внутри таба drill-down (список → форма), назад по `← back`, Esc или повторному клику по активному табу |
| 15 | Порядок в редакторе: outline, где built-ins показаны серыми read-only (весь справочник из mirror); добавление своих секций — пикером `+ Add section` (поиск + мультивыбор); переупорядочивание кнопками ↑↓ (`IconChevronUpOutlineMedium`/`IconChevronDownOutlineMedium`) плюс числовое поле — только внутри состава профиля; order пересчитывается как середина между соседями, при перестановке крайних — шаг ±1 с перенормировкой; HTML5 drag — опция, реализуемая вручную, не в v1 |
| 16 | Переименование секции — батч-операция с откатом: новая строка → правка ссылок во всех профилях → снятие старой строки |
| 17 | Удаление своей строки — физическое; удаление строки, пришедшей из бандла, — `disabled: true` в нашем профильном слое |
| 18 | Создание/удаление строк — своим writer'ом `insert:` в профильный патч (config-editor создавать строки не умеет) |
| 19 | Правка существующей строки — через `ctx.settings` / `configEditor` (валидация, revisions, атомарность, сохранение комментариев) |
| 20 | Деградация: ничего не фатально; битые данные → варнинг в лог и UI, работаем дальше; ссылка на несуществующий профиль → тихий сброс |
| 21 | Комбинация профиля с mode, у которого `complete: true` (пресет `minimal`), — предупреждение в UI; секции в такой сессии движком отбрасываются. Детекция (доказано спайком): host-side `ctx.agentPresets.readDocument(id)` возвращает `{agentPreset, content (YAML-строка), name?, description?}`; парсим `content` с custom-тегом `!!js`, flatten-им список плагинов и ищем строку `@deepseek-ai/dsh-persona` с `config.complete === true`. `compositionInventory()` для этого НЕдостаточно — её строки не несут config |
| 22 | Локаль: en в v1, ru вторым этапом через `dsh-client-locale` |
| 23 | UI-название фичи: **Prompt profile** |
| 24 | Правки сохраняются автосейвом с дебаунсом; отдельной кнопки Save нет |
| 25 | Таб Preview показывает только наши секции в итоговом порядке с подстановкой `{{model}}`/`{{cwd}}`; built-ins — плейсхолдерами, пропущенные секции — пометкой и причиной |
| 26 | `scope` редактируется только в составе профиля; форма секции показывает read-only «используется в» со scope и профилями |
| 27 | «Профиль по умолчанию для новых сессий» — в табе Profiles под списком профилей |

---

## 3. Строки конфигурации

Наш бандл вставляет только главную строку:

```yaml
- insert:
    - id: prompt-profiles
      name: '@knopki/dsh-prompt-profiles'
```

Другой бандл вставляет свои единицы (по строке на единицу, id — на его совести):

```yaml
- insert:
    - id: prompt-section-light-tone
      name: '@knopki/dsh-prompt-profiles/section'
      config:
        id: light-tone
        title: Light tone
        body: |-
          Отвечай кратко, без преамбул и извинений.
          Не пересказывай задачу перед тем, как её делать.

    - id: prompt-profile-light
      name: '@knopki/dsh-prompt-profiles/profile'
      config:
        id: light
        title: Light
        sections:
          - { id: light-tone, order: 1050, scope: main-only }
```

Пользовательские строки, созданные из UI, наш writer добавляет тем же способом в
`~/.dsh/profiles/web/cordis.patch.yml` (профильный слой применяется после всех слоёв бандлов,
поэтому обновление бандла их не затирает).

Строки, пришедшие из бандлов, не переписываются: правка такой строки из UI даёт bare-override
(без `insert`) в профильном слое, «удаление» — `disabled: true` в том же слое.

---

## 4. Схемы Config

Schemastery. Поля, которые правит UI, обязаны быть `.volatile()` — иначе `ctx.settings` откажет
(`Config field "x" is not volatile`).

```js
// главная строка: prompt-profiles
const Config = z.object({
  default: z.string().default('').volatile(),
  lastByWorkspace: z.dict(z.string()).default({}).volatile(),
})

// ./section
const Config = z.object({
  id: z.string().required(),          // НЕ volatile: домен id меняется только батч-операцией rename
  title: z.string().required().volatile(),
  body: z.string().required().volatile(),
})

// ./profile
const SectionRef = z.object({
  id: z.string().required(),
  order: z.number().required(),
  scope: z.union([z.const('inherit'), z.const('main-only'), z.const('subagents-only')]).default('inherit'),
})
const Config = z.object({
  id: z.string().required(),
  title: z.string().required().volatile(),
  sections: z.array(SectionRef).default([]).volatile(),   // пишем массив целиком
})
```

Две оговорки по семантике записи:

- `unset` значения, унаследованного от нижнего слоя, восстанавливает значение этого нижнего слоя;
  ключ, пришедший из бандла, удалить нельзя — только переопределить;
- запись массива `sections` целиком замещает config строки как есть, поэтому refs, отданные
  бандлом и не попавшие в новый массив, исчезают — это ожидаемая семантика override, но её
  нужно явно показывать в UI редактора.

Все три плагина объявляют `ctx.inject(['settings'], (child) => child.effect(() =>
child.settings.configure({ auto: false }, ctx.fiber)))` — страницу рисуем сами.

Запись в массив/словарь идёт целиком (как `allowedModels` в `dsh-client-ui-settings-subagent`):
`{op:'set', path:['sections'], value:[...]}`. Скаляры — точечно: `{op:'set', path:['body'], value}`.

---

## 5. Хост

### 5.1 Сервис `ctx.promptProfiles`

Главный плагин отдаёт сервис-реестр:

```ts
interface PromptProfiles {
  registerSection(row: { rowId: string; config: SectionConfig; source: 'bundle'|'user' }): () => void
  registerProfile(row: { rowId: string; config: ProfileConfig; source: 'bundle'|'user' }): () => void
  sections(): SectionView[]      // с учётом disabled и коллизий config.id
  profiles(): ProfileView[]
  builtinOrders(): Record<string, number>   // mirror
}
```

Subpath-плагины `/section` и `/profile` тривиальны: объявляют `static inject = ['promptProfiles']`
и в `apply` регистрируют свой config, возвращая disposer через `ctx.effect`. Регистрация живёт,
пока живёт строка, поэтому `disabled: true` и удаление строки сами убирают секцию.

Коллизии:
- два ряда с одинаковым `config.id` → в лог варнинг с обоими rowId, побеждает зарегистрированный позже
  (детерминированно — по порядку монтирования, то есть по порядку патч-слоёв);
- ряд с `disabled: true` не монтируется вовсе (поведение лоадера), реестр его не видит.

### 5.2 Mirror порядков

При старте: распарсить `SECTION_ORDERS` из `lib/index.js` установленного `@deepseek-ai/dsh-system-prompt`
(резолв от каталога профиля; фолбэк — захардкоженная копия). Правило приоритета:
**успешно распарсенная таблица установленной версии — истина**; если она разошлась с копией, пишем
варнинг (копия устарела) и работаем на распарсенной. Копия используется только тогда, когда парсинг
не удался или пакет не найден. Mirror нужен только для UI и для защиты от коллизий; в рантайме он
не обязателен.

### 5.3 Разрешение профиля и запечатывание

Слушатель waterfall `system-prompt/assemble` — koa-style, глобальный (не scoped); unscoped-слушатель
получает и agent-scoped сборки, а `context.agent` для агентных сборок есть всегда:

```js
ctx.on('system-prompt/assemble', (assembly, context, next) => {
  const agent = context.agent        // всегда определён у агентной сборки
  const session = agent.session
  const snapshot = snapshots.get(session.id)   // storageDomain, таблица sessions
  if (!snapshot) {
    const workspace = workspaceRegistry.resolveByPath(session.header.cwd)
    const profileId = lastByWorkspace[workspace.id] ?? default ?? null
    snapshot = buildSnapshot(profileId, scopePredicate(agent))
    await snapshots.put(session.id, snapshot)  // дальше только чтение
  }
  if (snapshot.sections.length > 0) {
    // мутируем assembly.sections на месте, вставляя записи по вычисленному индексу
  }
  return next()
})
```

Ключевые факты API сборки (доказано спайком, `.spike/R1-R2-injection-and-patch.md`):

- секции сортируются ДО waterfall и после него не пересортируются; `renderPrompt` не сортирует;
- собранные секции не несут поля `order` — форма записи `{name, text, interpolate?}`;
- поэтому слушатель сам вычисляет индекс вставки: строит зеркало name→order по built-in именам,
  фактически присутствующим в `assembly.sections` (порядки built-in — из mirror `SECTION_ORDERS`,
  порядки наших секций — из профиля; при совпадении order с built-in якорем наша секция идёт
  после него, т.е. «+0.5»); built-in якорь, отсутствующий в сборке, пропускается;
- обработка `complete: true` выполняется ПОСЛЕ waterfall и схлопывает секции в единственную
  complete-секцию — поэтому секции профиля в таких режимах молча исчезают (уже решение 21).

Предикаты scope (доказано спайком, `.spike/R5-R7-subagent-complete.md`):

```js
const isSubagent = agent.session.header.origin === 'subagent'
const isFork     = agent.session.header.isSeeded === true
// inherit        → всегда
// main-only      → !isSubagent
// subagents-only → isSubagent && !isFork
```

Известный краевой случай: fork, взятый до того, как у родителя есть хоть один завершённый ход,
имеет пустой seed — `isSeeded` у него false, и он обрабатывается как обычный ребёнок. Для
бухгалтерии, если когда-нибудь понадобится, существует публичный серийный ивент `agent/created`
`{agent, source, signal?}`, но точкой инъекции остаётся waterfall.

### 5.4 Снапшоты

```js
const promptProfilesDomain = defineDomain({
  name: 'prompt_profiles',
  version: 1,
  invalidRecords: 'backup-and-skip',   // битая запись снапшота не должна блокировать открытие домена
  tables: {
    sessions: domainTable(z.object({
      profileId: z.string().nullable(),
      sections: z.array(z.object({
        id: z.string(), title: z.string(), order: z.number(), text: z.string(),
      })),
    })),
  },
})
```

Ключ — `sessionId`. Запись durable до resolve, чтение синхронное из памяти. Клиенту снапшот не
нужен, поэтому транспорт ему не делаем. Домен не чистится: стоимость — один небольшой JSON на сессию,
и он же обеспечивает воспроизводимость resume.

### 5.5 API для клиента

Готового типизированного remote у нас нет (Typert-генерация требует сборочного тулинга, которого в
дистрибутиве нет), поэтому — обычные same-origin роуты через `webServer` (как `deepseek-web-import`):

| Метод | Назначение |
|---|---|
| `GET /__dsh-prompt-profiles/state` | `{profiles, sections, builtinOrders, default, lastByWorkspace, revision}` |
| `POST /__dsh-prompt-profiles/section/create` | writer: `insert`-строка `.../section` |
| `POST /__dsh-prompt-profiles/section/update` | `ctx.settings.mutate(rowId, ops, revision)` |
| `POST /__dsh-prompt-profiles/section/delete` | своя строка → удалить; чужая → `disabled: true` |
| `POST /__dsh-prompt-profiles/section/rename` | батч: новая строка → ссылки в профилях → старая строка |
| `POST /__dsh-prompt-profiles/profile/create|update|delete` | то же для профилей |
| `POST /__dsh-prompt-profiles/default` | `ctx.settings.mutate('prompt-profiles', {default})` |
| `POST /__dsh-prompt-profiles/last` | `ctx.settings.mutate('prompt-profiles', {lastByWorkspace})` |

Все записи идут через один внутрипроцессный мьютекс: свои `insert`-записи (свой writer) и записи
через `configEditor` (он берёт file-lock сам) не должны перемешиваться.

### 5.6 Свой writer

`config-editor` умеет только переопределять существующие строки: bare-патч с неизвестным id
лоадер пропускает («patch: entry %C not found»), а `edit()` после записи сверяет собранный config и
откатывает файл. Поэтому создание/удаление строк — сами:

1. прочитать `ctx.configEditor.documentPath` через `yaml.parseDocument` с customTags для `!!js`
   (как делает сам config-editor), чтобы сохранить комментарии и выражения;
2. для создания — `document.add(document.createNode({ insert: [row] }))`;
   для удаления своей строки — найти и удалить соответствующий item;
   для disable чужой — добавить/обновить bare-строку `{id, name, disabled: true}`;
3. сериализовать и записать атомарно (temp + rename, режим `0o600`);
4. HMR сам увидит изменение профильного патча (`dsh-hmr` следит за `patchPath`) и пересоберёт композицию.

Перед батч-операциями (rename) — снимок файла в памяти и восстановление при ошибке на любом шаге.

---

## 6. Клиент

### 6.1 Чип

`conversation.input.left`, `kind: 'list'`, `id: 'prompt-profile'`, order 10. Регистрация (закрыто
спайком R8):

```js
ctx.slots.inject('conversation.input.left', () => ctx.slots.register(
  {
    name: 'conversation.input.left',
    id: 'prompt-profile',
    order: 10,
    inject: (sessionId) => ({ /* … */ }),
  },
  Chip,
))
```

Session-scope слот передаёт `sessionId` первым аргументом `inject`; компонент дополнительно получает
стандартный кит (`sessionId`, `useSession`, `useSessions`, `useWorkspaces`, `useProjection`).
Слот `conversation.input.left` рендерится ТОЛЬКО когда у сессии есть sessionId и input — на
hero-экране без открытой сессии чипа не будет вовсе. Сам компонент:

- пустая сессия (`session.blank === true`) — рисует кнопку-меню `[ profile: light ▾ ]`; иначе `null`;
- профилей нет вовсе — `null` (никакого пустого чипа);
- меню: `none`, отсортированные по title профили, разделитель, `Manage profiles…` → открывает Settings ▸ Prompt profiles;
- выбор пишет `last` (POST `/last`) и локально обновляет состояние; ошибка → `Toast`, как у mode-чипа.

Визуально — сосед штатных контролов `permission` и `plan`, стилистика через токены `--dsw-alias-*`
и примитивы `@deepseek-ai/dsh-client-ui-primitives`.

### 6.2 Редактор

`settings.section`, `id: 'prompt-profiles'`, order 25, label «Prompt profiles». Три таба — Profiles,
Sections, Preview. Внутри таба drill-down: список → форма; назад по `← back`, Esc или повторному
клику по активному табу. Автосейв с дебаунсом, кнопки Save нет.

**Profiles — список**

```
╭─ Profiles ─┬─ Sections ─┬─ Preview ─╮
│            ╰────────────┴───────────╯
│   light       2 секции                  ✎ ⧉ 🗑
│   review      3 секции                  ✎ ⧉ 🗑
│   [+ New profile]
│
│   Default for new sessions   [ light ▾ ]
```

**Profiles → состав профиля** (drill-down, `← back`)

```
╭─ Profiles ─┬─ Sections ─┬─ Preview ─╮
│ ← back     light                                   ✎ title   ⧉ 🗑
│ ────────────────────────────────────────────────────────────────────
│     0 │ persona-prefix                            built-in
│   500 │ plan:policy                               built-in
│ ⠿ 1050│ Light tone        scope [ main-only ▾ ]    ✎ ⤢ 🗑
│  1000 │ tool:bash                                 built-in
│ ⠿ 1400│ No preamble       scope [ inherit   ▾ ]    ✎ ⤢ 🗑
│  2800 │ tool:subagent                             built-in
│ 10200 │ persona-suffix                            built-in
│                                          [ + Add section ]
│
│ ⚠ В mode «minimal» профиль не сработает: пресет заменяет промпт целиком
```

**Sections — список**

```
╭─ Profiles ─┬─ Sections ─┬─ Preview ─╮
│ [ search… ]                              [ + New section ]
│ ────────────────────────────────────────────────────────────────────
│   Light tone           used in: light              source: user
│   No preamble          used in: light, review      source: user
│   Tone: reviewer       не используется             bundle: knopki-…
```

**Sections → форма секции** (drill-down, `← back`)

```
╭─ Profiles ─┬─ Sections ─┬─ Preview ─╮
│ ← back     Light tone                                  ✎ ⧉ 🗑
│ ────────────────────────────────────────────────────────────────────
│   Title  [ Light tone                                           ]
│
│   Body
│   ┌──────────────────────────────────────────────────────────────┐
│   │ Отвечай кратко, без преамбул.                                │
│   │ Не пересказывай задачу перед тем, как её делать.             │
│   └──────────────────────────────────────────────────────────────┘
│
│   Используется в:  light — scope: main-only
│                    review — scope: inherit
│   source: bundle knopki-dsh-customizations       (автосейв)
```

**Preview**

```
╭─ Profiles ─┬─ Sections ─┬─ Preview ─╮
│ Profile [ light ▾ ]
│ ────────────────────────────────────────────────────────────────────
│   ⟨built-in⟩  0 … 500     persona-prefix, plan:policy …
│
│   ── profile: light ───────────────────────────────────────────────
│   1050  Light tone
│         Отвечай кратко, без преамбул.
│         Не пересказывай задачу перед тем, как её делать.
│   1400  No preamble
│         Не начинай ответ с «Отличный вопрос».
│   ─────────────────────────────────────────────────────────────────
│
│   ⟨built-in⟩  1000 … 10200   tool:bash … persona-suffix
│   ⟨skipped⟩   Tone: reviewer — scope subagents-only, профиль не для субагента
│   ⟨skipped⟩   Broken thing — секция не найдена
```

Поведение:
- свои секции добавляются в профиль кнопкой `+ Add section` — пикер с поиском и мультивыбором;
- переупорядочивание — кнопками ↑↓ (`IconChevronUpOutlineMedium`/`IconChevronDownOutlineMedium`)
  плюс числовое поле, только внутри состава профиля (между табами тащить нельзя); order пересчитывается
  как середина между соседями, при перестановке крайних — шаг ±1 с перенормировкой; ручная правка
  числа — в поле по клику; HTML5 drag — опция, реализуемая вручную, не в v1 (sortable-примитива в
  `@deepseek-ai/dsh-client-ui-primitives` нет — закрыто спайком R6);
- коллизия с built-in подсвечивается и уходит в `+0.5`; пустое тело секции не эмитится;
- в outline показывается весь справочник built-ins из mirror (часть может отсутствовать в конкретном mode);
- `scope` правится только здесь, в составе профиля; форма секции показывает «используется в» read-only;
- предупреждение complete-mode строится host-side: `ctx.agentPresets.readDocument(id)` →
  `{agentPreset, content (YAML-строка), name?, description?}` → парс `content` с custom-тегом `!!js` →
  flatten списка плагинов → строка `@deepseek-ai/dsh-persona` с `config.complete === true`;
  `compositionInventory()` НЕдостаточна — её строки не несут config;
- Preview показывает только наши секции в итоговом порядке с подстановкой `{{model}}`/`{{cwd}}`,
  built-ins — плейсхолдерами, пропущенные секции — с причиной.

### 6.3 Сборка

Клиентская половина — руками написанный `lib/client.js` с обёрткой
`window.__ModuleLoader__.load({ id, factory })` (сборочного тулинга в дистрибутиве нет;
прецедент — `deepseek-web-import`). React берётся через `require('react')` из baseline module table.

---

## 7. Деградация

| Ситуация | Поведение |
|---|---|
| `lastByWorkspace` указывает на удалённый профиль | тихий сброс на `default`, затем на «ничего» |
| профиль ссылается на отсутствующую секцию | секция пропускается, варнинг в лог и в UI-редактор |
| профиль ссылается на `disabled`-секцию | то же |
| пустое/пробельное тело секции | не эмитится |
| два ряда с одинаковым `config.id` | варнинг, побеждает зарегистрированный позже |
| битый YAML профильного патча | ломается загрузка профиля (цена выбора config как хранилища); writer всегда валидирует запись и держит бэкап на время батч-операций |
| mirror не распарсился | варнинг, работа на захардкоженной копии |
| `ctx.settings` недоступен (не web-профиль) | пикер и редактор не монтируются; рантайм-разрешение профиля продолжает работать |

---

## 8. Структура пакета

```
~/.dsh/bundles/dsh-prompt-profiles/
├── package.json          # dsh.bundle.patch + dsh.client + exports "./section" "./profile" "./client"
├── cordis.patch.yml      # insert только главной строки
├── lib/
│   ├── index.js          # главный плагин: сервис, mirror, слушатель, storageDomain, webServer-роуты, writer
│   ├── section.js        # subpath: регистрация секции
│   ├── profile.js        # subpath: регистрация профиля
│   ├── builtin-orders.js # захардкоженная копия SECTION_ORDERS (фолбэк)
│   ├── writer.js         # insert/remove/disable строк в профильном патче
│   └── client.js         # чип + страница редактора
└── locale/{en,ru}.json   # ru — вторым этапом
```

`package.json` (эскиз):

```json
{
  "name": "@knopki/dsh-prompt-profiles",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./lib/index.js",
    "./section": "./lib/section.js",
    "./profile": "./lib/profile.js",
    "./client": "./lib/client.js"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": ["@deepseek-ai/dsh-api-remotes", "@deepseek-ai/dsh-client-ui-settings", "@deepseek-ai/dsh-client-ui-conversation"]
    }
  },
  "dependencies": { "yaml": "^2" },
  "peerDependencies": { "@deepseek-ai/cordis": "~4.0.4" }
}
```

---

## 9. Риски и спайк

| Риск | Статус | Результат |
|---|---|---|
| R1 | ✅ закрыт спайком | мутация `assembly.sections` из слушателя реально попадает в промпт; сортировка — до waterfall, пересортировки после нет (`.spike/R1-R2-injection-and-patch.md`) |
| R2 | ✅ закрыт спайком | `insert:`-строка writer'а монтируется, HMR подхватывает, реестр видит секцию (`.spike/R1-R2-injection-and-patch.md`) |
| R3 | ✅ закрыт спайком | `ctx.settings.mutate` принимает запись в volatile-словарь и в volatile-массив; caveat — массив пишется целиком (`.spike/R3-R4-settings-and-storage.md`) |
| R4 | ✅ закрыт спайком | снапшот в `storageDomain` переживает resume и воспроизводит тот же промпт (`.spike/R3-R4-settings-and-storage.md`) |
| R5 | ✅ закрыт спайком | `isSubagent = origin === 'subagent'`, `isFork = isSeeded === true`; `subagents-only` остаётся в v1 (`.spike/R5-R7-subagent-complete.md`) |
| R6 | ✅ закрыт спайком | sortable-примитива нет; выбран вариант ↑↓ + числовое поле (`.spike/R6-R8-client-slots.md`) |
| R7 | ✅ закрыт спайком | признак `complete: true` извлекается через `ctx.agentPresets.readDocument(id)` + парс YAML `content` (`.spike/R5-R7-subagent-complete.md`) |
| R8 | ✅ закрыт спайком | слот рендерится только при наличии sessionId и input; session-scope inject получает `sessionId` первым аргументом + стандартный кит (`.spike/R6-R8-client-slots.md`) |

---

## 10. Вне объёма v1

- русская локаль (второй этап);
- импорт/экспорт наборов секций и профилей;
- переключатель интерполяции `{{...}}` на секцию (интерполяция включена, как у built-in);
- теги/условия применения секций, привязка к инструментам и моделям;
- переопределение built-in секций профилем;
- инструменты агента для управления профилями (всё через UI и файлы);
- per-section иконки и цвета профилей.
