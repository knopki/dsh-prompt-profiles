# dsh-prompt-profiles — SPEC

Статус: описывает текущую реализацию (коммит `82b7ca2`). Целевая версия DSH — `0.1.7-rc.2`.
Пакет: `@knopki/dsh-prompt-profiles`, каталог `~/.dsh/bundles/dsh-prompt-profiles`.

---

## 0. Назначение

Независимая от agent preset (mode) ось: именованные **профили системного промпта**. Один и тот же
mode может работать в разных профилях — меняются персона, стиль и инструкции, но состав
инструментов и композиция агента остаются теми же.

Профиль выбирается при создании сессии, запечатывается в системный промпт и в этой сессии больше
не меняется. Если профиль не выбран — системный промпт не модифицируется вообще.

Секция — отдельный markdown-фрагмент, профиль — именованный упорядоченный набор ссылок на секции.
Секции и профили приходят либо из чужих бандлов (composition rows этого пакета), либо создаются
пользователем из UI.

---

## 1. Термины

| Термин | Значение |
|---|---|
| **section** | именованный markdown-фрагмент; отдельная loader-строка со своим id |
| **profile** | именованный упорядоченный набор ссылок на секции; отдельная loader-строка |
| **built-in section** | секция, которую регистрирует сам DSH (`tool:bash`, `plan:policy`, `deployment:persona-prefix`, …) |
| **mirror** | таблица `SECTION_ORDERS`, полученная парсингом установленного `@deepseek-ai/dsh-system-prompt`; фолбэк — замороженная копия |
| **sealed snapshot** | зафиксированный при старте сессии набор `{profileId, sections[]}` с готовым текстом |
| **profile patch** | `cordis.patch.yml` профиля (`configEditor.documentPath`): строки секций/профилей и их overrides |
| **patch id** | неквалифицированный id строки в профильном патче (`prompt-section-<token>`) — то, чем адресуются записи |
| **row id** | id loader-записи в реестре (`<parent>:prompt-section-<token>`); реестр ключует по `ctx.fiber.entry.id` |

---

## 2. Слои и раскладка кода

```
src/
├── shared/                     # контракт, общий для обеих половин
│   ├── remote-contract.ts      # METHOD_SPECS + buildRemoteDescriptors(face)
│   └── wire-schemas.ts         # строгие zod-кодеки входов/результатов + WIRE_FIELDS
├── host/
│   ├── domain/                 # чистые правила: model, ids, ordering, refs, errors
│   ├── application/            # use cases: state, preview, sections, profiles, assembler, payloads, env, ports
│   ├── infra/                  # адаптеры: patch-writer, settings, workspace, snapshots, loader-registry, builtin-orders
│   └── entrypoints/            # драйверы: plugin.ts, remote.ts, section.ts, profile.ts
└── client/                     # web-половина: index.ts, transport.ts, remote.ts, chip.tsx, settings-*.tsx, ui.tsx, flows.ts, helpers.ts, i18n.ts
```

Правила принадлежности:

| Слой | Что там | Чего там быть не должно |
|---|---|---|
| `shared/` | форма провода и таблица методов, из которой строятся дескрипторы обеих половин | доступ к сервисам, I/O, логика use case |
| `host/domain/` | типы и чистые функции: формы id, порядок и правила пропуска, разрешение ссылок, ошибки | Cordis, fs, zod (единственная внешняя зависимость — `node:crypto` для токена) |
| `host/application/` | use cases и их порты: одна реализация каждой операции, запечатывание, терпимый разбор payload | прямые обращения к `ctx`, `node:fs`, конкретным сервисам |
| `host/infra/` | реализации портов: патч-файл, `ctx.settings`, workspace registry, storage domain, mirror, in-memory реестр, общий write lock | бизнес-правила и валидация payload |
| `host/entrypoints/` | Cordis-драйвер (`plugin.ts`), Remote-поверхность (`remote.ts`), composition rows `./section` и `./profile` | правила и адаптеры напрямую |
| `client/` | Cordis-плагин клиента, монтирование Remote, UI-компоненты, i18n | прямые HTTP-вызовы и вторая транспортная реализация |

Направление зависимостей: `entrypoints → application → domain`; `infra` реализует интерфейсы из
`application/ports.ts`; `domain` не импортирует ничего, кроме собственных модулей и `node:crypto`.

