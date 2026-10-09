# Stabilization Log

Sổ theo dõi đợt sửa ổn định. **Đây là file duy nhất chủ dự án cần mở.**

- Kế hoạch kỹ thuật: `docs/STABILIZATION-PLAN.md`
- **Nghiệm thu hợp nhất W0–W4: `docs/ACCEPTANCE-W0-W4.md`** — xếp theo thứ tự thao tác trong một phiên
- Checklist nghiệm thu từng round: mục "Checklist nghiệm thu tay theo round" trong file kế hoạch
- Nhánh: `fix/w1-runtime-and-index-performance`
- **Cây làm việc:** repository root của checkout hiện tại (thư mục chứa `.git` và `AGENTS.md`); không làm việc từ bản sao khác

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

## Cách feedback

Chủ dự án nói thẳng trong chat của agent — nhanh và tự nhiên hơn gõ vào file.
Agent sau đó **bắt buộc** ghi lại vào mục `### Feedback` của round, theo đúng ba
phần dưới đây. Phần "Cách hiểu" tồn tại để sau này đối chiếu được: nếu agent hiểu
sai ý, chỗ sai nằm ngay trên giấy chứ không mất trong lịch sử chat.

````markdown
### Feedback — 2026-08-31

**Nguyên văn (copy từ chat, không sửa, không tóm tắt):**

> mục 4 vẫn khựng khoảng 2 giây khi bấm sang footage thứ ba
> với lại cái events.jsonl vẫn tăng gần 50 dòng

![R1 khi bấm sang footage 3](feedback/R1-01.png)

**Cách agent hiểu:**

1. Checklist mục 4 chưa đạt. Chuyển asset trong Media Pool còn chặn UI khoảng
   2 giây, và chỉ xảy ra ở footage thứ ba (asset-bf35963dedac, 47,719 từ) — nghi
   là chi phí attach words của asset lớn nhất, không phải chi phí đọc index.
2. Checklist mục 5 chưa đạt: khoảng 50 dòng thay vì 3 dòng. Nghĩa là còn một
   đường ghi activity theo tick mà round này bỏ sót.
3. Ảnh R1-01 cho thấy spinner đứng ở Media Pool trong khi Timeline vẫn giữ
   waveform của asset cũ.

**Nếu chỗ nào hiểu sai, sửa lại rồi mới làm.**
````

Ảnh: chụp bằng `Win+Shift+S` rồi chạy

```powershell
.\scripts\save-feedback-image.ps1 -Round R1 -Note "mo ta ngan"
```

Script lưu vào `docs/feedback/` và in ra dòng Markdown để dán. Agent phải **đọc
ảnh và mô tả lại nội dung** trong phần "Cách agent hiểu" — file ảnh là bằng
chứng, phần mô tả mới là thứ agent thực sự hành động theo.

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

Số round giữ nguyên theo `STABILIZATION-PLAN.md`. R3 và R4 đã được làm sớm cùng
R1 vì cùng một đợt và không còn ai chạy song song để tranh chấp file.

| Round | Phạm vi | Trạng thái |
| --- | --- | --- |
| R0 | W0 runtime lifecycle | **ĐÃ XONG** — 4/5 mục verify tự động, 1 mục chờ chủ dự án |
| R1 | W1.1 storage split + W1.2 diarization progress + W1.5a audioop | **ĐÃ XONG** |
| R3 | W1.3 + W1.4 frontend | **ĐÃ XONG** (làm sớm cùng R1) |
| R4 | W1.5b + W1.5c sidecar | **ĐÃ XONG** (làm sớm cùng R1) |
| R2 | W2 timing trust theo từ | **ĐÃ NGHIỆM THU CÓ ĐIỀU KIỆN** — chủ dự án chấp nhận 2026-09-03; 2 ngưỡng dữ liệu thật vẫn chưa đạt |
| R5 | W3 probe forced alignment | **ĐÃ XONG — KHÔNG ĐẠT NGƯỠNG** (2/3 trượt) |
| R6 | W3 tích hợp | **KHÔNG THỰC HIỆN** — điều kiện R5 không thoả |
| R7 | W4 diarization | **ĐÃ XONG** — cả 3 tiêu chí đạt |

**Lưu ý cho R2:** vì R1/R3/R4 đã sửa `Timeline.tsx`, `server.py`, `main.py` và
đường ghi của media library, R2 phải đọc **trạng thái hiện tại** của các file đó
chứ không dựa vào mô tả cũ trong PLAN. Cụ thể ba chỗ đã đổi:

- `_fine_speech_spans` nay nhận buffer đã decode, không nhận `Path`.
- `wordTrackIndexes` đã virtualize không điều kiện; nhánh "dưới 1400 từ thì render hết" không còn.
- `reconcile_word_timing_quality` chỉ chạy ở đường ghi và kết quả được persist.

---

# R0 — Runtime lifecycle

**Trạng thái:** ĐÃ XONG. Commit `2520353`.

## Đã đổi

| File | Nội dung |
| --- | --- |
| `scripts/pro4bro-process-tree.ps1` | Mới. Tree walk trên một snapshot, kill có chờ exit thật, chờ port free, orphan sweep resolve cả dạng ổ ánh xạ lẫn UNC. |
| `scripts/pro4bro-console.ps1` | Job Object `KILL_ON_JOB_CLOSE`; mở browser qua `explorer.exe`; chiếm lại stack cũ; owner record; vòng chờ theo process; lệnh `restart`. |
| `scripts/pro4bro-workloads.ps1` | Dùng helper mới; bắt buộc chờ port free trước khi start; rebuild bundle khi source mới hơn dist. |
| `scripts/restart-pro4bro.ps1` | Mặc định full-stack restart; thêm `-WorkloadsOnly`. |
| `scripts/start-pro4bro.ps1` | Nhận thêm `restart`. |
| `services/api/app/runtime_controller.py`, `services/api/app/main.py` | `index.html` trả kèm `cache-control: no-store`. |

## Bốn nguyên nhân đã xác minh

1. **Venv stub.** `.venv\Scripts\python.exe` là launcher stub; process listen trên
   port là **cháu**. Kill listener thì stub còn sống.
2. **Không có process-tree ownership.** API và Studio có cha đã chết (PowerShell
   trung gian), không phải con của cửa sổ CMD. Đóng bằng nút X thì `finally`
   không chạy, cả 6 process sống sót.
3. **Restart race.** Stop không chờ; start đọc trạng thái ngay sau đó nên hoặc
   return không làm gì, hoặc throw "port is occupied".
4. **Restart không rebuild `apps/web/dist`**, và `index.html` được cache.

## Agent tự kiểm — output thật

