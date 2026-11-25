# 日级异常提醒测试

在上一级 Starlink 测试目录运行以下命令。Python 3 使用标准库和随仓库提供的 NAB 评分器。

```sh
python3 -m unittest discover -s nab -p 'test_*.py'
```

两种检测器都先观察 7 天。固定规则在当天达到 200 分钟时提醒。滚动规则只使用此前 7 个观测值，将阈值设为中位数加上 `max(50, 3 × 1.4826 × MAD)`。MAD 是到中位数的绝对偏差的中位数。

合成序列基准为每天 25 分钟。第 12 天分别注入 0、50、200 分钟。命中窗口为当天和次日。测试同时检查预热、阈值等号、修改当天或未来的值能否回写当日阈值、早报与晚报的分差、窗外误报代价，以及同一窗口的重复提醒。归一分以零提醒为 0、首日命中为 100。这些结果检验检测器与评分器的实现，真实用户异常的识别表现仍需另行标注。

`vendor/sweeper.py` 为 Numenta 上游原文件，Git blob 为 `3207ab95af2ed4736592d3e599f77b4e1a279f1d`，使用 standard 成本权重。许可见同目录的 LICENSE.txt。[NAB 源项目](https://github.com/numenta/NAB) · [评分器源文件](https://github.com/numenta/NAB/blob/master/nab/sweeper.py) · [原许可](vendor/LICENSE.txt)
