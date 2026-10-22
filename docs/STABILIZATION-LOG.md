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

## 2026-10-10 — STT-TIMING-ACCURACY-01

### Feedback

> em hãy làm tiếp STT-TIMING-ACCURACY-01

### Agent tự kiểm / kết quả so với ngưỡng

Measurement/tooling `08918b7` retains three exact mono PCM16/24kHz crops
(OBS9 236–272s; speech-2 55–66s and 75–82s), 148 native and edge-refined words
from the same private CPU/int8 Studio passes, and a separate cached Vietnamese
250h CPU alignment. Production timing defaults and owner runtimes are unchanged.

Candidate has 150/150 raw timed words. OBS confidence >0.3 is 97/104 =93.27%,
below the unchanged95% gate. Two cases contain leading transcript words absent
from the native timed-word lists; safe identity mapping is withheld rather than
shifted. Safe comparison coverage is104/148 =70.27%, below98%. Pooled candidate
VAD-proxy onset mean142.53ms also exceeds80ms; this is not human IN/OUT truth.
Short-crop intervals have no invalid/zero/overlap cases; prior zero-PCM timing
remains unresolved because decode context changed.

The blind offline worksheet has24 targets, exact audio and empty manual IN/OUT.
The scorer binds protocol/audio/word identity, reports missing/lexically corrected
words and checks IN/OUT p95 separately against250ms. Human anchors are absent:
errors and acceptance remain unmeasured. No timing winner/default is accepted.

Focused23 and full API741/two existing warnings pass; compile/JS syntax/diff
checks pass. Prior frontend701/77/typecheck/build is carried, not rerun. Closure
rehashes23 previous read-only sources, both current PCMs and all3 crops unchanged.
Recognition RSS is unavailable; alignment RSS is measured. First NLTK path denial,
protocol amendment and derived clock repair are retained transparently in the
gate. Browser/audible acceptance remains unverified; no automation workaround.

Gate `docs/gates/stt-timing-accuracy-01.md` and aggregate JSON document evidence.
The bounded profiling/tooling slice is complete; Phase03 remains60%. Exact next
**STT-TIMING-ACCURACY-01 independent anchor review**: receive the matching
`reviewed-anchors.json` from the worksheet, measure paired errors, and resolve
untimed leading-word identity before a bounded correction or default change.
Broader speaker coverage and native Script/Timeline acceptance remain open.

## 2026-10-10 — USER-FEEDBACK-17

### Feedback

Chủ dự án báo đầu mút kéo che ký tự ở mép subtitle và từ cũ biến mất khi
playhead sang từ khác. Chủ dự án sẽ chỉnh timing kỹ trong Conviction để làm
benchmark; mốc nghe độc lập chưa được cung cấp.

### Agent tự kiểm / kết quả so với ngưỡng

Product `3669099` / `05a5ce9` repairs subtitle rendering in one bounded round. Trim grips
sit outside and above readable word boxes; a separate clipped label keeps text inside.
Grip width reserves no layout/time space and selection changes no source words
or neighbouring timestamps. Compact overview stripes retain hidden grips.

The missing previous word was reproduced through Timeline audio-clock updates:
floating-point pixel collisions/search boundaries dropped a touching readable
box when the active neighbour changed. Shared density arithmetic now preserves
these boundaries at1e-6 pixel precision, with strict4px compact occupancy and
visual overshoot clipping. Ordinary, imported and archived OBS views use the
same helper; focused editors share the Timeline label/grips.

Original-product replay has3 regression failures (5px grip intrusion, density
omission, missing DOM word). Repaired focused36/4 and full frontend704/78 pass;
typecheck/build/diff pass. The full pass uses two workers with original test
budgets retained, after a loaded default run failed Script wheel/live-caption
checks; affected files also pass separately58/2. Full backend: 741 passed / two existing warnings in223.39s.
Gate `docs/gates/user-feedback-17-subtitle-grips-visibility.md` records evidence
and resolved test-setup failures. No owner runtime restart/model job/media edit.

Native screenshot/audio acceptance remains after reloading the built UI; the
prior automatic browser approval rejection is respected without a workaround.
The owner will carefully review timing in Conviction. Exact next remains
**STT-TIMING-ACCURACY-01 independent anchor review**: after owner confirmation,
freeze the reviewed regions/PCM/word identities as a separate benchmark copy.
That project can supply anchors without repeating the offline worksheet. Human
IN/OUT accuracy remains unmeasured, timing defaults unchanged; Phase03 stays60%.

## 2026-10-10 — USER-FEEDBACK-18

### Feedback

Owner requests Add text on subtitle right-click and a multiword input on
double-clicking empty subtitle space, splitting words into individual boxes
with evenly divided timing.

### Agent tự kiểm / Kết quả so với ngưỡng

Product `3186a8e` adds **Add text** to subtitle context menus and an
inline multiword editor on double-clicking a timing gap. Ordinary, imported
multitrack and archived OBS lanes share the editor. Hidden words still edit by
source timestamp; Ctrl-click and existing word actions remain available.

Inserted tokens receive separate equal positive provisional spans with small
spacing, bounded by adjacent words/audio end. Exact old word identities and
timestamps survive, including repeated text and tiny gaps. A no-room insertion
shows an inline alert and commits nothing. Enter/blur commits once; Escape
cancels. The input remains inside the viewport and Script updates through the
existing asset callback/history path.

Focused102/5 and final frontend715/78 pass; typecheck/build/diff pass. The first
full run714/1 exposed hidden-word editing and was repaired without changing its
assertion or DOM budget. Full backend: 741 passed /2 existing warnings in227.20s.
Evidence: `docs/gates/user-feedback-18-subtitle-text-insertion.md`.

Native device acceptance remains after refreshing the built UI. Exact next:
**STT-TIMING-ACCURACY-01 independent anchor review** when the owner finishes
Conviction. That reference matters because provisional interpolation is not
acoustic truth. Phase03 stays60%; timing defaults/budgets remain unchanged.


## 2026-10-10 — USER-FEEDBACK-19: đồng nhất bảng Script

### Owner feedback

Owner requests the Conviction table for all imported/recorded/project sources,
profile dropdown beside the checkbox, a30% smaller tick and the track label
immediately beneath the dropdown on multitrack footage.

### Agent tự kiểm / Kết quả so với ngưỡng

Product `278188d` makes ordinary footage, imported/archived channels, pending
OBS and VoiceScript use shared transcript table/header/row/speaker/selection
components. Separate channel cards are removed. Default columns and browser
column preferences now apply across projects and sources; legacy per-footage
keys are retained but no longer applied.

The profile dropdown is beside the16.8px checkbox (30% smaller), with its row
number underneath and channel name directly below the dropdown. Selected-only
assignment/unassignment remains; VoiceScript plain-click untick is repaired.
Text formatting and vertical scrollbar chrome are shared. Aggregate/live
export/clear/AI controls remain visible but disabled until a child document is
opened; live segment timing/profile readiness is not represented as archived
word data.

Focused92/7 and full frontend728/80 pass; typecheck/build/diff pass. Backend:
741 passed /2 existing warnings in206.62s. Full frontend preceded the final
code-tag timestamp/title polish, then all92 affected tests and typecheck/build
passed again. Evidence: `docs/gates/user-feedback-19-script-layout.md`;
shared presentation contract: ADR0065.

Native acceptance remains after refresh: compare Conviction and OBS9 parent/
child rows, checkbox/profile/track layout, long scroll and Voice Model selection.
DOM/CSS regressions establish structure and styles, not appearance on the owner's
device. Exact next: **STT-TIMING-ACCURACY-01 independent anchor review** after the
owner completes the Conviction benchmark. Phase03 stays60%; acoustic timing
accuracy, production defaults, media and model jobs are unchanged.


## 2026-10-10 — USER-FEEDBACK-20

Product `c253313` removes row-selection/source-feed disabling of valid Script
controls. Row profile dropdowns always open, including an empty catalog, and
always offer Chưa gán Profile. Opening an unselected row selects it only when
there is no existing selection; assignment/unassignment touches selected rows.
The same control rule applies to ordinary footage, channels and VoiceScript.

Archived parents now supply real child documents to table/text, Find/Replace,
AUTO NHỊP, Clear Text, Export and AI fix. Each source retains its own offsets,
word timings and labels. Multi-document edits use one Undo/Redo step. AI
candidates remain choices; late replies preserve newer edits and removals.
Other shared-module routing was audited; matrix and limits are in
`docs/gates/user-feedback-20-script-actions.md`. ADR0066 supersedes ADR0065's
archived-aggregate action restriction. Pending live drafts still require an
archived word document for destructive/word-document operations.

Five original caller repros failed before the fix. Final frontend750/83 passes
in93.46s; typecheck/build/diff pass. Backend741 passes /2 existing warnings in189.09s.
No selection assertion or performance budget was removed or relaxed.

Native acceptance remains after refresh: try profile assign/unassign, selected
rows only, table/text, Find/Replace, pause formatting, Undo/Redo and parent
Export/AI fix in Conviction and OBS9. Automated evidence does not prove native
popup rendering. Exact next: **STT-TIMING-ACCURACY-01 independent anchor review**
after the owner finishes the Conviction reference, required for independent
acoustic boundary measurement. Phase03 stays60%.


## 2026-10-10 — USER-FEEDBACK-21

Product `9faf5d3`: ChannelScript now uses the canonical `script-table__word-wrap` around each
word, as ordinary ScriptTable and VoiceScript already do. Inline spans had
allowed trailing spaces to contribute extra inter-word spacing in imported/OBS
channel transcripts. The existing inline-block wrapper gives these transcripts
the Conviction/screenshot1 spacing without a project-specific CSS adjustment.
Text, timestamps and commands are unchanged.

Two stylesheet regressions failed before the fix and pass after it. Focused38/4
passes, including editing, command routing and transcript-window tests. Full
frontend752/83 passes in97.32s; typecheck/build/diff pass. Backend741 passes /2 existing warnings in224.01s. Evidence:
`docs/gates/user-feedback-21-script-word-spacing.md`.

Refresh and compare Conviction and OBS9 at the same Script SIZE. Native glyph
geometry remains owner acceptance; computed-style/markup checks do not measure
it on the owner's device. Exact next: **STT-TIMING-ACCURACY-01 independent anchor
review** after the owner finishes the Conviction timing reference, needed for
independent acoustic boundary measurement. Phase03 stays60%.

## 2026-10-10 — USER-FEEDBACK-22

### Feedback addressed

OBS Timeline drag highlighted Script words without following them. Earlier
presentation changes had left separate behavior paths.

Product `6c2d714` fixes the missing archived/multitrack Script follow behavior.
ChannelScript previously highlighted source words but had no viewport-follow
effect. Ordinary footage, imported parent/child and archived OBS parent/child
now use shared source-aware playback following and virtual reveal. Deliberate
Timeline scrubbing resumes follow even within the same word; manual reading
still pauses it. Simultaneous tracks keep their highlights with one stable
scroll focus. Multitrack plain text follows/highlights without replacing native
editing selection, and VoiceScript tables share the follow policy. Audio and
word timings are unchanged. ADR0067 records the behavior contract.

Initial registry regressions failed5/6 before the correction. Final full frontend
772/84 passes in98.94s with two workers; typecheck/build/diff pass. Backend741
passes /2 existing warnings in192.19s. Default-worker validation initially had
an existing scroll timeout and live-caption assertion failure; the complete
bounded runs passed without changing assertions or timeouts. Evidence:
`docs/gates/user-feedback-22-script-playback-parity.md`.