```
TEST 1  stop toàn bộ stack
  trước: 6 python process, port 18119/18120/18081 đều listen
  sau :  Pro4Bro python processes con lai: 0
         port 18119 -> free / 18120 -> free / 18081 -> free

TEST 2  giết launcher PowerShell (ngữ nghĩa nút X)
  trước: 6 process, ba cây stub -> interpreter, cả 3 port listen
  cache-control tren index.html: no-store, must-revalidate
  sau khi Stop-Process launcher:
         Pro4Bro python con lai: 0
         port 18119 -> free / 18120 -> free / 18081 -> free

TEST 3  restart 5 lần liên tiếp
  restart #1: overall=running  (124s)
  restart #2: overall=running  (121s)
  restart #3: overall=running  (120s)
  restart #4: overall=running  (121s)
  restart #5: overall=running  (116s)
  -> 0 lần báo "port is occupied", 0 lần return không làm gì

TEST 4  rebuild bundle khi source mới hơn dist
  "Frontend source changed since the last build. Rebuilding bundle..."
  dist trước : 8/29/2026 5:57:47 PM
  dist sau   : 8/30/2026 2:20:55 AM
  ĐÃ REBUILD : True   (162s)

pytest services/api/tests -q   57 passed
PowerShell parse check         6/6 script OK
```

## Kết quả so với ngưỡng

| Mục checklist | Ngưỡng | Đo được | Anh xác nhận |
| --- | --- | --- | --- |
| 1 · launcher in dòng owns-process | có dòng đó | có | |
| 2 · đóng bằng nút X thì còn 0 process | 0 | **0** (trước: 6) | |
| 3 · sửa React rồi Restart all | rebuild chạy | **rebuild + dist đổi** | |
| 4 · restart 5 lần | 5/5 running | **5/5** | |
| 5 · sửa controller rồi `restart` | nạp được | **chưa test** | |

## Việc còn treo

Mục 5 chưa test. Nó cần sửa `runtime_controller.py` rồi chạy
`start-pro4bro.bat restart` từ một cửa sổ thật. Đường code đã có
(`pro4bro-console.ps1` nhánh `restart` gọi `Stop-FullStack` rồi launch lại),
nhưng chưa chạy end-to-end.

### Review (Claude)

Tự làm nên không phải review độc lập. Bốn mục đầu đã verify bằng số thật ở trên.
Mục 5 cần chủ dự án bấm.

### Feedback

_(chưa có)_

---

# R1 + R3 + R4 — Toàn bộ W1

**Trạng thái:** ĐÃ XONG. Ba commit: `df5a319`, `1f58112`, `3d354ad`.

## Đã đổi

| Commit | File | Nội dung |
| --- | --- | --- |
| `df5a319` | `media_index_store.py` (mới), `file_media_library.py` | Tách words ra `assets/media/<id>/words.json`; cache theo file identity; migration tự động; lock theo project; gom mutation về `_update_asset`; `reconcile_word_timing_quality` chuyển sang đường ghi |
| `df5a319` | `sequential_diarization_queue.py`, `main.py` | Progress diarization ghi job snapshot; route `GET /media/diarization-status`; đọc lại words sau job thay vì dùng snapshot cũ |
| `1f58112` | `studio_app/server.py` | `audioop` thay vòng lặp từng sample; decode một lần dùng cho cả hai pass; nhận `source_path` local thay vì upload |
| `1f58112` | `media_import_processor.py` | Ưu tiên `source_path`, fallback multipart khi sidecar cũ từ chối |
| `3d354ad` | `WorkspaceShell.tsx` | Poll 150ms sang 900ms, system status 1400ms sang 3000ms; `selectedAssetId`/`scriptDirty`/`liveTranscriptActive` chuyển sang ref; diarization poll dùng endpoint snapshot |
| `3d354ad` | `Timeline.tsx` | Memo `lastWordEnd`; virtualize không điều kiện; tách `activeWordIndex` khỏi memo viewport |
| `3d354ad` | `ScriptEditor.tsx` | Debounce alignment 250ms; memo `playbackSegments` |

## Lệch so với kế hoạch

**Một phát hiện làm đổi trọng tâm của round.** Sau khi tách storage, `list()` vẫn
mất 0.38 s. Profile chỉ ra nút thắt thật **không phải JSON** mà là
`Path.resolve()`: workspace nằm trên ổ mạng ánh xạ, và `_portable_path` gọi
`resolve()` cho mọi path đã lưu ở mọi lần đọc — **24 round trip tới file server
mỗi lần `list()`, 2.5 s riêng trong `nt._getfinalpathname`**.

Đây cũng là lý do các lần đo trước dao động 1.5 s / 3.3 s / 5.2 s: đó là độ trễ
mạng, không phải CPU.

Sửa: path do app tự ghi luôn là relative và không chứa `..`, nên kiểm tra
containment bằng phép so chuỗi thay vì gọi filesystem. `_resolved_project_path`
vẫn resolve thật ở đúng chỗ path được mở — nơi symlink mới thực sự có thể bị đi
theo.

Kế hoạch gốc không hề nêu điểm này. Nếu chỉ làm đúng W1.1 như viết, `list()` sẽ
dừng ở khoảng 0.38 s và **không đạt ngưỡng 0.150 s**.

Hai điểm nhỏ khác:

- `read_words` ban đầu copy từng dict (`[dict(w) for w in cached]`) — 0.16 s cho
  125k từ mỗi lần đọc. Đổi thành trả list mới trên dict dùng chung; mọi caller
  ghi trong package này vốn đã tự copy phần nó sửa. Đã ghi rõ trong docstring.
- `audioop.rms` trả int nên RMS tổng lệch 3525.05 sang 3524.61 (0.012%). Peak
  chính xác tuyệt đối, quyết định near-silent giống hệt. Đã ghi trong docstring
  thay vì tuyên bố "identical".

## Agent tự kiểm — output thật

```
pytest services/api/tests -q          63 passed   (57 cũ + 6 mới, KHÔNG sửa test cũ)
npx vitest run --pool=threads         42 passed (10 files)
npx tsc -b                            sạch

media.list() x5:  0.0985  0.2075  0.0937  0.1100  0.1090   -> min 0.0937s
media.get()  x5:  0.1225  0.0980  0.0515  0.1146  0.1064   -> min 0.0515s

index.json pdca:  31.30 MB -> 3.05 MB
words.json:       4.5 MB + 7.6 MB + 8.1 MB
dữ liệu word sau migration: giống hệt bản gốc (assert trong test)

_is_near_silent trên sample 236s:
  vòng lặp Python  3.054s   peak=29574 rms=3525.0514
  audioop          0.072s   peak=29574 rms=3524.6105
  quyết định giống nhau: True     nhanh hơn 42.6 lần
```

**Ghi chú về vitest:** `npm test` (fork pool) không chạy được — worker timeout.
Đây là hạn chế môi trường đã ghi trong `SESSION_HANDOFF.md` (ổ mạng ánh xạ làm
Node không resolve được entry), **không phải do thay đổi này**. `--pool=threads`
chạy đủ 42 test.

## Kết quả so với ngưỡng

