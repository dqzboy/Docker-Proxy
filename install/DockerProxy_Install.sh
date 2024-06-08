#!/usr/bin/env bash
#===============================================================================
#
#          FILE: DockerProxy_Install.sh
# 
#         USAGE: ./DockerProxy_Install.sh
#
#   DESCRIPTION: 自建Docker镜像代理，基于官方registry一键部署Docker镜像代理服务
# 
#  ORGANIZATION: DingQz dqzboy.com 浅时光博客
#===============================================================================

echo
cat << EOF

    ██████╗  ██████╗  ██████╗██╗  ██╗███████╗██████╗     ██████╗ ██████╗  ██████╗ ██╗  ██╗██╗   ██╗
    ██╔══██╗██╔═══██╗██╔════╝██║ ██╔╝██╔════╝██╔══██╗    ██╔══██╗██╔══██╗██╔═══██╗╚██╗██╔╝╚██╗ ██╔╝
    ██║  ██║██║   ██║██║     █████╔╝ █████╗  ██████╔╝    ██████╔╝██████╔╝██║   ██║ ╚███╔╝  ╚████╔╝ 
    ██║  ██║██║   ██║██║     ██╔═██╗ ██╔══╝  ██╔══██╗    ██╔═══╝ ██╔══██╗██║   ██║ ██╔██╗   ╚██╔╝  
    ██████╔╝╚██████╔╝╚██████╗██║  ██╗███████╗██║  ██║    ██║     ██║  ██║╚██████╔╝██╔╝ ██╗   ██║   
    ╚═════╝  ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝    ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   
                                                                                               
EOF

echo "----------------------------------------------------------------------------------------------------------"
echo -e "\033[32m机场推荐\033[0m(\033[34m按量不限时，解锁ChatGPT\033[0m)：\033[34;4mhttps://mojie.mx/#/register?code=CG6h8Irm\033[0m"
echo "----------------------------------------------------------------------------------------------------------"
echo
echo



GREEN="\033[0;32m"
RED="\033[31m"
YELLOW="\033[33m"
RESET="\033[0m"

INFO="[${GREEN}INFO${RESET}]"
ERROR="[${RED}ERROR${RESET}]"
WARN="[${YELLOW}WARN${RESET}]"
function INFO() {
    echo -e "${INFO} ${1}"
}
function ERROR() {
    echo -e "${ERROR} ${1}"
}
function WARN() {
    echo -e "${WARN} ${1}"
}


# 定义Docker保存和解压的路径
save_path="$PWD"

# 服务部署配置存储路径
PROXY_DIR="/data/registry-proxy"
mkdir -p ${PROXY_DIR}
cd "${PROXY_DIR}"

# 部署的容器名称和镜像版本
CONTAINER_NAME_LIST=("reg-docker-hub" "reg-ghcr" "reg-k8s-gcr")
IMAGE_NAME="registry:latest"
DOCKER_COMPOSE_FILE="docker-compose.yml"


# 定义安装重试次数
attempts=0
maxAttempts=3


function CHECK_OS() {
INFO "======================= 检查环境 ======================="
# OS version
OSVER=$(cat /etc/os-release | grep -o '[0-9]' | head -n 1)

if [ -f /etc/os-release ]; then
    . /etc/os-release
else
    echo "无法确定发行版"
    exit 1
fi


# 根据发行版选择存储库类型
case "$ID" in
    "centos")
        repo_type="centos"
        ;;
    "debian")
        repo_type="debian"
        ;;
    "rhel")
        repo_type="rhel"
        ;;
    "ubuntu")
        repo_type="ubuntu"
        ;;
    "opencloudos")
        repo_type="centos"
        ;;
    "rocky")
        repo_type="centos"
        ;;
    *)
        WARN "此脚本目前不支持您的系统: $ID"
        exit 1
        ;;
esac


INFO "System release:: $NAME"
INFO "System version: $VERSION"
INFO "System ID: $ID"
INFO "System ID Like: $ID_LIKE"

}

function CHECK_PACKAGE_MANAGER() {
    if command -v dnf &> /dev/null; then
        package_manager="dnf"
    elif command -v yum &> /dev/null; then
        package_manager="yum"
    elif command -v apt-get &> /dev/null; then
        package_manager="apt-get"
    elif command -v apt &> /dev/null; then
        package_manager="apt"
    else
        ERROR "不受支持的软件包管理器."
        exit 1
    fi
}

