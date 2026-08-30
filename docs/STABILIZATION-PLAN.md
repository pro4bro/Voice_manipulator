# Stabilization Plan — STT, Timing, Diarization, Runtime

Tài liệu thi công cho đợt sửa ổn định. Viết để một agent khác (Codex) có thể
implement mà không cần đọc lại toàn bộ lịch sử điều tra.

Nhánh làm việc: `fix/w1-runtime-and-index-performance` (đã tạo từ `main` tại `e180f91`).

## Cách dùng file này

File này là **cái gì và tại sao**. `docs/STABILIZATION-LOG.md` là **đang ở đâu**:
nó giữ con trỏ round hiện tại, báo cáo từng round, và feedback của chủ dự án.

Mỗi mục kỹ thuật có: **Triệu chứng → Nguyên nhân đã xác minh → Việc phải làm →
Tiêu chí nghiệm thu**. Số trong phần "Baseline" là số đo thật trên
`data/projects/pdca-cldndd-k4` (3 asset, 125,048 từ). Dùng chính số đó để so sánh
sau khi sửa.

## Quy trình làm việc (BẮT BUỘC ĐỌC TRƯỚC KHI CODE)

Mỗi lần được gọi, agent thi công làm đúng sáu bước sau, không hơn:

1. Đọc `docs/STABILIZATION-LOG.md`. Tìm round đang đánh dấu `NEXT`.
2. Nếu round trước có mục `### Feedback` chưa xử lý, **xử lý feedback đó trước**,
   rồi mới sang round `NEXT`.
3. Làm **đúng phạm vi round đó**. Không làm sang round sau, kể cả khi thấy dễ.
   Phạm vi hẹp là để chủ dự án review được từng lớp một.
4. Chạy phần "Agent tự kiểm" của round. Ghi lại **output thật**, không viết lại
   từ trí nhớ.
5. Append báo cáo vào cuối `STABILIZATION-LOG.md` theo đúng template ở cuối file
   đó. Chuyển con trỏ `NEXT` sang round kế tiếp trong bảng trạng thái.
6. **Dừng lại.** Không tự động chạy tiếp round sau.

Quy tắc trung thực, quan trọng hơn mọi thứ khác:

- **Không được hạ ngưỡng nghiệm thu để cho nó pass.** Nếu không đạt ngưỡng, ghi
  con số thật đo được vào báo cáo, giải thích tại sao, và đề xuất hướng. Một round
  báo "chưa đạt, đây là số thật" có giá trị hơn một round báo "đạt" mà sai.
- **Không sửa test cũ cho pass.** Nếu một test cũ buộc phải đổi, ghi rõ test nào,
  đổi gì, và tại sao đổi đó là đúng chứ không phải né lỗi.
- Nếu phát hiện kế hoạch này sai ở đâu, ghi vào báo cáo thay vì âm thầm làm khác.

Ràng buộc kỹ thuật, không được vi phạm:

- Không sửa `engines/OmniVoice`. Chỉ đi qua adapter.
- Mọi đường dẫn lưu trong project phải relative so với thư mục chứa `project.json`
  (`docs/PORTABILITY.md`).
- Không đánh dấu processor là thành công khi chưa có artifact thật (`AGENTS.md`).
- Gate mọi round: `npm test`, `npm run build`,
  `.venv\Scripts\python.exe -m pytest services\api\tests -q`.

## Bảng round

Chi tiết kỹ thuật của mỗi round nằm ở mục W tương ứng bên dưới.

| Round | Phạm vi | Vùng file | Vì sao ở vị trí này |
| --- | --- | --- | --- |
| R0 | W0 runtime lifecycle | `scripts/`, controller | Xong rồi. Chờ chủ dự án nghiệm thu tay. |
| **R1** | W1.1 + W1.2 + W1.5a | `file_media_library`, queue diarization, `server.py` | Nền móng, rủi ro cao nhất, chặn mọi round sau |
| R2 | W2 timing trust theo từ | `word_timing_quality`, `Timeline.tsx`, `server.py` | Fix người dùng thấy rõ nhất |
| R3 | W1.3 + W1.4 frontend | `WorkspaceShell.tsx`, `Timeline.tsx`, `ScriptEditor.tsx` | Sau R2 vì cùng đụng `Timeline.tsx` |
| R4 | W1.5b + W1.5c sidecar | `server.py`, `media_import_processor` | Sau R2 vì cùng đụng `server.py` |
| R5 | W3 probe | `.scratch/` | Chỉ ra báo cáo đo, chưa viết adapter |
| R6 | W3 tích hợp | ports + adapter mới | **Có điều kiện**: chỉ làm nếu R5 đạt ngưỡng |
| R7 | W4 diarization | `server.py`, queue diarization | Sau R1 vì cùng đụng file queue |

### Vì sao R1 gộp ba việc

W1.1 và W1.2 cùng viết lại `file_media_library.py`; tách ra chỉ tốn thêm một vòng
đọc hiểu cùng một file. W1.5a (`audioop`) nằm ở service khác hẳn
(`services/stt_studio`), không chồng lấn gì, dài khoảng 20 dòng, và cắt ~166 giây
thời gian chết trên mỗi lần STT file 2.7 giờ. Gộp vào R1 để có thắng lợi sớm mà
không làm rối bề mặt review — đi thành **ba commit riêng**.

### Vì sao R2 đứng trước R3/R4

R2 đụng vào cả bốn file mà R3/R4 cũng sửa (`Timeline.tsx`, `server.py`,
`main.py`, đường ghi của media library). Chạy song song là conflict chắc chắn.
R2 đi trước vì nó là round trả lại giá trị người dùng thấy được ngay: 91,136 từ
đang bị ẩn khỏi Timeline sẽ hiện lại.

---

# W0 — Runtime lifecycle (ĐÃ LÀM XONG)

## Triệu chứng

"Đôi khi phải khởi động lại máy thì mới thấy các sửa đổi được áp dụng." Ba nút
`Turn on all` / `Restart all` / `Turn off all` không thực sự tắt hết tiến trình.

## Nguyên nhân đã xác minh

Chụp process thật lúc điều tra:

