# Feedback images

Ảnh chụp màn hình kèm theo feedback từng round trong `docs/STABILIZATION-LOG.md`.

Chụp bằng `Win+Shift+S` (ảnh vào clipboard), rồi:

```powershell
.\scripts\save-feedback-image.ps1 -Round R1 -Note "timeline khi phat"
```

Script lưu ảnh vào đây và in ra dòng Markdown để dán vào log. Đặt tên theo
`R<n>-<số thứ tự>.png` nên thứ tự chụp được giữ nguyên.

Ảnh **được commit** vào repo: chúng là bằng chứng vì sao một round bị từ chối, và
mất chúng thì lời giải thích trong log không còn đối chiếu được. Giữ file ở mức
vài trăm KB — cắt đúng phần cần nhìn thay vì chụp cả màn hình.
