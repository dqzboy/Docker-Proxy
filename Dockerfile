FROM node:lts-alpine
# 设置工作目录
WORKDIR /app
# 复制项目文件到工作目录
COPY hubcmdui/ .
# 安装项目依赖
RUN npm install
# 暴露应用程序的端口
EXPOSE 3000
# 运行应用程序
CMD ["sh", "-c", "cd /app && ./docker-entrypoint.sh"]