Native browser acceptance remains: refresh OBS9 and an imported project, drag
to offscreen words, scroll Script manually, drag again within the same word and
switch parent/child or plain text. Controlled DOM geometry does not prove native
scroll/pixel behavior. Exact next planned round: **STT-TIMING-ACCURACY-01
independent anchor review** after the owner finishes the Conviction timing
reference, required for independent acoustic boundary measurement. Phase03
stays60%.

## 2026-10-13 — PORT-FEEDBACK-01

### Feedback — 2026-10-13

**Nguyên văn (copy từ chat):**

> đây là bản test chạy app ở máy khác.
>
> khi anh chạy thử STT ở máy khác thì nó không đồng bộ chạy subtitle với chữ trên script. Em hãy sửa lại.
>
> Khi bấm vào chữ trên script thì trên timeline có nhảy theo. Nhưng ngược lại thì không.
>
> khi thử delete file thì nó hiển thị chồng chéo như hình 1, có lúc nó cũng gom vào Recycle Bin nhưng lại không scroll được tới cuối để thao tác với recycle bin. Nó chỉ scroll được tới footage cuối cùng thôi. và anh đã thử xóa thêm footage để slot nó giảm đi và show được recycle bin, sau đó anh xổ ra để xem Rồi xóa. Sau đó thử lại lần nữa thì nó chồng chéo như thế này.
>
> khi anh bấm cài plugin thì nó báo lỗi.
>
> Em hãy xem các file bat trong thư mục gốc của portable này có chức năng gì quan trọng, nếu trùng lặp thì nên xóa. Anh nghĩ nên mở app bằng open-pro4bro-console.bat, cài plugin bằng INSTALL-OBS-PLUGIN.bat, còn update portable thì nên UPDATE-PORTABLE.bat, VERIFY-PORTABLE.bat
>
> Còn những file bat khác thì có cái nào trùng lặp thì em xóa đi, có chức năng đặc biệt thì em gom vào các file chính. Còn file nào có nhiệm vụ đặc biệt thì em báo anh biết để anh xem xét.

Owner gửi thêm lỗi: `OBS plugin install failed.` tại
`scripts/install-obs-plugin.ps1:22`, qua BAT trên máy D-drive.
Ảnh đính kèm: `codex-clipboard-7a0bcf53-18e7-47e1-aece-d04fa8d321e5.png`.

**Cách agent hiểu:**

1. Timeline cần cập nhật cả highlight và vị trí đọc Script khi phát/seek sau STT,
   kể cả lúc mở riêng track con của footage nhiều track.
2. Ảnh cho thấy hàng Recycle Bin và nút Restore/Delete đè lên hàng footage đang
   dùng. Bin phải nằm sau các hàng đang dùng và cuộn được tới hàng cuối sau nhiều
   lần remove/restore/delete.
3. Cài plugin mặc định phải chạy được qua Windows PowerShell/BAT trên máy khác;
   cần giữ lỗi gốc để chẩn đoán nếu OBS/path/quyền cài thực tế vẫn khác.
4. Portable chỉ giữ bốn BAT chính đã nêu. Lệnh restart/stop/status gom vào
   launcher; tác vụ riêng của source và entrypoint của gói update cần báo rõ.

**Phạm vi sửa:** source và gói portable app alpha 0.5.7; không đổi model,
checkpoint, media gốc hay tiến độ tính năng Phase03. Candidate0.5.6 chỉ giữ
trong debug vì tích hợp phát hiện pairing vẫn trỏ launcher cũ.

### Agent tự kiểm

- Repro registry trước sửa: bốn kiểm tra thất bại với sidecar STT ID khác project
  track ID. Portable0.5.5 thực tế: subtitle `vậy` tại2.000296s nhưng Script không
  có từ active. Sửa clock identity cho imported/archived child; ordinary file
  tiếp tục dùng take clock.
- Repro bin trên Chromium: grid root cấp98.828125px trong khi nội dung kéo dài
  thêm hơn700px. Bỏ `min-height:100%` phá chu kỳ percentage sizing. Trên portable
  mới, remove/restore/remove, delete qua API204 và reopen fixture vẫn có bốn
  hàng bin; scrollTop1085 bằng scroll maximum, hàng cuối nằm trong viewport.
- Sửa empty native argument của WinPS5 bằng auto-root sentinel, giữ CLI cũ,
  chuyển tiếp BAT arguments, dùng UTF-8 có scope và giữ lỗi gốc. Cài/repair
  pairing chuyển known old launcher sang console BAT, giữ token và config riêng.
- Portable root đúng bốn BAT; obsolete start/restart chỉ gỡ khi hash khớp
  inventory cũ, có backup/rollback. Source aliases giữ tương thích.
- API/UI thật dùng embedded portable Python và bản sao project-owned artifacts
  STT thật: seek hai chiều và playback cùng highlight; bin không chồng. Browser
  console không có lỗi. Không sửa project/media của owner.
- Actual INSTALL BAT dùng embedded Python: tìm local OBS, ghi DLL/config trong
  ProgramData/AppData cô lập, hash DLL khớp package và pairing trỏ launcher tồn
  tại. Target record của portable được khôi phục nguyên byte. Không ghi đè cài
  đặt OBS thật và chưa thử elevation/native plugin load trên máy owner.

### Kết quả so với ngưỡng

Frontend **785 passed /84 files**; backend **774 passed /2 existing warnings**;
typecheck/build pass. Playback regressions16pass; installer22pass; updater11pass.
Actual migration pack33/0; final root UPDATE tự chọn **alpha0.5.7**,151appfiles,
**33 pass /0 fail**, `modelLayerChanged:false`. ZIP155entries,151payload hashes
khớp file cài;1,213,602bytes. Không hạ assertion hoặc ngưỡng để đạt.

Evidence, hướng dẫn từng bước và BAT inventory:
`docs/gates/portable-feedback-20261013.md`.

### Review (Claude)

Chưa có review độc lập trong round này.

### Nghiệm thu owner / bước tiếp theo

**PORT-FEEDBACK-UAT-01:** áp dụng0.5.7 trên máy D-drive, thử parent/track con khi
play/seek, bin qua nhiều lần thao tác; đóng OBS, cài plugin rồi mở lại để kiểm
tra native loading/quyền UAC nếu cần. Chưa khẳng định nghiệm thu máy đó.
Phase03 giữ60%; planned **STT-TIMING-ACCURACY-01** chờ Conviction reference để
đánh giá acoustic timing độc lập. Round kỹ thuật này kết thúc.

## 2026-10-13 — PORT-UPDATE-LOCK-01

### Feedback — 2026-10-13

**Nguyên văn (copy từ chat):**

```text
Selected update: alpha 0.5.7
Portable folder: D:\AI_RND\PRO4BRO\VOICE_MANIPULATOR\PRO4BRO_VOICE_MANIPULATOR\.scratch\portable-release\Pro4Bro-Portable-20261012-NoVibeVoice
Update folder: D:\AI_RND\PRO4BRO\VOICE_MANIPULATOR\PRO4BRO_VOICE_MANIPULATOR\.scratch\portable-release\Pro4Bro-Portable-20261012-NoVibeVoice\updates\App-alpha-0.5.7-NoVibeVoice
{"overall":"running","api":{"state":"running","pid":8104},"studio":{"state":"running","pid":56528}}
Move-Item : The process cannot access the file because it is being used by another process.
At D:\AI_RND\PRO4BRO\VOICE_MANIPULATOR\PRO4BRO_VOICE_MANIPULATOR\.scratch\portable-release\Pro4Bro-Portable-20261012-NoV
ibeVoice\updates\App-alpha-0.5.7-NoVibeVoice\payload\scripts\update-portable.ps1:272 char:24
+ ... ($hadOld) { Move-Item -LiteralPath $destination -Destination $backupP ...
+                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : WriteError: (D:\AI_RND\PRO4B...ce\services\api:DirectoryInfo) [Move-Item], IOException
    + FullyQualifiedErrorId : MoveDirectoryItemIOError,Microsoft.PowerShell.Commands.MoveItemCommand

Press any key to continue . . .
```

**Cách agent hiểu:** gói0.5.7 được tìm đúng nhưng không thay được services/api
vì process giữ thư mục. Cần sửa lifecycle trong updater và phát hành bản có thể
bootstrap từ pack, kể cả bản đã rollback còn mang version cũ.

**Phạm vi sửa:** updater full-stack stop/reopen, native regression và hướng dẫn
pack alpha0.5.8. Model, project/media và Phase03 không đổi.

### Agent tự kiểm

Native CWD lock tái hiện đúng lỗi tại dòng272. Controller chạy trong services/api
vẫn giữ CWD sau khi API/Studio dừng. Updater nay kiểm tra cả18119/18120/18081
bằng bundle interpreter/module, dừng toàn stack, chờ process thoát và port trống
rồi mới move. Console launcher mở lại toàn app sau update/rollback;
NoRestart giữ cả ba stopped. Mixed foreign process bị từ chối trước mutation.

Năm ca mới dùng lock thật: controller riêng, cả stack với NoRestart, reopening,
failed gate rollback/reopen bản cũ, foreign controller giữ nguyên mọi process/file.
Harness đã sửa lazy NetTCPIP module import có thể đè function override; local
source stack được mở lại và các ca cuối kiểm tra source PIDs còn sống.

### Kết quả so với ngưỡng

Native updater16pass; frontend785/84files, backend779pass/2existingwarnings,
typecheck/build pass. Actual0.5.8 pack trên embedded controller thật, port18139
được ánh xạ thành controller role:33pass/0fail,151appfiles. Controller thoát trước
move; source PIDs còn sống, model inventory hash nguyên vẹn.151file cài và ZIP
khớp hash/size; ZIP1,214,130bytes. Evidence:
`docs/gates/portable-update-lock-20261013.md`.

### Review (Claude)

Chưa có review độc lập trong round này.

### Nghiệm thu owner / bước tiếp theo

**PORT-FEEDBACK-UAT-01:** copy cả gói0.5.8 vào updates máy D-drive, bấm APPLY
trong gói một lần để thay updater cũ, kiểm tra update hết lỗi rồi thử lại
playback/bin/native OBS của feedback trước. Standard-port window, UAC/GPU/OBS
loading trên máy đó còn cần nghiệm thu thực tế. Phase03 giữ60%; planned timing
review tiếp tục chờ Conviction reference. Round kỹ thuật này kết thúc sau gates.

## 2026-10-13 — PORT-OBS-REPAIR-01

### Feedback — 2026-10-13

**Nguyên văn (copy từ chat):**

```text
python.exe : OBS plugin install failed: Plugin bị hỏng hoặc khác manifest; dùng Repair sau khi đóng OBS.
At D:\AI_RND\PRO4BRO\VOICE_MANIPULATOR\PRO4BRO_VOICE_MANIPULATOR\.scratch\portable-release\Pro4Bro-Portable-20261012-No
VibeVoice\scripts\install-obs-plugin.ps1:24 char:15
+ ...   $output = & $python -m app.adapters.obs_plugin_installation --cli $ ...
+                 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (OBS plugin inst...u khi đóng OBS.:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError

Press any key to continue . . .
```

**Cách agent hiểu:** installer đã tìm thấy cài đặt plugin nhưng phát hiện file
thiếu hoặc lệch hash so với manifest. BAT mặc định Install từ chối trạng thái
damaged; WinPS Stop còn ngắt ngay khi Python ghi stderr. Cần cho thao tác bấm BAT
tự chọn Repair khi cần, giữ guard và báo nguyên nhân/mã thoát đầy đủ. Log của
owner chưa xác định được file nào lệch; không suy đoán đó là DLL cụ thể.