```
41624  powershell.exe   pro4bro-console.ps1 start      <- cửa sổ CMD
 └ 48740 .venv python.exe  →  50600  runtime_controller  (port 18119)
DEAD 63228 (pro4bro-workloads.ps1, đã thoát)
 ├ 41876 .venv python.exe  →  24208  -m app              (port 18120)  MỒ CÔI
 └ 31016 .venv python.exe  →  53932  studio_app.server   (port 18081)  MỒ CÔI
```

Bốn lỗi độc lập:

1. **Venv stub.** `.venv\Scripts\python.exe` trên Windows là launcher stub, nó
   exec lại interpreter gốc. Process *listen* trên port là **cháu**, không phải
   con. `Stop-ExpectedPort` cũ chỉ kill process listen → stub còn sống.
2. **Không có process-tree ownership.** API và Studio được `Start-Process` từ một
   PowerShell trung gian đã thoát. Chúng không phải con của cửa sổ CMD. Đóng cửa
   sổ bằng nút X → khối `finally` của PowerShell **không chạy** → cả 6 process
   sống sót, giữ port.
3. **Restart race.** `Stop-Workloads` gọi `Stop-Process -Force` rồi return ngay,
   không chờ. `Start-Workloads` đọc trạng thái ngay sau đó:
   - port còn Listen + process còn resolve → `overall = "running"` → **return, không start gì cả**;
   - port còn Listen + process đã chết → `overall = "blocked"` → **throw** "port is occupied".
4. **Không rebuild frontend.** `Restart all` chỉ sync `studio_app` và restart
   API/Studio. `apps/web/dist` chỉ được build bởi `setup-pro4bro.ps1`, và chỉ khi
   `dist/index.html` không tồn tại. Sửa React → không bao giờ thấy.

Phụ: `index.html` được serve không có `cache-control`, trình duyệt giữ bản cũ.

## Đã làm

### `scripts/pro4bro-process-tree.ps1` (file mới)

Helper dùng chung, dot-source vào cả console lẫn workloads script.

- `Get-Pro4BroDescendantIds` — BFS trên một snapshot `Win32_Process` duy nhất.
- `Stop-Pro4BroTree` — kill con trước, cha sau, rồi **chờ thật** đến khi process
  biến mất (timeout 20s).
- `Wait-Pro4BroPortFree` — poll đến khi không còn entry Listen.
- `Stop-Pro4BroPort` — resolve listener → verify command line → **leo lên cha nếu
  cha cũng khớp pattern** (bắt được venv stub) → kill cả cây → chờ port free.
- `Get-Pro4BroRootAlias` — workspace nằm trên ổ mạng ánh xạ. Cùng một project có
  thể được khởi chạy qua `V:\...` hoặc `\\192.168.100.102\hub\...`, và process ghi
  nhớ đúng cách viết lúc khởi chạy. Hàm này resolve **cả hai** dạng qua
  `Win32_LogicalDisk.ProviderName`. Thiếu bước này thì orphan sweep bỏ sót.
- `Remove-Pro4BroOrphan` — quét mọi python process có command line chứa một trong
  các root alias **và** khớp pattern module, rồi kill cả cây. Đây là đường phục
  hồi khi cửa sổ bị đóng bằng nút X.

Pattern nhận dạng (`$script:Pro4BroModulePatterns`):

```
controller  (?i)-m\s+app\.runtime_controller(\s|$)
api         (?i)-m\s+app(\s|$)
studio      (?i)-m\s+studio_app\.server(\s|$)
```

Lưu ý `api` không khớp nhầm controller vì sau `app` là dấu `.`, không phải `\s|$`.

### `scripts/pro4bro-console.ps1`

- **Job Object `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.** `Enable-ProcessTreeOwnership`
  tạo job qua P/Invoke (`Add-Type`) rồi gán *chính process PowerShell này* vào job.
  Job membership được kế thừa, nên controller → workloads script → API/Studio →
  FFmpeg/model worker đều tự động thành member. Handle job chỉ do PowerShell này
  giữ; PowerShell chết bằng bất kỳ cách nào (Ctrl+C, nút X, taskkill, crash) →
  handle đóng → Windows kill toàn bộ member. **Đây là câu trả lời cho yêu cầu
  "gom hết tiến trình vào CMD để tự tắt hoàn toàn."**
- **Trình duyệt không bị kill theo.** Nếu mở bằng `Start-Process $url` thì browser
  có thể trở thành con của PowerShell và bị job giết cùng. Đã đổi sang
  `Open-Workspace` dùng `explorer.exe <url>`: explorer chuyển yêu cầu cho shell
  đang chạy rồi thoát, browser là con của explorer chính, nằm ngoài job.
- **Chiếm lại stack cũ.** Nếu port 18119 đã có controller từ phiên trước, controller
  đó **không** nằm trong job của cửa sổ mới. Nay sẽ dừng nó và thay bằng cái mới,
  thay vì tái sử dụng (tái sử dụng chính là lý do code cũ vẫn chạy).
- **Owner record.** Ghi `data/runtime/pro4bro-console.json` chứa `consolePid`.
  Khối `finally` chỉ teardown khi file vẫn ghi tên mình (`Test-ConsoleOwnership`).
  Nhờ vậy một cửa sổ bị thay thế không tắt stack mà cửa sổ kế nhiệm vừa dựng lên.
- **Vòng chờ theo process, không theo port.** `while (-not $controllerProcess.HasExited)`.
  Vòng chờ theo port trước đây khiến cửa sổ cũ hiểu nhầm controller mới là của mình.
- **Lệnh `restart` mới.** Full-stack restart (kể cả controller). Nhánh này chạy
  *trước* khi tạo job nên cửa sổ mới độc lập với cửa sổ cũ.

### `scripts/pro4bro-workloads.ps1`

- Dùng helper mới cho toàn bộ stop/wait.
- `Start-Workloads`: mọi trạng thái khác `stopped` đều dọn trước, rồi **bắt buộc
  chờ cả 18081 và 18120 free** mới start. Xoá hẳn restart race.
- `Test-WebBundleStale` + `Invoke-WebBuild`: so LastWriteTime mới nhất trong
  `apps/web/src`, `index.html`, `vite.config.ts`, `package.json`, `tsconfig*.json`
  với `apps/web/dist/index.html`. Nếu source mới hơn → `npm run build` trước khi
  start. **`Restart all` từ menu Windows nay áp dụng được thay đổi React.**
  Có `-SkipWebBuild` để bỏ qua.
- Sau khi stop theo port, gọi thêm `Remove-Pro4BroOrphan` cho `api`+`studio`.

### `scripts/restart-pro4bro.ps1`

Mặc định nay là **full-stack restart** (qua console). Thêm `-WorkloadsOnly` cho
hành vi cũ. Lý do: restart chỉ API+Studio không bao giờ nạp được thay đổi trong
`runtime_controller.py` — chính là process phục vụ UI.

### `services/api/app/runtime_controller.py` và `services/api/app/main.py`

`index.html` trả về kèm `cache-control: no-store, must-revalidate`. Vite đánh
fingerprint mọi file trong `/assets` nên chúng vẫn cache vĩnh viễn; `index.html`
là file duy nhất có tên cố định giữa các build, và cache nó chính là lý do bundle
mới vẫn hiển thị app cũ.

## Tiêu chí nghiệm thu W0

Chạy tay, từng bước:

1. `start-pro4bro.bat` → cửa sổ in "This window owns every Pro4Bro process."
2. Đóng cửa sổ bằng **nút X**. Sau đó chạy:
   ```bash
   powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Select ProcessId,CommandLine"
   ```
   → **không còn** process nào của Pro4Bro. (Trước khi sửa: còn 6.)
3. Sửa một chuỗi hiển thị bất kỳ trong `apps/web/src`, mở app, menu Windows →
   `Restart all` → cửa sổ log in "Rebuilding bundle", refresh trình duyệt thấy
   thay đổi. Không cần reboot, không cần `npm run build` tay.
4. `Restart all` 5 lần liên tiếp → lần nào cũng về `running`, không lần nào báo
   "port is occupied".
5. Sửa `runtime_controller.py` → `start-pro4bro.bat restart` → thay đổi được nạp.

Ghi kết quả vào `docs/SESSION_HANDOFF.md`.

---

# W1 — Storage, polling, lãng phí sidecar

## Baseline đã đo

```
project pdca-cldndd-k4 · 3 asset · 125,048 từ · index.json = 31.3 MB