Сборка: TypeScript 7, `build.mjs` (esbuild для `lib/index.js`, `lib/client.js`, `lib/section.js`,
`lib/profile.js`, `lib/remote.js` + `tsc` для `lib/types/**`). `lib/` коммитится, поэтому установка
не требует сборки. Линтер/форматтер — Biome. `pnpm run check` = `typecheck && lint && test &&
test:client && test:remote && build`.

---

## 3. Remote-контракт

### 3.1 Идентичность

| Константа | Значение |
|---|---|
| `TYPERT_PACKAGE` | `@knopki/dsh-prompt-profiles` |
| `REMOTE_NAMESPACE` | `promptProfiles` (wire-имя; вызовы идут на `promptProfiles/<method>`) |
| `REMOTE_SERVICE_KEY` | `promptProfilesRemote` (ключ делегирующего Cordis-сервиса на хосте) |

Хост-половина регистрируется через `ctx.typert.register({ package, face: 'host', schemas: [],
invocations })` в Cordis-эффекте; клиентская — через `await ctx.remote.$mount({ package, descriptors })`.
Обе половины строят дескрипторы одной функцией `buildRemoteDescriptors(face)` из
`src/shared/remote-contract.ts`, различается только `sourceLocation.file`.

### 3.2 Таблица методов — единственный источник истины

`METHOD_SPECS` (`src/shared/remote-contract.ts`) — единственное место, где перечислены методы; из
неё строятся дескрипторы обеих половин, а строгие схемы берутся из `src/shared/wire-schemas.ts`.
Из той же таблицы `WIRE_FIELDS` терпимый бизнес-разбор (`application/payloads.ts`) выводит поля
своих схем, поэтому провод и бизнес-правила не могут разойтись.

| Метод | Вход (строгий кодек) | Результат |
|---|---|---|
| `state` | `{sessionId?, cwd?, workspaceId?}` (подсказки принимаются и игнорируются — состояние глобальное) | `{profiles, sections, builtinOrders, modes, default, lastByWorkspace, revision}` |
| `preview` | `{profileId, cwd?}` | `{profileId, title, sections, skipped, variables}` |
| `sectionCreate` | `{id?, title?, body?}` | `{rowId, patchId, configId, title, body, emits}` |
| `sectionUpdate` | `{rowId, value: {title, body}, revision?}` | `{rowId, patchId, emits}` |
| `sectionDelete` | `{rowId}` | `{disabled}` |
| `sectionRename` | `{rowId, id}` | `{rowId, patchId, id, affectedProfiles: [{profileId, title}]}` |
| `profileCreate` | `{id?, title?, sections?}` | `{rowId, patchId, configId, title, sections}` |
| `profileUpdate` | `{rowId, value: {title, sections?}, revision?}` | `{rowId, patchId}` |
| `profileDelete` | `{rowId, revision?}` | `{disabled}` |
| `last` | `{workspaceId?, cwd?, profileId, revision?}` (нужен хотя бы один ключ воркспейса) | `{ok: true}` |
| `defaultSet` | `{profileId, revision?}` (`profileId: ""` — «никакой») | `{ok: true}` |

### 3.3 Дескриптор метода

Каждый дескриптор — рукописный, без генератора:

```ts
{
  id: "@knopki/dsh-prompt-profiles#promptProfiles/<method>",
  service: "promptProfilesRemote",
  namespace: "promptProfiles",
  method: "<method>",
  invocation: { kind: "direct" },
  parameters: [{
    name: "input", wire: "input", source: "json",
    codec: { mode: "strict", typeSymbol: "@knopki/dsh-prompt-profiles#<Method>Input", create: <memoized zod factory> },
  }],
  result: { mode: "strict", typeSymbol: "@knopki/dsh-prompt-profiles#<Method>Result", create: <memoized zod factory> },
  sourceLocation: { file: "src/host/remote.ts" | "src/client/remote.ts", line: <committed data>, column: 1 },
}
```

`line` и `file` — закоммиченные данные, а не живые позиции: они не меняются при рефакторингах.
`service` обязан совпадать с `serviceKey` сервиса, поэтому Remote-поверхность живёт на отдельном
сервисе `promptProfilesRemote` (ключ `promptProfiles` занят сервисом-реестром) и делегирует вызовы
общему набору операций.