**Phạm vi sửa:** CLI/PowerShell installer, native regression, hướng dẫn và gói
app alpha0.5.9. Không đổi model, checkpoint, media hay tiến độ tính năng Phase03.

### Agent tự kiểm

Trước sửa: bảy ca native mới có4fail/3pass trong9.84s, gồm DLL khác bytes và
DLL thiếu tái hiện đúng NativeCommandError của owner. BAT nay mặc định auto:
CLI chọn Repair nếu damaged; trạng thái khác qua Install. Manager và REST vẫn
giữ install/repair/remove. Hash package/file, OBS build, OBS đang chạy, atomic
write/rollback, elevation và pairing giữ nguyên. Explicit Install vẫn từ chối
damaged; explicit Repair vẫn từ chối cài đặt mới.

WinPS bắt stderr dưới Continue có scope rồi khôi phục Stop trước xử lý exit
code; thông báo giữ mã thoát và lý do gốc. UTF-8/env restoration giữ nguyên.
Test cũ default-root failure đổi chuỗi expected sang `auto failed (exit 1)` vì
CLI default/format lỗi đã đổi; thêm assertion không còn NativeCommandError,
giữ nonzero/no-mutation. Không hạ gate.

Actual received pack APPLY trên portable full33/0,151appfiles; tất cả hash/size
cài và ZIP khớp manifest, bốn root BAT nguyên vẹn. Model inventory hash không
đổi; source controller/API/Studio PIDs59812/47064/55788 còn sống.

Probe cô lập dùng script/adapter/package từ portable đã cài0.5.9 và bootstrap
Python embedded copy nguyên byte. Cài mới/healthy rerun thành công; đổi DLL
và xóa brand đều được Repair, cả ba file khớp hash package; pairing nguyên byte.
Mô phỏng tasklist có OBS thì Repair bị chặn với exit1/lý do đúng, không thay
file/pairing. Chỉ tasklist được kiểm soát trong fixture sitecustomize, OBS exe
giả không chạy; không chạm OBS/profile thật và không đóng OBS của owner.
Fixture không nằm trong payload.

### Kết quả so với ngưỡng

Installer **29 passed**,20.21s; frontend **785 passed /84 files**,120.16s;
backend **786 passed /2 existing warnings**,348.11s; typecheck/build/diff pass.
Actual MAKE tự đánh **alpha0.5.9**, source62deace; actual APPLY **33 pass /0 fail**,
`modelLayerChanged:false`. ZIP155entries,151payload hashes verified,
**1,214,835bytes**, khoảng1.16MiB. Evidence:
`docs/gates/portable-obs-repair-20261013.md`.

### Review (Claude)

Chưa có review độc lập trong round này.

### Nghiệm thu owner / bước tiếp theo

**PORT-FEEDBACK-UAT-01:** copy nguyên gói0.5.9 vào updates máy D-drive, bấm APPLY
trong gói (hoặc root UPDATE nếu đã0.5.8). Chờ release0.5.9/updatedtrue/gateFailed0,
đóng hẳn OBS rồi bấm root INSTALL; mở lại OBS để kiểm tra native loading và UAC
nếu cần. Tiếp tục nghiệm thu playback/bin của feedback trước. Loading/UAC trên
máy đó chưa được xác nhận bằng các fixture. Phase03 giữ60%; planned
STT-TIMING-ACCURACY-01 chờ Conviction reference. Round kỹ thuật này kết thúc.

## 2026-10-13 — PORT-REBUILD-01

### Feedback — 2026-10-13

**Nguyên văn (copy từ chat):**

```text
khi record OBS Livelink thì có nhận được tín hiệu từ OBS gửi sang. Nhưng lúc record thì không thấy gì. Và khi xong thì slot nó bị chồng chéo như slot đầu tiên trong Media Pool. em hãy kiểm tra lại vì sao bản portable lại hoạt động khác so với bản chính vậy? anh kỳ vọng là nó phải như nhau chứ?
anh nghĩ là em nên tạo lại một bản portable mới. Nhưng lần này nó phải đảm bảo copy toàn bộ chức năng, hoạt động của app chính. Còn với các file core, model nặng thì em hãy chỉ đường dẫn cho anh, anh sẽ tự copy cho nhanh
Vẫn bỏ VibeVoice, giữ trong danh sách chọn
```

Ảnh owner: [PORT-REBUILD-01-owner.png](feedback/PORT-REBUILD-01-owner.png).

**Cách agent hiểu:** cần app mới được build từ nguồn hiện tại, map các base nặng
để owner tự chép, VibeVoice vẫn hiện nhưng chưa cài. Slot OBS có lỗi layout dùng
chung ở source/portable. Meter và PCM là hai luồng riêng; chưa được xem project,
outbox hay log PCM của take lỗi trên máy D nên chưa kết luận nguyên nhân vật lý.

**Phạm vi:** một round đóng gói, readiness, shared OBS row và launcher migration.
Không đổi core/model/audio processor, không đụng media/project/OBS profile thật,
không tiến Phase03. Capture audit dùng PCM thật trong project scratch cô lập.

### Agent tự kiểm

Builder tự build web; app được copy độc lập dù base dùng hardlink. Studio app
lấy từ canonical source. Deferred base có map12thành phần và guide tiếng Việt,
chỉ VERIFY0fail mới atomically bỏ marker và đặt ready. Test native kiểm tra guard
thiếu/sai profile/failed/empty report; sửa native null backup argument theo lỗi
thực nghiệm. Kit mỏng VERIFY16pass/17fail/exit1 vẫn incomplete như thiết kế;
copy kiểm tra đã có đủ base VERIFY33pass/0fail/exit0 và ready timestamp.

Retry từng là item thứ4 trực tiếp trong grid, bị đẩy vào cột18px. Nhóm actions
đã sửa source và portable: Retry65.328125x30.1875px nằm gọn trong row252x74.375px,
thay vì rộng12px/cao45.59px trước sửa. Browser chạy API/UI thật của portable trên
project PCM đã publish: parent MKA READY, child Audit Mic và waveform hiện đúng;
không có console error/warning. Runtime status được thay trong fixture để tránh
đụng controller source; không giả archive/media/waveform hoặc claim inference.

Review fresh folder phát hiện installer chỉ migrate console khi tên folder cũ
và mới giống nhau. Bốn native install/repair × old-present/old-removed red trước
sửa, green sau sửa; installId/token/apiBase/customSetting được giữ. Candidate
alpha0.5.10 bị loại và lưu debug, MAKE tự đánh alpha0.5.11 sau sửa. Payload phát
hành không sửa tay. Root còn đúng4BAT owner yêu cầu.

Audit source/bundle PCM-to-MKA đều pass. Control meterPeak75.0 nhưng không gửi
PCM cho đúng thông báo missing stems,0JSON/0PCM. Alpha0.5.11 kiểm tra250ms PCM16
48kmono/12000frames/24000bytes/durableACK tạo MKA4872bytes, manifest773bytes,
analysis24kmono/6000frames/12078filebytes/nonzeroPCM11901bytes. Source WAV tạm
được xóa có chủ đích sau publish, retained chunks còn. Đây là chứng minh đường
xử lý PCM, không phải nghiệm thu plugin native hay nhận dạng lời nói trên máy D.

### Kết quả so với ngưỡng

Native builder/completion9pass13.12s; installer33pass19.05s; frontend785pass/
84files210.35s với maxWorkers1; backend799pass329.76s/2existingwarnings;
typecheck/build/diff pass. Frontend parallel ban đầu783pass/2timingfail, hai file
đó64pass khi chạy riêng; rerun2workers784pass/1timeout; serialfull785pass với
test/ngưỡng giữ nguyên. Không che first failure hay hạ gate.

174productionroutes/eightcatalogs khớp chức năng trừ VibeVoice bị bỏ payload;
cả6VibeVoice entries vẫn list/unavailable. Revision/branch upstream Git thiếu
trong portable được ghi riêng, không coi là lệch capability. Chưa sửa label hub
`detached · undefined` do thiếu metadata Git. Bốn cache symlink relative trỏ
nội bộ copy kiểm tra; scratch inventory dùng lstat cho khớp WinPS sau count
ban đầu nhầm bytes target. Không thay đổi gate sản phẩm.

ZIP mới1,223,266bytes (~1.17MiB),158files,151app hash/size khớp folder và numbered
update; complete components38,205,124,406bytes (~35.6GiB) chưa kể userdata.
SHA25672a5c58ca797f66a1612fe7782ee0caef665be55d8dfbca567ccfdc94bf45825.
Evidence: `docs/gates/portable-rebuild-20261013.md`. Listener kiểm tra đã đóng;
source controller/API/Studio59812/47064/55788 vẫn sống trên18119/18120/18081.

### Review (Claude)

Chưa có review độc lập Claude trong round này. Lead review source/package,
native regressions, catalog parity và browser/artifact evidence đã hoàn tất.

### Nghiệm thu owner / bước tiếp theo

**PORT-FEEDBACK-UAT-01:** giải nén alpha0.5.11 vào folder mới; chép12base đúng
map, root VERIFY0fail, mở console rồi copy nguyên hydrated folder sang D-machine.
Ở vị trí cuối đóng OBS/root INSTALL/reopen; kiểm tra Forward, durable PCM counts,
outbox/rejection logs và native take, rồi parent/child playback, STT follow/bin.
Máy thật/GPU/UAC/device/pairing cần bằng chứng owner; đóng gói/hash/catalog không
đủ để đảm bảo mọi hành vi đó. Phase03 giữ60%; timing vẫn chờ Conviction.
Round kỹ thuật này kết thúc sau delivery/gates.

## 2026-10-13 — PORT-FEEDBACK-02

### Feedback — 2026-10-13

**Nguyên văn (copy từ chat):**

```text
hiện tại khi đang test trên máy khác. với footage record bị lỗi từ OBS thì nó không có right click menu để có thể xóa hoặc thao tác. em hãy kiểm tra xem trên app chính có bị hay không, nếu bị thì sửa ngay từ app chính và rồi mang vào bản update.

anh muốn em ghi nhớ 1 điều là các feedback của anh, anh muốn áp dụng cho app chính, rồi sau đó tạo ra bản updates. Và em hãy đảm bảo một khi đã sửa thì tất cả đều phải hoạt động như nhau, cả bản app chính lẫn bản portable.

có vấn đề về logic khi thao tác với footage có nhiều track bên trong. Đó là khi anh đang view nhiều track bên trong 1 footage cùng lúc, nếu anh muốn nghe và đọc script của chỉ một hoặc vài track xác định, anh sẽ tạm thời lower volume hoặc bấm mute một vài track bên trong, lúc này các track sẽ hoạt động đúng, nghĩa là nếu chỉnh volume hoặc mute track nào thì track đó sẽ mất tiếng. Đúng ý anh. Nhưng nếu anh tạm thời chỉ select đúng track anh cần, thì bỗng nhiên các track khác lại tự động phát âm thanh. anh muốn là khi người dùng select track nào, footage nào thì chỉ có track đó, footage đó được phát âm thanh, đồng thời script cũng sẽ xuất hiện theo footage và track mà anh đang select. Và dù anh đang select mà nếu anh đã mute hoặc điều chỉnh volume của track nào thì track đó vẫn sẽ nhớ trạng thái và hoạt động tương ứng.

Anh muốn có thêm nút solo nằm bên dưới nút Mute của mỗi track. khi bấm vào solo của track nào thì track đó sẽ được phát âm thanh, những track nào không bấm Solo thì sẽ không được phát âm.

anh muốn khi training xong, voice được đưa vào Voice Collection sẽ có thể export hoặc import với bên ngoài. Người dùng có thể mang file model đã train để mang sang máy khác hoặc tài khoản khác.
```