media.list()      1.46 – 1.95 s   (mỗi lần gọi)
media.get()       1.72 s          (vì get() gọi list())
  json.loads          0.636 s
  pydantic validate   0.131 s
  reconcile timing    0.508 s
  serialize khi ghi   0.517 s

Một phiên ngắn (data/logs/pro4bro-api.out.log):
  GET .../media/transcription-status   1,213 request   (poll 150 ms)
  GET /api/system/status                 758 request   (poll 1400 ms)

_is_near_silent()   3.97 s cho file 236 s  →  ~166 s cho file 9,881 s
analysis.wav        474 – 631 MB mỗi file (24 kHz mono)
```

Hệ quả nặng nhất: `set_diarization_state(..., progress=)` gọi `list()` + `_write()`
≈ **2.1 s**, trong khi `StudioDiarizationGateway` phát progress mỗi **0.2 s**. Hàng
đợi tick dồn vô hạn và giữ `threading.RLock` toàn cục → API đứng hình khi diarize.

## 1.1 — `MediaIndexStore` (FILE ĐÃ VIẾT SẴN, CẦN WIRE VÀO)

File `services/api/app/adapters/media_index_store.py` **đã tồn tại trên nhánh này,
đã smoke-test, nhưng chưa được dùng ở đâu.** Việc của Codex là wire nó vào
`FileMediaLibrary`, không phải viết lại.

Thiết kế:

- `assets/media/index.json` giữ metadata, **không giữ `words`**.
- `assets/media/<asset-id>/words.json` giữ mảng word timing của riêng asset đó.
- Cache trong RAM, invalidate bằng `(st_mtime_ns, st_size)`.
- Ghi atomic qua file `.tmp` rồi `replace`.
- **Migration tự động**: `_parse_index` phát hiện index cũ còn nhúng `words`, tách
  ra file riêng và ghi lại index. Chạy một lần, không cần script migration.

Kết quả đo trên chính dữ liệu pdca:

```
migration (1 lần)          1.071 s   31.3 MB → 3.05 MB
đọc index lạnh             0.026 s   (từ 1.5–2.0 s)
đọc index nóng            0.0002 s
đọc words 1 asset lạnh  0.086–0.150 s
đọc words 1 asset nóng  0.011–0.016 s
dữ liệu word sau migration: giống hệt bản gốc (đã assert)
```

### Việc phải làm

Viết lại `services/api/app/adapters/file_media_library.py`:

1. `__init__` nhận thêm `MediaIndexStore` (tạo mặc định nếu không truyền).
2. Thay `RLock` **toàn cục** bằng lock **theo project**:
   `self._locks: dict[str, threading.RLock]`, lấy qua một helper có
   `defaultdict`-style. Lý do: hiện mọi project và mọi endpoint tuần tự hoá lên
   cùng một lock.
3. `list(project_id, *, include_words: bool = True)`:
   - đọc index qua store (rẻ);
   - chuẩn hoá path + `url` như `_normalize_asset` hiện tại, **bỏ phần
     `reconcile_word_timing_quality`** khỏi đường đọc;
   - nếu `include_words` thì attach words từ store cho từng asset;
   - sort theo `created_at` giảm dần (giữ nguyên hành vi).
4. `get(project_id, asset_id)` **không được gọi `list()`**. Đọc index, tìm đúng
   asset, attach words của riêng nó.
5. Gom toàn bộ các hàm mutation về một helper duy nhất:

   ```python
   def _update_asset(
       self,
       project_id: str,
       asset_id: str,
       updates: dict,
       *,
       event: str | None = None,
       details: dict | None = None,
       words: list[dict] | None = None,   # None = không đụng tới words.json
   ) -> ProjectMediaAsset:
   ```

   Helper này: đọc index (không attach words) → `model_copy(update=...)` →
   `store.write_index(...)` → nếu `words is not None` thì `store.write_words(...)`
   → append activity → trả về asset đã attach words.

   Hiện `set_diarization_state`, `set_transcription_state`, `_set_boolean`,
   `update_annotations`, `update_timeline_edits`, `update_local_cache`,
   `apply_diarization`, `update_diarization_assignments` lặp lại gần như y hệt
   nhau; gom lại vừa nhanh vừa giảm bề mặt lỗi.
6. `reconcile_word_timing_quality` chỉ chạy ở **đường ghi** (`apply_transcription`,
   `update_script` khi có `words`, `apply_diarization`) và kết quả được persist.
   Migration trong `MediaIndexStore` không chạy reconcile; thêm một lần reconcile
   một lần duy nhất ngay sau migration nếu asset chưa có `timingSource`.
7. `remove()` gọi `store.remove_words(...)` và `store.forget(project_id)`.

### Tiêu chí nghiệm thu 1.1

- `pytest services/api/tests -q` — 57 test hiện có phải pass **không sửa test**
  (trừ khi test đọc trực tiếp `index.json`; nếu có, cập nhật test và ghi rõ lý do).
- Thêm test mới trong `services/api/tests/test_project_media_library.py`:
  - index cũ có `words` nhúng → sau lần `list()` đầu, `index.json` không còn
    `words` và `words.json` chứa đúng dữ liệu cũ;
  - `get()` trả về words đầy đủ;
  - `set_transcription_state` không làm thay đổi `words.json` (so mtime);
  - project di chuyển sang thư mục khác vẫn đọc được (portability).
- Benchmark: `media.list()` trên pdca < **0.15 s** (từ 1.5–2.0 s).

## 1.2 — Diarization progress không được chạm index

`SequentialDiarizationQueue._process` gọi `report()` → `set_diarization_state(...)`
mỗi 0.2 s, mỗi lần ghi lại toàn bộ index + một dòng `activity/events.jsonl`.

STT đã làm đúng rồi — copy đúng khuôn đó:

1. Trong `FileMediaLibrary`, thêm `_diarization_progress_path(project_id, asset_id)`
   → `<project>/jobs/diarization/<asset-id>.json`, cùng cặp
   `_write_diarization_progress_snapshot` / `set_diarization_progress` /
   `diarization_progresses(project_id)` — sao chép nguyên mẫu từ ba hàm STT tương ứng
   (`_write_transcription_progress_snapshot`, `set_transcription_progress`,
   `transcription_progresses`).
2. `set_diarization_state` chỉ được gọi ở các **chuyển trạng thái** (queued,
   processing, complete, error, requires-setup), **không** gọi cho progress.
3. `SequentialDiarizationQueue._process`: `report()` gọi `set_diarization_progress`.
4. **Không append activity cho progress.** Chỉ append khi đổi state.
5. Thêm route trong `services/api/app/main.py`, đặt cạnh route STT tương ứng:
   ```
   GET /api/projects/{project_id}/media/diarization-status
       -> list[MediaDiarizationProgress]
   ```
   Model `MediaDiarizationProgress` đã có sẵn trong `domain/models.py`.

**Bug riêng cần sửa cùng lúc:** `_process` chụp `asset = self.media.get(...)`
*trước* khi chạy job, rồi cuối job gọi
`assign_spans_to_words(asset.words, spans)` với snapshot cũ đó. Mọi chỉnh sửa
Script trong lúc diarize bị ghi đè mất. Phải **đọc lại words ngay trước khi merge**:

```python
spans = await self.studio.diarize(...)
current = self.media.get(task.project_id, task.asset_id)   # đọc lại
self.media.apply_diarization(
    task.project_id, task.asset_id, assign_spans_to_words(current.words, spans)
)
```

### Tiêu chí nghiệm thu 1.2

- Diarize một asset của pdca: API vẫn trả `GET /api/health` < 100 ms trong suốt job.
- `activity/events.jsonl` tăng ≤ 3 dòng cho một job diarization (trước: hàng trăm).
- `jobs/diarization/<asset>.json` tồn tại và cập nhật trong khi chạy.
- Sửa Script trong lúc diarize → sửa đổi không bị mất khi job xong.

## 1.3 — Frontend: bỏ poll nóng, bỏ teardown khi gõ phím

File `apps/web/src/app/WorkspaceShell.tsx`.

1. **Chu kỳ poll.** `window.setInterval(refreshStatus, 150)` → **900 ms**. Progress
   bar không cần 7 fps. `api.getSystemStatus()` 1400 ms → **3000 ms**.
2. **Dependency array.** Effect polling hiện có `selectedAssetId, scriptDirty,
   liveTranscriptActive` trong deps. Mỗi lần gõ phím đầu tiên (`scriptDirty`
   false→true) là teardown + `cancelled = true`, vứt bỏ request `refreshFullMedia`
   đang bay — đúng cửa sổ khiến "STT xong mà Script không lên". Sửa: đưa ba giá trị
   này vào `useRef` (cập nhật trong body render như `mediaAssetsRef` đang làm) và
   **chỉ để `[project.id, hasBackgroundTranscription]` trong deps.**
3. **Poll diarization.** Effect `hasBackgroundDiarization` đang gọi
   `api.listProjectMedia()` mỗi 800 ms — payload lớn nhất trong app. Đổi sang
   endpoint mới ở 1.2 (thêm `api.listProjectMediaDiarizationStatus` vào
   `apps/web/src/api/client.ts`), và chỉ gọi `listProjectMedia` một lần khi có
   asset chuyển sang `complete` — đúng khuôn `hasTerminalTransition` mà STT đã dùng.

### Tiêu chí nghiệm thu 1.3

- Một phiên 2 phút có STT chạy: số request `transcription-status` trong
  `data/logs/pro4bro-api.out.log` giảm còn khoảng 1/6 so với baseline 1,213.
- Gõ liên tục vào Script trong lúc STT chạy → khi STT xong, transcript vẫn vào
  Script. Test hiện có `WorkspaceShell.test.tsx` phải vẫn pass; thêm một test mới
  bật `scriptDirty` giữa lúc chờ để khoá lại hồi quy này.
- `data/logs/pro4bro-controller.err.log` không phát sinh thêm `ClientDisconnect`
  (baseline: 46).

## 1.4 — Frontend: hot path của Timeline và Script

`apps/web/src/modules/timeline/Timeline.tsx`:

1. Dòng ~274: `const lastWordEnd = words.length ? Math.max(...words.map(w => w.end)) : 0;`
   chạy **mỗi lần render** với mảng hàng chục nghìn phần tử — và `Math.max(...arr)`
   với 47k đối số còn có nguy cơ tràn stack. Bọc `useMemo(..., [words])`, và dùng
   vòng `for` thay vì spread.
2. `wordTrackIndexes` (dòng ~321): nhánh `if (displayWords.length <= 1400) return
   displayWords.map((_, i) => i);` render **toàn bộ** word box và tính lại mỗi lần
   `activeWordIndex` đổi (~12 lần/giây khi phát). **Bỏ hẳn nhánh này**, luôn
   virtualize theo viewport.
3. Tách `activeWordIndex` ra khỏi deps của `wordTrackIndexes`. Nó chỉ dùng để bảo
   đảm từ đang phát nằm trong danh sách; xử lý riêng bằng cách hợp nhất ở nơi
   render thay vì cho vào memo.

`apps/web/src/modules/script/ScriptEditor.tsx`:

4. Dòng 128: `const wordRanges = useMemo(() => scriptWordRanges(value, words), [value, words]);`
   `scriptWordRanges` tokenize toàn bộ văn bản rồi dò khớp từng từ với lookahead
   420 token — chạy **mỗi keystroke**. Debounce `value` khoảng **250 ms** bằng một
   state phụ (`deferredValue`) rồi memo theo `deferredValue`. Cân nhắc `useDeferredValue`
   của React 18 nếu đã dùng React 18.
5. `scriptSegments(value, wordRanges).map(...)` đang được gọi **trực tiếp trong
   JSX**, dựng lại hàng nghìn `<span>` mỗi render (kể cả khi chỉ `activeWordIndex`
   đổi). Đưa ra `useMemo`, và tách phần tô sáng từ đang phát ra khỏi việc dựng
   segment (dùng class trên container + selector con, hoặc tách component có `memo`).
6. `NATIVE_PLAYBACK_TEXT_LIMIT = 3800` là ngưỡng thoát hiểm. Sau khi có 4 và 5,
   hạ xuống mức mà đo được vẫn mượt (đề xuất bắt đầu từ 1200 rồi đo lại).

### Tiêu chí nghiệm thu 1.4

Đo bằng Chrome DevTools Performance trên asset 665 từ và asset 33,912 từ:

- Gõ trong Script: không frame nào > 50 ms.
- Phát audio: không frame nào > 16 ms trong 10 giây liên tục.
- `npm test` pass, `npm run build` pass.

## 1.5 — Sidecar STT: ba khoản lãng phí

File `services/stt_studio/studio_app/server.py`.

1. **`_is_near_silent` lặp từng sample bằng Python thuần.** Đo thật: 3.97 s cho
   file 236 s, suy ra ~166 s cho file 2.7 giờ — chạy **trước** khi ASR bắt đầu,
   progress đứng ở 4% suốt thời gian đó. Thay bằng `audioop`:

   ```python
   import audioop
   peak = 0
   sum_squares = 0.0
   sample_count = 0
   while data := input_file.readframes(24000 * 8):
       peak = max(peak, audioop.max(data, 2))
       block_rms = audioop.rms(data, 2)
       block_samples = len(data) // 2
       sum_squares += (block_rms ** 2) * block_samples
       sample_count += block_samples
   rms = math.sqrt(sum_squares / sample_count) if sample_count else 0.0
   ```

   Giữ nguyên ngưỡng `peak <= 104 and rms <= 52` để không đổi hành vi.
   Lưu ý `audioop` deprecated ở Python 3.13; runtime hiện là 3.11 nên vẫn dùng
   được, nhưng ghi một TODO trỏ sang `numpy` (đã có sẵn trong runtime venv) cho
   lần nâng Python.

2. **Upload file 600 MB qua HTTP tới sidecar cùng máy.** `_upload_studio_audio`
   gửi multipart, `import_audio` ghi ra `TemporaryDirectory`, rồi faster-whisper
   mới decode. Thêm một đường vào nhận **đường dẫn tuyệt đối local**:
   - `POST /api/audio/import` nhận thêm field `source_path` (tuỳ chọn); khi có thì
     bỏ qua `file`.
   - Sidecar phải **kiểm tra path** nằm trong thư mục được cho phép
     (`PRO4BRO_DATA_ROOT`) trước khi mở, và chỉ chấp nhận khi request đến từ
     `127.0.0.1`.
   - `MediaImportProcessor._upload_studio_audio` ưu tiên `source_path`, fallback
     multipart nếu sidecar trả 400/422 (giữ tương thích ngược).

3. **Decode hai lần.** `_fine_speech_spans` gọi `decode_audio()` giải mã lại toàn
   bộ file ở 16 kHz float32 (~632 MB RAM cho file 2.7 giờ) ngay sau khi
   faster-whisper vừa decode xong. Decode **một lần** ở đầu `_transcribe`, truyền
   buffer cho cả `model.transcribe` và `_fine_speech_spans`.
   `faster_whisper.WhisperModel.transcribe` nhận được `np.ndarray` thay cho path.

### Tiêu chí nghiệm thu 1.5

- File 2.7 giờ: thời gian từ lúc nhận request đến khi progress vượt 16% giảm từ
  ~170 s xuống < 10 s.
- RSS đỉnh của process sidecar khi xử lý file 2.7 giờ giảm ít nhất 500 MB.
- Text transcript của sample 236 s **không đổi** so với trước (so sánh
  `assets/media/<id>/stt/transcript.stt.json`).

---

# W2 — Tin cậy timestamp theo từ

## Triệu chứng

"STT chạy xong lại không xuất hiện trên module Script" — thực chất text có, nhưng
Timeline ẩn hết word box và không export được SRT.

## Nguyên nhân đã xác minh

`services/api/app/adapters/word_timing_quality.py` → `inspect_word_timings` đánh
giá ở **cấp asset**. Vài từ lỗi là cả file bị gắn `needs-alignment`. Timeline
(`timingIsTrusted = take?.wordTimingQuality === "source"`) ẩn **toàn bộ** word box,
và `main.py` chặn export SRT.

Dữ liệu thật:

```
asset-bd55873fc707   43,417 từ → needs-alignment vì   8 từ kéo dài (0.018%)
asset-bf35963dedac   47,719 từ → needs-alignment vì  13 từ chồng + 24 từ kéo dài (0.078%)
→ 91,136 từ có timing tốt đang bị ẩn khỏi Timeline
```

## Việc phải làm

1. `inspect_word_timings` gắn cờ **trên từng từ**: thêm key `timingTrusted: bool`
   vào mỗi word dict. Từ bị coi là không tin cậy khi: `end <= start`, nằm ngoài
   `[0, duration]`, chồng lên từ trước quá 3 ms, span < 0.025 s, hoặc span >
   `max(8.0, median * 16)`.
2. `word_timing_quality` cấp asset trở thành **tóm tắt**, không còn là công tắc:
   - `source` khi 100% từ trusted;
   - `partial` (giá trị mới) khi ≥ 1 từ không trusted nhưng < 5% tổng số;
   - `needs-alignment` khi ≥ 5% hoặc không có từ nào hợp lệ.
   Cập nhật `WordTimingQuality` trong `domain/models.py` và type tương ứng trong
   `apps/web/src/domain/types.ts`.
3. `Timeline.tsx`: `timingIsTrusted` thành `wordTimingQuality !== "needs-alignment"`,
   và word box của từ có `timingTrusted === false` render với class cảnh báo
   (`.timeline-word--untrusted`) thay vì bị ẩn.
4. `main.py` export SRT: chỉ chặn khi `needs-alignment`. Với `partial`, cho export
   và **bỏ qua** đúng những dòng chứa từ untrusted, kèm header comment ghi số dòng
   đã bỏ.
5. `_refine_word_boundaries` trong sidecar khi **không** áp dụng được phải ghi rõ
   vào `word_timing_note` (hiện đang im lặng giữ nguyên DTW).

## Nguyên nhân thứ hai: bước refine gần như không chạy

`WORD_GROUP_GAP_SECONDS = 0.52` quá lớn cho tiếng Việt nói liên tục:

```
sample 236 s / 665 từ:
  số phrase group        17
  thời lượng nhóm    median 9.94 s   max 37.36 s
  nhóm > 15 s             5
  refine thành công       6 / 665 từ   (0.9%)