| Chỉ số | Ngưỡng | Baseline | Agent đo được | Anh xác nhận |
| --- | --- | --- | --- | --- |
| `media.list()` | < 0.150 s | 3.332 s | **0.094 s** | |
| `media.get()` | < 0.300 s | 3.297 s | **0.052 s** | |
| `index.json` | khoảng 3 MB | 31.30 MB | **3.05 MB** | |
| `_is_near_silent` (236 s) | < 0.50 s | 3.054 s | **0.072 s** | |
| test cũ pass mà không sửa | 57 | 57 | **57** | |

## Anh cần check

Những mục em không tự kiểm được vì cần bấm trong app thật:

| # | Việc anh làm | Kết quả đúng |
| --- | --- | --- |
| 1 | Mở project PDCA, bấm qua lại 3 footage | Không khựng. Lần đầu mở chậm khoảng 2 s (migration), sau đó tức thì. |
| 2 | Xem Script của từng footage | Transcript và word timing giống hệt trước |
| 3 | Chạy diarization một footage PDCA, trong lúc chạy bấm quanh app | App vẫn phản hồi. Trước đây đứng hình. |
| 4 | Vừa diarize vừa sửa Script | Sửa đổi **không mất** khi job xong |
| 5 | Đếm dòng `activity/events.jsonl` trước/sau một job diarization | Tăng 3 dòng trở xuống. Trước đây hàng trăm. |
| 6 | Chạy STT file dài hơn 1 giờ | Progress vượt 16% trong khoảng 10 s. Trước: đứng ở 4% gần 2 phút. |
| 7 | Chạy STT, **vừa chạy vừa gõ liên tục vào Script** | Khi STT xong, transcript vẫn vào Script |
| 8 | Gõ vào Script của asset 33,912 từ | Không khựng khi gõ |
| 9 | Phát audio asset dài, để chạy 30 giây | Playhead mượt, không giật |

## Việc còn treo

- `NATIVE_PLAYBACK_TEXT_LIMIT` vẫn để 3800. Kế hoạch đề xuất hạ xuống khoảng 1200
  sau khi có memo; chưa đo lại nên chưa đổi. Để round sau quyết định bằng số.
- `GET /media` vẫn trả toàn bộ words. Giữ nguyên hợp đồng HTTP là quyết định có
  chủ đích của W1; tách endpoint words riêng vẫn là việc của round sau.
- `audioop` deprecated ở Python 3.13; runtime hiện là 3.11. Khi nâng Python thì
  chuyển sang `numpy` (đã có sẵn trong runtime venv).

### Review (Claude)

Tự làm nên không phải review độc lập.

### Feedback

_(chưa có)_

---

# R5 — Probe forced alignment

**Trạng thái:** ĐÃ XONG. **KHÔNG ĐẠT NGƯỠNG.** Không sang R6.

Round này theo thiết kế không sửa code sản phẩm — nó là cửa quyết định.

## Đã đổi

| File | Nội dung |
| --- | --- |
| `scripts/probe_forced_alignment.py` | Mới. Đo sai lệch onset của từ mở đầu mỗi cụm so với biên Silero không padding, cho cả DTW hiện tại lẫn từng model aligner ứng viên. |
| `docs/adr/0007-preserve-source-word-timing.md` | Ghi kết quả đo lại và quyết định. |

Kế hoạch bảo đặt probe trong `.scratch/`. Em để vào `scripts/` thay vì vậy: lý do
phải làm lại probe này ngay từ đầu là **không ai chạy lại được kết luận cũ của
ADR-0007**, nên nó đứng vững suốt nhiều tháng trong khi runtime đã đổi. Lặp lại
sai lầm đó là vô nghĩa.

## Kết quả so với ngưỡng

Sample: `conviction`, 236 s, 665 từ, 31 cụm âm học.

| Chỉ số | Ngưỡng | `vi-vlsp2020` (mặc định) | **`vietnamese-250h`** (tốt nhất) | `mms-300m-1130` |
| --- | --- | --- | --- | --- |
| tỉ lệ từ align được | ≥ 98% | 100% ĐẠT | **100% ĐẠT** | 100% ĐẠT |
| confidence > 0.3 | ≥ 95% | 0.0% TRƯỢT | **89.3% TRƯỢT** | 58.5% TRƯỢT |
| sai lệch onset trung bình | ≤ 80 ms | 1051 ms TRƯỢT | **188 ms TRƯỢT** | 1071 ms TRƯỢT |

Để so sánh, **DTW đang chạy trong sản phẩm**: trung bình 107 ms, median 50 ms,
p90 230 ms. Ứng viên tốt nhất là 188 / 35 / 358.

## Lệch so với kế hoạch

**Thước đo ban đầu của em sai và em đã sửa giữa chừng.** Bản đầu lấy "word start
gần nhất với mỗi onset", vốn tự động cho điểm cao khi có nhiều từ — 665 từ trên
31 onset thì luôn có cái gì đó ở gần, đúng hay sai không quan trọng. Bản đã sửa
tìm từ đầu tiên có trung điểm nằm trong cụm, tức từ *lẽ ra phải mở đầu* cụm đó.
Số DTW đổi từ 176 ms xuống 107 ms sau khi sửa, nên mọi con số trước đó trong
phiên này đều bỏ.

Em cũng đo thêm một biến thể kế hoạch không nêu, vì nó quyết định khuyến nghị:
**lai ghép — lấy alignment khi confidence cao, giữ DTW khi thấp.**

| Ngưỡng confidence | % từ lấy alignment | trung bình | median | p90 | ≤80ms |
| --- | --- | --- | --- | --- | --- |
| 0.3 | 89.3% | 188 ms | 35 ms | 358 ms | 65.5% |
| 0.5 | 81.8% | 176 ms | 31 ms | 320 ms | 72.4% |
| 0.7 | 73.2% | 177 ms | 26 ms | 320 ms | 72.4% |
| 0.9 | 40.8% | 212 ms | 48 ms | 440 ms | 62.1% |

**Lai ghép không cứu được.** Median xuống tới 26 ms, nhưng trung bình đứng ở
177 ms và p90 ở 320 ms. Siết lên 0.9 làm mọi chỉ số tệ đi. Nghĩa là outlier
không phải những từ aligner không chắc — mà là những từ nó **sai một cách tự
tin**. Với ứng dụng này đó là loại sai tệ nhất: không có tín hiệu nào phía sau
phát hiện được.

## Phát hiện đáng giữ

Model mặc định của WhisperX cho tiếng Việt bị **nạp sai, không phải không phù
hợp**: checkpoint có tầng `feature_transform` mà `Wav2Vec2ForCTC` âm thầm vứt bỏ,
nên confidence tụt xuống 0.011. ADR-0007 đọc điều đó thành "aligner không hợp
tiếng Việt". Thực ra là "checkpoint đó không hợp loader đó". Ai quay lại việc này
phải bắt đầu từ `wav2vec2-base-vietnamese-250h`.

MMS-300M cần văn bản đã romanize; dấu tiếng Việt nằm ngoài vocab của nó và
WhisperX không romanize, nên nó suy biến thành nhiễu.