### 3.4 Провод

Запрос — `POST /api/promptProfiles/<method>` с телом:

```json
{ "type": "client-request", "rpcId": "<id>", "method": "promptProfiles/<method>",
  "payload": { "args": { "input": { } } } }
```

Ответ:

```json
{ "type": "server-response", "rpcId": "<id>",
  "result": { "ok": true, "value": { } } }
{ "type": "server-response", "rpcId": "<id>",
  "result": { "ok": false, "error": { "code": "…", "message": "…", "details": { } } } }
```

Аргумент всегда объект: вызов без `input` отвергается контрактом (`missing "input"`). Транспорт и
доверие принадлежат платформе (Connection/gateway), плагин не реализует ни auth, ни CSRF: fence по
доверенным Host/Origin и подписанная браузерная кука применяются до нашего обработчика
(неаутентифицированный POST → 401).

### 3.5 Строгая валидация

- Вход каждого метода — `z.strictObject`: неизвестное поле, отсутствующее обязательное или неверный
  тип отвергаются на границе gateway до выполнения операции (код ошибки
  `gateway/input-invalid`). Исключение — «открытые» строчные view-типы (`jsonRow`) в результатах,
  которые намеренно допускают любые поля.
- Хост дополнительно разбирает payload терпимо (`application/payloads.ts`: `z.object` + бизнес-refine
  «не пустая строка»), чтобы строки из старых клиентов и чужих слоёв не ломались, а пустые
  обязательные поля отвергались до записи.
- Результат операции проверяется дважды: рекурсивным guard'ом «plain JSON» (без классов, функций,
  циклов и не-конечных чисел) и строгой result-схемой. Нарушение — `InternalError`, то есть видимый
  отказ вызова, а не тихий успех.
- Операции `last` и `defaultSet` возвращают `undefined`; хост нормализует это в `{ok: true}`.

### 3.6 Ошибки

Бизнес-ошибки — доменные объекты (`InvalidInputError`, `NotFoundError`, `ConflictError`,
`UnavailableError`), они бросаются операциями и попадают в `error.message` конверта как есть.
Клиент (`src/client/remote.ts`) разворачивает конверт: `{ok: true, value}` → `value`,
`{ok: false, error}` → `RemoteCallError` с `code` и `message`, а существующие UI-пути (`notify`,
inline-ошибка, `runSave`) читают `err.message`. HTTP-статус через конверт не проходит, поэтому
классификатор конфликта (`isRemoteConflict`) опирается на два детерминированных текста:
`configuration changed since read` и `configuration kept changing`.

---

## 4. Доменные правила

### 4.1 Идентификаторы

- Полная форма id: `prompt-section-<token>` / `prompt-profile-<token>`; `token` соответствует
  `^[a-z0-9][a-z0-9-]*$`. Генерируемый токен — 8 hex-символов из `crypto.randomUUID`.
- Принимаются также bare-токен (`<token>`) и квалифицированная форма (`include:prompt-section-<x>`);
  нормализация — `toPatchId` (последний сегмент после `:`) и `normalizeNewRowId`.
- Инвариант: у строки, созданной этим бандлом, `config.id` РАВЕН полному row id
  (`prompt-section-<token>`) и `patchId` в ответе. Старые строки с короткими slug-`config.id` не
  переписываются; lookup (`findRow`, `sectionRefTargets`) продолжает их поддерживать наряду с новыми.
- Ссылка в профиле хранится всегда как зарегистрированный `config.id`. Разрешение ссылки принимает
  config.id, его квалифицированную/нормализованную row-id форму и bare-токен полного config.id;
  строка, которую HMR ещё не зарегистрировал, принимается только если она уже есть в профильном
  патче (`pending`) как наша собственная, не disabled и с `config`.

### 4.2 Порядок

- `order` — свойство ссылки в профиле, а не секции; он используется ровно как задан: без смещения и
  нормализации. Одинаковые order допустимы.