function CHECK_PKG_MANAGER() {
    if command -v rpm &> /dev/null; then
        pkg_manager="rpm"
    elif command -v dpkg &> /dev/null; then
        pkg_manager="dpkg"
    elif command -v apt &> /dev/null; then
        pkg_manager="apt"
    else
        ERROR "无法确定包管理系统."
        exit 1
    fi
}


function CHECKMEM() {
# 获取内存使用率，并保留两位小数
memory_usage=$(free | awk '/^Mem:/ {printf "%.2f", $3/$2 * 100}')

# 将内存使用率转为整数（去掉小数部分）
memory_usage=${memory_usage%.*}

if [[ $memory_usage -gt 90 ]]; then  # 判断是否超过 90%
    read -e -p "$(WARN '内存占用率高于 70%($memory_usage%). 是否继续安装?: ')" continu
    if [ "$continu" == "n" ] || [ "$continu" == "N" ]; then
        exit 1
    fi
else
    INFO "内存资源充足。请继续.($memory_usage%)"
fi
}

function CHECKFIRE() {
systemctl stop firewalld &> /dev/null
systemctl disable firewalld &> /dev/null
systemctl stop iptables &> /dev/null
systemctl disable iptables &> /dev/null
ufw disable &> /dev/null
INFO "防火墙已被禁用."

if [[ "$repo_type" == "centos" || "$repo_type" == "rhel" ]]; then
    if sestatus | grep "SELinux status" | grep -q "enabled"; then
        WARN "SELinux 已启用。禁用 SELinux..."
        setenforce 0
        sed -i 's/SELINUX=enforcing/SELINUX=disabled/g' /etc/selinux/config
        INFO "SELinux 已被禁用."
    else
        INFO "SELinux 已被禁用."
    fi
fi
}

function INSTALL_PACKAGE(){
INFO "======================= 安装依赖 ======================="
# 每个软件包的安装超时时间（秒）
TIMEOUT=300
PACKAGES_APT=(
    lsof jq wget tar mailutils
)
PACKAGES_YUM=(
    epel-release lsof jq wget tar yum-utils
)

if [ "$package_manager" = "dnf" ] || [ "$package_manager" = "yum" ]; then
    for package in "${PACKAGES_YUM[@]}"; do
        if $pkg_manager -q "$package" &>/dev/null; then
            INFO "已经安装 $package ..."
        else
            INFO "正在安装 $package ..."

            # 记录开始时间
            start_time=$(date +%s)

            # 安装软件包并等待完成
            $package_manager -y install "$package" --skip-broken > /dev/null 2>&1 &
            install_pid=$!

            # 检查安装是否超时
            while [[ $(($(date +%s) - $start_time)) -lt $TIMEOUT ]] && kill -0 $install_pid &>/dev/null; do
                sleep 1
            done

            # 如果安装仍在运行，提示用户
            if kill -0 $install_pid &>/dev/null; then
                WARN "$package 的安装时间超过 $TIMEOUT 秒。是否继续？ (y/n)"
                read -r continue_install
                if [ "$continue_install" != "y" ]; then
                    ERROR "$package 的安装超时。退出脚本。"
                    exit 1
                else
                    # 直接跳过等待，继续下一个软件包的安装
                    continue
                fi
            fi

            # 检查安装结果
            wait $install_pid
            if [ $? -ne 0 ]; then
                ERROR "$package 安装失败。请检查系统安装源，然后再次运行此脚本！请尝试手动执行安装：$package_manager -y install $package"
                exit 1
            fi
        fi
    done
elif [ "$package_manager" = "apt-get" ] || [ "$package_manager" = "apt" ];then
    dpkg --configure -a &>/dev/null
    $package_manager update &>/dev/null
    for package in "${PACKAGES_APT[@]}"; do
        if $pkg_manager -s "$package" &>/dev/null; then
            INFO "$package 已安装，跳过..."
        else
            INFO "安装 $package ..."
            $package_manager install -y $package > /dev/null 2>&1
            if [ $? -ne 0 ]; then
                ERROR "安装 $package 失败,请检查系统安装源之后再次运行此脚本！请尝试手动执行安装：$package_manager -y install $package"
                exit 1
            fi
        fi
    done
else
    WARN "无法确定包管理系统."
    exit 1
fi
}