## Giới hạn của kết luận này

Một sample 236 giây, 31 cụm, chấm bằng proxy VAD chứ không phải mốc do người
đánh dấu. Đủ để **không tiêu tốn công sức R6**; **không** đủ để kết luận forced
alignment không giúp được gì. Chạy lại probe trước khi xét lại.

## Anh cần check

Round này không đổi hành vi app nên không có gì để bấm. Nếu anh muốn tự xác minh:

```bash
.runtime/omnivoice-studio/.venv/Scripts/python.exe scripts/probe_forced_alignment.py nguyenvulebinh/wav2vec2-base-vietnamese-250h
```

## Việc còn treo

- R6 **không thực hiện**. Điều kiện trong kế hoạch không thoả.
- Forced alignment cho **script người dùng cung cấp** (plan 03-02) vẫn còn nguyên
  và **không phụ thuộc** kết quả này — nó trả lời câu hỏi khác: người nói có đọc
  đúng script không, chứ không phải có thắng DTW về onset không.
- Cải thiện timestamp giờ nằm ở W2 (Codex đã code, 2 ngưỡng chưa đạt) chứ không
  còn ở W3.

### Review (Claude)

Tự làm nên không phải review độc lập. Số đo tái lập được bằng lệnh ở trên.

### Feedback

_(chưa có)_

---

# R7 — W4 Diarization

**Trạng thái:** ĐÃ XONG. Commit `db7f070`. Cả ba tiêu chí đạt.

## Kết quả so với ngưỡng

Sample `test-3` (236 s, 665 từ, 2 người nói), chạy lại end-to-end:

| Chỉ số | Ngưỡng | Trước | Sau |
| --- | --- | --- | --- |
| số run nhãn | ≤ 22 | 40 | **17** |
| từ không có nhãn | 0 | 39 | **0** |
| run < 3 từ kẹt giữa hai run cùng nhãn | 0 | 5 | **0** |

78 backend test pass, **không sửa test cũ nào**.

## Đã đổi

| File | Nội dung |
| --- | --- |
| `sequential_diarization_queue.py` | Gán nhãn theo bằng chứng phủ sóng; từ ở ranh giới nhường hàng xóm; từ trong khe kế thừa trong 0.6 s; smoothing đổi từ ngưỡng thời lượng sang ngưỡng khoảng lặng hai đầu; lưu spans thô |
| `studio_app/server.py` | `torchaudio.functional.resample` thay `interpolate(mode="linear")` |
| `scripts/stt_quality_report.py` | Đếm flip theo đúng tiêu chí < 3 từ |

## Lệch so với kế hoạch

**Thiết kế kế hoạch đề xuất bị bác bỏ sau khi thử.** Kế hoạch bảo gom từ thành
lượt theo khoảng lặng > 0.35 s rồi bỏ phiếu đa số cho cả lượt. Em code xong thì
một test có sẵn fail: hai người nói cách nhau **0.3 s** — luân phiên bình thường
trong hội thoại — bị gộp thành một lượt và một người mất tiếng nói. Đã thay bằng
cách phẫu thuật hơn, sửa đúng hai defect đo được thay vì đổi cả mô hình.

**Dùng `torchaudio.functional.resample` thay vì tạo file 16 kHz bằng FFmpeg.**
Kế hoạch chọn FFmpeg là chính, torchaudio là dự phòng. Nhưng FFmpeg kéo theo một
field mới trong model, một file mới cho mỗi asset, và migration cho asset cũ —
để đổi lấy tiết kiệm 1–2 giây trên một job chạy 154 giây. Kế hoạch cho phép
torchaudio; đây là đánh đổi tốt hơn.

**Không truyền `min_speakers`/`max_speakers`.** Kế hoạch nêu mục này, nhưng UI chỉ
có một ô "số người nói", và khi có số đó thì `num_speakers` (đang dùng) mạnh hơn
min/max. Không có gì để cải thiện nếu không đổi UI, nên em không thêm ống dẫn
không ai dùng.

**Đo lại aliasing thì nhỏ hơn em từng nói.** Trước em viết "mọi thành phần trên
8 kHz gập ngược vào dải thoại". Số đo thật: **+57% năng lượng thừa ở 6.5–8 kHz**,
−10% ở 3–5 kHz, sai lệch RMS tổng ~10%. Vẫn đáng sửa, không phải thảm hoạ.

## Giới hạn phải nói rõ

Smoothing chỉ gộp run **1–2 từ**. Bản mạnh tay hơn (≤5 từ) cho 11 run thay vì 17,
nhưng audit từng run bị gộp cho thấy nó **xoá mất backchannel thật** — *"À hiểu
hiểu"*, *"Đúng rồi"* — kiểu đệm rất phổ biến trong hội thoại tiếng Việt.

Nguyên nhân sâu hơn: DTW xếp từ sát nhau nên gap = 0.000 **ở cả backchannel thật
lẫn artefact giữa câu**. Không tín hiệu nào trong timing hiện tại tách được
chúng. Gán lời người nghe cho người nói là sai tệ hơn là để lại một run thừa mà
người dùng nhìn thấy và sửa tay được, nên em chọn phía hẹp.

**Chất lượng gán nhãn diarization bị chặn trên bởi chất lượng word timing.** Nếu
W2 làm timing tách được ranh giới cụm, quy tắc này có thể mở rộng an toàn.

## Anh cần check

| # | Việc anh làm | Kết quả đúng |
| --- | --- | --- |
| 1 | Mở **Test 3**, xem Script chế độ speaker | Không còn từ nào thiếu nhãn |
| 2 | Đọc qua transcript | Không còn đoạn 1–2 từ bị gán nhầm sang người kia giữa câu |
| 3 | Kiểm tra các đoạn đệm ngắn ("Đúng rồi", "À hiểu hiểu") | Vẫn thuộc người nghe, không bị gộp vào người nói |

Mục 3 quan trọng nhất — nếu anh thấy backchannel bị gán nhầm, báo em, đó là chỗ
em đã chọn đánh đổi.

Tự chấm lại không cần GPU (spans đã lưu):

```bash
.venv/Scripts/python.exe scripts/stt_quality_report.py --project test-3
```

## Việc còn treo

- `min_speakers`/`max_speakers` cần UI cho khoảng số người nói trước khi có ý nghĩa.
- Backchannel 1–2 từ vẫn có thể bị gộp; cần word timing tốt hơn (W2) mới sửa được.

### Review (Claude)

Tự làm nên không phải review độc lập. Spans thô của cả hai project giống nhau
từng byte, nên pyannote deterministic ở sample này và cải thiện 40 → 17 quy được
cho thay đổi thuật toán chứ không phải may rủi.

### Feedback

_(chưa có)_

---

# Template báo cáo round

Agent copy nguyên khối này xuống cuối file cho mỗi round mới.

````markdown
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

| Chỉ số | Ngưỡng | Baseline | Agent đo được | Anh xác nhận |
| --- | --- | --- | --- | --- |
| | | | | |