sample 9,881 s / 33,912 từ:
  refine thành công       0 / 33,912 từ   (0.0%)
```

Warp tuyến tính một nhóm dài 37 giây là vô nghĩa, nên bộ lọc an toàn
(`0.70 <= scale <= 1.35`) từ chối là **đúng**. Lỗi nằm ở thiết kế nhóm.

### Việc phải làm

Sửa `_refine_word_boundaries` trong `services/stt_studio/studio_app/server.py`:

1. Hạ `WORD_GROUP_GAP_SECONDS` xuống **0.20**, và gom nhóm theo **`segmentIndex`
   của Whisper trước, rồi mới theo gap** (mỗi word dict đã có `segmentIndex`).
2. **Bỏ warp tuyến tính toàn nhóm.** Thay bằng snap hai biên:
   - tìm span Silero có onset gần `group.start` nhất trong cửa sổ `±0.40 s`;
     nếu có, dịch **chỉ từ đầu tiên** `word["start"] = span.start`, không đụng
     `word["end"]` của nó nếu việc đó làm `end <= start`;
   - tương tự cho offset của từ cuối với `group.end`;
   - **không đụng từ ở giữa nhóm.** DTW giữ nguyên biên tương đối bên trong.
3. Đánh dấu `timingSource = "faster-whisper-dtw+silero-edge"` chỉ cho những từ
   thực sự bị dịch.
4. Trả về số nhóm đã snap và ghi vào `word_timing_note`.

Cập nhật `docs/adr/0008-refine-dtw-phrase-edges-with-unpadded-vad.md`: ADR hiện
mô tả một cơ chế hoạt động ở mức < 1% số từ. Thêm mục "2026-08-30 Measurement"
ghi số đo thật và quyết định đổi sang snap biên.

## Tiêu chí nghiệm thu W2

- Sample 236 s: tỉ lệ từ mang `silero-edge` ≥ **60%** số nhóm (từ 1 nhóm / 17).
- Sample pdca 9,881 s: > 0 nhóm được snap (từ 0).
- Hai asset `needs-alignment` của pdca chuyển sang `partial`, word box hiện lại
  trên Timeline.
- Thêm test trong `services/api/tests/test_word_timing_quality.py` cho ngưỡng 5%
  và cho cờ `timingTrusted` theo từng từ.

---

# W3 — Forced alignment

Đây là lời giải **đúng** cho vấn đề timestamp; W2 chỉ là giảm thiểu.

## Bối cảnh

`docs/adr/0007-preserve-source-word-timing.md` ghi rằng aligner tiếng Việt của
WhisperX bị loại vì phụ thuộc đường dẫn NLTK không truy cập được và cho ra
khoảng từ bị nén với confidence gần 0. Runtime hiện tại **đã đổi**:

```
.runtime/omnivoice-studio/.venv:
  whisperx        3.8.6
  torch           2.8.0+cu128
  torchaudio      2.8.0+cu128
  transformers    4.57.6