- Порядок детерминирован сортировкой по `(order, позиция в профиле)` (стабильная сортировка).
- Вставка в уже отсортированный `assembly.sections`: сборка не несёт `order`, поэтому якорем служит
  только built-in **имя**, реально присутствующее в сборке, с порядком из mirror. Секция вставляется
  после последней built-in со строго меньшим order; при равенстве с присутствующей built-in — перед
  ней. Чужое имя или отсутствующий якорь не участвуют, при отсутствии якоря вставка идёт в начало.
- Вставка идёт с конца к началу (base-индексы), поэтому порядок не сдвигается и `interpolate: false`
  гарантирует, что движок не интерполирует уже запечатанный текст повторно.

### 4.3 Scope

`scope ∈ {inherit, main-only, subagents-only}`, по умолчанию `inherit`.

```js
isSubagent = agent.session.header.origin === 'subagent'
isFork     = isSubagent && agent.session.header.isSeeded === true
// inherit        → всегда
// main-only      → !isSubagent
// subagents-only → isSubagent && !isFork
```

Scope проверяется ДО существования секции и её disabled-состояния, поэтому причина пропуска
совпадает с той, что дал бы рантайм. Значение вне словаря не коэрцируется и даёт пропуск с причиной
`unknown scope "<value>"`.

### 4.4 Пропуск ссылок (деградация)

Единый предикат `sectionSkipReason` возвращает причину или `null`:

| Причина | Условие |
|---|---|
| `scope main-only in a subagent` | `main-only` в субагенте |
| `scope subagents-only outside a plain subagent` | `subagents-only` не в обычном (не fork) ребёнке |
| `unknown scope "<value>"` | scope вне словаря |
| `section not found` | `config.id` не зарегистрирован (в т.ч. переименованная секция) |
| `section disabled` | строка отключена |
| `empty body` | тело пустое/пробельное |
| `empty after interpolation` | после подстановки не осталось текста |
| `interpolation failed: …` | strict-интерполяция при запечатывании не прошла |

Пропуск никогда не фатален: он попадает в лог и (для Preview/редактора) в UI.

### 4.5 Коллизии реестра

Два ряда с одинаковым `config.id` дают варнинг с обоими rowId; побеждает зарегистрированный позже
(детерминированно — по порядку монтирования патч-слоёв). Реестр хранит стек регистраций на каждый
`(kind, config.id)`: снятие верхней возвращает следующую живую, поэтому HMR-выгрузка
overriding-строки не роняет id из промптов. Строка с `disabled: true` не монтируется вовсе.

---

## 5. Запечатывание и storage unit

Слушатель waterfall `system-prompt/assemble` (unscoped) на первой сборке сессии:

1. строит упорядоченные кандидаты ключей воркспейса (см. §6);
2. выбирает профиль (`resolveProfileId`): первый ПРИСУТСТВУЮЩИЙ кандидат решает; `""` — явное «нет»
   и оно бьёт default; валидный id выбирается; присутствующий, но устаревший id даёт default и
   `reset: true`; default применяется только если ни одного кандидата нет;
3. строит снапшот: фильтрует scope, отсутствующие/disabled/пустые секции, подставляет переменные
   сборки strict-интерполяцией (текст фиксируется) — не поддавшиеся подстановке секции
   пропускаются с варнингом, а не пишутся в снапшот;
4. пишет снапшот durable-first и вставляет секции в `assembly.sections`.

Хранилище — storage domain платформы:

```ts
defineDomain({
  name: "prompt_profiles",
  version: 1,
  invalidRecords: "backup-and-skip",
  tables: {
    sessions: domainTable(zod.object({
      profileId: zod.string().nullable(),
      sections: zod.array(zod.object({ id: zod.string(), title: zod.string(), order: zod.number(), text: zod.string() })),
    })),
  },
})
```

Файл — `$DSH_HOME/storages/prompt_profiles.json`, ключ — `sessionId`. Внутри процесса решение
принимается ровно один раз: уже сохранённая запись (в том числе пустая) финальна; если хранилище
недоступно на первой сборке, решение пинится в памяти, пишется на следующей сборке, а неудачное
открытие домена не кэшируется. Схемы записей — zod (протокол storage domain), Schemastery
зарезервирован под `Config` строк. Домен не чистится: один небольшой JSON на сессию и
воспроизводимость resume.

---

## 6. Ключи воркспейса

`resolveWorkspaceKeys` строит упорядоченный список без дублей:

1. членство сессии в воркспейсе по реестру (`workspaceRegistry.list()` + `sessionIds`);
2. `await workspaceRegistry.resolveByPath(cwd)` — канонический id, владеющий cwd;
3. сырой `cwd`;
4. явный `workspaceId`.

Если ничего не выводится — `[""]` (пустая сессия всё равно имеет ключ).

Почему сосуществуют UUID- и path-ключи: исторически `/last` писался под cwd (и писать под cwd
приходится, когда сессия ещё не приписана воркспейсу и реестр не даёт id). Новые записи идут под
ПЕРВЫМ кандидатом, а чтение (`resolveProfileId`) обходит весь список, поэтому выбор, сохранённый
под UUID, и выбор, сохранённый под path, оба достигают промпта без миграции. Домохозяйство при
`last` снимает только доказуемо мёртвые ключи: значения, не совпадающие ни с одним профилем
(кроме `""`), и ключи формы workspace-UUID, которых реестр не знает; path-ключи не удаляются только
из-за отсутствия в реестре. Pruning отправляется лишь при доступной ревизии настроек (CAS), иначе
пропускается — свой ключ выбора пишется всегда.

---

## 7. Путь записи

Все мутации этого бандла сериализуются одним модульным мьютексом (`writeLock`), поверх которого
ставится опциональный host-гейт `dsh-hmr runExclusive` (`setWriteGate`), если сервис есть; гейт
не реентрантный, поэтому ничего, что само берёт hmr-эксклюзивность (`settings.mutate`,
`configEditor.edit`), внутрь не запускается.

| Что | Как |
|---|---|
| Создание строки секции/профиля | writer: `insert:`-запись `{id, name, config}` в профильный патч; дубликат полного id отвергается |
| Удаление своей строки | writer: физическое удаление `insert`-записи |
| Удаление чужой (bundle) строки | writer: bare-override `{id, name, disabled: true}` |
| Правка существующей строки (title/body, title/sections) | `ctx.settings.replace(rowId, volatileFields, revision)` — volatile-поля целиком, `id` не трогается (он не volatile) |
| `default` главной строки | `ctx.settings.mutate("prompt-profiles", [{op:'set', path:['default'], value}], revision)` |
| `lastByWorkspace` | per-key ops `set`/`unset` по `['lastByWorkspace', key]` через `mutate`, с CAS-retry (до 5 попыток) |
| Rename секции | один writer-коммит: вставить новую строку, удалить или disable старую; профили не читаются и не пишутся |

Writer парсит/сериализует патч тем же `!!js`-диалектом, что config-editor, пишет атомарно
(temp + rename, режим `0o600`), держит бэкап и откат на время батча. Удаление профиля сначала
удаляет строку (авторитетная операция), затем best-effort чистит `default`/`lastByWorkspace`;
неудача чистки не превращает успешное удаление в ошибку — устаревший id всё равно безопасно
сбрасывается резолвером.

---

## 8. Клиент

Клиентский плагин (`src/client/index.ts`) объявляет `inject: ["slots", "locale", "remote"]`,
регистрирует три словаря (`ctx.locale.register("promptProfiles", messages)`), монтирует Remote в
Cordis-эффекте (`mountRemote`) и регистрирует две поверхности.

### 8.1 Чип (`conversation.input.left`)

`id: "prompt-profile"`, order 10. Рендерится только на пустой сессии (`session.blank === true`) и
только если профили есть; иначе `null`. Меню — `none` плюс профили по алфавиту; пункта
«Manage profiles…» нет (проверенного API навигации в Settings у стороннего плагина нет). Выбор
пишется через `last` ровно с одним ключом воркспейса (workspaceId, иначе cwd); если ключа нет
вовсе, выбор блокируется с объяснением, а не отправляется заведомо провальный запрос. Три
состояния совпадают с хостовым `resolveProfileId`: ключ отсутствует → default, ключ есть и `""` →
явное «нет», ключ есть и валиден → этот профиль. Всплеск мутаций настроек схлопывается в один
debounce-перечит `/state` (150 мс). В `complete`-mode триггер помечается предупреждением и
приглушается.

### 8.2 Страница настроек (`settings.section`)