function INSTALL_NGINX() {
INFO "====================== 安装Nginx ======================"
# 定义一个函数来启动 Nginx
start_nginx() {
    systemctl enable nginx &>/dev/null
    systemctl restart nginx
}

check_nginx() {
# 检查 Nginx 是否正在运行
if pgrep "nginx" > /dev/null; then
    INFO "Nginx 已在运行."
else
    WARN "Nginx 未运行。尝试启动 Nginx..."
    start_attempts=3

    # 最多尝试启动 3 次
    for ((i=1; i<=$start_attempts; i++)); do
        start_nginx
        if pgrep "nginx" > /dev/null; then
            INFO "Nginx已成功启动."
            break
        else
            if [ $i -eq $start_attempts ]; then
                ERROR "Nginx 在尝试 $start_attempts 后无法启动。请检查配置"
                exit 1
            else
                WARN "在 $i 时间内启动 Nginx 失败。重试..."
            fi
        fi
    done
fi
}


if [ "$package_manager" = "dnf" ] || [ "$package_manager" = "yum" ]; then
    # 检查是否已安装Nginx
    if which nginx &>/dev/null; then
        INFO "Nginx 已经安装."
    else
        INFO "正在安装Nginx程序，请稍候..."
        NGINX="nginx-1.24.0-1.el${OSVER}.ngx.x86_64.rpm"

        # 下载并安装RPM包
        rm -f ${NGINX}
        wget http://nginx.org/packages/centos/${OSVER}/x86_64/RPMS/${NGINX} &>/dev/null
        while [ $attempts -lt $maxAttempts ]; do
            $package_manager -y install ${NGINX} &>/dev/null

            if [ $? -ne 0 ]; then
                ((attempts++))
                WARN "正在尝试安装Nginx >>> (Attempt: $attempts)"

                if [ $attempts -eq $maxAttempts ]; then
                    ERROR "Nginx installation failed. Please try installing manually."
                    rm -f ${NGINX}
                    echo "命令: wget http://nginx.org/packages/centos/${OSVER}/x86_64/RPMS/${NGINX} && $package_manager -y install ${NGINX}"
                    exit 1
                fi
            else
                INFO "已安装 Nginx."
                rm -f ${NGINX}
                break
            fi
        done
    fi

    # 启动nginx
    check_nginx

elif [ "$package_manager" = "apt-get" ] || [ "$package_manager" = "apt" ];then
    dpkg --configure -a &>/dev/null
    $package_manager update &>/dev/null
    if $pkg_manager -s "nginx" &>/dev/null; then
        INFO "nginx 已安装，跳过..."
    else
        INFO "安装 nginx 请稍等 ..."
        $package_manager install -y nginx > /dev/null 2>&1
        if [ $? -ne 0 ]; then
            ERROR "安装 nginx 失败,请检查系统安装源之后再次运行此脚本！请尝试手动执行安装：$package_manager -y install $package"
            exit 1
        fi
    fi

    # 启动nginx
    check_nginx
else
    WARN "无法确定包管理系统."
    exit 1
fi
}