## Anh cần check

_(Copy nguyên bảng checklist của round này từ STABILIZATION-PLAN.md.)_

## Việc còn treo

_(Những gì round này cố tình không làm, và round nào sẽ làm.)_

### Review (Claude)

_(chưa có)_

### Feedback

_(chưa có)_
````

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

---

# R2 — Timing trust theo từ

**Trạng thái:** đã code, commit `bfcaafd`. Chờ nghiệm thu tay; 2 ngưỡng dữ liệu
thật chưa đạt và không được hạ.

## Đã đổi

| File | Nội dung |
| --- | --- |
| `services/api/app/adapters/word_timing_quality.py`, `domain/models.py` | Gắn `timingTrusted` cho từng từ theo đúng 5 điều kiện; tóm tắt asset thành `source` / `partial` / `needs-alignment`; version migration để backfill một lần mà không biến dữ liệu provisional thành trusted. |
| `services/api/app/adapters/file_media_library.py` | Reconcile và persist cờ trust ở mọi đường ghi words; lazy-migrate index cũ đúng một lần. |
| `apps/web/src/modules/timeline/Timeline.tsx`, `domain/types.ts`, `styles/modules.css` | Timeline chỉ ẩn word box khi asset là `needs-alignment`; từ untrusted vẫn hiện với style cảnh báo; thêm type `partial`. |
| `services/api/app/adapters/subtitle_exporter.py` | Asset `partial` được export SRT; bỏ đúng cue có từ untrusted và thêm header ghi số cue đã bỏ. Export bảng không đổi. |
| `services/stt_studio/studio_app/server.py` | Group theo `segmentIndex` rồi gap 0,20 s; bỏ warp toàn nhóm; chỉ snap từ đầu/cuối trong cửa sổ ±0,40 s; chỉ từ thực sự dịch mới mang `faster-whisper-dtw+silero-edge`; note luôn ghi số nhóm hoặc lý do không snap. |
| `scripts/stt_quality_report.py` | Báo trust theo từng từ và thống kê phrase group theo thuật toán W2. |
| `docs/adr/0008-refine-dtw-phrase-edges-with-unpadded-vad.md`, `CONTEXT.md` | Ghi lại phép đo, quyết định edge-snap, và thuật ngữ trust mới. |
| 5 file test backend + `Timeline.test.tsx` | Thêm coverage ngưỡng 5%, từng loại từ lỗi, migration, SRT partial, snap biên và UI cảnh báo. |

## Lệch so với kế hoạch

- Không sửa `main.py`: code hiện tại sau R1 đã chặn SRT đúng duy nhất khi
  `wordTimingQuality == "needs-alignment"`; sửa thêm sẽ chỉ tạo diff thừa.
- Kế hoạch dự đoán cả hai asset PDCA chuyển sang `partial`, nhưng chính bộ quy tắc
  W2 tìm thấy asset `asset-bf35963dedac` có 2.737/47.719 từ untrusted = **5,74%**
  (phần lớn là span < 25 ms). Theo ngưỡng `>= 5%` đã khóa, kết quả bắt buộc vẫn là
  `needs-alignment`. Không hạ ngưỡng và không thêm ngoại lệ theo asset.
- Sample 236 s chạy end-to-end chỉ snap 20/56 nhóm = **35,7%**, thấp hơn 60%.
  Với cách group bắt buộc theo `segmentIndex`, sample có 53 lần tách theo segment
  nhưng chỉ 31 Silero span; chỉ 21/56 nhóm có ít nhất một edge gần cửa sổ. Muốn
  vượt 60% phải đổi thuật toán ngoài phạm vi W2 nên dừng ở số thật.
- Một số test cũ được đổi kỳ vọng vì W2 cố ý thay hợp đồng: word dict lỗi nay được
  giữ lại với `timingTrusted=false` thay vì bị bỏ; Timeline hiển thị timing
  provisional trừ `needs-alignment`; refine chuyển từ warp/reject cả nhóm sang
  snap riêng hai biên. Không test nào bị sửa để né lỗi.

## Agent tự kiểm

```text
.venv\Scripts\python.exe -m pytest services\api\tests -q
69 passed, 2 warnings in 10.38s

npm test
Vitest caught 10 unhandled errors: Failed to start forks worker (timeout)
Test Files: no tests; Tests: no tests; Errors: 10; Duration: 60.23s

npm test -- --pool=threads
Test Files  10 passed (10)
Tests       43 passed (43)
Duration    71.36s

npm run build
tsc -b && vite build
48 modules transformed; built in 1.07s

git diff --check
exit 0 (chỉ có cảnh báo LF -> CRLF của Git trên Windows)
```

Output thật của quality report sau migration:

```text
asset-7e08a3f43af8  words=33912  quality=partial          trusted=33843/33912 (99.8%)
asset-bd55873fc707  words=43417  quality=partial          trusted=42656/43417 (98.2%)
asset-bf35963dedac  words=47719  quality=needs-alignment  trusted=44982/47719 (94.3%)
TOTAL words=125048 trusted=97.1%
media.list first=0.450s repeat=0.024s; media.get=0.036s
```

Probe read-only thuật toán mới trên asset PDCA 9.881 s:

```text
words=33912; phrase_groups=4565
snapped_groups=3053/4565 (66.9%); snapped_words=3678
```

Fresh STT end-to-end trên sample 236 s:

```text
words=665; phrase_groups=56
snapped_groups=20/56 (35.7%); snapped_words=25
engine=faster-whisper-native-dtw+silero-edge
note=... (20 phrase groups; middle words unchanged)
```

Các asset PDCA cũ chưa chạy lại STT nên file persist vẫn có 0 provenance
`silero-edge`; số 3.053/4.565 ở trên là probe read-only bằng thuật toán hiện tại.

## Kết quả so với ngưỡng

| Chỉ số | Ngưỡng | Baseline | Agent đo được | Anh xác nhận |
| --- | --- | --- | --- | --- |
| Tỉ lệ từ `timingTrusted` trên 3 asset PDCA | ≥ 95% | 27,1% từ từng được asset-level gate cho hiện | **97,1% — ĐẠT** | |
| Sample 236 s: nhóm được snap biên | ≥ 60% | 1/17 nhóm; 6/665 từ | **20/56 = 35,7% — CHƯA ĐẠT** | |
| PDCA 9.881 s: nhóm được snap biên | > 0 | 0/1.126 | **3.053/4.565 = 66,9% — ĐẠT** | |
| `asset-bd55873fc707` | chuyển sang `partial` | `needs-alignment` | **`partial`, 98,2% trusted — ĐẠT** | |
| `asset-bf35963dedac` | chuyển sang `partial` | `needs-alignment` | **`needs-alignment`, 94,3% trusted — CHƯA ĐẠT** | |
| Test ngưỡng 5% và cờ theo từng từ | có | chưa có | **có, backend 69 pass — ĐẠT** | |

