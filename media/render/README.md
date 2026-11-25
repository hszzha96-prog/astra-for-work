# 重剪 Astra for Work

这个渲染器重建黑色画布版本的 30 秒行程。它从 [network.json](../../model/network.json) 读取三维坐标、分类颜色和连线，在 1920 × 1080 画布上投影出 1,800 帧。相机关键帧、节点高亮时段和片名绘制都位于 [render.cjs](render.cjs)，粒子、辉光和透视投影位于 [scene.cjs](scene.cjs)。模型须使用格式版本 1.0，并包含镜头引用的节点。

## 渲染一帧

需要 Node.js 18.3 或更高版本。从仓库根目录执行以下命令，预览第 5.7 秒的 Teams 近景。

```sh
cd media/render
npm install
npm run render -- --from 342 --to 343 --out preview
```

打开 `preview/00342.jpg`。帧编号从零开始，输出范围包含 `--from`，到 `--to` 前一帧结束。默认字体按顺序尝试 Baskerville、Times New Roman 和系统衬线字体。各平台字形可能不同。若有适用字体文件，传入 `--font path/to/font.ttf`。也可用 `--model path/to/network.json` 读取其他同结构模型。

## 生成配乐与整片

在同一目录执行以下命令。配乐源文件 [score.py](score.py) 使用 Python 3.11 或更新版本及 NumPy，以固定随机种子生成 48 kHz 双声道 WAV。打包视频需要带 H.264 与 AAC 编码器的 FFmpeg。

```sh
npm run render -- --out frames
python3 -m pip install numpy==2.3.5
python3 score.py score.wav
ffmpeg -framerate 60 -start_number 0 -i frames/%05d.jpg -i score.wav \
  -map 0:v:0 -map 1:a:0 -t 30 -c:v libx264 -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 160k -movflags +faststart astra-for-work.mp4
```

已发布的 MP4 使用 AV1。上面的 H.264 导出设置便于在更多设备上播放。要改运镜，在 `render.cjs` 的 `mark(...)` 调用中调整时间、注视点、距离和两个旋转角，再渲染一个局部帧段检查过渡。编辑数据前，可从仓库根目录运行 `python3 tools/network.py validate` 检查模型。
