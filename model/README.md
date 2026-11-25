# passway extra work

*The model for network for calculation and for designing*

互动星图把工作分配到四个中心，观众可以放大一个条目，顺着连线查看它与另一个条目的关系。本次开源整理新增了 [network.json](network.json) 和 [Python 查询工具](../tools/network.py)，把相同的节点、业务关系和三维坐标变成可独立读取的模型。JSON 的格式版本是 `1.0`。项目的第三阶段名称是 **passway extra work**。

## 打开设计视图

第三阶段还包含一个直接读取模型的[设计视图](../design/index.html)。在仓库根目录启动本地预览服务。

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

在浏览器打开 [http://127.0.0.1:8000/design/](http://127.0.0.1:8000/design/)。页面每次加载都会读取同一份 `model/network.json`。拖动旋转，滚轮或双指捏合缩放。也可将焦点移到画布，使用方向键、加减键和 Home 键操作。模型中的坐标决定节点位置，分类实线与跨组虚线分别来自对应关系。修改模型并刷新即可查看效果。运行中的正常视图只显示标题 **Astra for Work** 和星图。

## 三种关系

| `kind` | 存储方向 | 本版数量 | 用途 |
| --- | --- | ---: | --- |
| `category` | 根节点 → 分类中心 | 4 | 从白色 Codex 入口找到办公、设计、课程和求职四组。 |
| `membership` | 分类中心 → 工作条目 | 20 | 每项工作恰好有一个所属中心。 |
| `workflow` | 提供材料、结果或反馈的工作 → 使用它的工作 | 7 | 用边上的 `label` 和 `reason` 解释跨组交接。 |

工作通过目录彼此连通。要查“哪些工作向同一张汇报图提供了材料”，应只选 `workflow` 边。例如 `teams → slides ← pal` 表示“反馈和预测结果都进入演示设计”。从 Teams 沿图找到 PAL 时，第二段走的是反向溯源。图上的连通本身不会使 Teams 成为预测模型的输入。

## 运行一次查询

在仓库根目录执行以下命令。查询工具只使用 Python 3.8+ 标准库。

```sh
python3 tools/network.py validate
python3 tools/network.py stats
python3 tools/network.py path teams pal
python3 tools/network.py path pal slides --mode flow
python3 tools/network.py path codex pal --mode atlas
```

| 查询模式 | 可走的边 | 方向 | 示例结果 |
| --- | --- | --- | --- |
| `trace`（默认） | 工作交接 | 两个方向 | `teams → slides ← pal`，共 2 跳。输出标注每段是正向还是逆向。 |
| `flow` | 工作交接 | 仅正向 | `pal → slides` 有 1 跳，`teams → pal` 没有正向路径。 |
| `atlas` | 全部 | 两个方向 | `codex → learn → pal` 有 2 跳，可用于选择导航路线。 |

路径查询按边数求最短路，各边取相同权重。查询成功返回退出码 0，无路径返回 1，输入数据或节点 ID 有误返回 2。使用另一份数据时，将 `--graph path/to/network.json` 放在子命令前。

## 字段及坐标

| 记录 | 字段 | 约定 |
| --- | --- | --- |
| 节点 | `id`、`kind` | ID 稳定且唯一。类型为 `root`、`group` 或 `work`。 |
| 展示信息 | `name`、`short_name`、`name_en`、`description`、`color` | 同一节点可分别用于清单、近景标签、说明和分类上色。 |
| 工作归属 | `group_id` | 工作节点的所属分类，须和唯一的 `membership` 入边一致。 |
| 三维位置 | `position.x`、`position.y`、`position.z` | 互动版初始布局算出的场景坐标，保留 6 位小数。 |
| 边 | `source`、`target`、`kind`、`label`、`reason` | 两端按节点 ID 关联，点选一条工作交接边时可以显示其依据。 |

坐标取自互动版原有的固定分类锚点、随机种子 `26981` 和 155 次布局迭代。镜头推近、旋转或平移时改变投影，模型坐标保持固定。节点距离、颜色和大小用于展示。工作频次、投入时长和真实物理尺度需要额外数据才能估计。

若要导入一个 Z 轴向上的三维设计场景，可先将根节点移到原点，再自行选定比例。举例取 100 个场景单位等于 1 个设计单位，根节点为 `(0, 2, 12)`，可以这样换算。

```python
def design_position(p):
    return (p["x"] / 100, -(p["z"] - 12) / 100, (p["y"] - 2) / 100)
```

金色办公中心从 `(-139, 79, 38)` 映射为 `(-1.39, -0.26, 0.77)`。这是场景设计者选定的比例，换算结果可供布点和镜头规划使用。

## 扩充模型

1. 为新工作分配一个稳定 ID，填写类别、说明及初始位置。
2. 增加一条从所属分类到该工作的 `membership` 边。
3. 如确有跨组交接，写清提供了什么、由哪项工作使用，将描述写入 `reason`。
4. 运行 `validate` 和 `stats` 检查新节点、边和各组计数。第二阶段的单文件互动页面是独立快照，新数据需由下一个版本的界面主动加载。