function INSTALL_DOCKER() {
INFO "====================== 安装Docker ======================"
# 定义存储库文件名
repo_file="docker-ce.repo"
# 下载存储库文件
url="https://download.docker.com/linux/$repo_type"
# 定义最多重试次数
MAX_ATTEMPTS=3
# 初始化 attempt和 success变量为0和 false
attempt=0
success=false

if [ "$repo_type" = "centos" ] || [ "$repo_type" = "rhel" ]; then
    if ! command -v docker &> /dev/null;then
      while [[ $attempt -lt $MAX_ATTEMPTS ]]; do
        attempt=$((attempt + 1))
        WARN "docker 未安装，正在进行安装..."
        yum-config-manager --add-repo $url/$repo_file &>/dev/null
        $package_manager -y install docker-ce &>/dev/null
        # 检查命令的返回值
        if [ $? -eq 0 ]; then
            success=true
            break
        fi
        ERROR "docker安装失败，正在尝试重新下载 (尝试次数: $attempt)"
      done

      if $success; then
         INFO "docker 安装版本为：$(docker --version)"
         systemctl restart docker | grep -E "ERROR|ELIFECYCLE|WARN"
         systemctl enable docker &>/dev/null
      else
         ERROR "docker安装失败，请尝试手动安装"
         exit 1
      fi
    else
      INFO "docker 已安装，安装版本为：$(docker --version)"
      systemctl restart docker | grep -E "ERROR|ELIFECYCLE|WARN"
    fi
elif [ "$repo_type" == "ubuntu" ]; then
    if ! command -v docker &> /dev/null;then
      while [[ $attempt -lt $MAX_ATTEMPTS ]]; do
        attempt=$((attempt + 1))
        WARN "docker 未安装，正在进行安装..."
        curl -fsSL $url/gpg | sudo apt-key add - &>/dev/null
        add-apt-repository "deb [arch=amd64] $url $(lsb_release -cs) stable" <<< $'\n' &>/dev/null
        $package_manager -y install docker-ce docker-ce-cli containerd.io &>/dev/null
        # 检查命令的返回值
        if [ $? -eq 0 ]; then
            success=true
            break
        fi
        ERROR "docker 安装失败，正在尝试重新下载 (尝试次数: $attempt)"
      done

      if $success; then
         INFO "docker 安装版本为：$(docker --version)"
         systemctl restart docker | grep -E "ERROR|ELIFECYCLE|WARN"
         systemctl enable docker &>/dev/null
      else
         ERROR "docker 安装失败，请尝试手动安装"
         exit 1
      fi
    else
      INFO "docker 已安装，安装版本为：$(docker --version)"
      systemctl restart docker | grep -E "ERROR|ELIFECYCLE|WARN"
    fi
elif [ "$repo_type" == "debian" ]; then
    if ! command -v docker &> /dev/null;then
      while [[ $attempt -lt $MAX_ATTEMPTS ]]; do
        attempt=$((attempt + 1))

        WARN "docker 未安装，正在进行安装..."
        curl -fsSL $url/gpg | sudo apt-key add - &>/dev/null
        add-apt-repository "deb [arch=amd64] $url $(lsb_release -cs) stable" <<< $'\n' &>/dev/null
        $package_manager -y install docker-ce docker-ce-cli containerd.io &>/dev/null
        # 检查命令的返回值
        if [ $? -eq 0 ]; then
            success=true
            break
        fi
        ERROR "docker 安装失败，正在尝试重新下载 (尝试次数: $attempt)"
      done

      if $success; then
         INFO "docker 安装版本为：$(docker --version)"
         systemctl restart docker | grep -E "ERROR|ELIFECYCLE|WARN"
         systemctl enable docker &>/dev/null
      else
         ERROR "docker 安装失败，请尝试手动安装"
         exit 1
      fi
    else
      INFO "docker 已安装，安装版本为：$(docker --version)"
      systemctl restart docker | grep -E "ERROR|ELIFECYCLE|WARN"
    fi
else
    ERROR "不支持的操作系统."
    exit 1
fi
}


