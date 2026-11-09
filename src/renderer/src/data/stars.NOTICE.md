# 星表数据来源与许可

文件：src/renderer/src/data/stars.json（最亮约 1200 颗恒星）

- 原始数据来自 d3-celestial 的 data/stars.6.json（作者 Olaf Frohn），其星表源自
  Yale Bright Star Catalog（公有领域）。
- d3-celestial 采用 BSD-3-Clause 许可：

  Copyright (c) 2015, Olaf Frohn
  All rights reserved.

  Redistribution and use in source and binary forms, with or without modification,
  are permitted provided that the copyright notice, this list of conditions and
  the following disclaimer are retained.

- 本仓库中的 stars.json 是上述数据的裁剪版本（按星等取最亮约 1200 颗，
  坐标由度转换为小时/度并做四舍五入）。
