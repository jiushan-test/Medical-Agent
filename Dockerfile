# Node.js 20 镜像 (Next.js 16 要求 Node >= 20.9.0)
# 如需国内镜像，可在构建时覆盖：--build-arg BASE_IMAGE=registry.cn-hangzhou.aliyuncs.com/library/node:20-alpine
ARG BASE_IMAGE=node:20-alpine
FROM ${BASE_IMAGE} AS base

# 安装基础依赖 (better-sqlite3 需要 python 和 build-base)
FROM base AS deps
RUN if command -v apk >/dev/null 2>&1; then sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories; fi
RUN if command -v apk >/dev/null 2>&1; then apk add --no-cache libc6-compat python3 make g++ coreutils bash; else apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*; fi
WORKDIR /app

# 复制依赖文件
COPY package.json package-lock.json* ./
RUN npm ci

# 构建阶段
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 设置环境变量
ENV NEXT_TELEMETRY_DISABLED 1
# 某些小内存机器构建 Next.js 容易触发 Node 内存不足，可在构建时覆盖：
# docker build --build-arg BUILD_NODE_OPTIONS="--max-old-space-size=4096" ...
ARG BUILD_NODE_OPTIONS=--max-old-space-size=2048
ENV NODE_OPTIONS=${BUILD_NODE_OPTIONS}
# 如果有 Zhipu Key，可以在构建时传入，或者运行时传入 (推荐运行时)
# ENV ZHIPU_API_KEY="" 

# 修复二进制文件权限 (防止 "Permission denied")
RUN chmod +x node_modules/.bin/*

# 构建项目
RUN npm run build

# 生产运行阶段
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# 创建系统用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制构建产物
COPY --from=builder /app/public ./public

# 自动利用 standalone 输出 (Next.js 优化)
# 需要在 next.config.mjs 中开启 output: 'standalone'
# 这里我们假设默认配置，手动复制必要文件
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 复制数据库初始化脚本或空 DB (如果需要)
# better-sqlite3 会在运行时创建文件，确保目录权限
# 我们需要在 lib/db.ts 中确保路径是可写的，通常是 process.cwd()

USER nextjs

EXPOSE 3000

ENV PORT 3000
# 绑定 0.0.0.0
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
