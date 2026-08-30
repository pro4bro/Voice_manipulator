# Stabilization Log

Sổ theo dõi đợt sửa ổn định. **Đây là file duy nhất chủ dự án cần mở.**

- Kế hoạch kỹ thuật: `docs/STABILIZATION-PLAN.md`
- Checklist nghiệm thu từng round: mục "Checklist nghiệm thu tay theo round" trong file kế hoạch
- Nhánh: `fix/w1-runtime-and-index-performance`

## Cho agent thi công

Đọc `docs/STABILIZATION-PLAN.md` mục "Quy trình làm việc" trước khi làm bất cứ gì.
Tóm tắt: xử lý `### Feedback` chưa giải quyết trước → làm đúng round `NEXT` →
append báo cáo theo template ở cuối file này → đổi con trỏ `NEXT` → **dừng lại**.

Không hạ ngưỡng nghiệm thu để cho pass. Không sửa test cũ để né lỗi. Báo số thật.

## Ba vai, ba chỗ ghi

| Vai | Ghi ở đâu | Làm gì |
| --- | --- | --- |
| Agent thi công (Codex) | mục `## Agent tự kiểm` + `## Kết quả so với ngưỡng` | Code một round, chạy đo, báo số thật |
| Người review (Claude) | mục `### Review (Claude)` | Đối chiếu báo cáo với dữ liệu thật trước khi chủ dự án chấp nhận |
| Chủ dự án | mục `### Feedback` | Bấm checklist tay, ghi mục nào hỏng |

Thứ tự trong mỗi round: **báo cáo agent → review → feedback → chấp nhận hoặc làm lại.**

## Công cụ đo dùng chung

Cả agent và người review chạy **cùng một lệnh**, để không ai tự chấm bài bằng số
của riêng mình:

```bash
.venv/Scripts/python.exe scripts/stt_quality_report.py --project pdca-cldndd-k4 --benchmark pdca-cldndd-k4-949eae9a --silence-probe
```

Script đọc project ở chế độ chỉ-đọc và chạy được cả trước lẫn sau khi tách
storage, nên số hai bên so sánh được trực tiếp.

### Baseline trước R1 — đo ngày 2026-08-30

```
=== pdca-cldndd-k4        index.json 31.30 MB · 3 asset

asset-7e08a3f43af8   9,881s   33,912 từ   quality source
  timing trusted   33,912 / 33,912  (100.0%)
  edge-refined          0 / 33,912  (  0.0%)   groups 0/1126
  phrase group     median   4.72s   max 108.30s
asset-bd55873fc707  12,104s   43,417 từ   quality needs-alignment
  timing trusted        0 / 43,417  (  0.0%)
  word span        tiny(<25ms) 753    long(>8.0s) 8
asset-bf35963dedac  13,152s   47,719 từ   quality needs-alignment
  timing trusted        0 / 47,719  (  0.0%)
  word span        tiny(<25ms) 2,704  long(>8.0s) 24

=== TOTAL   125,048 từ   trusted 27.1%   edge-refined 0.0%
    phrase groups refined 0 / 3,408  (0.0%)      [R2 threshold >= 60%]

media.list()  first 3.332s   repeat 3.558s      [threshold < 0.150s]
media.get()         3.297s                      [threshold < 0.300s]

silence probe (audioop)  0.356s cho 236s audio  → ~14.9s cho file 9,881s
  (vòng lặp Python hiện tại: 3.97s → ~166s)
```

Hai con số đáng chú ý phát hiện khi dựng script này:

- `media.list()` đo lại là **3.3 s**, không phải 1.5–2.0 s như lần đo đầu. Lần đầu
  đo trong một process đã ấm cache OS. Số 3.3 s là số dùng để so sánh từ giờ.
- Phrase group dài nhất trên file thật là **108.30 giây**. Trên sample 236 s là
  37 s. Ngưỡng gap 0.52 s không tách nổi người nói liên tục, nên `_refine_word_boundaries`
  từ chối **1,126/1,126 nhóm** — đúng như W2 mô tả, nhưng tệ hơn dự đoán ban đầu.

## Bảng trạng thái

| Round | Phạm vi | Trạng thái |
| --- | --- | --- |
| R0 | W0 runtime lifecycle | ĐÃ CODE — chờ chủ dự án nghiệm thu tay |
| R1 | W1.1 storage split + W1.2 diarization progress + W1.5a audioop | **NEXT** |
| R2 | W2 timing trust theo từ | chờ |
| R3 | W1.3 + W1.4 frontend | chờ |
| R4 | W1.5b + W1.5c sidecar | chờ |
| R5 | W3 probe forced alignment | chờ |
| R6 | W3 tích hợp | chờ — có điều kiện, phụ thuộc kết quả R5 |
| R7 | W4 diarization | chờ |