## Anh cần check

| # | Việc anh làm | Kết quả đúng |
| --- | --- | --- |
| 1 | Mở PDCA, chọn `2026-08-26 08-33-29.mp3` (43,417 từ) | Timeline **hiện word box**. Trước đây trống trơn. |
| 2 | Nhìn nhãn chất lượng của asset đó | `partial`, kèm ghi chú số vùng cần căn chỉnh |
| 3 | Phát audio | Từ đang phát được highlight ở cả Timeline và Script |
| 4 | Tìm vùng có từ xấu (theo ghi chú) | Từ đó hiện với style cảnh báo, **không bị ẩn** |
| 5 | Export SRT theo câu | Xuất được. Header ghi số dòng đã bỏ qua. |
| 6 | Chạy lại STT trên footage 236 s, xem báo cáo của agent | Tỉ lệ nhóm được snap biên ≥ 60% (trước: 1/17 nhóm, 6/665 từ) |

## Việc còn treo

- Chủ dự án/reviewer cần quyết định cách xử lý mâu thuẫn giữa yêu cầu “cả hai
  asset thành partial” và ngưỡng 5%: asset 47.719 từ đang ở 5,74%. W2 không tự ý
  thay ngưỡng.
- Ngưỡng snap 60% của sample chưa đạt vì số Whisper segment nhiều hơn số Silero
  span. Thay grouping hoặc cho snap qua segment boundary là một quyết định thuật
  toán mới; để round sau quyết định, không mở rộng W2.
- Chưa bấm nghiệm thu UI thật; sáu mục ở bảng trên chờ chủ dự án.
- `npm test` mặc định vẫn gặp fork-worker timeout trên ổ mạng ánh xạ; pool threads
  chạy đủ 43 test và build sạch.
- R5 chỉ được bắt đầu ở invocation kế tiếp; round này dừng tại đây.

### Review (Claude)

_(chưa có)_

### Feedback

_(chưa có)_

## USER-FEEDBACK-05 — 2026-10-09

Timeline individual-word density and local timing edits supersede the04 overview
snippets. Atomic promoted IN/OUT and direct edits preserve untouched neighbours;
actual collisions retain10% and warn. Unsafe editable intervals become explicitly
untrusted positive estimates with source timing retained. Studio phrase-edge snaps
are fenced against original neighbours and already-refined adjacent gaps.
Frontend627/71, API679/two existing warnings, typecheck/build and focused Studio
regressions pass; see `docs/gates/user-feedback-05-timeline-word-timing.md`, ADR0052.
No new acoustic accuracy claim is made. The historical250h candidate worsened
mean/tail proxy error; R5/R6 remain unaccepted under their frozen gates. Exact next
STT-TIMING-ACCURACY-01 requires reviewed word IN/OUT truth and isolated comparison
in `docs/STT-TIMING-ACCURACY-PLAN.md`. Real visual/audio and older prerequisites
remain. No model dispatch, normal service restart, owner audio or phase-budget
change occurred.

## USER-FEEDBACK-10 — 2026-10-09

### Feedback

**Nguyên văn (copy từ chat):**

> anh thấy giao diện nó không nhất quán.&#x20;
>
> hiện tại, trong project "test OBS 9", "Conviction" khi lăn chuột xuống thì nó hay bị giật giật, không đến được đoạn cuối.
>
> còn trong project "**PDCA_CLDNDD_K4_V02**" thì khi lăn chuột được vài lần thì nó tự scroll xuống rất nhanh, không dừng lại được. Phải nắm kéo thanh scroll mới được.
>
> anh để ý thấy mỗi dự án test OBS Livelink là thanh scroll bị mất.
>
> em phải kiểm tra lại rõ vì sao lại có sự khác nhau này? anh muốn chia module là để nhất quán ở mọi tình huống. Nó phải hoạt động đúng thiết kế. Chứ không phải mỗi nơi một kiểu, mỗi dự án một kiểu.

Phản hồi xác định module: **script**. Cách hiểu: sửa cơ chế cuộn Script dùng chung, không thêm ngoại lệ theo project.

## Agent tự kiểm

Commit `9fcd554` stabilizes shared Script scrolling: semantic measurement caches,
anchor-preserving height changes, logical-row chrome and header offsets, and
manual browsing priority over playback/data-refresh follow. Table, prose,
archived channels and OBS realtime now share an explicit keyboard/pointer
scrollbar. Table toolbar no longer expands the scrollbar's region. Read-only
owner topology explains different routes: OBS1,136 words/10 turns/25 fragments;
Conviction665/15/19; PDCA42,107/3/659. Three red regressions reproduce anchor
movement, refresh cache churn and Script refresh returning5,000->0; green now.
Full frontend654/75 before final toolbar containment refinement; final focused
53/4, typecheck/build pass. Backend unchanged; API687 is carried08 baseline.
Gate `docs/gates/user-feedback-10-script-scroll.md`, ADR0057. Natural wheel
smoothness, end reachability and visible OBS scrollbar on the owner device still
need UX-EDITING-DEVICE-01 after reload; source/jsdom is not that acceptance.
Exact next executable STT-GAP-01 retains recognizer/merge artifacts on an isolated
copy; native Script acceptance can proceed alongside. No owner media/transcript,
normal service/model, schema/upstream or Phase03-budget change. Phase03 stays60%.

Full test log và topology ở `.scratch/user-feedback-10`; chưa xác nhận nghiệm thu cuộn bằng chuột thật. R5/R6 và ngưỡng timing cũ không đổi.

## USER-FEEDBACK-11 — 2026-10-09

### Feedback

**Nguyên văn (copy từ chat):**

> ở job test OBS 9, khi scroll tới hết script thì nó báo như hình. Hiện tại thì không còn giật giật nữa. Đã có thanh scroll rồi.
>
> lăn chuột cũng không còn tự chạy nữa.
>
> Em sửa lỗi cho anh

Ảnh: "Không hiển thị được script", "Minified React error #185"; bản sao ở
`.scratch/user-feedback-11/owner-script-end.png`. Cách hiểu: giữ các cải thiện
cuộn đã được xác nhận, sửa vòng cập nhật khi cuộn qua vùng cuối Script OBS.

## Agent tự kiểm

Commit `9c6c696` repairs React185 at an archived Script boundary. Row minimum
height changed with a one-word continuation; measured offsets updated while
viewport still held the previous position, alternating windows/corrections.
Publish matching corrected viewport and measurements in one batch, retaining
postcommit browser clamp/readback and existing presentation/scrollbar. Minimal
65+600-word hook and OBS9-shaped ChannelScript caller both reproduce the exact
maximum-update-depth error on baseline and pass after repair. Full frontend659/75,
focused20/4, typecheck/build/diff pass; API687 remains carried08 baseline.
Owner confirms jitter/runaway ceased and scrollbar present after10; end error
acceptance is now UX-SCRIPT-END-DEVICE-01 after reload. Gate
`docs/gates/user-feedback-11-script-end-react-depth.md`, ADR0058. Exact next
executable STT-GAP-01 retains isolated recognizer/merge results before replacing
owner text. No source media/transcript, services/models, schema/upstream or
Phase03-budget changes; stays60%. Native all-route/audible/device gates remain.