.runtime/omnivoice-studio/nltk_data/   <- đã tồn tại cục bộ
```

Nên lý do loại bỏ trong ADR-0007 nhiều khả năng đã hết hiệu lực.

## Việc phải làm

1. **Probe trước, tích hợp sau.** Viết một script dùng một lần trong `.scratch/`:
   chạy `whisperx.load_align_model(language_code="vi", ...)` +
   `whisperx.align(...)` trên `data/projects/conviction/assets/media/asset-a29e7bedc07a/analysis.wav`
   với transcript hiện có. In ra: số từ align được, phân bố confidence, và sai
   lệch onset so với biên Silero không padding.
   **Không viết adapter nếu probe cho confidence gần 0 như ADR-0007 mô tả.**
   Phương án hai nếu probe thất bại: `ctc-forced-aligner` với MMS-300M
   (`MahmoudAshraf/mms-300m-1130-forced-aligner`), hỗ trợ tiếng Việt.
2. Nếu probe đạt: định nghĩa **port** `ForcedAligner` trong
   `services/api/app/domain/ports.py` với hợp đồng
   `align(audio_path, text, language) -> list[AlignedWord]`, và adapter
   `services/api/app/adapters/studio_forced_aligner.py` gọi một endpoint mới
   `POST /api/audio/align` trong sidecar. Không import class WhisperX vào route
   hay UI module (`AGENTS.md`).
3. Từ được aligner trả về mang `timingSource = "<model>-forced-align"` và
   `timingTrusted = True`. Chỉ processor này được phép thay timing (ADR-0007).
4. Đây cũng chính là bộ máy plan `03-02` cần cho "forced alignment của script có
   sẵn". Làm một lần, dùng cho cả hai mục đích: căn chỉnh lại kết quả ASR, và
   kiểm chứng script người dùng cung cấp (phát hiện từ bị thiếu, lặp, đổi).

## Tiêu chí nghiệm thu W3

- Trên sample 236 s: sai lệch onset trung bình so với biên Silero không padding
  ≤ **80 ms**, và ≥ 95% từ có confidence > 0.3.
- Ghi số đo vào ADR mới `docs/adr/0010-use-forced-alignment-for-word-timing.md`,
  và cập nhật ADR-0007 với mục nói rõ điều kiện đã thay đổi.

---

# W4 — Diarization

## Nguyên nhân đã xác minh

1. **Aliasing ở đầu vào.** `_load_diarization_waveform` trong
   `services/stt_studio/studio_app/server.py` hạ mẫu 24 kHz → 16 kHz bằng
   `torch.nn.functional.interpolate(mode="linear")`. Đây là nội suy tuyến tính
   **không có low-pass chống aliasing**: mọi thành phần trên 8 kHz bị gập ngược
   vào dải thoại. Speaker embedding của pyannote phụ thuộc chi tiết phổ.
2. **Gán nhãn theo từng từ rời rạc.** `assign_spans_to_words` trong
   `services/api/app/adapters/sequential_diarization_queue.py` chọn span có
   overlap lớn nhất cho **mỗi từ độc lập**. `_smooth_short_label_flips` chỉ vá
   được run ≤ 5 từ **và** ≤ 0.7 s **và** hai bên giống nhau.

Dữ liệu thật (`data/projects/test-3`, 236 s, 2 speaker):

```
số run nhãn liên tiếp   41    (kỳ vọng ~15–20)
từ không có nhãn        39
lật nhãn không được vá:
  speaker-1  1 từ    25.30–25.58
  speaker-1  4 từ    61.51–62.59   (kẹt giữa speaker-2)
  speaker-1  5 từ   155.63–156.39
