# Nghiệm thu W0–W4

Danh sách kiểm tra hợp nhất cho toàn bộ đợt ổn định trên nhánh
`fix/w1-runtime-and-index-performance` (18 commit, 50 file).

Xếp theo **thứ tự thao tác trong một phiên làm việc**, không theo số round — mở
app một lần rồi kiểm nhiều thứ, thay vì mở lại theo từng W.

Ký hiệu:

- **[TAY]** chỉ người bấm mới kiểm được (thị giác, cảm giác, hành vi app)
- **[LỆNH]** chạy được bằng lệnh, kết quả khách quan
- **[RỦI RO]** chỗ đã đánh đổi hoặc chưa chắc — nhìn kỹ nhất ở đây

---

## 0. Trước khi bắt đầu

```bash
.venv/Scripts/python.exe -m pytest services/api/tests -q
```
→ **78 passed**. Không test cũ nào bị sửa để né lỗi.

```bash
powershell -NoProfile -Command "Push-Location apps\web; npm test; Pop-Location"
```
→ **43 passed trong ~3 giây**. Trên ổ mạng cũ lệnh này **không chạy được** và
phải dùng `--pool=threads` mất ~9 phút; sau khi chuyển sang ổ local, nó hoạt
động bình thường. Nếu thấy worker timeout thì kiểm tra xem có đang đứng ở bản
copy trên ổ mạng không.

```bash
.venv/Scripts/python.exe scripts/stt_quality_report.py
```
→ Ảnh chụp trạng thái hiện tại. Chạy lại sau mỗi lần kiểm để so.

---

## 1. Vòng đời tiến trình — W0

| # | Việc làm | Kết quả đúng | |
| --- | --- | --- | --- |
| 1.1 | Chạy `start-pro4bro.bat` | Cửa sổ in **"This window owns every Pro4Bro process."** | [TAY] |
| 1.2 | **Đóng cửa sổ bằng nút X**, rồi chạy lệnh đếm process bên dưới | **0 process**. Trước khi sửa còn 6. | [TAY] |
| 1.3 | Sửa một chuỗi hiển thị trong `apps/web/src`, mở app, Windows → `Restart all` | Log in "Rebuilding bundle"; refresh thấy chuỗi mới. Không cần reboot, không cần `npm run build` tay. | [TAY] |
| 1.4 | Bấm `Restart all` 5 lần liên tiếp | Lần nào cũng về `running`. Không lần nào báo "port is occupied". | [TAY] |
| 1.5 | Sửa `services/api/app/runtime_controller.py`, chạy `start-pro4bro.bat restart` | Thay đổi được nạp trong cửa sổ mới | [RỦI RO] |

```bash
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Select-Object ProcessId,CommandLine | Format-Table -Wrap"
```

**1.5 là mục duy nhất trong W0 chưa ai chạy end-to-end.** Đường code có, nhưng
cần một cửa sổ thật mới xác minh được.

---

## 2. Mở project lớn — W1 storage

Dùng **PDCA CLDNDD K4** (3 asset, 125.048 từ).

| # | Việc làm | Kết quả đúng | |
| --- | --- | --- | --- |
| 2.1 | Mở project PDCA | Media Pool hiện đủ 3 footage, không khựng. Lần đầu chậm ~2 s (migration), từ lần hai tức thì. | [TAY] |
| 2.2 | Bấm qua lại giữa 3 footage nhiều lần | Không khựng | [TAY] |
| 2.3 | Xem Script của từng footage | Transcript và word timing **giống hệt trước**, không mất chữ | [TAY] |
| 2.4 | Kiểm tra file trên đĩa | `index.json` **3,05 MB** (trước 31,3 MB); mỗi thư mục asset có `words.json` | [LỆNH] |
| 2.5 | Đo lại tốc độ | `media.list()` < 0,15 s; `media.get()` < 0,30 s | [LỆNH] |

```bash
.venv/Scripts/python.exe scripts/stt_quality_report.py --project pdca-cldndd-k4 --benchmark pdca-cldndd-k4-949eae9a
```

Baseline trước W1: `media.list()` **3,332 s**, `media.get()` **3,297 s**.

---

## 3. Module Script — W1 frontend + W3 UI