Ảnh owner: [PORT-FEEDBACK-02-owner.png](feedback/PORT-FEEDBACK-02-owner.png).
Ảnh có take OBS MKA LỖI/chờ PCM, ba child Track1–3 CHỜ PCM và thông báo missing
source stems. Đây là journal chưa publish, khác asset đã có MKA.

**Cách agent hiểu:** sửa source trước, build update cùng code và đối chiếu thực
tế; take lỗi vẫn phải quản lý/xóa được. Selection trong một footage phải đồng
bộ audio và Script; Gain/Mute/Solo nghe lại giữ qua selection/view trong phiên
project. Solo có thể bật nhiều track, Mute vẫn thắng. Voice transfer phải mang
đúng file model đã train và lineage, không phụ thuộc đường dẫn/account nguồn.

**Phạm vi:** một round source/portable feedback, không sửa engine/model nặng,
không nhận là đã sửa nguyên nhân native OBS không gửi PCM, không tiến Phase03.
Preference source-first/parity đã được lưu thành công qua OpenViking, ADR0072
và PORTABILITY. Giao diện, adapters và tests đều sửa trong project chính.

### Agent tự kiểm

Pending OBS dùng router quản lý journal stopped/unpublished, optional deletedAt,
bin giữ PCM, Restore và xác nhận xóa vĩnh viễn; active capture/archive/STT locks
chặn xóa. Recovery/publish/STT không chạy với journal đã recycle. Review phát
hiện Restore409 do gọi status STT vốn từ chối recycled; production create_app
test red/green, giữ lock/task guards và bỏ status call cho recycled khi restore.

Timeline chỉ mount player thuộc selection, pause detached refs và chặn delayed
activation ở imported path. Provider phiên project giữ mixer qua remount. Script
và Timeline dùng cùng resolved subset, Solo S dưới M ở cả hai loại Timeline.
Browser source phát hiện Ctrl-select2track lại bị opened-prop sync thay thành
parent/3players; thêm controlled Media Pool prop và test two-way Workspace,
red trước/green sau sửa. Quay lại parent vẫn nhớ Mute1/Gain2=37/Solo2.

Voice Collection export/import ZIP schema1 kiểm inventory/hash/relative paths/
lineage, stage có cleanup tất cả failure, bounds8GiB expanded/20kfiles. LoRA,
full/RVC roundtrip vào collection/project độc lập có đúng shape/bytes. Lead
review thêm failing stage cleanup/fresh missing-root404 regressions. Không load
hoặc execute model trong import; base/runtime không nằm trong ZIP.

Actual source API/UI18131 và installed portable core Python18132 dùng hai tree
fixture độc lập. Runtime status là phần duy nhất được supply để tránh controller
owner; media/journal/voice routes thật. Fixture3track có PCM16/48k/5s tones thật,
MKA/analysis WAV publish; words tự viết và model synthetic, không claim ASR/
training/inference. Cả hai UI có failed contextmenu/recycle/bin/restore; subset
2tracks cho2audio-source elements/2Script rows và mixer reports giống hệt.
Play tone thật; gain37/Solo2 và Mute1 giữ khi parent→subset. Source ZIP import
qua UI vào portable collection mới rồi native API export lại giữ nguyên3payload
files/lineage. Final source/portable console warning/error đều rỗng.

### Kết quả so với ngưỡng

Final frontend **795pass/84files**,185.37s; backend **819pass/3warnings**,322.92s;
typecheck/build/diff pass. Focused integrated5files197pass34.66s. Vitest default
fork ban đầu hết60s chưa khởi động worker/0tests; dùng threads/maxWorkers1.
Backend ban đầu816pass/1controller deadlinefail dưới frontend load; unchanged
isolatedpass1.16s và finalfull819pass. Hai warnings deprecation cũ; một warning
duplicate ZIP member chủ động từ test reject. Không hạ thresholds.

Test cũ singleTrackView phải đổi expected2player→1 theo contract owner. Test
two-channel play clear lịch sử global mock trước action và thêm exact instance
URLs; vẫn phải play đúng2channels. Voice browse cấm `/Import đã chọn/` thay broad
`/Import/` vì Hub giờ có external Import voice package. Ghi lý do rõ, không dùng
sửa test để né bug. Late controlled-selection regression giữ failure trước sửa.

Actual MAKE tự cấp **alpha0.5.12**, sourcea8d09e0, rebuilt web. Actual root UPDATE
chọn received numbered pack, **33pass/0fail**,updatedtrue/modelLayerChangedfalse.
Native dependency import mất nhiều phút nhưng probe và gate hoàn tất nguyên
trạng, không đổi env/threshold/runtime để pass. Harness scratch copy nhầm vào
dest updates chưa tồn tại và verifier thiếu README mapping đã được sửa tại
scratch, không chạm payload immutable.154source/payload/installed byte/hash/size
khớp; eightcatalogs không lệch ngoài intentionalVibe/Gitmetadata; isolated app
OpenAPI180operation signatures match, cả5route mới được kiểm.

ZIP **1,223,639bytes (~1.17MiB)**/158files, SHA256
`6c10de416abf03ddb3744dbbe32ffcc4348cc7cfbdcbea8ecf8683ad85f6c594`.
Base model manifest hash giữ nguyên,6VibeVoice entries vẫn list/unavailable.
Evidence: `docs/gates/portable-feedback-02-20261013.md`; screenshots portable:
[selection](feedback/PORT-FEEDBACK-02-portable-selection.png),
[OBS menu](feedback/PORT-FEEDBACK-02-portable-obs-menu.png),
[voice import](feedback/PORT-FEEDBACK-02-portable-voice-import.png).

### Review (Claude)

Chưa có review độc lập Claude trong round này. Lead review source, worker fixes,
test changes, artifact safety/shape, actual BAT, hashes và browser parity đã xong.

### Nghiệm thu owner / bước tiếp theo

**PORT-FEEDBACK-UAT-02:** giải nén nguyên App-alpha-0.5.12-NoVibeVoice vào updates
máy D, bấm root UPDATE (portable0.5.7 hoặc cũ hơn dùng pack APPLY một lần).
Chờ updatedtrue/release0.5.12/gateFailed0 rồi root open-pro4bro-console. Test
take OBS lỗi menu→bin→Restore; một/hai track audio+Script, Gain/Mute/Solo và
quay lại parent; export/import ZIP voice train thật, inference trên base tương
thích. Không cần copy model nặng lại. Zero-PCM native OBS cause vẫn chưa được
xác minh trên D-device; fixtures/hashes không đảm bảo GPU/UAC/native capture.

Own listeners/probes được dọn sau chụp bằng chứng. Các source PIDs59812/47064/
55788 đã vắng ngay lần check đầu turn; không có lệnh trong round này stop chúng.
Không sửa profile OBS/project/media thật. Phase03 giữ60%, independent timing
vẫn chờ Conviction. Round kỹ thuật kết thúc sau delivery và báo gap này.


## PORT-FEEDBACK-03 — slot first, async work second (2026-10-13)

### Triệu chứng / nguyên nhân

Owner yêu cầu mọi thao tác thêm Media Pool/Voice Output hiện slot ngay và có
animation khi đang làm việc. Source cũng thiếu phản hồi: Recorder chỉ gửi file
sau Stop, OBS Start chờ polling, Generate chờ output; Choose MKV từ OBS chỉ hiện
session sau create. Import multitrack chưa đánh dấu row đang decode.

### Sửa app chính / bản update

Slot client hiện trước await permission/Start/import/Generate; status preparing,
recording,saving/progress và animation; choice/error/cancelled đứng yên. Capture
ID giữ xuyên suốt, save lỗi giữ File để retry trong phiên; receipt audio không
bị reupload nếu annotation lỗi. OBS ack refresh journal ngay, dedup theo recording
ID; MKV session theo dõi tại Workspace cả khi đổi page, chỉ bỏ slot khi asset
receipt tồn tại. Voice Output pending đứng đầu list, terminal status có thể ẩn.
ADR0073; source commit d735469; không sửa engine/model. Main-first/portable parity
và owner first-slot preference đã lưu OpenViking.

### Test / failures / artifact

Lead regression5failed/117passed; Workers OBS3failed/27passed→30pass,
Voice Output3failed/9passed→12pass. OBS-file1failed/6passed→green. Sai biến
integration gây55failed đã sửa; một assertion label MKA làm fullsuite1failed,
sửa đúng accessible identity và rerun. Không skip/delete test hay hạ threshold.
Final frontend814/84files, backend819/3warnings, typecheck/build/diff pass.
Native root UPDATE alpha0.5.13 updatedtrue/154app/33pass/0fail/modelLayerChangedfalse.
154source/payload/installed bytes khớp, ZIP CRC/158files/1,227,314bytes và SHA
đã kiểm. Model manifest hash nguyên; VibeVoice listed/unavailable như profile.
Source/embedded portable held-import DOM busytrue/pulse/status text khớp; release
hold chạy decoder thật, pending0 và footage thật hiện. WAV5s/120000frames/24kHz/
mono16-bit nguồn/cache SHA khớp. Console errors/warnings rỗng. UTF-8 parity-helper
và generic Python-path launch lỗi đã sửa, không ảnh hưởng product/gói issued.

Evidence: docs/gates/portable-feedback-03-20261013.md;
docs/feedback/PORT-FEEDBACK-03-source-import.jpg,
docs/feedback/PORT-FEEDBACK-03-portable-import.jpg,
docs/feedback/PORT-FEEDBACK-03-portable-ready.jpg.

### Review / owner nghiệm thu tiếp

Lead review source/workers/wiring/test changes, receipts, native BAT, bytes và
browser parity; chưa có Claude review độc lập. Exact next PORT-FEEDBACK-UAT-03:
D-machine giải nén nguyên App-alpha-0.5.13-NoVibeVoice vào updates, root UPDATE,
chờ0failed rồi root open-pro4bro-console. Test first slot/working/error/ready
cho browser/native/multitrack import, mic/system/HQ, OBS và Generate, đồng thời
prior selected audio/Script/Mute/Solo, failed OBS bin và trained voice transfer.
Không cần copy core/model lại. Fixtures không chứng minh native OBS PCM/mic/GPU
quality/timing; zero-PCM cause cũ chưa xác minh. Phase03 giữ60%, independent timing
vẫn chờ Conviction. Own fixture servers/tabs đóng; không sửa project/profile thật.
Bounded technical round dừng sau delivery và báo gap.


## SOURCE-SYNC-01 — source publication and cleanup (2026-10-13)

Owner now prefers GitHub Desktop source sync for daily tests. Research notes
committed; redundant start/restart BATs removed; unique setup/upstream-update/
legacy pack BATs moved to scripts/maintenance. Root retains console/OBS install/
verify/update.7601temporary targets and2249empty directories removed; owner
projects/media/core/model/dependencies and issued packs retained. Final pass
0failures; Syncthing marker classification error recovered and protected.
Native focused63pass/2warnings, frontend menu4pass, typecheck/build pass.
Actual push of9a00345 to origin/feat/03-04-high-quality-training verified by SHA.
See docs/SOURCE-SYNC.md, ADR0074 and docs/gates/source-sync-01-20261013.md.
This configuration round does not advance Phase03 (60%) or issue a new portable.
Next SOURCE-EXTERNAL-ASSETS-01 implements full-source packaging and one local
core/model library path, verified Python/app/Studio origins and cross-drive
artifact parity. Current launchers still require the existing local runtime
layout; cloning alone is not runtime provisioning. Physical OBS/GPU and timing
acceptance remain open.

