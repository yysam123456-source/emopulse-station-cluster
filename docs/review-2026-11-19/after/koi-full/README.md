# koi 完整移植 · 实机截图

全部由 `tests/lib/browser.mjs` 驱动真实 Chromium（headless WebGPU）截取，不是手绘、不是 mock。

| 文件 | 内容 |
|---|---|
| `koi-desk-ink.png` | 1280×800，`/koi` 默认 ink，带站点标题与 hook |
| `koi-desk-paint.png` | 1280×800，`?style=paint`，水彩/纸纹 |
| `koi-desk-real.png` | 1280×800，`?style=real`，池底卵石、焦散、鱼影、浅米白标题 |
| `koi-mobile-{ink,paint,real}.png` | 390×844 @dpr2，三种 look |
| `koi-menu.png` | Esc 菜单，Look / Touch / Camera / Water / Weather / Music |
| `koi-upstream-vs-port.png` | 上排上游原页，下排 `/koi`；同 `seed=42`、同 `warm=600`、`t=0`、暂停，用来核对鱼群/池底/笔触 |

## 复现

```bash
npm run build:sites
# 直接打开 dist/koi/index.html?style=real
# 或跑视觉门：
npm run verify:site
```

`dist/koi-upstream/` 是本地对照页（import map 指向本地 three），不是交付物，`dist/` 被 gitignore。