---

# R0 — Runtime lifecycle

**Trạng thái:** đã code, commit `2520353`. Chờ nghiệm thu tay.

## Đã đổi

| File | Nội dung |
| --- | --- |
| `scripts/pro4bro-process-tree.ps1` | Mới. Tree walk, kill có chờ exit thật, chờ port free, orphan sweep resolve cả dạng ổ ánh xạ lẫn UNC. |
| `scripts/pro4bro-console.ps1` | Job Object `KILL_ON_JOB_CLOSE`; mở browser qua `explorer.exe`; chiếm lại stack cũ; owner record; vòng chờ theo process; lệnh `restart`. |
| `scripts/pro4bro-workloads.ps1` | Dùng helper mới; bắt buộc chờ port free trước khi start; rebuild bundle khi source mới hơn dist. |
| `scripts/restart-pro4bro.ps1` | Mặc định full-stack restart; thêm `-WorkloadsOnly`. |
| `scripts/start-pro4bro.ps1` | Nhận thêm `restart`. |
| `services/api/app/runtime_controller.py`, `services/api/app/main.py` | `index.html` trả kèm `cache-control: no-store`. |

## Bốn nguyên nhân đã xác minh

1. Venv stub: process listen trên port là **cháu**, không phải con. Kill listener thì stub còn sống.
2. Không có process-tree ownership: API và Studio có cha đã chết, không phải con của cửa sổ CMD. Đóng bằng nút X thì `finally` không chạy, cả 6 process sống sót.
3. Restart race: stop không chờ, start đọc trạng thái ngay sau đó nên hoặc return không làm gì, hoặc throw "port is occupied".
4. Restart không rebuild `apps/web/dist`, và `index.html` được cache.

## Agent tự kiểm

```
pytest services/api/tests -q          57 passed
PowerShell parse check                5/5 script OK
Orphan detection trên process thật    nhận đúng 3 cây (controller/api/studio) kèm descendant
Root alias resolve                    V:\... và \\192.168.100.102\hub\... đều khớp
```

## Anh cần check

Xem bảng **R0** trong `docs/STABILIZATION-PLAN.md` mục "Checklist nghiệm thu tay
theo round". Năm mục, quan trọng nhất là mục 2 (đóng bằng nút X) và mục 3
(sửa React rồi `Restart all`).

### Review (Claude)

Tự làm, nên không phải review độc lập. Ba điều cần chủ dự án xác nhận vì em không
tự tắt stack đang chạy: mục 2, 3, 5 trong checklist R0.

### Feedback

_(chưa có)_

---

# R1 — Storage split + diarization progress + audioop

**Trạng thái:** NEXT. Chưa bắt đầu.

## Phạm vi round này

Đọc chi tiết ở `docs/STABILIZATION-PLAN.md`, mục **W1.1**, **W1.2**, và
**W1.5 điểm 1**. Ba commit riêng:

1. **W1.1** — wire `services/api/app/adapters/media_index_store.py` (đã viết sẵn,
   đã benchmark, **chưa được dùng ở đâu**) vào `FileMediaLibrary`. Tách words ra
   `assets/media/<id>/words.json`, cache theo mtime, lock theo project thay vì
   lock toàn cục, gom các hàm mutation về một helper `_update_asset`, chuyển
   `reconcile_word_timing_quality` sang đường ghi.
2. **W1.2** — progress diarization ghi snapshot trong `jobs/diarization/`, không
   chạm index; thêm route `GET /api/projects/{id}/media/diarization-status`; sửa
   bug snapshot cũ ghi đè chỉnh sửa Script.
3. **W1.5a** — thay vòng lặp từng sample bằng `audioop` trong `_is_near_silent`
   (`services/stt_studio/studio_app/server.py`).

**Không** làm sang W1.3/W1.4 (frontend) trong round này. **Giữ nguyên hợp đồng
HTTP**: `GET /media` vẫn trả `words` như cũ. Việc tách endpoint words riêng là
chuyện của round sau.

## Baseline để so sánh

Dùng số trong mục "Baseline trước R1" ở đầu file này (đo bằng
`scripts/stt_quality_report.py`, là số chính thức để so sánh):