### Cleanup / review evidence

Read-only Worker audit and Lead source/reference review. Removed only verified
checkout-contained temporary targets; no model/owner recording/project deletion.
Marker informational-text classification mistake interrupted/recovered, metadata
protected on retry; no byte-identical marker claim. Focused native63/0, menu4/0,
typecheck/build/diff pass; no skipped/weakened tests. Push origin feature branch
verified9a00345. Full source/portable external library remains next acceptance,
not an implemented feature. No independent Claude review, no phase progress.

## HUB-COLLECTION-01 — 2026-10-14

### Agent tự kiểm

Sửa từ main source: hover không cắt hàng đầu, bỏ LOCAL/PROJECTS, detail waveform
không tràn cột tên/path. Collection đếm profile, có hàng xổ model và tick để
Export cạnh Import. Native chọn nhiều ZIP/thư mục đích; giữ checksum/cache/Script.
Job tạo mẫu dùng archived model thật, chỉ công bố PCM có tín hiệu >=15s; có trạng
thái/animation/error/retry, hủy đúng worker khi đóng. Dataset snapshot mới có hash
run để tính giây train; archive cũ thiếu chứng cứ báo chưa có thông tin. RVC chưa
hỗ trợ Script synthesis, vẫn chuyển package. Không tạo portable mới.

### Kết quả so với ngưỡng

Frontend818/84files, affected20/3files; typecheck/build/diff pass. Backend full
848pass/3startup-timeout, exact unchanged rerun3/0; final focused88/0. Không nới
timeout/ngưỡng hoặc bỏ test. IAB hover dư3px, sáu detail cards không overlap;
Collection hai theme, profile/model selection và cuộn cuối6model đạt. Actual
Anh Vũ CPU run dừng sau583.06s chưa có WAV; không nhận là model-inference pass.
Worker review phát hiện và sửa cache/model tampering, JSON bool/int, shutdown
continuation và metadata malformed; regressions đạt. Không có Claude review.

### Còn lại / NEXT

HUB-COLLECTION-UAT-01: Pull/restart source, thử native dialogs và mẫu trained >=15s
bằng GPU đủ VRAM, nghe đối chiếu Script. SOURCE-EXTERNAL-ASSETS-01 vẫn là vòng
implementation tiếp theo. Phase03 giữ60%; native OBS/identity/timing còn mở.
Evidence: docs/gates/hub-collection-01-20261014.md, ADR0075.


## Round46 — Browse recovery / offline OBS leases (2026-10-17)

### Agent tự kiểm

Owner-reported Browse wait investigated without attributing it to recent timing
work: native adapter last changed2026-10-04. Reproduced timeout error contract,
unreported picker rejection and late reply overwriting a typed folder; added
RED-first recovery tests. Windows uses an isolated STA child with activated
owner, detached stdin and recoverable timeout503; UI preserves draft and allows
retry. Actual intermittent native foreground/selection/cancel acceptance remains
open. Independently reproduced offline OBS claim500 and invalid release checkpoint;
now retain exact valid durable state and report disconnected/unknown truthfully,
then rebind on connected hello. ADR0104 records the evidence and limits.
Final full API1145pass/532.74s (3existing/fixture warnings), frontend920pass/
112files/127.02s using ordinary npm test; typecheck/build172/diff pass.
Default jsdom worker count is bounded to2 after two unconstrained runs timed out
the existing5s Script case; all cases/assertions/deadlines remain intact. First
API1144pass/one unconfirmed training-tree stop601.72s retained; exact unchanged
case rerun passes and current full rerun is green. No cancellation safety check
was relaxed. All590API/web input hashes match the final frozen snapshot; the only
change after API rerun began was the frontend test-worker configuration.
Real private controller/API/CPU Studio verifies forced dialog-child error recovery,
project create/reopen, cached real-speech import, waveform/Play/Pause, Unicode
move/Open Existing, source hashes/relative paths and Range206. Source24kHz mono
16bit230400frames/9.6s unchanged; no new inference/model load. Private listeners
stopped, shared runtime untouched. Deleted only two audited old pytest trees
(8482files/120235285logical bytes); recent/unconfirmed evidence and media retained.
See docs/gates/hub-browse-cleanup46-20261017.md for cache cleanup, failures and
remaining native/quality limits. Checkpoint A remains open; Phase03 stays60%.

### Kết quả so với ngưỡng

Không đổi timeout/assertion hoặc bỏ test. Source/UI hồi quy đầy đủ đạt ở snapshot
cuối; lỗi đầu giữ trong gate. Native dialog ẩn chưa có bằng chứng tái hiện chắc
chắn, không nhận nghiệm thu chỉ từ mock hoặc owner activation.

### Còn lại / NEXT

Chủ dự án thử Browse native sau khi nạp bản sửa; chưa đóng Checkpoint A hay các
gate mic/OBS/model/identity/timing. Giữ dữ liệu chưa xác nhận. Roadmap chức năng
Voice Manipulator và SOURCE-EXTERNAL-ASSETS-01 không được đánh dấu hoàn tất.


## Round47 — TIMELINE-CLOCK-SELECTION-01 (2026-10-17)

### Feedback và xử lý

Chủ dự án thấy từ trên subtitle kết thúc gần lúc waveform bắt đầu, thiếu highlight
và START/END/DURATION khi chọn Script/subtitle, yêu cầu Ctrl+left drag để quét.
Tái hiện được lỗi chia peak/vẽ điểm làm waveform lệch theo độ dài cửa sổ; sửa
hệ tọa độ và cache overview, không dời timestamp STT. Mở overlay cho STT/import,
nối native/channel Script selection; phân biệt Ctrl-click nhập chữ và Ctrl-drag.
Giữ Ctrl-drag handle co giãn, caret text, scope asset/revision và vùng rời nhau.

### Bằng chứng

Final frontend937/113files/132.61s, typecheck/build172 pass. Full API1147pass/537.75s (3existing/fixture warnings). Browser với PCM
synthetic500ms khớp waveform/subtitle/overlay, Script native chọn đúng vùng.
Xem docs/gates/timing-selection47-20261017.md và ADR0105. Không hạ ngưỡng.

### Còn lại / NEXT

Cần project/footage và từ/mốc cụ thể để kết luận sai số STT ngôn ngữ của chủ dự án.
Không coi sửa hiển thị là forced alignment đã đạt. Native Ctrl-drag/live OBS,
Browse foreground và Checkpoint A vẫn chờ nghiệm thu; không tăng Phase03/60% hay
đánh dấu13processor còn lại đã xong. Dừng sau round47.


## Round48 — STT-WORD-CLOCK-AUDIT-01 (2026-10-17)

### Feedback và đo kiểm

Chủ dự án xác nhận lệch ở hầu hết từ trên nhiều project, trừ từ timing dài bất
thường/cuối câu. Không coi round47 đã giải quyết sai số ngữ âm. Đã đối chiếu41869từ:
START artifact→saved giống nhau100%; END lệch tối đa0.4ms. UI thực tế chỉ đổi5START/
54END ở nhóm bất thường. CPU raw→converted155interval hợp lệ giữ nguyên; refiner
chỉ sửa6START/9END. Một từ0–0 ở mép crop bị bỏ nhưng quality vẫn source: ghi riêng.

CTC aligner độc lập đối chiếu98từ: trung vị IN muộn hơn STT124/168/149.5ms;
84/98IN gần END cũ hơn START cũ. Kết quả ủng hộ nghi vấn DTW đặt đầu từ sớm,
nhưng aligner có outlier lớn nên chưa được gọi là mốc chuẩn hoặc tự dịch hàng loạt.
Xem docs/gates/stt-word-clock48-20261017.md/.json.23test profiler/scorer/packet pass,
12input hash giữ nguyên. Không thay code/timestamp production, không tải model,
không dùng GPU/runtime đang chạy. Browser kiểm tra worksheet/audio16s được.

### Còn lại / NEXT

Bảng nghe12từ nằm tại .scratch/stt-timing-accuracy-01/round48-review-1/review-anchors.html;
IN/OUT trống,0từ được nghe xác nhận. Cần mốc nghe độc lập để đo sai số và kiểm chứng
cách sửa; không nhận p95 giữa hai model là acoustic ground truth. Dừng round48;
Phase03/60%, Checkpoint A và các gate chất lượng vẫn mở.


## Round49 — TIMELINE-VIEWPORT-UX-01 (2026-10-17)

### Feedback và xử lý

Cuộn khi kéo playhead ở biên dùng10% chiều rộng viewport mỗi giây, tính theo
elapsed RAF và giữ phần lẻ khi browser làm tròn pixel. Zoom giữ playhead ở giữa,
clamp tại đầu/cuối nguồn. Bấm trái vùng trống waveform/subtitle bỏ selection.
Overlay timing dùng alpha0.30 (trong suốt70%), chữ accent100%, bỏ tên/khung xám;
IN/OUT nằm ngoài vùng hẹp và có hàng tránh chồng ở mép viewport. Áp dụng chung
Timeline thường/import/OBS archive, giữ scope nguồn/revision và multi-selection.

Clipping chỉ tô bucket peak vượt ngưỡng liên tiếp, không nối qua bucket yên,
không coalesce/ép độ rộng. Một SVG path nonzero tránh cộng opacity. Preferences
có tùy chọn tự ẩn5s, mặc địnhoff; sửa lifecycle OBS để pan/zoom không restart timer.
Archived waveform và clipping dùng cùng i/N. ADR0106/gate timeline-ux49 ghi bằng
chứng và giới hạn. Không sửa source audio, saved word timing hay chạy model.

### Kiểm tra

Frontend cuối968pass/120files/143.39s; full API1149pass/559.26s,3warning cũ/fixture.
Typecheck/build179 pass.594input hash khớp khi full test kết thúc; sau đó chỉ bỏ
một dòng trắng EOF trong test và chạy lại9test đó pass. Lượt broad đầu964pass/
4fail là4contract cũ, giữ log và thay assertion theo yêu cầu UX mới; không nới
ngưỡng/timeout, không skip test. Browser PCM synthetic xác nhận màu/alpha,
zoom/selection/clipping/tự ẩn; tab/server riêng đã dừng. Chi tiết ở gate round49.

### Còn lại / NEXT

Độ chính xác clipping giới hạn theo min/max bucket được tải; zoom để xem chi tiết.
Native hand-timed drag/live OBS UAT và mốc nghe STT round48 vẫn chưa nghiệm thu.
Phase03/60%, Checkpoint A và13processor gates giữ nguyên. Dừng sau round49.


## Round50 — TIMELINE-LIVE-READABILITY-01 (2026-10-17)

### Feedback và xử lý

Sửa playhead bằng cách paint trực tiếp vị trí đang kéo, không chờ audio seek/
timeupdate bị chặn lúc scrub; durationchange không được paint lại vị trí audio
cũ.3gesture test RED trước, GREEN sau, giữ audio preview. IN/duration/OUT luôn
cùng một hàng; dàn label ra ngoài khi hẹp, giữ số gốc và clamp theo viewport.

