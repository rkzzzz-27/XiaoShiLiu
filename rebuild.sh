#!/bin/bash
# 脚本名称: rebuild.sh
# 功能: 初始化 Express 项目数据库，然后构建 Vue3 前端项目

set -e  # 遇到任何错误立即退出

# 获取脚本所在目录的绝对路径（假设脚本放在 XiaoShiLiu 根目录下）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 进入后端目录并执行数据库初始化
echo "=== 正在初始化 Express 数据库 ==="
cd "$SCRIPT_DIR/express-project"
if [ -f "package.json" ]; then
    npm run init-db
else
    echo "错误: express-project 中没有 package.json，请检查路径"
    exit 1
fi

# 返回根目录（实际上 cd .. 可以省略，因为下一步会直接使用绝对路径）
cd "$SCRIPT_DIR"

# 进入前端目录并构建
echo "=== 正在构建 Vue3 前端 ==="
cd "$SCRIPT_DIR/vue3-project"
if [ -f "package.json" ]; then
    npm run build
else
    echo "错误: vue3-project 中没有 package.json，请检查路径"
    exit 1
fi

echo "✅ 全部完成！数据库已初始化，前端已构建。"