function INSTALL_DOCKER_PROXY() {
INFO "======================= 开始安装 ======================="
cat > ${PROXY_DIR}/docker-compose.yaml <<\EOF
services:
  ## docker hub
  docker-hub:
    container_name: reg-docker-hub
    image: registry:2.8.2
    restart: always
    environment:
      REGISTRY_HTTP_HEADERS_Access-Control-Allow-Methods: '[HEAD,GET,OPTIONS,DELETE]'
      REGISTRY_HTTP_HEADERS_Access-Control-Allow-Credentials: '[true]'
      REGISTRY_HTTP_HEADERS_Access-Control-Allow-Headers: '[Authorization,Accept,Cache-Control]'
      REGISTRY_HTTP_HEADERS_Access-Control-Expose-Headers: '[Docker-Content-Digest]'
      REGISTRY_STORAGE_DELETE_ENABLED: 'true'
    volumes:
      - ./registry/data:/var/lib/registry
      - ./docker-hub.yml:/etc/docker/registry/config.yml
    ports:
      - 51000:5000
    networks:
      - registry-net


  ## ghcr.io
  ghcr:
    container_name: reg-ghcr
    image: registry:2.8.2
    restart: always
    environment:
      REGISTRY_HTTP_HEADERS_Access-Control-Allow-Methods: '[HEAD,GET,OPTIONS,DELETE]'
      REGISTRY_HTTP_HEADERS_Access-Control-Allow-Credentials: '[true]'
      REGISTRY_HTTP_HEADERS_Access-Control-Allow-Headers: '[Authorization,Accept,Cache-Control]'
      REGISTRY_HTTP_HEADERS_Access-Control-Expose-Headers: '[Docker-Content-Digest]'
      REGISTRY_STORAGE_DELETE_ENABLED: 'true'
    volumes:
      - ./registry/data:/var/lib/registry
      - ./ghcr.yml:/etc/docker/registry/config.yml
    ports:
      - 52000:5000
    networks:
      - registry-net


## k8s.gcr.io
  k8s-gcr:
    container_name: reg-k8s-gcr
    image: registry:2.8.2
    restart: always
    environment:
      REGISTRY_HTTP_HEADERS_Access-Control-Allow-Methods: '[HEAD,GET,OPTIONS,DELETE]'
      REGISTRY_HTTP_HEADERS_Access-Control-Allow-Credentials: '[true]'
      REGISTRY_HTTP_HEADERS_Access-Control-Allow-Headers: '[Authorization,Accept,Cache-Control]'
      REGISTRY_HTTP_HEADERS_Access-Control-Expose-Headers: '[Docker-Content-Digest]'
      REGISTRY_STORAGE_DELETE_ENABLED: 'true'
    volumes:
      - ./registry/data:/var/lib/registry
      - ./k8s-ghcr.yml:/etc/docker/registry/config.yml
    ports:
      - 53000:5000
    networks:
      - registry-net

## UI
  registry-ui:
    container_name: registry-ui
    image: joxit/docker-registry-ui:main
    restart: always
    ports:
      - 50000:80
    environment:
      - SINGLE_REGISTRY=true
      - REGISTRY_TITLE=Docker Registry UI
      - DELETE_IMAGES=true
      - SHOW_CONTENT_DIGEST=true
      - NGINX_PROXY_PASS_URL=http://reg-docker-hub:5000
      - SHOW_CATALOG_NB_TAGS=true
      - CATALOG_MIN_BRANCHES=1
      - CATALOG_MAX_BRANCHES=1
      - TAGLIST_PAGE_SIZE=100
      - REGISTRY_SECURED=false
      - CATALOG_ELEMENTS_LIMIT=1000
    networks:
      - registry-net

networks:
  registry-net:
EOF

# config配置文件
cat > ${PROXY_DIR}/docker-hub.yml <<\EOF
version: 0.1
log:
  fields:
    service: registry
storage:
  cache:
    blobdescriptor: inmemory
  filesystem:
    rootdirectory: /var/lib/registry
http:
  addr: :5000
  headers:
    Access-Control-Expose-Headers: ['Docker-Content-Digest']
    Access-Control-Allow-Methods: ['HEAD', 'GET', 'OPTIONS', 'DELETE']
    Access-Control-Allow-Origin: ['*']
    X-Content-Type-Options: [nosniff]
health:
  storagedriver:
    enabled: true
    interval: 10s
    threshold: 3

proxy:
  remoteurl: https://registry-1.docker.io
  username: 
  password:
EOF


cat > ${PROXY_DIR}/ghcr.yml <<\EOF
version: 0.1
log:
  fields:
    service: registry
storage:
  cache:
    blobdescriptor: inmemory
  filesystem:
    rootdirectory: /var/lib/registry
http:
  addr: :5000
  headers:
    Access-Control-Expose-Headers: ['Docker-Content-Digest']
    Access-Control-Allow-Methods: ['HEAD', 'GET', 'OPTIONS', 'DELETE']
    Access-Control-Allow-Origin: ['*']
    X-Content-Type-Options: [nosniff]
health:
  storagedriver:
    enabled: true
    interval: 10s
    threshold: 3

proxy:
  remoteurl: https://gcr.io
  username: 
  password:
EOF


cat > ${PROXY_DIR}/k8s-ghcr.yml <<\EOF
version: 0.1
log:
  fields:
    service: registry
storage:
  cache:
    blobdescriptor: inmemory
  filesystem:
    rootdirectory: /var/lib/registry
http:
  addr: :5000
  headers:
    Access-Control-Expose-Headers: ['Docker-Content-Digest']
    Access-Control-Allow-Methods: ['HEAD', 'GET', 'OPTIONS', 'DELETE']
    Access-Control-Allow-Origin: ['*']
    X-Content-Type-Options: [nosniff]
health:
  storagedriver:
    enabled: true
    interval: 10s
    threshold: 3

proxy:
  remoteurl: https://k8s.gcr.io
  username: 
  password:
EOF

# 安装服务
docker compose pull
docker compose up -d --force-recreate
}