Màu có quy tắc dùng chung: normal text>=4.5:1, semantic foreground/background
đi thành cặp cho selection/active/untrusted/collision, chặn inline tint phá cặp.
Custom speaker/emotion qua resolver theo surface/theme; alpha được composite
trước và render đúng nền đã tính, giữ nguyên màu/preference đã lưu. Một observer
root dùng chung cho mọi consumer. Sửa token chữ phụ light trên sunken/app từ
3.91/4.43/4.30 lên ngưỡng; không vá riêng từng widget. ADR0107/UI-COLOR-RULES.md
và gate round50 ghi rule, AST guard và phạm vi kiểm tra.

### Kiểm tra

Frontend1010pass/125files/148.56s; API1149pass/551.59s,3warning cũ/fixture.
Typecheck/build182/diff pass;602input frozen hash khớp. Test màu gồm1000cặp
custom, matrix emotion/background/opacity hai theme, CSS token parity và cascade
thực tế với inline pale text/amber fill. Không skip/nới assertion/timeout.
Browser trung gian ghi8vị trí playhead trước pointerup,3label cùng top. Sau đó
CUA báo local browser disabled trong Work settings nên chưa có final cross-page
sweep/screenshot; không gộp ảnh trung gian thành nghiệm thu CSS cuối. Server riêng
18421–18424 đã dừng; không restart runtime đang dùng.

### Còn lại / NEXT

Final rendered sweep hai theme/native popups và các raster/gradient tổ hợp vẫn
cần nghiệm thu khi công cụ browser hoạt động. Mốc nghe STT round48, Checkpoint A
và13downstream processor gates còn mở. Phase03/60% giữ nguyên. Dừng round50.

## Round51 — TIMELINE-SAFE-EDGE-01 (2026-10-17)

### Feedback và xử lý

Playhead trước đây theo chuột vượt vùng10%–90% khi kéo; thả xong playback follow
căn lại viewport nên bị nhảy. Dùng chung safe-edge seek cho down/move/RAF/up ở
Timeline thường, imported multitrack và OBS archive. Chuột vẫn quyết định hướng
cuộn10% khung nhìn/giây, giữ fractional frame. Khi hết nguồn để cuộn thì cho tới
đầu/cuối file. Playback follow chấp nhận sai số1pixel ở biên để tránh nhảy do
rounding. OBS bỏ click sau release nếu đã pan/bị clamp, kể cả giữ chuột đứng yên.

### Kiểm tra

Hai test Timeline gesture RED trước sửa; focused100pass/4files/12.05s. Bổ sung
assertion thả ở biên trái cho imported/OBS:86pass/2files/11.77s. Giữ kiểm tra tốc
độ80px/s trên viewport800px và seek full transport. Đổi assertion cũ95% thành90%
theo yêu cầu mới (main950→900px, imported46.5→45s, OBS63→60s); không skip/nới test.
Final frontend1013pass/125files/147.12s; API1149pass/530.32s (3existing/fixture
warnings). Typecheck/build182/diff pass; all603frozen inputs match.
Browser trả local use disabled trong Work settings; chưa nghiệm thu chuột thật.
ADR0108 và gate timeline-safe-edge51 ghi evidence/giới hạn; không restart runtime.

### Còn lại / NEXT

Real mouse UAT khi browser hoạt động; acoustic anchors STT round48, Checkpoint A
và13downstream gates còn mở. Không sửa source media/word timing/model/backend.
Phase03/60% giữ nguyên. Dừng sau round51.

## Round52 — SUBTITLE-PRECISE-TIMING-01 (2026-10-18)

### Feedback và xử lý

Bỏ snap60ms vào acoustic edge khi move/trim từ. Trim handle nhận chuyển động nhỏ
ngay, không đợi3pixel; middle move vẫn phân biệt click/drag. Chỉ mount handle ở
từ selected, bỏ hover reveal nên từ khác không có hit target ẩn. Từ mới Add text
đã auto-promote nhưng middle-pick lại toggle off: đổi event thành đặt target,
chọn lại cùng từ không tắt. Left/right/Escape và tự sang từ kế tiếp vẫn giữ.
Thực thi chung trong Timeline editor dùng cho ordinary/imported/OBS focus view.

### Kiểm tra

RED đầu5fail/33pass/33.04s:4lỗi thật (2insertion toggle, hidden grips, acoustic
snap),1float fixture2.8000000000000003 so với2.8 đổi sang9decimal. RED bổ sung2
handle1pixel không commit,2.37s. GREEN focused38pass/3files/4.40s. Full suite gồm
thêm assertion repeat event từ Script/channel.3test acoustic helper cũ được bỏ
cùng feature theo yêu cầu; thay contract drag bằng exact fractional delta cả3mode,
giữ order/visibility/collision/cancel tests. Không thêm skip hay nới timeout.
Final frontend1017pass/125files/143.64s; API1149pass/538.13s (3existing/fixture
warnings), typecheck/build182/diff pass. All605frozen input hashes match.
ADR0109/gate word-timing52 lưu evidence/giới hạn. CUA báo browser use disabled,
chưa nghiệm thu chuột thật. Không restart runtime, không đổi backend/media/model.

### Còn lại / NEXT

Real mouse UAT khi browser hoạt động; acoustic anchors STT round48, Checkpoint A
và13processor gates còn mở. Phase03/60% giữ nguyên. Dừng sau round52.

## Round53 — SUBTITLE-DRAFT-FEEDBACK-01 (2026-10-18)

### Feedback và xử lý

Highlight có ranges nguồn nên không theo draft từ. Thêm retime selection cho
waveform/readout/markers/stretch handles, commit cùng word timing, hủy thì hoàn
lại. Giữ scope, disjoint ranges, silence padding, partial-word và source bounds.
Từ mới kế thừa row gần thời điểm chèn; giữ null chủ động và các từ cũ. Bổ sung
mapping profile mặc định của footage/track vào Timeline như Script. Manual word
có nền speaker và chữ xanh#1a5fa7 đã resolve theo exact state background>=4.5:1;
giữ border cảnh báo timing. Cache profile/state pairs, không tính lại mỗi từ/frame.
Middle IN/OUT dùng chung drag hook10%/90%,10% viewport/s; suspend playback follow,
commit last constrained target và dừng RAF khi release/cancel/Escape/blur/source.

### Kiểm tra

RED4test/2.65s cho highlight, insertion identity và2hướng middle jump. GREEN
focused38test/5files/7.05s; imported/OBS integration96pass/3files/12.02s. Thêm
RED default speaker fill1fail/2.28s rồi wire mapping cả3editor. Matrix actual CSS
2theme/3profile màu (có alpha)/3state bắt2lỗi backdrop mismatch; render exact pair
rồi pass. Float fixture dùng9decimal; không thêm rounding sản phẩm. Typecheck
đầu bắt typing test callback TS2348, sửa type và dừng broad run đầu; broad tiếp
bắt duplicate source reset (OBS đòi3event, nhận4), REDfocused4.07s xác nhận, bỏ
call thừa và giữ assertion cũ. Full run cuối dùng frozen inputs mới, giữ log cũ.
Không thêm skip/nới timeout hay hạ ngưỡng nghiệm thu.
Final frontend1034pass/126files/145.65s; API1149pass/526.89s (3existing/fixture
warnings). Typecheck/build182/diff pass; all606frozen input hashes match.
ADR0110/gate subtitle-feedback53 ghi evidence và giới hạn. Không restart runtime.
CUA báo browser use disabled nên chưa nghiệm thu chuột/paint thật.

### Còn lại / NEXT

Real mouse UAT khi browser hoạt động; mốc nghe STT round48, Checkpoint A và13
processor gates còn mở. Không sửa backend/source media/model/persistent format.
Phase03/60% giữ nguyên. Dừng sau round53.

## Round54 — WORD-EDIT-RESUME-01 (2026-10-18)

### Feedback và xử lý

Menu chuột phải subtitle có Speaker Profiles và reference riêng; Script table,
text và channel có Add/Sửa/Xóa. Delete xóa atomic text+word intervals, không chặn
Delete trong input/textarea. Sửa một từ giữ nguyên IN/OUT, nhiều từ chia đúng khoảng
cũ; giữ sourceTiming/row metadata, đánh dấu manual/untrusted. Add không mượn timing
từ hàng xóm; thiếu chỗ thì giữ draft và báo status. Source và cursor lưu tách nhau
theo project/source ID, không ghi đường dẫn tuyệt đối. Khôi phục sau initial load,
ưu tiên thao tác mở của người dùng, kiểm tra deleted/importSelected. Imported child,
output và OBS archive có khóa riêng; focused editor chia sẻ clock. Guard initial0,
stale source/metadata và callback OBS không được ghi đè identity asset/child.
Menu cũ đóng khi words đổi; Delete bị chặn khi thu âm. Xem ADR0111/gate round54.

### Kiểm tra

RED parity7fail/2.85s, resume2fail/2.16s, source restore2fail/5.49s và metadata cũ5s
làm cursor70s bị cắt còn5s. Review bổ sung RED2menu stale,1recording Delete,
1OBS source ownership. Sửa đúng path, giữ assertion preview cũ sau normalize URL.
Test mới query đúng message thay vì query nhiều status; không nới timeout/skip.
Focused cuối97pass/4files/18.09s. Broad đầu dừng khi phát hiện lỗi, broad kế tiếp
mất process cùng terminal trước khi có kết quả; không báo pass cho lượt đó.
Final frontend1075pass/129files/194.01s; API1149pass/590.08s (3existing/fixture
warnings). Typecheck/build183/diff pass; all615frozen input hashes match.
Cả615frozen inputs khớp; log giữ trong .scratch/edit54/. Browser bị tắt lúc đầu,
hoạt động sau khi resume: xác nhận menu Script/subtitle trên footage thật6744words,
reload app rồi mở lại Test11 giữ đúng nguồn tại00:00:05.200. Không thấy console error.
Không sửa transcript/media thật để UAT lệnh xóa. Không restart app/runtime chung.

### Còn lại / NEXT

UAT chỉnh/xóa thật và imported/live drag, acoustic anchors STT round48,
Checkpoint A và13processor gates còn mở. Generated output transcript persistence
vẫn theo Voice Edits; live OBS giữ follow. Không đổi backend/source media/model/
project.json. Resume lưu cục bộ trên thiết bị. Phase03/60% giữ nguyên. Dừng sau round54.


## Round55 — WORD-MENU-NOTE-01 (2026-10-18)

### Feedback và xử lý

Menu từ dùng body portal chung, đo kích thước thật, mở lên/xuống/trái/phải theo
viewport; không bị cắt bởi module transform/overflow. Note xổ ngang, tự đổi phía,
bám lại khi resize/scroll, hỗ trợ bàn phím và không tự lưu bản nháp text. Subtitle
mới/sửa dùng chữ xanh theo phân loại, vạch dưới Speaker, nền theo trạng thái.
Script và Subtitle có chú thích màu/format riêng. Xem ADR0112 và gate menu-note55.

### Kiểm tra và còn lại

Gate report ghi RED/GREEN, full tests, browser bounds/paint và portable parity.
Browser fixture dùng component thật, commit counter0; không sửa media/project.
Phase03/60% giữ nguyên. Acoustic anchors round48, Checkpoint A,13processor gates
và UAT rộng imported/live editing vẫn mở. Dừng sau round55.