`id: "prompt-profiles"`, order 25, label `nav`. Три таба — Profiles / Sections / Preview; внутри
таба drill-down (список → форма), назад по `← back`, Esc (только вне полей ввода и открытых
диалогов/меню) или повторному клику по активному табу. URL/deep-link состояния нет.

- **Profiles**: список профилей, «Default for new sessions», состав профиля как outline с
  built-in'ами из mirror (read-only, серые), `+ Add section` — пикер с поиском и мультивыбором;
  порядок задаётся числовым полем и drag&drop, клавиатурный путь — стрелки вверх/вниз на ручке.
- **Sections**: поиск, `used in`, `source`, форма секции (title + body, «используется в»
  read-only, scope не здесь). Переименование id из UI меняет только секцию; ответ
  `affectedProfiles` показывается списком профилей, которые надо поправить вручную. У
  bundle-строки id менять нельзя — действие заблокировано с причиной.
- **Preview**: иллюстративный предпросмотр — свои секции в итоговом порядке, built-in'ы
  плейсхолдерами, пропущенные с причиной; подставляется только `{{cwd}}`, остальные переменные
  остаются литералами и перечисляются в `variables` (`null` = неизвестно). Реальные значения
  подставляются при старте сессии, поэтому текст предпросмотра может отличаться.
- Autosave с дебаунсом ~1200 мс, кнопки Save нет; уход из формы (blur/back/смена таба) и unmount
  досылают отложенную правку. Пустой title не пишется. Все мутации идут через `runSave`: при
  конфликте ревизии состояние перечитывается и запись повторяется один раз, затем ошибка становится
  уведомлением и inline-строкой.

### 8.3 Транспорт клиента

`mountRemote` (`src/client/transport.ts`): в эффекте `ctx.remote.$mount(clientContribution)`, затем
`ctx.inject(["remote", "remote.promptProfiles"], scope => …)` — namespace-сервис не достижим «голым»
доступом. До завершения монтирования все методы отдают `remoteUnavailable`; провал монтирования
логируется громко и остаётся в силе, второй транспорт не подставляется. Записи адресуют
неквалифицированный `patchId` в поле `rowId`; `setDefault("")` означает «нет»; `last` ключуется
ровно одним из `workspaceId`/`cwd`.

### 8.4 Локализация

Словари `en`, `ru`, `zh` лежат в `src/client/i18n.ts` и регистрируются одним bundle'ом
`ctx.locale.register("promptProfiles", messages)`. `en` — эталон набора ключей: тип
`Record<MessageKey, string>` делает расхождение ключей ошибкой компиляции, паритет дополнительно
проверяется тестом (`test/client/i18n.spec.ts`). До привязки сервиса `boundT` отвечает по `en`.

---

## 9. Строки конфигурации

Бандл вставляет только главную строку:

```yaml
- insert:
    - id: prompt-profiles
      name: '@knopki/dsh-prompt-profiles'
```

Другой бандл вставляет свои единицы (по строке на единицу):

```yaml
- insert:
    - id: prompt-section-light-tone
      name: '@knopki/dsh-prompt-profiles/section'
      config:
        id: prompt-section-light-tone
        title: Light tone
        body: |-
          Отвечай кратко, без преамбул и извинений.
    - id: prompt-profile-light
      name: '@knopki/dsh-prompt-profiles/profile'
      config:
        id: prompt-profile-light
        title: Light
        sections:
          - { id: prompt-section-light-tone, order: 1050, scope: main-only }
```

`Config` строк (Schemastery); поля, которые правит UI, обязаны быть `.volatile()`, иначе
`ctx.settings` откажет:

```js
// prompt-profiles
z.object({ default: z.string().default('').volatile(), lastByWorkspace: z.dict(z.string()).default({}).volatile() })

// ./section  — id НЕ volatile: он меняется только батч-операцией rename
z.object({ id: z.string().required(), title: z.string().required().volatile(), body: z.string().required().volatile() })

// ./profile  — id НЕ volatile; order и scope принадлежат ссылке
z.object({
  id: z.string().required(),
  title: z.string().required().volatile(),
  sections: z.array(z.object({
    id: z.string().required(),
    order: z.number().required(),
    scope: z.union([z.const('inherit'), z.const('main-only'), z.const('subagents-only')]).default('inherit'),
  })).default([]).volatile(),
})
```

