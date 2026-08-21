# FRIEND-REQUEST: VN-POL & STUDIO-LADDER — Полировка + WireK Preview + Cosmo Presets

> **Статус:** `lane: ready`  
> **Дата:** 17 августа 2026  
> **Авторы:** Boss (Bro 40% + Flash 60%)  
> **Профиль:** `secops-lab-pure` (Default Коробка) & `cosmo-custom`

---

## 1. Проблема и Ценность

После закрытия VNEXT остались две честные дыры до канона:

**1. Секреты утекают plaintext (P0 Security).** `downloadManifest`, `exportResults` и `storage/draft` писали пароли/токены как есть — без редкации. Это дыра безопасности при любом экспорте или сохранении черновика.

**2. WireK Preview в Studio.** В Studio не было переключателя PrettyK ↔ WireK — оператор не видел машинный формат шагов. Для отладки и верификации это критично.

**3. Cosmo Ladder Presets.** Для интеграции в портал Cosmo (ЦБ) нужен был селектор приложений/окружений в тулбаре Studio — каскад App → Build → Deploy.

---

## 2. Реализованный скоуп (As-Built)

### VN-POL (Polish + Security):

| ID | Компонент | Файлы | Что сделано |
|---|---|---|---|
| **VN-POL-F1** | Redact Secrets | `cosmo/src/form/redactSecrets.ts` | `isSecretFieldKey`, `redactManifestSecrets`, `redactSecretsForDraft`, `redactSecretAssignmentLines`, `tryRedactSecretAssignmentAt`, `redactManifestForPreview`. Константы `REDACT_PLACEHOLDER`/`DRAFT_SECRET_PLACEHOLDER`. |
| **VN-POL-F2** | Подключение redact | `manifestIO.ts`, `exportResults.ts`, `storage/draft.ts` | `downloadManifest` → `redactManifestSecrets`; `exportResults` → `redactManifestSecrets`; `saveStudioDraft` → `redactSecretsForDraft`. |
| **VN-POL-F3** | Blank Letterhead | `cosmo/src/results/blankLetterhead.ts` | `defaultBlankOrg` + `manifestContentHash` (FNV-1a). Врезан в подвал `BlankPanel.blankHtml`. |
| **VN-POL-R1** | WireK Preview | `cosmo/src/studio/studioWorkspaceWirePreview.ts` | `buildWirePreviewText()`: ресурс → `''`, фаззер → `JSON.stringify`, коннектор → `JSON.stringify`, иначе `prettyToWire(text)` → `redactWireSecretLines`. |
| **VN-POL-R2** | Переключатель PrettyK ↔ WireK | `cosmo/src/studio/StudioModeSegmented.tsx`, `StudioWirekPreviewPane.tsx`, `StudioWorkspace.tsx` | Ant Design `Segmented` в тулбаре Monaco-табов. WireK preview — read-only `<pre>` под редактором (display-only, не мутирует `formData`). |

### STUDIO-LADDER (Cosmo Integration):

| ID | Компонент | Файлы | Что сделано |
|---|---|---|---|
| **STUDIO-LADDER-1** | Preset Bar | `cosmo/src/studio/StudioPresetBar.tsx` | Селектор приложений/окружений из `cosmoportLadderMock.ts`, текущий deploy URL, статус. Встроен в тулбар Studio. |

### Flash (60%):
- VN-POL-F1, F2, F3 — Redact Secrets, подключение, Blank Letterhead.
- VN-POL-R2 — переключатель PrettyK ↔ WireK (StudioModeSegmented, StudioWirekPreviewPane, StudioWorkspace).
- STUDIO-LADDER-1 — Preset Bar (StudioPresetBar).

### Bro (40%):
- VN-POL-R1 — WireK Preview движок (`buildWirePreviewText`, `redactWireSecretLines`).
- Тесты: `studioWorkspaceWirePreview.test.ts`, `redactSecrets.test.ts`.
- `tsc --noEmit`, `npm run build`.

---

## 3. Верификация и Тесты

- **Всего тестов:** **23 passed** (vitest).
- `redactSecrets.test.ts` — 9 тестов (password/token/api_key → `***`, draft → `''`, `Секрет $x = …` → маска).
- `studioWorkspaceWirePreview.test.ts` — 5 тестов (ресурс/фаззер/коннектор/сценарий → wirek, секреты маскированы).
- `StudioModeSegmented.test.tsx` — 2 теста.
- `StudioWirekPreviewPane.test.tsx` — 2 теста.
- `StudioPresetBar.test.tsx` — 2 теста.
- `BlankPanel.test.tsx` — 3 теста (FNV-1a хеш, letterhead).
- `tsc --noEmit` — 0 ошибок.
- `npm run build` — зелёный.

---

## 4. Стены и ограничения

- **Redact Secrets** — чистая логика, без RJSF/`schema`/`formData`. `exportManifestPayload` legacy не тащили (flatten не нужен).
- **WireK preview** — display-only, не мутирует state. Вкладки ресурсов/фаззеров — без переключателя.
- **Preset Bar** — использует `cosmoportLadderMock.ts` (заглушка для интеграции Cosmo, не коробочный функционал).
- `docs/manifest.json` не менялся.
- Стили: тёмная тема, скругления 5–6px, JetBrains Mono для WireK preview.