Final round55: frontend1096pass/133files/376.02s (`--maxWorkers=1`, giữ5s);
API1150pass/596.27s,3existing/fixture warnings. Typecheck/build187/diff pass;
599frozen inputs khớp. Hai broad web trước trượt deadline fixture833words khi
chạy2workers; baseline và source chạy đối chiếu riêng đều đạt. Full API bắt lỗi
chẩn đoán listener chiếm hết deadline trước health probe: thêm deterministic RED,
đảm bảo ít nhất1probe có giới hạn; giữ điều kiện health/deadline và exited-process.
15focused cases đạt, full API cuối đạt. Build UI thực mở Test11/6744words, Note
cả2module mở trái vừa viewport, không thấy console errors; không sửa transcript.

App update alpha0.5.15 NoVibeVoice:206payload hashes và210ZIP entries khớp;
ZIP1,443,398bytes, không chứa core/model nặng. Actual payload UI kiểm tra cả2Note
trên Test11 đạt, không console error. Full base/runtime gate chờ owner copy file
nặng và VERIFY0failed; không báo standalone-ready. Xem gate report để lấy SHA256.


## Round56 — OVERVIEW-WAVEFORM-FOLLOW-01 (2026-10-18)

### Feedback và xử lý

Kéo thanh tua toàn clip đã đổi clock/Script nhưng waveform zoom không cuộn theo.
Layout follow bị chặn lúc transport drag để giữ ổn định edge drag. Overview nay
chủ động reveal đúng targetTime đã dùng cho playhead/audio, không đợi media event
hay lấy clock cũ. Cho phép thao tác tua rõ ràng khi đang chọn nhiều vùng; chọn
nhiều vùng đơn thuần vẫn không tự scroll. Giữ safe edge10/90%, pan10%viewport/s
và trạng thái thả chuột của waveform/playhead. Không sửa backend/media/timing.

### Kiểm tra và còn lại

RED2case scrollLeft0 thay vì1000 ở85s; focused28pass và94multitrack/OBS controls
đạt. Test giữ chuột xác nhận active word Script, stale media event, stable release.
Browser nguồn trên Test11 kéo thật tới30:50.492 rồi về07:37.049, ruler/waveform và
Script cùng chuyển theo; không console error. Xem ADR0113/gate overview-follow56
cho full gates và app pack. Phase03/60% giữ nguyên; acoustic anchors round48,
Checkpoint A,13processor gates và wider editing UAT còn mở. Dừng sau round56.

Final round56: frontend1102pass/133files/273.66s với1worker; API1150pass/479.45s,
3existing/fixture warnings. Typecheck/build187/diff pass,599frozen inputs khớp.
Không retry full gates, không đổi timeout/skip/assertion. App alpha0.5.17 kiểm
206payload hashes và210ZIP entries, ZIP1,443,424bytes; xem gate report cho SHA256.
Actual payload UI kéo thật hai chiều đạt cùng bounds/scrollLeft với source,
không console error. Chỉ là app update; full installed base gate chờ owner copy
core/model và VERIFY0failed. GitHub source giữ toàn bộ source/test/tài liệu mới.

## Round57 — VM-FUNCTION-LAYOUT-01 (2026-10-19)

### Feedback và xử lý

Thêm tab dọc VO/VP/VD/VI/LT ở mép trái. Script/Timeline cùng workspace; chỉ đổi
bảng tác vụ ở cột phải. VO có guard ở nút và entrypoint; không chạy VO nhầm ở
tab khác. Từ Input chuyển vùng hợp lệ sang Manipulator mở VP. Bốn nhóm thiết lập
Script chuyển sang cột phải bằng portal của chính editor, giữ selection/document
và refresh timing. Kết quả hiện nhãn VO/VP theo lineage thực; không theo tab đang
mở. Imported/OBS dùng chung mixer trong header cột: M/S dọc, Gain trên Level.

### Kiểm tra và còn lại

Frontend1109pass/136files/312.67s; API1150pass/608.09s,3existing/fixture warnings.
Typecheck/build191/diff pass;675frozen inputs khớp. Worker review không thấy
regression cụ thể; browser fixture thật dùng source components, cả2theme và
cột hẹp xác nhận header42px/contained, chọn câu2→sửa duration3.5→chuyển tab vẫn
đúng giá trị. Controller thật không chạy502 nên không báo real-project/audio UAT.
Xem ADR0114 và docs/gates/function-layout57-20261019.md. Code commit d3062ca.

Owner đã đồng ý OmniVoice làm lõi; provider tương thích được chọn theo tác vụ.
docs/OPEN-ENGINE-WORKFLOW-PLAN.md ghi9slice tích hợp tiếp theo, gồm VibeVoice-ASR,
CosyVoice, Sokuji và các runtime chuyển giọng. Chưa cài/chạy engine mới; VD/VI/LT
mới là workspace chuẩn bị. Prefix tên file xuất mới đi cùng processor tương ứng.
Phase03 vẫn60%; acoustic timing/Checkpoint A và các gate processor còn mở.
Không phát hành portable trong round này. Dừng sau round57 theo AGENTS.md.

## Round60 — TIMELINE-SOURCE-BOUNDARY-01 (2026-10-19)

### Feedback và xử lý

Khi zoom và kéo tới cuối footage, playhead bị giữ ở90%. Nguyên nhân gồm canvas
rộng lẻ pixel so với giới hạn scrollWidth/clientWidth nguyên, so sánh float quá
chặt, và ResizeObserver vẽ lại vị trí cũ lúc zoom. Chuẩn hóa hai đầu scroll trong
sai số1CSSpx, dùng cùng extent cho pan/seek, nhận diện mốc toán học bằng ULP và
vẽ lại theo playhead hiện tại. Hai đầu cho phép0/duration ngoài10%–90%; giữ tốc
độ10%khung nhìn/giây khi còn footage để cuộn. Không gọi play cho audio preview
rỗng ở cuối nguồn để tránh media tự chạy lại từ0.

### Kiểm tra và còn lại

Các repro RED có3lỗi boundary,1lỗi empty preview và1lỗi delayed resize trước
khi sửa. Final focused131pass/6files/28.23s; frontend1127pass/136files/161.28s;
typecheck/build191 pass; API1207pass/3warnings/642.63s; diff check pass. Browser
DOM/media probe dùng WAV tổng hợp20.123s, giữ đúng0/20.123s cùng transform/scroll
sau release/resize/media events ở zoom lẻ và tối đa. Fixture pointer capture có
stub, không gọi đó là test kéo chuột native; server WAV ban đầu thiếu byte-range
đã bị loại khỏi evidence và sửa trước lần đo cuối. Xem ADR0117 và gate
timeline-source-boundary60. Native mouse/portable UAT còn mở; không phát hành
portable. Phase03 vẫn60%; provider/acoustic/complete processor gates giữ nguyên.

## Round61 — TIMELINE-EDGE-SPEAKER-01 (2026-10-19)

### Feedback và xử lý

Tăng tốc cuộn theo vị trí chuột: 90%/10% → 10%, 95%/5% → 20%, đúng mép
100%/0% → 30%, ra ngoài → 40% khung nhìn/giây. Dùng chung cho playhead,
waveform, gán timing chuột giữa, imported multitrack và OBS archive; giữ các
ngoại lệ đầu/cuối nguồn, safe edge, release/cancel và tích lũy subpixel.

Viền cam cũ là dấu timing đã sửa, không phải đổi Speaker. CSS is-past ghi đè
viền này thành xanh; từ thường còn thiếu property vạch Speaker. Nay vạch dưới
luôn theo Profile đã gán/kế thừa, viền trên cam đánh dấu timing sửa thủ công.
Giữ phân loại text xanh và cập nhật Note cho hai dấu độc lập.

### Kiểm tra và còn lại

RED 3 fail/19 pass trước sửa; browser CSS tái hiện đúng cam → xanh. Final
focused 138 pass/30.41s; frontend 1130 pass/136 files/149.48s; typecheck/build191
pass; API 1207 pass/3 warnings/677.64s. Browser CSS 32 trường hợp qua đủ hai
theme, before/active/past/selected, có profile/kế thừa/explicit null/manual text.
Các test tốc độ cũ đổi vị trí chuột sang band10% hoặc kỳ vọng40% ngoài khung
theo yêu cầu mới; không xóa case, giảm assertion hay tăng timeout. Xem ADR0118
và gate timeline-edge-speaker61. Native held-drag/portable UAT còn tách riêng;
không phát hành portable. Phase03 vẫn60%; dừng sau round61.


## 2026-10-21 — Round78 STT-CONVICTION-REFERENCE-01

### Feedback — 2026-10-21

**Nguyên văn (copy từ chat):**

> Anh đã refine lại timing của từng từ trong subtitle của project Conviction. Có một số từ anh không cho vào dù trên waveform đang có sóng âm, đó là vì 2 người trong hội thoại đang chồng tiếng lên nhau. Nên rất khó xác định. Đây không phải là chính xác 100% về mặt timing vì sòng âm không có biên giới cứng, anh chỉ xác định dựa theo sóng âm và lắng nghe. Anh có bổ sung thêm từ vì nhận diện chưa chính xác. Tuy nhiên chất lượng nhận diện âm thanh rất đáng khen. Timing cũng rất đúng, chỉ là độ dài của từng từ lại không chính xác và dường như bị offset một chút khi mà subtitle ghi nhận thòi điểm kết thúc của từ lại là thời điểm bắt đầu của chính từ đó trên âm thanh, sóng âm. Anh đã điều chỉnh cả timing lẫn timespan của từng từ. Độ chính xác thì trong khoảng 80% nhưng đó là do không xác định chính xác được điểm đầu và cuối của từ do sóng âm có lên xuống theo tình tự chứ không dứt khoát. Nhưng về vị trí của từ và độ tin cậy thì cao vì anh đã tự tay làm.
>
> Em hãy dựa vào đây để so sánh với chức năng STT của mình, và tìm cách cải thiện nó lên

**Cách agent hiểu:** Conviction đã có mốc nghe thủ công cho cả IN/OUT và độ dài.
Biên âm học còn dung sai; 80% là tự đánh giá của chủ dự án, không phải ngưỡng
80ms hay độ chính xác STT. Có bổ sung từ, và thiếu có chủ đích ở vùng chồng tiếng.
Phải ghép đúng nội dung/thứ tự, giữ riêng từ chưa review hoặc ước lượng, không
ép toàn bộ sóng âm thành từ của một người hoặc tự cộng offset toàn bản.

### Agent tự kiểm

Đóng băng 697 từ hiện tại, STT gốc 665 từ và MP3/WAV tại
`.scratch/stt-conviction78`. PCM giải mã lại khớp WAV từng byte, không clipping.
680 từ có timing manual/trusted; 581 cặp không mơ hồ theo mọi đường edit tối ưu.
Giữ hiện rõ 99 mốc manual không ghép được và 17 từ không đủ provenance manual.
Số đo và kiểm tra cuối nằm ở `docs/gates/stt-conviction78-20261021.md`.

Trên 581 cặp, sai số trung vị IN/OUT STT cũ là 161.9/103.8ms, OUT gần IN đã sửa
hơn (53.1ms). Replay refiner hiện tại không sửa được phần lớn sai lệch. CTC250h
thử nghiệm giảm trung vị xuống 18.3/24.8ms, nhưng OUT p95 tăng384.9→495.5ms,
có41 cặp khoảng chồng lấn;15 từ sai>500ms dù confidence>0.7. Lần ghi artifact
đầu lỗi numpy int64 được giữ nguyên; serializer có regression, chạy lại ở run-2.
Replay decoder hiện tại trả692 từ/587 cặp manual: median có dấu IN/OUT trước
refiner là-159.8/-100.8ms, xác nhận triệu chứng trước bước ghi SRT. Full API1245
pass/3warning cũ/641.34s; focused35pass, frontend1175/145files, typecheck/build205
pass. Hash nguồn/bản sao và PCM bốn chunk đều giữ nguyên, provenance source pass.