```

## Việc phải làm

1. `MediaImportProcessor._extract_audio` tạo thêm `analysis-16k.wav`
   (`-ac 1 -ar 16000 -c:a pcm_s16le`). FFmpeg tự áp dụng low-pass đúng chuẩn.
   Thêm `analysis_16k_path` vào `MediaAssetCreate`/`ProjectMediaAsset`
   (project-relative). Tạo lại cho asset cũ khi chạy diarize nếu file chưa có.
2. `_load_diarization_waveform` nhận thẳng file 16 kHz, **bỏ hẳn nhánh
   `interpolate`**. Nếu vì lý do nào đó vẫn phải resample trong Python, dùng
   `torchaudio.functional.resample`.
3. Viết lại `assign_spans_to_words` để gán theo **cụm**, không theo từ:
   - gom từ thành cụm theo khoảng lặng > 0.35 s (hoặc theo `segmentIndex`);
   - với mỗi cụm, cộng **tổng thời lượng overlap** với từng speaker span;
   - gán nhãn thắng cho **cả cụm**;
   - chỉ tách cụm khi có một span speaker khác phủ > 60% một đoạn con liên tục
     dài > 1.0 s bên trong cụm (turn thật giữa câu).
   Giữ `manualDiarizationSpeakerId` và `speakerId` của người dùng nguyên vẹn.
4. Sau đó `_smooth_short_label_flips` gần như không còn việc; giữ lại nhưng nới
   điều kiện thời lượng lên 1.2 s.
5. Truyền `min_speakers`/`max_speakers` xuống pyannote khi người dùng đã nhập số
   người nói (`MediaDiarizationEnqueue.expected_speakers` đã có sẵn; hiện chỉ
   truyền `num_speakers`).
6. Sửa bug snapshot cũ đã mô tả ở mục 1.2.

## Tiêu chí nghiệm thu W4

Trên `data/projects/test-3` (chạy lại diarization):

- số run nhãn liên tiếp giảm từ 41 xuống **≤ 22**;
- số từ không nhãn về **0**;
- không còn run nào < 3 từ nằm kẹt giữa hai run cùng nhãn.

Nếu sau (1)+(3) vẫn chưa đạt, bước tiếp theo là tách embedding riêng
(`pyannote/wespeaker-voxceleb-resnet34-LM`) rồi clustering có ràng buộc theo biên
câu — nhưng **chỉ làm sau khi đã đo lại với đầu vào 16 kHz sạch**.

---

# Gate nghiệm thu mới cho checklist

Nguyên nhân các lỗi trên tồn tại lâu là vì checklist verification chỉ kiểm
"57 backend tests, 42 frontend tests passed" — không có gate nào về **chất lượng
dữ liệu thật**. Unit test không bao giờ hỏi "bao nhiêu phần trăm từ thực sự được
refine?".

Thêm `scripts/check-stt-quality.ps1` (hoặc một pytest đánh dấu `@pytest.mark.sample`)
chạy trên một sample cố định và assert:

| Chỉ số | Ngưỡng |
| --- | --- |
| `media.list()` trên project ≥ 100k từ | < 0.15 s |
| tỉ lệ từ `timingTrusted` | ≥ 95% |
| tỉ lệ nhóm được snap biên | ≥ 60% |
| số run diarization / số speaker | ≤ 12 |
| số từ không có nhãn diarization | 0 |

Bổ sung dòng chạy gate này vào `docs/NEXT_SESSION.md` mục "Verification Gates".

---

# Checklist nghiệm thu tay theo round

Đây là phần chủ dự án tự bấm. Agent phải copy nguyên bảng của round mình vừa làm
vào báo cáo, điền cột "Agent đo được", và để trống cột "Anh xác nhận".

Lệnh dùng chung, chạy từ thư mục gốc repo:

```bash
.venv/Scripts/python.exe -m pytest services/api/tests -q
```

```bash
powershell -NoProfile -Command "Push-Location apps\web; npm test; npm run build; Pop-Location"
```

## R0 — runtime lifecycle

| # | Việc anh làm | Kết quả đúng |
| --- | --- | --- |
| 1 | Chạy `start-pro4bro.bat` | Cửa sổ in "This window owns every Pro4Bro process." |
| 2 | Đóng cửa sổ bằng **nút X**, rồi chạy lệnh liệt kê python bên dưới | Không còn process Pro4Bro nào. Trước khi sửa: còn 6. |
| 3 | Sửa một chuỗi hiển thị bất kỳ trong `apps/web/src`, mở app, menu Windows → `Restart all` | Log in "Rebuilding bundle"; refresh trình duyệt thấy chuỗi mới. Không cần reboot. |
| 4 | Bấm `Restart all` 5 lần liên tiếp | Lần nào cũng về `running`. Không lần nào báo "port is occupied". |
| 5 | Sửa `services/api/app/runtime_controller.py`, chạy `start-pro4bro.bat restart` | Thay đổi được nạp trong cửa sổ mới. |

```bash
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Select-Object ProcessId,CommandLine | Format-Table -Wrap"
```

## R1 — storage + diarization progress + audioop

| # | Việc anh làm | Kết quả đúng |
| --- | --- | --- |
| 1 | Mở project **PDCA CLDNDD K4** trong app | Media Pool hiện đủ 3 footage, không khựng. Lần đầu chậm ~1 s (migration), từ lần hai trở đi tức thì. |
| 2 | Kiểm tra file trên đĩa | `data/projects/pdca-cldndd-k4/assets/media/index.json` từ 31.3 MB xuống ~3 MB; mỗi thư mục asset có thêm `words.json` |
| 3 | Chọn từng footage, xem Script | Transcript và word timing hiện đủ, giống hệt trước khi sửa |
| 4 | Chạy diarization một footage của PDCA. Trong lúc chạy, bấm quanh app | App vẫn phản hồi. Trước đây đứng hình. |
| 5 | Vừa diarize vừa sửa Script | Sửa đổi **không bị mất** khi job xong |
| 6 | Đếm dòng `data/projects/pdca-cldndd-k4/activity/events.jsonl` trước và sau một job diarization | Tăng ≤ 3 dòng. Trước đây tăng hàng trăm. |
| 7 | Chạy STT một file dài (> 1 giờ), nhìn progress | Progress vượt 16% trong vòng ~10 giây. Trước đây đứng ở 4% gần 3 phút. |
| 8 | So transcript của file 236 s trước/sau | Text **không đổi** |

## R2 — timing trust theo từ

| # | Việc anh làm | Kết quả đúng |
| --- | --- | --- |
| 1 | Mở PDCA, chọn `2026-08-26 08-33-29.mp3` (43,417 từ) | Timeline **hiện word box**. Trước đây trống trơn. |
| 2 | Nhìn nhãn chất lượng của asset đó | `partial`, kèm ghi chú số vùng cần căn chỉnh |
| 3 | Phát audio | Từ đang phát được highlight ở cả Timeline và Script |
| 4 | Tìm vùng có từ xấu (theo ghi chú) | Từ đó hiện với style cảnh báo, **không bị ẩn** |
| 5 | Export SRT theo câu | Xuất được. Header ghi số dòng đã bỏ qua. |
| 6 | Chạy lại STT trên footage 236 s, xem báo cáo của agent | Tỉ lệ nhóm được snap biên ≥ 60% (trước: 1/17 nhóm, 6/665 từ) |

## R3 — frontend

| # | Việc anh làm | Kết quả đúng |
| --- | --- | --- |
| 1 | Chạy STT, **vừa chạy vừa gõ liên tục vào Script** | Khi STT xong, transcript vẫn vào Script. Đây là lỗi "lâu lâu không thấy update". |
| 2 | Gõ vào Script của asset 33,912 từ | Không khựng khi gõ |
| 3 | Phát audio asset dài, để chạy 30 giây | Playhead chạy mượt, không giật |
| 4 | Sau một phiên 2 phút có STT, đếm request trong `data/logs/pro4bro-api.out.log` | Số `transcription-status` còn khoảng 1/6 so với 1,213 |

## R4 — sidecar

| # | Việc anh làm | Kết quả đúng |
| --- | --- | --- |
| 1 | Chạy STT file 2.7 giờ, xem Task Manager | RAM đỉnh của process Studio giảm ít nhất 500 MB |
| 2 | So `assets/media/<id>/stt/transcript.stt.json` trước/sau trên sample 236 s | Text **không đổi** |
| 3 | Chạy STT bình thường | Không còn thấy file tạm 600 MB xuất hiện trong thư mục temp |

## R5 — probe forced alignment

Round này **không sửa code sản phẩm**. Anh chỉ cần đọc báo cáo và quyết định:

| Chỉ số agent phải báo | Ngưỡng để đi tiếp R6 |
| --- | --- |
| Sai lệch onset trung bình so với biên Silero không padding | ≤ 80 ms |
| Tỉ lệ từ có confidence > 0.3 | ≥ 95% |
| Số từ align được / tổng số từ | ≥ 98% |

Nếu **không đạt**, agent phải thử phương án hai (`ctc-forced-aligner` với MMS-300M)
và báo cáo lại, chứ không tự ý sang R6.

## R7 — diarization

| # | Việc anh làm | Kết quả đúng |
| --- | --- | --- |
| 1 | Chạy lại diarization trên project **Test 3** (236 s, 2 người nói) | Số run nhãn ≤ 22 (trước: 41) |
| 2 | Mở Script ở chế độ speaker | Không còn từ nào thiếu nhãn (trước: 39 từ) |
| 3 | Đọc qua transcript | Không còn đoạn 1–4 từ bị gán nhầm sang người kia giữa câu |

---

# Nếu một round không đạt

Ghi feedback trực tiếp vào `docs/STABILIZATION-LOG.md`, ngay dưới báo cáo của
round đó, theo mẫu:

```markdown
### Feedback — 2026-08-31 — CHƯA ĐẠT

- Mục 4 trong checklist: app vẫn khựng khoảng 2 giây khi bấm sang footage thứ ba.
- Mục 6: events.jsonl tăng 47 dòng, không phải ≤ 3.
- Còn lại đạt.
```

Chỉ cần liệt kê **mục nào không đạt và hiện tượng thật**. Không cần đoán nguyên
nhân — đó là việc của agent. Lần gọi kế tiếp, agent bắt buộc xử lý feedback này
trước khi sang round mới.
