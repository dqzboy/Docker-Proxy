<p align="right">
   <strong>中文</strong> | <a href="./README.en.md">English</a>
</p>

<div style="text-align: center">
  <p align="center">
  <img src="https://github.com/dqzboy/Docker-Proxy/assets/42825450/c187d66f-152e-4172-8268-e54bd77d48bb" width="230px" height="200px">
      <br>
      <i>Docker镜像加速命令查询获取、镜像搜索、配置教程文档展示UI面板.</i>
  </p>
</div>

<div align="center">

[![Auth](https://img.shields.io/badge/Auth-dqzboy-ff69b4)](https://github.com/dqzboy)
[![GitHub contributors](https://img.shields.io/github/contributors/dqzboy/Docker-Proxy)](https://github.com/dqzboy/Docker-Proxy/graphs/contributors)
[![GitHub Issues](https://img.shields.io/github/issues/dqzboy/Docker-Proxy.svg)](https://github.com/dqzboy/Docker-Proxy/issues)
[![GitHub Pull Requests](https://img.shields.io/github/stars/dqzboy/Docker-Proxy)](https://github.com/dqzboy/Docker-Proxy)
[![HitCount](https://views.whatilearened.today/views/github/dqzboy/Docker-Proxy.svg)](https://github.com/dqzboy/Docker-Proxy)
[![GitHub license](https://img.shields.io/github/license/dqzboy/Docker-Proxy)](https://github.com/dqzboy/Docker-Proxy/blob/main/LICENSE)


📢 <a href="https://t.me/+ghs_XDp1vwxkMGU9" style="font-size: 15px;">Docker Proxy-交流群</a>

</div>

---

## 📝 源码运行

```bash
# 克隆项目并启动
git clone git@github.com:dqzboy/Docker-Proxy.git
cd Docker-Proxy/hubcmdui
npm install
npm start
```

系统会自动检测并完成：
- ✅ 依赖包安装（如果需要）
- ✅ SQLite数据库初始化（如果需要）
- ✅ 启动服务


### 访问系统

- **主页**: http://localhost:3000
- **管理面板**: http://localhost:3000/admin  
- **默认账户**: root / admin@123

## 📦 Docker 方式运行

#### 1. 下载 hubcmd-ui 镜像
```bash
docker pull dqzboy/hubcmd-ui:latest
```

#### 2. 运行 hubcmd-ui 容器
```bash
docker run -d -v /var/run/docker.sock:/var/run/docker.sock -v ./data:/app/data -p 30080:3000 --name hubcmdui-server dqzboy/hubcmd-ui
```
- `-v` 参数解释：左边是宿主机上的 Docker socket 文件路径，右边是容器内的映射路径

## Docker Compose 部署

#### 1. 下载 [docker-compose.yaml](https://github.com/dqzboy/Docker-Proxy/blob/main/hubcmdui/docker-compose.yaml) 文件到你本地机器上

#### 2. 执行 `docker compose` 或 `docker-compose` 命令启动容器服务

```shell
docker compose up -d

# 查看容器日志
docker logs -f [容器ID或名称]
```

---

## 🌐 代理配置

支持通过环境变量配置 HTTP 代理，用于所有出站网络请求。

### 环境变量配置

```bash
# HTTP 代理配置
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=https://proxy.example.com:8080
export NO_PROXY=localhost,127.0.0.1,.local

# 启动应用
npm start
```

### Docker 部署代理配置

```bash
docker run -d \
  -e HTTP_PROXY=http://proxy.example.com:8080 \
  -e HTTPS_PROXY=https://proxy.example.com:8080 \
  -e NO_PROXY=localhost,127.0.0.1,.local \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v ./data:/app/data \
  -p 30080:3000 \
  dqzboy/hubcmd-ui
```

### Docker Compose 代理配置

```yaml
version: '3.8'
services:
  hubcmdui:
    image: dqzboy/hubcmd-ui
    environment:
      - HTTP_PROXY=http://proxy.example.com:8080
      - HTTPS_PROXY=https://proxy.example.com:8080
      - NO_PROXY=localhost,127.0.0.1,.local
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      # SQLite数据库文件
      - ./data:/app/data
    ports:
      - "30080:3000"
```

---

## UI界面

- 默认容器监听`3000`端口，映射宿主机端口`30080`

> 浏览器输入 `服务器地址:30080` 访问前端

<table>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/hubcmd-ui_01.png?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/hubcmd-ui_02.png?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/hubcmd-ui_03.png?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/hubcmd-ui_04.png?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/hubcmd-ui_05.png?raw=true"></td>
    </tr>
</table>

> 浏览器输入 `服务器地址:30080/admin` 访问后端页面，默认登入账号密码: root / admin@123

<table>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/hubcmd-ui_06.png?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/hubcmd-ui_07.png?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/hubcmd-ui_08.png?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/hubcmd-ui_09.png?raw=true"></td>
    </tr>
</table>

<table>
    <tr>
        <td width="50%" align="center"><img src="https://cdn.jsdelivr.net/gh/dqzboy/Images/dqzboy-proxy/hubcmd-ui_10.png?raw=true"></td>
    </tr>
</table>

---

## 🚀 系统特性

### 数据存储优化
- **SQLite数据库**: 所有数据统一存储在SQLite数据库中
- **Session管理**: 使用数据库存储用户会话，自动清理过期会话
- **配置管理**: 系统配置、用户数据、文档内容统一存储
- **零文件依赖**: 不再依赖JSON文件存储，简化部署和维护

### 功能特性
- 🔐 **用户认证**: 基于数据库的用户管理系统
- ⚙️ **配置管理**: 灵活的系统配置和菜单管理
- 📚 **文档系统**: 内置Markdown文档管理
- 🔍 **镜像搜索**: Docker Hub镜像搜索和代理
- 📊 **系统监控**: 实时系统状态监控
- 🎨 **响应式界面**: 现代化的Web管理界面

## 📁 项目结构

```
hubcmdui/
├── database/           # SQLite数据库相关
│   └── database.js    # 数据库管理模块
├── services/          # 业务服务层
│   ├── configServiceDB.js    # 配置服务
│   ├── userServiceDB.js      # 用户服务
│   └── documentationServiceDB.js # 文档服务
├── routes/            # API路由
├── web/              # 前端静态文件
├── middleware/       # 中间件
└── data/             # 数据目录（SQLite文件）
    └── app.db        # SQLite数据库文件
```

---

## 🫶 赞助
如果你觉得这个项目对你有帮助，请给我点个Star。并且情况允许的话，可以给我一点点支持，总之非常感谢支持😊

<table>
    <tr>
      <td width="50%" align="center"><b> Alipay </b></td>
      <td width="50%" align="center"><b> WeChat Pay </b></td>
    </tr>
    <tr>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Deploy_K8sCluster/assets/42825450/223fd099-9433-468b-b490-f9807bdd2035?raw=true"></td>
        <td width="50%" align="center"><img src="https://github.com/dqzboy/Deploy_K8sCluster/assets/42825450/9404460f-ea1b-446c-a0ae-6da96eb459e3?raw=true"></td>
    </tr>
</table>

---

## 😺 其他

开源不易,若你参考此项目或基于此项目修改可否麻烦在你的项目文档中标识此项目？谢谢你！

---

## License
Docker-Proxy is available under the [Apache 2 license](./LICENSE)