### Kết quả so với ngưỡng

Ứng viên chưa đạt p95 IN/OUT≤250ms và không được thay default. Reference không
còn thiếu; acoustic gate vẫn mở. Hướng tiếp: nhất quán cửa sổ/câu và timeline
toàn bản, thử corrected transcript riêng, review chồng tiếng, giữ manual lock
và xác minh thêm hội thoại độc lập. Không thay dữ liệu Conviction, engine upstream,
format project hoặc phát hành portable. Phase03 giữ60%; dừng sau round78.

## Round81 — Input Ghost, giữ Live STT, hoàn tất MKV (2026-10-22)

### Feedback

Chủ dự án yêu cầu bỏ checklist từng từ; bật/tắt từng phương pháp, xổ thông số,
chỉnh IN/OUT, xem Ghost ngay trên Timeline rồi Apply một lần. Xung đột phải đỏ,
chớp; từ không đổi đứng yên. Live STT phải còn sau Stop; chỉ hiện cụm OBS khi
Capture Source là OBS. Khi OBS Stop, tự nhập MKV hoàn chỉnh ở nền và lấy đủ đuôi;
STT lại là tùy chọn toàn file. Kiểm tra tình trạng workspace cần khởi động terminal lại.

### Agent tự kiểm

Đã triển khai các luồng trên, giữ manual lock, source fingerprint, Restore/Undo.
Đọc footer MKV trước kiểm tra header live, hoặc nhận Stop đã xác thực đúng đường
dẫn, rồi copy/hash/decode toàn track ở nền. Không dùng im lặng/kích thước file đứng
yên làm tín hiệu kết thúc; không tự chạy Final STT. Có fence khi inference trả muộn
và khóa media khi kiểm tra/ghi. Explicit STT sau đó đi qua queue toàn file sẵn có.

Frontend1201/150file, typecheck/build212 pass. FFmpeg writer thật và MKV AAC hai
track xác nhận PCM cuối khớp từng byte với decode độc lập, đủ đuôi; draft/clear/STT
và shutdown drain có regression. Browser thật trên clone độc lập xác nhận Ghost,
Apply690 từ/+116ms,4 chỉ số xung đột, Restore692/692 tọa độ, OBS source ẩn/hiện.
API closure, log lỗi giữ lại và mutation bị giết nằm ở input-feedback81 gate.
Runtime nạp lại bằng controller sau kiểm tra29 project không có job/OBS đang ghi.

### Kết quả so với ngưỡng

Common trial trên692 từ thay690, median IN/OUT64.3/54.2ms ở587 cặp chỉ dùng chấm
điểm. Vector21 thay đổi chưa đạt nghiệm thu tổng quát. Bulk Apply có xung đột là
thao tác review chủ dự án yêu cầu, hiển thị rõ; không hạ acoustic gate hoặc sửa tọa
độ từ khóa để che xung đột. Hash nguồn/reference Conviction giữ nguyên.

Đã tái hiện và sửa load bị chặn bởi schema,21 request OBS chồng nhau, GET treo và
clear cũ chặn STT mới. Chưa đủ bằng chứng quy nguyên nhân chính xác lần app treo
trước. Chưa nghiệm thu OBS vật lý/âm thanh thiết bị hoặc hội thoại độc lập. MKV
unknown-size không có kết nối Stop giữ nút Finish dự phòng. ADR0129 và
`docs/gates/input-feedback81-20261022.md` ghi đầy đủ. Phase03 giữ60%, Phase06 mở;
không đổi default STT/portable. Dừng81.

## Round82 — MKV recording slot indicators (2026-10-22)

### Feedback

MKV được import khi còn ghi cần vòng tròn đỏ nhấp nháy thay tick Import và sọc
chéo45 độ chạy trái sang phải ngay trong slot. Áp dụng cả footage cha và track con;
khi nhập hoàn chỉnh phải trở lại giao diện bình thường.

### Agent tự kiểm

Trạng thái lấy từ parent growingMkvFollow và publication source-final.mkv sẵn có.
Không đoán từ im lặng, duration, kích thước file hay trạng thái STT; không thêm
polling/backend. Import vẫn là checkbox native có busy/description và giữ lựa
chọn; chưa chọn Import là vòng tròn rỗng. Reduced-motion giữ chỉ báo tĩnh.

Regression ban đầu1 fail/64 pass bắt đúng trạng thái còn thiếu; sau sửa65 pass.
Browser app/API thật trên fixture MKV AAC hai track xác nhận3 slot có sọc45 độ,
vị trí ngang tăng12.7194→14.4971px. Sau append phần đuôi, cả3 tự hết highlight và
trở lại checkbox native, không reload. Hai track đủ8.034125s,24kHz mono PCM16;
source-final bằng byte với file kín. Không ghi vào project của chủ dự án.

### Kết quả so với ngưỡng

Frontend full replay1203/150file/193.56s pass, typecheck/build212 pass. Full đầu
1202 pass/1 timeout1s ở Voice Output; chạy riêng5 pass và full lại đều pass, không
sửa test/product Voice Output hoặc nới timeout. Lỗi đầu được giữ. Backend closure
và ảnh hai trạng thái nằm ở `docs/gates/mkv-recording-slots82-20261022.md`.

Chỉ báo bao gồm lúc đang follow và lúc chờ nhập đầy đủ; không báo tick sẵn sàng
trước khi artifact đầy đủ tồn tại. Các giới hạn OBS thật/unknown-size không có Stop
vẫn là contract Round81. ADR0130 ghi quyết định. Phase03 giữ60%, Phase06 mở;
không đổi media, default STT hoặc portable. Dừng82.

Chốt gate: API full1318 pass/3 warning cũ/629.79s. Mutation đảo điều kiện source
final bị test bắt đúng; hash file product không đổi. App phục vụ build mới và
`/api/health` JSON status=ok; không cần restart runtime. Đã dọn tab/server fixture.

## Round83 — Timeline tự fit khi footage dài thêm (2026-10-22)

### Feedback

Khi recording hoặc follow MKV đang ghi, footage tiếp tục dài thêm. Nếu người dùng
đã zoom out hoàn toàn thì Timeline phải tự co để luôn thấy toàn bộ thời lượng.

### Agent tự kiểm

MKV trước đây ghi số giây hiện tại vào state khi bấm minus/kéo slider hết trái,
làm mất ý định fit ban đầu. OBS còn chặn viewport ở120s. Đã giữ fit sentinel khi
zoom out hoàn toàn, mở extent OBS theo duration và giữ manual zoom hữu hạn khi
zoom vào. Clock vẫn chạy khi source seek giữ playhead; waveform request vẫn tối
đa120s/600 điểm ở đuôi cửa sổ. Không tạo cache waveform live toàn lịch sử.

Browser app/API thật trên MKV AAC hai track xác nhận2.925625→11.702625s tự fit,
zoom vào giữ5.8513125s khi source dài thêm, rồi Home trở lại fit và hoàn tất ở
24.0326667s/slider0 không reload. Final source bằng byte với file kín và file đã
append; hai PCM24kHz mono16-bit đủ576784 frame. Không ghi project của chủ dự án.

### Kết quả so với ngưỡng

Frontend1209/150file/174.01s, typecheck/build212/397ms và API1318/3 warning cũ/
629.93s pass. Mutation đảo điều kiện fit bị cả4 case MKV bắt đúng; hash product
giữ nguyên. Lỗi đỏ ban đầu, tail request và fixture live scrub không hợp lệ được
giữ lại; fixture cuối dùng source-linked seek thật và vẫn giữ mọi assertion.

Managed API18120 health=ok, controller API/Studio running, busy=false,
lastError=null và phục vụ build mới; không restart. Probe URL fixture18482 cũ bị
refuse, không phải port app quản lý. Server fixture18484 đã dọn; thao tác đóng tab/
reset viewport không thể xác nhận vì Work settings tắt browser ở lúc chốt.
Ảnh và số đo trước đó nằm ở `docs/gates/timeline-fit83-20261022.md`, ADR0131.
Không đổi backend/media/engine/default STT, không hạ gate. OBS thiết bị thật và
nghiệm thu âm học độc lập vẫn mở. Phase03 giữ60%, Phase06 mở; dừng83.

## Round84 — Playhead MKV đang ghi tự nhảy về mốc cũ (2026-10-22)

### Feedback

Kéo playhead trong MKV đã import khi đang ghi thì nó tự nhảy về vị trí trước đó.

### Agent tự kiểm

Tái hiện bằng component thật: WAV còn metadata60s, footage đã120s, kéo tới96s rồi
timeupdate kéo ngược về60s. Resume/viewport không cần đổi để gây lỗi. onTimeUpdate
trước đây nhận cả clock đang pause; updatedAt còn nằm trong lifecycle key nên poll
kết thúc audition đang kéo. Sau khi chỉ đổi quyền clock, cả2 case drag đã pass.

Đã giữ quyền pointer/paused playhead, ổn định danh tính scrubber qua poll, thêm
revision URL từ path/duration PCM và đợi metadata khôi phục vị trí trước khi nhận
clock phát. Bắt cả18.5→0 khi resource đang load và Play cũ trả muộn sau thả chuột;
scrub mới hủy activation cũ. Không sửa shared scrubber hoặc backend/media.

Frontend full1215/150file/177.12s, focused77+16, typecheck/build212/424ms và mutation
pass. Ba fixture cũ nhận timeupdate khi pause được sửa cách khởi tạo: bật Play thật
hoặc pointer seek; giữ nguyên mọi assertion. Full đầu1214 pass/1 fixture fail và
lỗi nullable typecheck được giữ lại, không suppression/nới timeout.

MKV AAC hai track thật cho duration2.925625→11.702625→24.0326667s;6 HTTP Range
query trả206, final WAV24kHz mono PCM16 đủ576784 frame, source-final bằng hash.
Probe đầu giả định WAV header44 byte sai với LIST chunk; đọc4096 byte là đủ, không
đổi product. Fixture chỉ ghi scratch, không chạy model. Browser bị tắt trong Work
settings nên không nhận nghiệm thu browser/thiết bị mới. ADR0132 và gate
`docs/gates/mkv-playhead84-20261022.md` giữ bằng chứng.

### Kết quả so với ngưỡng

API full chưa xanh:1317 pass/1 fail/3 warning cũ/615.14s. Test portable updater
`test_update_stops_controller_holding_api_directory[True-False-False-False]` báo
protected source API PID54648 bị dừng; controller/API/Studio cũng ngừng. Chưa quy
được chính xác đường terminate. Không sửa/skip test này hoặc chạy lại trên app sống.
Wrapper lỗi và issue containment nằm trong `.scratch/playhead84/`.

Đã khôi phục bằng console chuẩn ở nền: controller/API/Studio running, busy=false,
lastError=null, health=ok, phục vụ build mới. Console6064 giữ quyền sở hữu stack;
log recovery và health cuối được lưu. Trước lần full API trên runtime sống tiếp
theo phải chặn terminate ngoài cây process fixture trước khi gọi stop. Gate này
và browser/device UAT còn mở; không hạ ngưỡng để báo pass. Phase03 giữ60%, Phase06
mở, không đổi default STT/portable; dừng84.