Nguyên nhân: prefix offsets mới và viewport cũ được render xen giữa trước khi
bù vị trí; row controls làm hai cửa sổ liên tục thay nhau. Sửa bằng cập nhật
viewport/measurement cùng batch; không tăng ngưỡng/tắt lỗi React. Gate có log đỏ
và xanh; việc nghiệm thu hết Script trên thiết bị sau reload vẫn chờ chủ dự án.

## USER-FEEDBACK-12 — 2026-10-09

Shared Timeline density/rulers eliminate OBS15s detail floor. Shared consent form
uses14px checks and project-local proof uploads. Voice Collection creation, export
and import work through Hub and all Sound Library routes, with copied artifacts
and lineage. Product23e6494; final frontend672/API703, typecheck/build pass.
Initial Windows Stop-test failure, isolated pass and final full pass are retained.
Native UI acceptance and STT-GAP-01 remain; gate user-feedback-12 and ADR0059.

## USER-FEEDBACK-13 — contained Sound Library and Script row controls (2026-10-09)

Product `1532c47` contains profile/voice controls in compact Sound Library slots,
with fixed selection boxes, separate voice actions and explicit Properties.
Shared list bounds cover Input, standalone and Voice Manipulator. Channel Script
places profile choice with leading row controls. Plain ticks toggle membership;
Shift/Ctrl+A and selected-row-only assignment remain. Explicit null word speaker
IDs survive Script/Workspace/Timeline and compiler ownership, preventing cleared
rows from inheriting the footage default. Raw diarization remains provenance.

Frontend682/77, focused Script56/3 and compiler34 pass; typecheck/build pass.
Full API704/twoexistingwarnings and diff checks pass. Gate user-feedback-13-library-slots-script-profile,
ADR0060. Owner restart/reload and narrow-panel containment, clear/reopen and long
Script-end acceptance remain device gates. Native rendering cannot be proven by
source/jsdom checks. Phase03 stays60%; no owner media/model/runtime mutations.
Exact next STT-GAP-01 retains isolated OBS recognizer/merge evidence before repair.

## USER-FEEDBACK-14 — Library menus and imported generation (2026-10-09)

Product `99dc301` moves profile color/apply/delete/deselect and model bulk
delete/deselect into right-click menus. Tick selection inserts no toolbar.
Selected ranges, nested model scope, keyboard navigation and focus are retained.
Labels distinguish Speaker Profile identity from the trained ProjectVoice model.
Optional Collection origin persists on new imports and projects from bounded
legacy markers without rewriting owner records; imported models hide Add to
Collection. A generation category override makes imported trained voices available
immediately and on reopen without changing Training settings; a compact selector
permits manual category choice. Existing publication/engine gates remain.

Final frontend690/77, API706/twoexistingwarnings, typecheck/build/diff checks pass.
Gate user-feedback-14-context-menu-collection-generation and ADR0061 retain
red/green evidence and the old-toolbar caller test update rationale. Read-only
OBS9 confirms its existing full model is imported. Native narrow-menu layout and
audible generation remain device acceptance after restart; mocks prove request
routing, not model quality. Phase03 stays60%; owner media/model/runtime unchanged.
Exact next STT-GAP-01 retains isolated recognizer/merge evidence before repairing
missing OBS words, so existing text is not replaced without recognition evidence.


### Feedback — 2026-10-09

**Nguyên văn (copy từ chat):**

> khi tick chọn thì các nút như "áp dụng màu", "xóa profile" và "bỏ chọn" nên cho vào right click menu. không nên có nút nào nhày ra như này nữa.
>
> anh đang không hiểu có 2 mục Anh Vũ và Anh Vũ - full fine-tune là gì? nếu nó là 2 bản training khác nhau thì tại sao chỉ có full fine-tune là có nút Add to Collection? nếu nó là 1 thì tại sao lại có 2 slot trong module? và có 2 dấu tick? và 2 cái này kết quả tạo ra voice sẽ có gì khác nhau?
>
> với các voice được Import from Collection thì voice đó nó sẽ không tồn tại nút Add to Collection nữa. và trong page Voice Manipulation sẽ tự nhận voice đã import từ collection và cho người dùng chọn để generate voice.

Ảnh: codex-clipboard-31a8db18-07d5-481d-92b6-868a047501e9.png trong chat.

**Cách hiểu:** tick chỉ chọn đối tượng; thao tác nhóm nằm trong menu chuột phải.
Phải phân biệt rõ hồ sơ người nói và model, giữ đúng phạm vi mỗi dấu tick.
Ẩn export đối với model import, kể cả bản import cũ và sau reopen; cho model đó
xuất hiện để generate mà không phụ thuộc loại model đang chọn ở Voice Training.

### Agent tự kiểm / kết quả so với ngưỡng

Library red2/green16; Workspace/Generator focused51; backend focused31.
Full frontend ban đầu689 pass/1fail do ModuleRegistry test bấm toolbar đã bỏ;
test chuyển sang context menu nhưng giữ nguyên xác nhận/callback xóa nhóm.
Final690/77 và API706/twoexistingwarnings208.24s, typecheck/build/diff pass.
Không đổi ngưỡng chất lượng hay timing. Native menu và output âm thanh chưa
nghiệm thu; gate14 ghi checklist. Kế tiếp STT-GAP-01; Phase03 vẫn60%.

## USER-FEEDBACK-15 — Collection profile/model import selection (2026-10-09)

Product `a06c2f8` groups Collection models by exact source project and Speaker ID.
Parent checks select all archived models in that Collection; expanded child
checks select a subset, with mixed parent state. Fixed import action adds no
selection toolbar. Imports run serially with catalog flush before every request;
confirmed models leave selection, failed/unprocessed models remain for retry.
Workspace publishes its changed catalog snapshot synchronously to the transfer
ref, preventing pre-render flush from dropping confirmed profiles.

API imports reuse one destination profile for the same archived origin, retain
manual edits and recover legacy markers/catalogs. Profile consent proof has
independent project ownership; each model retains its archived evidence/hash
snapshot. Copy/save failures roll back new artifacts. Lead review repaired header
CSS specificity and a reproduced child-folder containment gap. Existing artifact,
checkpoint and publication gates remain; unrelated equal names never merge.

Final frontend696/77, API712/twoexistingwarnings, typecheck/build/diff pass.
Focused UI8, Workspace44, Collection API22; isolated legacy proof/manual-edit/
actual-deletion check1 pass. Gate user-feedback-15-profile-model-import, ADR0062.
Native grouped-checkbox layout and audible owner-model output remain acceptance
after restart: fixtures prove transfers, not inference quality. Owner projects,
models and normal runtimes remain untouched; Phase03 stays60%. Exact next
STT-GAP-01 retains isolated OBS recognizer/merge evidence before missing-word repair.