```
media.list()  trên pdca-cldndd-k4     3.332 s      → ngưỡng < 0.150 s
media.get()                           3.297 s      → ngưỡng < 0.300 s
index.json                            31.30 MB     → kỳ vọng ~3 MB
_is_near_silent  file 236 s           3.97 s       → ngưỡng < 0.50 s
                                                     (audioop đo được 0.356 s)
activity/events.jsonl mỗi job diarize  hàng trăm dòng → ngưỡng ≤ 3 dòng
```

MediaIndexStore đã đo sẵn (chưa wire):

```
migration 1 lần          1.071 s     31.3 MB → 3.05 MB
đọc index lạnh           0.026 s
đọc index nóng          0.0002 s
đọc words 1 asset lạnh  0.086 – 0.150 s
dữ liệu word sau migration giống hệt bản gốc (đã assert)
```

## Agent tự kiểm — bắt buộc chạy và dán output thật

1. `.venv\Scripts\python.exe -m pytest services\api\tests -q` — 57 test cũ phải
   pass. Nếu phải sửa test nào, ghi rõ test nào và tại sao.
2. Test mới trong `services/api/tests/test_project_media_library.py`:
   - index cũ có `words` nhúng → sau `list()` đầu tiên, `index.json` không còn
     `words`, `words.json` chứa đúng dữ liệu cũ;
   - `get()` trả về words đầy đủ;
   - `set_transcription_state` **không** làm đổi mtime của `words.json`;
   - project di chuyển sang thư mục khác vẫn đọc được.
3. Benchmark trên `data/projects/pdca-cldndd-k4`, dán số thật:
   - `media.list()` < **0.15 s**
   - `media.get()` < **0.30 s**
4. `_is_near_silent` trên `data/projects/conviction/assets/media/asset-a29e7bedc07a/analysis.wav`
   (236 s): < **0.5 s**, và kết quả boolean giống hệt code cũ.
5. `npm test` và `npm run build`.

## Anh cần check

Bảng **R1** trong `docs/STABILIZATION-PLAN.md`. Tám mục.

### Review (Claude)

_(chưa có)_

### Feedback

_(chưa có)_

---

# Template báo cáo round

Agent copy nguyên khối này xuống cuối file cho mỗi round mới.

```markdown
# R<n> — <tên round>

**Trạng thái:** đã code, commit `<hash>`. Chờ nghiệm thu tay.

## Đã đổi

| File | Nội dung |
| --- | --- |
| | |

## Lệch so với kế hoạch

_(Ghi mọi chỗ làm khác kế hoạch và lý do. Nếu không có, ghi "không có".)_

## Agent tự kiểm

_(Dán output thật của từng lệnh trong mục "Agent tự kiểm" của round.
Nếu một ngưỡng không đạt, ghi số thật và giải thích — tuyệt đối không hạ ngưỡng.)_

## Kết quả so với ngưỡng

| Chỉ số | Ngưỡng | Agent đo được | Anh xác nhận |
| --- | --- | --- | --- |
| | | | |

## Anh cần check

_(Copy nguyên bảng checklist của round này từ STABILIZATION-PLAN.md.)_

## Việc còn treo

_(Những gì round này cố tình không làm, và round nào sẽ làm.)_

### Review (Claude)

_(Để trống. Người review điền sau khi đối chiếu độc lập.)_

### Feedback

_(chưa có)_
```

---

# Checklist cho người review

Điền vào mục `### Review (Claude)` của round. Bốn việc, làm độc lập với báo cáo
của agent — mục đích là bắt đúng chế độ hỏng đã xảy ra một lần trong dự án này:
báo cáo nghe hợp lý mà không ai đối chiếu với dữ liệu thật.

1. **Chạy lại `scripts/stt_quality_report.py`**, không đọc số trong báo cáo. So
   trực tiếp với baseline ở đầu file này.
2. **`git diff` với commit trước đó.** Kiểm tra ba thứ:
   - có test cũ nào bị sửa không, và nếu có thì sửa để đúng hay để né;
   - có ngưỡng nào trong `STABILIZATION-PLAN.md` bị hạ không;
   - phạm vi có tràn sang round sau không.
3. **Đọc code chỗ rủi ro nhất của round**, không đọc toàn bộ diff. R1 là migration
   và mất dữ liệu; R2 là ngưỡng phân loại từ; R7 là gán nhãn speaker.
4. **Kết luận một trong ba:** `ĐẠT`, `ĐẠT CÓ ĐIỀU KIỆN` (kèm việc phải làm ở round
   sau), hoặc `CHƯA ĐẠT` (kèm số thật và lý do).
