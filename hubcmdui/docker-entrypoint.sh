# /bin/sh
# 进入工作目录
cd /app
# 处理挂载目录/app/config
# 检查目录 /app/config 是否存在
if [ ! -d "/app/config" ]; then
    # 如果不存在，则创建目录
    mkdir -p /app/config
    echo "Created /app/config directory."
else
    echo "/app/config directory already exists."
fi

# 检查目录 /app/config 里面是否有 *.json 文件
if ls /app/config/*.json 1> /dev/null 2>&1; then
    echo "JSON files found in /app/config."
else
    echo "No JSON files found in /app/config. Copying default config."
    # 如果没有 JSON 文件，则复制默认配置文件
    cp /app/_templates/config/*.json /app/config/
    echo "Default config files copied to /app/config."
fi

# 处理挂载目录 /app/data
# 检查目录 /app/data 是否存在
if [ ! -d "/app/data" ]; then
    # 如果不存在，则创建目录
    mkdir -p /app/data
    echo "Created /app/data directory."
else
    echo "/app/data directory already exists."
fi

# 检查目录 /app/data 里面是否有 *.json 文件
if ls /app/data/*.json 1> /dev/null 2>&1; then
    echo "JSON files found in /app/data."
else
    echo "No JSON files found in /app/data. Copying default data."
    # 如果没有 JSON 文件，则复制默认数据文件
    cp /app/_templates/data/*.json /app/data/
    echo "Default data files copied to /app/data."
fi

# 处理挂载目录 /app/documentation
# 检查目录 /app/documentation 是否存在
if [ ! -d "/app/documentation" ]; then
    # 如果不存在，则创建目录
    mkdir -p /app/documentation
    echo "Created /app/documentation directory."
else
    echo "/app/documentation directory already exists."
fi

# 检查目录 /app/documentation 里面是否有 *.json 文件
if ls /app/documentation/*.json 1> /dev/null 2>&1;
then
    echo "JSON files found in /app/documentation."
else
    echo "No JSON files found in /app/documentation. Copying default documentation."
    # 如果没有 JSON 文件，则复制默认文档文件
    cp /app/_templates/documentation/*.json /app/documentation/
    echo "Default documentation files copied to /app/documentation."
fi


# 启动应用
echo "Starting hubcmd-ui..."
node server.js