Все три плагина объявляют `ctx.inject(['settings'], child => child.effect(() =>
child.settings.configure({ auto: false }, ctx.fiber)))` — страница рисуется вручную.
Запись массива `sections` целиком замещает config строки как есть, поэтому refs, отданные нижним
слоем и не попавшие в новый массив, исчезают — это ожидаемая семантика override.

---

## 10. Известные ограничения

- **Один процесс DSH.** Внутрипроцессный мьютекс и опциональный hmr-гейт сериализуют записи только
  этого процесса; кросс-процессной блокировки профильного патча нет. Параллельная правка того же
  `cordis.patch.yml` вторым процессом DSH может перезаписать строки или выбор.
- **Одноразовое окно запечатывания.** Сессия, начавшаяся до появления записи снапшота (плагин
  поставлен позже, хранилище было недоступно), запечатывается на первой сборке, при которой плагин
  смонтирован; чтобы получить профиль в такой сессии, нужна новая сессия. Решение, зафиксированное
  в памяти при недоступном хранилище, не пересматривается в этом процессе, но если процесс
  завершится до записи, следующий процесс примет решение заново.
- **HMR-лаг реестра.** После удаления строки из патча лоадер ещё какое-то время держит её в
  композиции. `last`/`defaultSet` проверяют профиль по АВТОРИТЕТНОМУ патчу (не по реестру) внутри
  залоченной мутации, но `state`/`preview` могут короткое время показывать удалённую строку; в этом
  же окне ссылка на только что созданную секцию принимается через `pending`-набор.
- **Семантика предупреждения о complete-mode.** Предупреждение строится по ОБЪЯВЛЕННОЙ композиции
  пресета (`agentPresets.readDocument` → YAML с `!!js` → рекурсивный поиск строки
  `@deepseek-ai/dsh-persona` с `config.complete === true`), а не по смонтированному дереву:
  `compositionInventory()` не несёт config, а override config дочернего плагина внутри пресета в
  пометке не виден. Обработка `complete` выполняется ПОСЛЕ waterfall и схлопывает сборку, поэтому
  секции профиля в таком режиме молча исчезают; предупреждение лишь объясняет это заранее.
- **Размер клиентского бандла.** `lib/client.js` — 139 289 B: строгие кодеки собраны на
  `zod/mini` (сабпас пакета `zod`), в клиентский артефакт бандлится только mini-часть
  (42 358 B по метафайлу, classic-входов нет); в browser module table нет bare `zod`.
  Хост-парсеры (`payloads.ts`, `plugin.ts`) остаются на полном zod — на размер клиента
  это не влияет.
- **Классификация конфликтов по тексту.** Конверт не несёт HTTP-статус, поэтому `isRemoteConflict`
  узнаёт устаревшую ревизию по двум фиксированным сообщениям хоста. Новый текст конфликта сломает
  автоповтор.
- **Pruning требует ревизии.** Домохозяйство `lastByWorkspace` (снятие мёртвых ключей) выполняется
  только при доступной ревизии настроек; без CAS оно пропускается, а свой ключ пишется всегда.
- **Ошибки хоста по-английски.** Сообщения операций английские и показываются как есть;
  локализуется только префикс (`loadError`/`saveError`).
- **Mirror — фолбэк-копия.** Если установленный `@deepseek-ai/dsh-system-prompt` не распарсился,
  используется замороженная копия таблицы `0.1.7-rc.1` и пишется варнинг; неизвестные ключи
  распарсенной таблицы репортятся `unmappedBuiltinKeys`.
- **Подсказки `state` игнорируются.** `sessionId`/`cwd`/`workspaceId` в `state` приняты контрактом,
  но операция глобальна и их не использует.

---

## 11. Вне объёма

- генератор Typert (дескрипторы рукописные, чтобы бандл ставился независимо);
- совместимость с rc.1;
- публикация в npm (цель — установка из git с закоммиченным `lib/`);
- импорт/экспорт наборов секций и профилей;
- переключатель интерполяции на секцию (интерполяция включена, как у built-in);
- теги/условия применения секций, привязка к инструментам и моделям;
- переопределение built-in секций профилем;
- инструменты агента для управления профилями (всё через UI и файлы);
- per-section иконки и цвета профилей.