function STOP_REMOVE_CONTAINER() {
    for container_name in "${CONTAINER_NAME_LIST[@]}"; do
        #检查容器是否存在并停止并移除
        if docker ps -a --format '{{.Names}}' | grep -Eq "^${container_name}$"; then
            INFO "停止和移除容器: ${container_name}"
            docker compose down --remove-orphans
        else
            WARN "容器: ${container_name} 未找到或已停止。."
        fi
    done
}

function REMOVE_NONE_TAG() {
    #删除标记为<none>的${IMAGE_NAME}镜像
    docker images | grep "^${IMAGE_NAME}.*<none>" | awk '{print $3}' | xargs -r docker rmi
    images=$(docker images ${IMAGE_NAME} --format '{{.Repository}}:{{.Tag}}')
    #获取最新的镜像版本
    latest=$(echo "$images" | sort -V | tail -n1)
    #遍历所有的镜像
    for image in $images
    do
      #如果镜像不是最新的版本，就删除它
      if [ "$image" != "$latest" ];then
        docker rmi $image
      fi
    done
}



function PROMPT(){
# 获取公网IP
PUBLIC_IP=$(curl -s https://ifconfig.me)

# 获取所有网络接口的IP地址
ALL_IPS=$(hostname -I)

# 排除不需要的地址（127.0.0.1和docker0）
INTERNAL_IP=$(echo "$ALL_IPS" | awk '$1!="127.0.0.1" && $1!="::1" && $1!="docker0" {print $1}')

INFO "=================感谢您的耐心等待，安装已经完成=================="
INFO
INFO "请用浏览器访问UI面板: "
INFO "公网访问地址: http://$PUBLIC_IP"
INFO "内网访问地址: http://$INTERNAL_IP"
INFO
INFO "作者博客: https://dqzboy.com"
INFO "技术交流: https://t.me/dqzboyblog"
INFO "代码仓库: https://github.com/dqzboy"
INFO  
INFO "如果使用的是云服务器，且配置了域名与证书，请至安全组开放80、443端口；否则开放对应服务的监听端口"
INFO
INFO "================================================================"
}


function main() {

INFO "====================== 请选择操作 ======================"
echo "1) 新装"
echo "2) 重启"
echo "3) 更新"
echo "4) 卸载"
read -e -p "$(INFO '输入对应数字并按 Enter 键: ')" user_choice
case $user_choice in
    1)
        CHECK_OS
        CHECK_PACKAGE_MANAGER
        CHECK_PKG_MANAGER
        CHECKMEM
        CHECKFIRE
        
        while true; do
            read -e -p "$(INFO '是否执行软件包安装? [y/n]: ')" choice_package
            case "$choice_package" in
                y|Y )
                    INSTALL_PACKAGE
                    break;;
                n|N )
                    WARN "跳过软件包安装步骤。"
                    break;;
                * )
                    INFO "请输入 'y' 表示是，或者 'n' 表示否。";;
            esac
        done

        INSTALL_NGINX
        INSTALL_DOCKER
        INSTALL_DOCKER_PROXY
        PROMPT
        ;;
    2)
        INFO "======================= 重启服务 ======================="
        docker compose restart
        PROMPT
        ;;
    3)
        INFO "======================= 更新服务 ======================="
        docker compose pull
        docker compose up -d --force-recreate
        PROMPT
        ;;
    4)
        eINFO "======================= 卸载服务 ======================="
        STOP_REMOVE_CONTAINER
        REMOVE_NONE_TAG
        docker rmi $(docker images -q ${IMAGE_NAME}) &>/dev/null
        ;;
    *)
        WARN "输入了无效的选择。请重新运行脚本并选择1-4的选项。"
        ;;
esac
}