| # | Việc làm | Kết quả đúng | |
| --- | --- | --- | --- |
| 3.1 | Mở footage có nhiều speaker, xem bảng Script | **Có thanh cuộn ngang** dưới bảng khi cột rộng hơn module; kéo được sang phải | [TAY] |
| 3.2 | Chỉ có **một** thanh cuộn dọc | Thanh tùy chỉnh bên phải; không có thanh dọc thứ hai của trình duyệt | [TAY] |
| 3.3 | Bấm play, để chạy 30 giây | Từ đang phát được highlight, **Script tự cuộn theo từ**, không nhảy về đầu | [TAY] |
| 3.4 | Kéo playhead ra chỗ bất kỳ rồi play tiếp | Script vẫn bám theo, không quay về đầu | [TAY] |
| 3.5 | Gõ vào Script của asset 33.912 từ | Không khựng khi gõ | [TAY] |
| 3.6 | Gõ liên tục trong lúc STT đang chạy, chờ STT xong | **Transcript vẫn vào Script** — đây là lỗi "lâu lâu không thấy update" | [RỦI RO] |

**3.3 và 3.6 là hai lỗi anh báo trực tiếp.** Nếu còn, báo ngay.

---

## 4. Popup — W3 UI

| # | Việc làm | Kết quả đúng | |
| --- | --- | --- | --- |
| 4.1 | Mở Windows → Preferences | Nền phía sau **tối nhưng nét**, đọc được chữ. Không blur. | [TAY] |
| 4.2 | Bấm ra ngoài popup Preferences | Popup đóng | [TAY] |
| 4.3 | Mở LOG ở thanh trạng thái, bấm ra ngoài | Popup đóng | [TAY] |
| 4.4 | IMPORT nhiều file để hiện hàng chờ, bấm ra ngoài | Popup đóng (tương đương bấm Hủy) | [TAY] |

---

## 5. Chạy STT — W1 sidecar + W2 timing

| # | Việc làm | Kết quả đúng | |
| --- | --- | --- | --- |
| 5.1 | Chạy STT một file **dài hơn 1 giờ**, nhìn progress | Vượt 16% trong khoảng 10 giây. Trước: đứng ở 4% gần 2 phút. | [TAY] |
| 5.2 | Xem Task Manager lúc STT chạy | RAM đỉnh của process Studio thấp hơn trước ít nhất 500 MB | [TAY] |
| 5.3 | Chạy STT lại file 236 s, so transcript trước/sau | **Text không đổi** | [LỆNH] |
| 5.4 | Sau khi chạy lại STT, xem `edge-refined` | Tỉ lệ nhóm được snap **tăng lên khác 0** | [RỦI RO] |

> **W2 chỉ có tác dụng khi chạy lại STT.** Asset cũ giữ nguyên timing cũ, nên
> `edge-refined` hiện đang **0,0%** trên các file PDCA. Đó **không phải hỏng** —
> chúng chưa được nhận dạng lại. Muốn kiểm W2 phải bấm `Nhận diện kỹ` lại.

---

## 6. Diarization — W1 progress + W4 gán nhãn

| # | Việc làm | Kết quả đúng | |
| --- | --- | --- | --- |
| 6.1 | Chạy diarization một footage, chờ tới 100% | **Job kết thúc thật**, chuyển sang complete. Trước đây kẹt ở 100% mãi. | [RỦI RO] |
| 6.2 | Trong lúc diarize, bấm quanh app | App vẫn phản hồi. Trước đây đứng hình. | [TAY] |
| 6.3 | Vừa diarize vừa sửa Script | Sửa đổi **không mất** khi job xong | [TAY] |
| 6.4 | Đếm dòng `activity/events.jsonl` trước/sau một job | Tăng **3 dòng trở xuống**. Trước đây hàng trăm. | [LỆNH] |
| 6.5 | Mở **Test 3**, xem Script chế độ speaker | **Không còn từ nào thiếu nhãn** (trước: 39 từ) | [TAY] |
| 6.6 | Đọc qua transcript Test 3 | Không còn đoạn **1–2 từ** bị gán nhầm sang người kia giữa câu | [TAY] |
| 6.7 | Tìm các đoạn đệm ngắn: **"Đúng rồi"**, **"À hiểu hiểu"**, **"Chính xác"** | Vẫn thuộc **người nghe**, không bị gộp vào người nói | [RỦI RO] |

```bash
wc -l < data/projects/test-3/activity/events.jsonl
.venv/Scripts/python.exe scripts/stt_quality_report.py --project test-3
```

