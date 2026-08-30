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

```
media.list()  trên pdca-cldndd-k4     1.46 – 1.95 s
media.get()                           1.72 s
index.json                            31.3 MB
_is_near_silent  file 236 s           3.97 s   → suy ra ~166 s cho file 9,881 s
activity/events.jsonl mỗi job diarize  hàng trăm dòng
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

### Feedback

_(chưa có)_
```