### Feedback — 2026-10-09

**Nguyên văn (copy từ chat):**

> Vậy nghĩa là trong một hồ sơ sẽ có nhiều model phải không? nếu vậy thì nên có dấu tick để import cả bộ hồ sơ người nói, hoặc là import vài model trong hồ sơ do người dùng tự chọn

**Cách hiểu:** một hồ sơ sở hữu nhiều model. Trong Import from Collection,
tick hồ sơ chọn toàn bộ model đã lưu trong Collection đó; xổ và tick model
để chọn một phần. Các model import cùng nguồn hồ sơ dùng chung một hồ sơ đích,
không nhân bản hồ sơ cho mỗi model hoặc gộp hai người chỉ vì trùng tên.

### Agent tự kiểm / kết quả so với ngưỡng

Workspace caller red: hai profile đã import biến mất khỏi snapshot flush trước
React commit; green44 sau cập nhật transfer ref đồng bộ. UI focused8 pass.
API red: hai model cùng nguồn có hai speaker ID; green22 gồm retry/reopen,
legacy recovery, actual model deletion, copy/save rollback và tamper rejection.
Lead containment regression red1 DID NOT RAISE; đã chặn leaf symlink/junction
ở prepare/publish, test chạy không skip và target bên ngoài giữ trống.
Test proof path cũ đổi sang profile-owned theo ADR0062; snapshot model vẫn được
assert riêng. Full frontend696/77, API712/twoexistingwarnings204.01s;
typecheck/build/diff pass. Legacy proof/manual-edit/delete fixture bổ sung1 pass.
Không đổi ngưỡng nghiệm thu hoặc Phase03 budgets. Native group checks và âm thanh
generate còn cần nghiệm thu sau restart; round kế tiếp STT-GAP-01.


## USER-FEEDBACK-16 — profile nesting and OBS word sync (2026-10-10)

### Feedback — 2026-10-10

**Nguyên văn (copy từ chat):**

> nếu một model nằm trong một profile thì nó phải nằm trong nút xổ trong profile trong module Speaker Profile. Hiện tại profile và model đang ngang hàng.
>
> khi STT với file âm thanh record từ OBS Livelink thì nó không chạy sub theo. Không tương tác qua lại giữa Script và Timeline module.

**Cách hiểu:** model là đối tượng con trong phần xổ của hồ sơ Speaker. Với
footage OBS đã ghi xong/STT, chọn từ trong Script hoặc subtitle phải tua đúng
audio/playhead; khi playback, highlight Script và subtitle cùng thời gian,
cả view nhiều track và một track.

### Agent tự kiểm / kết quả so với ngưỡng

Product `cc1a8fa` nests trained ProjectVoice models inside independently
expandable Speaker Profile slots, initially collapsed, with accessible counts
and retained selection/context/Collection controls. Imported models still hide
Add to Collection. Properties stays in its header column even without models.

Archived OBS now publishes per-asset active word indexes and accepts Script
seeks through the shared playback store. Subtitle clicks seek audio as well as
the playhead; single-track Script selection and repeat clicks seek correctly.
Silence clears highlights; asset refresh does not rewind. The focused standard
Timeline owns its clock and has local selection when opened from multitrack.

Real ModuleRegistry regressions fail before the repair and pass afterward;
review caught and repaired the multitrack focused-selection gap. Final frontend
701/77 files, typecheck/build/diff checks pass. API718/twoexistingwarnings is
carried from STT-GAP-01, not rerun. Read-only OBS9 confirms two stem/asset/parent
identities and original1094/42 word arrays; six metadata hashes are unchanged.
Gate user-feedback-16-profile-obs-sync; ADR0064. No source/model/data mutation
or runtime restart. Reload the built UI for the new frontend.

Native layout/audio interaction still needs owner acceptance because repository
jsdom tests cannot prove playback on the device; prior automatic browser review
rejection remains respected. Phase03 stays60% and recognition/timing budgets
remain open. Exact next development round **STT-GAP-02** reviews recovered gap
text and other long/boundary/silence samples; STT-TIMING-ACCURACY-01 remains open.

Red UI disclosure1; red ModuleRegistry interaction2; review focused selection
red aria-pressed=false. Đã sửa, final frontend701/77 files92.39s. Repeat-click
regression dùng đủ pointer-down/up/click như trình duyệt thật; không đổi quy tắc
kéo row trong Script. Một focused run trung gian có nhãn zoom ngắn0.02 thay vì
0.01; không tái diễn trong full runs sau đó và không sửa assertion để né lỗi.
Không suy ra nghiệm thu native zoom/audio từ jsdom. Rerun backend không cần
cho thay đổi UI này; số718 là baseline mang theo, không phải kết quả vòng này.


## STT-GAP-02 — retained gap review and context screen (2026-10-10)

### Feedback

> em hãy làm tiếp STT-GAP-02

Chủ dự án đã gửi lời tham chiếu sau khi nghe/đối chiếu; nguyên văn được giữ
riêng trong `.scratch/stt-gap-02/run-1/owner-reference-score.json`.

### Agent tự kiểm / kết quả so với ngưỡng

Measurement `cd86683` freezes reference PCM/protocol and retains real Studio
responses plus publication artifacts. Serial cached large-v3 A/B uses two
116.454s curated speech tracks and125s zero PCM:10 requests. Common60s owned
blocks +2s context improve micro CER11.2831 ->7.8382% and WER13.6364 ->9.5779%;
bounded text passes the inherited10%/20% screen. Pure silence emits zero words
in both modes. Publication handoff keeps the same text/counts, resolves one
raw seam overlap and has zero final overlaps; timing provenance stays partial.

Owner supplied independently heard/reference OBS9 text. The corresponding
expanded101-word passage scores CER30/310=9.6774%, WER13/101=12.8713%; this is
post hoc lexical review with context, not a77-word-only or acoustic timing gate.
All1,177 retained OBS words map one-to-one to owning raw records; starts are
unchanged and ends shorten at most20ms. No owner word data was replaced.

One bounded word interval remains wholly inside inserted zero PCM; lexical
hallucination versus neighboring-word displacement is unresolved. Independent
word anchors are absent, so <=250ms IN/OUT p95 is unmeasured. Focused API34
passed5.60s, profiler compile/reanalysis/diff pass,23 source hashes unchanged.
Full API718 and frontend701/77/typecheck/build are carried, not rerun. Studio
health ok/controller running; no restart/browser automation/source mutation.
Gate `docs/gates/stt-gap-02-context-screen.md` and aggregate JSON retain evidence.

Bounded STT-GAP-02 review/screen is complete; Phase03 stays60%, no acceptance
budget changes. Exact next **STT-TIMING-ACCURACY-01** independently anchors OBS
and boundary/zero-PCM words, measures timing, and screens a bounded correction.
Native Script/Timeline audio acceptance and broader speaker coverage remain.