**6.7 là chỗ đánh đổi rõ ràng nhất trong toàn đợt.** Bản gộp mạnh tay cho 11 run
thay vì 17 — đẹp hơn trên giấy — nhưng xoá mất backchannel thật. Chọn phía hẹp vì
gán lời người nghe cho người nói là sai tệ hơn. Nếu anh vẫn thấy backchannel bị
gán nhầm, đó là chỗ cần nới ngược lại.

---

## 7. Portability — copy project

| # | Việc làm | Kết quả đúng | |
| --- | --- | --- | --- |
| 7.1 | Copy **nguyên thư mục** một project sang ổ khác, mở app | Project hiện **và mở được**, đủ transcript, audio, timing | [TAY] |
| 7.2 | Không cần copy `.registry`, không cần bấm Open Existing | Vẫn mở được | [TAY] |

Trước khi sửa: **7/8 project** hiện trong Project Hub nhưng bấm vào thì lỗi.

---

## 8. Log — W3 logging

| # | Việc làm | Kết quả đúng | |
| --- | --- | --- | --- |
| 8.1 | Dùng app vài phút rồi mở `data/logs/pro4bro-api.out.log` | **Không còn** dòng `GET /api/system/status` lặp lại | [LỆNH] |
| 8.2 | Sau một job diarization/STT, xem cuối log | Có dòng `DIARIZATION START` / `DONE ... spans=.. speakers=.. unlabelled=..` | [LỆNH] |
| 8.3 | Gây một lỗi bất kỳ (tắt Studio rồi chạy STT) | Log ghi `FAILED` kèm exception và traceback | [TAY] |

Trước khi sửa: **97% log là nhiễu** (2.043/2.104 dòng).

---

## 9. Đã biết là chưa đạt — không cần kiểm

Hai ngưỡng của **W2 (R2, do Codex làm)** chưa đạt, và **cố ý không hạ**:

| Chỉ số | Ngưỡng | Thật | Vì sao |
| --- | --- | --- | --- |
| PDCA asset 3 chuyển sang `partial` | mong đợi `partial` | vẫn `needs-alignment` | 2.737/47.719 từ untrusted = **5,74%**, vượt ngưỡng 5% đã khoá |
| tỉ lệ nhóm được snap biên | ≥ 60% | **35,7%** | Cách group theo `segmentIndex` cho 56 nhóm nhưng chỉ có 31 Silero span; muốn vượt 60% phải đổi thuật toán ngoài phạm vi W2 |

**W3 (forced alignment) đã đo và bác bỏ** — không có gì để kiểm. Chi tiết trong
`docs/adr/0007-preserve-source-word-timing.md`.

---

## 10. Hiển thị tiến trình — bổ sung sau W4

| # | Việc làm | Kết quả đúng | |
| --- | --- | --- | --- |
| 10.1 | Mở `start-pro4bro.bat`, nhìn cửa sổ | In bảng **STARTED** với 3 dòng: controller / API / Studio, kèm port và PID | [TAY] |
| 10.2 | Để yên 30 giây | Xuất hiện dòng heartbeat `[hh:mm:ss] runtime=running pro4bro=running omnivoice=running` | [TAY] |
| 10.3 | Nhìn tiêu đề cửa sổ | `Pro4Bro - RUNNING (3/3)` | [TAY] |
| 10.4 | Mở menu Windows trong app | Liệt kê 3 tiến trình với port và PID | [TAY] |
| 10.5 | Giết một service từ Task Manager | Cửa sổ in bảng **CHANGED** trong ~2 giây; menu Windows đổi trạng thái | [TAY] |
| 10.6 | Cho process khác chiếm port 18120 rồi xem menu Windows | Báo **PORT BỊ CHIẾM** / `blocked`, nêu tên và PID kẻ chiếm — **không** báo ALL SYSTEMS ON | [RỦI RO] |
| 10.7 | Sau một lần dọn orphan, mở `data/logs/pro4bro-runtime-actions.log` | Có dòng `reclaimed N orphaned process tree(s)` và bảng inventory sau mỗi action | [LỆNH] |

**10.6 là lỗi thật đã sửa.** Trước đây một process lạ giữ port 18120 vẫn khiến app
báo "ALL SYSTEMS ON" trong khi không có gì của mình trả lời — loại sai tệ nhất vì
mọi chỉ báo đều đồng ý.

---

## 11. Chưa làm, đang chờ anh quyết

Không còn mục nào treo. Hai ngưỡng W2 ở mục 9 vẫn chưa đạt và cố ý không hạ.
