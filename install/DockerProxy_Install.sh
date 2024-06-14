#!/usr/bin/env bash
#===============================================================================
#
#          FILE: DockerProxy_Install.sh
# 
#         USAGE: ./DockerProxy_Install.sh
#
#   DESCRIPTION: 建Docker镜像加速服务，基于官方 registry 一键部署Docker、K8s、ghcr镜像加速\管理服务.
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

# 服务部署和配置持久华存储路径
PROXY_DIR="/data/registry-proxy"
mkdir -p ${PROXY_DIR}
cd "${PROXY_DIR}"

# 项目RAW地址
GITRAW="https://raw.githubusercontent.com/dqzboy/Docker-Proxy/main"

# 部署的容器名称和镜像版本
CONTAINER_NAME_LIST=("reg-docker-hub" "reg-ghcr" "reg-k8s-gcr")
IMAGE_NAME="registry"
UI_IMAGE_NAME="dqzboy/docker-registry-ui"
DOCKER_COMPOSE_FILE="docker-compose.yaml"


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


function INSTALL_CADDY() {
INFO "====================== 安装Caddy ======================"
# 定义一个函数来启动 Caddy
start_caddy() {
    systemctl enable caddy.service &>/dev/null
    systemctl restart caddy.service
}

check_caddy() {
# 检查 caddy 是否正在运行
if pgrep "caddy" > /dev/null; then
    INFO "Caddy 已在运行."
else
    WARN "Caddy 未运行。尝试启动 Caddy..."
    start_attempts=3

    # 最多尝试启动 3 次
    for ((i=1; i<=$start_attempts; i++)); do
        start_caddy
        if pgrep "caddy" > /dev/null; then
            INFO "Caddy已成功启动."
            break
        else
            if [ $i -eq $start_attempts ]; then
                ERROR "Caddy 在尝试 $start_attempts 后无法启动。请检查配置"
                exit 1
            else
                WARN "在 $i 时间内启动 Caddy 失败。重试..."
            fi
        fi
    done
fi
}

if [ "$package_manager" = "dnf" ]; then
    # 检查是否已安装Caddy
    if which caddy &>/dev/null; then
        INFO "Caddy 已经安装."
    else
        INFO "正在安装Caddy程序，请稍候..."

        $package_manager -y install 'dnf-command(copr)' &>/dev/null
        $package_manager -y copr enable @caddy/caddy &>/dev/null
        while [ $attempts -lt $maxAttempts ]; do
            $package_manager -y install caddy &>/dev/null

            if [ $? -ne 0 ]; then
                ((attempts++))
                WARN "正在尝试安装Caddy >>> (Attempt: $attempts)"

                if [ $attempts -eq $maxAttempts ]; then
                    ERROR "Caddy installation failed. Please try installing manually."
                    echo "命令: $package_manager -y install 'dnf-command(copr)' && $package_manager -y copr enable @caddy/caddy && $package_manager -y install caddy"
                    exit 1
                fi
            else
                INFO "已安装 Caddy."
                break
            fi
        done
    fi

    # 启动caddy
    check_caddy

elif [ "$package_manager" = "yum" ]; then
    # 检查是否已安装Caddy
    if which caddy &>/dev/null; then
        INFO "Caddy 已经安装."
    else
        INFO "正在安装Caddy程序，请稍候..."

        $package_manager -y install yum-plugin-copr &>/dev/null
        $package_manager -y copr enable @caddy/caddy &>/dev/null
        while [ $attempts -lt $maxAttempts ]; do
            $package_manager -y install caddy &>/dev/null
            if [ $? -ne 0 ]; then
                ((attempts++))
                WARN "正在尝试安装Caddy >>> (Attempt: $attempts)"

                if [ $attempts -eq $maxAttempts ]; then
                    ERROR "Caddy installation failed. Please try installing manually."
                    echo "命令: $package_manager -y install 'dnf-command(copr)' && $package_manager -y copr enable @caddy/caddy && $package_manager -y install caddy"
                    exit 1
                fi
            else
                INFO "已安装 Caddy."
                break
            fi
        done
    fi

    # 启动caddy
    check_caddy

elif [ "$package_manager" = "apt" ] || [ "$package_manager" = "apt-get" ];then
    dpkg --configure -a &>/dev/null
    $package_manager update &>/dev/null
    if $pkg_manager -s "caddy" &>/dev/null; then
        INFO "Caddy 已安装，跳过..."
    else
        INFO "安装 Caddy 请稍等 ..."
        $package_manager install -y debian-keyring debian-archive-keyring apt-transport-https &>/dev/null
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg &>/dev/null
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list &>/dev/null
        $package_manager update &>/dev/null
        $package_manager install -y caddy &>/dev/null
        if [ $? -ne 0 ]; then
            ERROR "安装 Caddy 失败,请检查系统安装源之后再次运行此脚本！请尝试手动执行安装：$package_manager -y install caddy"
            exit 1
        fi
    fi

    # 启动Caddy
    check_caddy
else
    WARN "无法确定包管理系统."
    exit 1
fi


INFO "====================== 配置Caddy ======================"
while true; do
    read -e -p "$(WARN '是否配置Caddy,实现自动HTTPS? 执行前必须提前在DNS服务商解析A记录ui、hub、gcr、ghcr、k8s-gcr、quay[y/n]: ')" caddy_conf
    case "$caddy_conf" in
        y|Y )
            read -e -p "$(INFO '请输入你的域名[例: baidu.com],不可为空: ')" caddy_domain
            wget -NP /etc/caddy/ ${GITRAW}/caddy/Caddyfile &>/dev/null
            sed -i "s#your_domain_name#$caddy_domain#g" /etc/caddy/Caddyfile
            # 重启服务
            start_attempts=3
            # 最多尝试启动 3 次
            for ((i=1; i<=$start_attempts; i++)); do
                start_caddy
                if pgrep "caddy" > /dev/null; then
                    INFO "重新载入配置成功.Caddy启动完成,现在你可以将不需要的A记录从DNS解析中删除了"
                    break
                else
                    if [ $i -eq $start_attempts ]; then
                        ERROR "Caddy 在尝试 $start_attempts 后无法启动。请检查配置"
                        exit 1
                    else
                        WARN "在 $i 时间内启动 Caddy 失败。重试..."
                    fi
                fi
            done

            break;;
        n|N )
            WARN "退出配置 Caddy 操作。"
            break;;
        * )
            INFO "请输入 'y' 表示是，或者 'n' 表示否。";;
    esac
done

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
                ERROR "Nginx 在尝试 $start_attempts 次后无法启动。请检查配置"
                exit 1
            else
                WARN "第 $i 次启动 Nginx 失败。重试..."
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
            ERROR "安装 nginx 失败,请检查系统安装源之后再次运行此脚本！请尝试手动执行安装：$package_manager -y install nginx"
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


function DOWN_CONFIG() {
    files=(
        "dockerhub ${GITRAW}/config/docker-hub.yml"
        "gcr ${GITRAW}/config/gcr.yml"
        "ghcr ${GITRAW}/config/ghcr.yml"
        "quay ${GITRAW}/config/quay.yml"
        "k8sgcr ${GITRAW}/config/k8s-ghcr.yml"
    )

    selected_names=()

    echo "-------------------------------------------------"
    echo "1) docker hub"
    echo "2) gcr"
    echo "3) ghcr"
    echo "4) quay"
    echo "5) k8s-gcr"
    echo "6) all"
    echo "7) exit"
    echo "-------------------------------------------------"

    read -e -p "$(INFO '输入序号下载对应配置文件,空格分隔多个选项. all下载所有: ')" choices_reg

    if [[ "$choices_reg" == "6" ]]; then
        for file in "${files[@]}"; do
            file_name=$(echo "$file" | cut -d' ' -f1)
            file_url=$(echo "$file" | cut -d' ' -f2-)
            selected_names+=("$file_name")
            wget -NP ${PROXY_DIR}/ $file_url &>/dev/null
        done
        selected_all=true
    elif [[ "$choices_reg" == "7" ]]; then
        WARN "退出下载配置! 首次安装如果没有配置无法启动服务,只能启动UI服务"
        return
    else
        for choice in ${choices_reg}; do
            if [[ $choice =~ ^[0-9]+$ ]] && ((choice > 0 && choice <= ${#files[@]})); then
                file_name=$(echo "${files[$((choice - 1))]}" | cut -d' ' -f1)
                file_url=$(echo "${files[$((choice - 1))]}" | cut -d' ' -f2-)
                selected_names+=("$file_name")
                wget -NP ${PROXY_DIR}/ $file_url &>/dev/null
            else
                ERROR "无效的选择: $choice"
                exit 1
            fi
        done
        selected_all=false
    fi
}

function START_CONTAINER() {
    if [ "$selected_all" = true ]; then
        docker compose up -d --force-recreate
    else
        docker compose up -d "${selected_names[@]}" registry-ui
    fi
}

function RESTART_CONTAINER() {
    if [ "$selected_all" = true ]; then
        docker compose restart
    else
        docker compose restart "${selected_names[@]}"
    fi
}

function INSTALL_DOCKER_PROXY() {
INFO "======================= 开始安装 ======================="
wget -P ${PROXY_DIR}/ ${GITRAW}/docker-compose.yaml &>/dev/null

# config
DOWN_CONFIG

# 安装服务
START_CONTAINER
}


function STOP_REMOVE_CONTAINER() {
    if [[ -f "${PROXY_DIR}/${DOCKER_COMPOSE_FILE}" ]]; then
        INFO "停止和移除所有容器"
        docker compose -f "${PROXY_DIR}/${DOCKER_COMPOSE_FILE}" down --remove-orphans
    else 
        WARN "容器未运行，无需删除"
        exit 1
    fi
}




# 更新配置
function UPDATE_CONFIG() {
while true; do
    read -e -p "$(WARN '是否更新配置，更新前请确保您已备份现有配置，此操作不可逆? [y/n]: ')" update_conf
    case "$update_conf" in
        y|Y )
            DOWN_CONFIG
            RESTART_CONTAINER
            break;;
        n|N )
            WARN "退出配置更新操作。"
            break;;
        * )
            INFO "请输入 'y' 表示是，或者 'n' 表示否。";;
    esac
done

}

function REMOVE_NONE_TAG() {
    docker images | grep "^${IMAGE_NAME}.*<none>" | awk '{print $3}' | xargs -r docker rmi
    images=$(docker images ${IMAGE_NAME} --format '{{.Repository}}:{{.Tag}}')
    latest=$(echo "$images" | sort -V | tail -n1)
    for image in $images
    do
      if [ "$image" != "$latest" ];then
        docker rmi $image
      fi
    done
}


function PACKAGE() {
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
}


function INSTALL_WEB() {
while true; do
    read -e -p "$(INFO "是否安装WEB服务？[y/n]: ")" choice_service
    if [[ "$choice_service" =~ ^[YyNn]$ ]]; then
        if [[ "$choice_service" == "Y" || "$choice_service" == "y" ]]; then
            while true; do
                read -e -p "$(INFO "选择安装的WEB服务。安装Caddy可自动开启HTTPS [Nginx/Caddy]: ")" web_service
                if [[ "$web_service" =~ ^(nginx|Nginx|caddy|Caddy)$ ]]; then
                    if [[ "$web_service" == "nginx" || "$web_service" == "Nginx" ]]; then
                        INSTALL_NGINX
                        break
                    elif [[ "$web_service" == "caddy" || "$web_service" == "Caddy" ]]; then
                        INSTALL_CADDY
                        break
                    fi
                else
                    WARN "请输入'nginx' 或者 'caddy'"
                fi
            done
            break
        else
            WARN "跳过WEB服务的安装。"
            break
        fi
    else
        INFO "请输入 'y' 表示是，或者 'n' 表示否。"
    fi
done
}



function UPDATE_SERVICE() {
    services=(
        "dockerhub"
        "gcr"
        "ghcr"
        "quay"
        "k8sgcr"
    )

    selected_services=()

    WARN "更新服务请在docker compose文件存储目录下执行脚本.默认存储路径: ${PROXY_DIR}"
    echo "-------------------------------------------------"
    echo "1) docker hub"
    echo "2) gcr"
    echo "3) ghcr"
    echo "4) quay"
    echo "5) k8s-gcr"
    echo "6) all"
    echo "7) exit"
    echo "-------------------------------------------------"

    read -e -p "$(INFO '输入序号选择对应服务,空格分隔多个选项. all选择所有: ')" choices_service

    if [[ "$choices_service" == "6" ]]; then
        for choice in ${choices_service}; do
            if [[ $choice =~ ^[0-9]+$ ]] && ((choice >0 && choice <= ${#services[@]})); then
                service_name="${services[$((choice -1))]}"
                #检查服务是否正在运行
                if docker compose ps --services | grep -q "^${service_name}$"; then
                    selected_services+=("$service_name")
                    echo "更新的服务: ${selected_services[*]}"
                else
                    WARN "服务 ${service_name}未运行，跳过更新。"
                fi
            else
                ERROR "无效的选择: $choice"
                exit 2
            fi
        done
    elif [[ "$choices_service" == "7" ]]; then
        WARN "退出更新服务!"
        exit 1
    else
        for choice in ${choices_service}; do
            if [[ $choice =~ ^[0-9]+$ ]] && ((choice >0 && choice <= ${#services[@]})); then
                service_name="${services[$((choice -1))]}"
                #检查服务是否正在运行
                if docker compose ps --services | grep -q "^${service_name}$"; then
                    selected_services+=("$service_name")
                else
                    WARN "服务 ${service_name} 未运行，跳过更新。"
                fi
            else
                ERROR "无效的选择: $choice"
                exit 2
            fi
        done
    fi
}


function PROMPT(){
# 获取公网IP
PUBLIC_IP=$(curl -s https://ifconfig.me)

# 获取所有网络接口的IP地址
ALL_IPS=$(hostname -I)

# 排除不需要的地址（127.0.0.1和docker0）
INTERNAL_IP=$(echo "$ALL_IPS" | awk '$1!="127.0.0.1" && $1!="::1" && $1!="docker0" {print $1}')

echo
INFO "=================感谢您的耐心等待，安装已经完成=================="
INFO
INFO "请用浏览器访问 UI 面板: "
INFO "公网访问地址: http://$PUBLIC_IP:50000"
INFO "内网访问地址: http://$INTERNAL_IP:50000"
INFO
INFO "作者博客: https://dqzboy.com"
INFO "技术交流: https://t.me/dqzboyblog"
INFO "代码仓库: https://github.com/dqzboy/Docker-Proxy"
INFO  
INFO "如果使用的是云服务器，且配置了域名与证书，请至安全组开放80、443端口；否则开放对应服务的监听端口"
INFO
INFO "================================================================"
}


function main() {

INFO "====================== 请选择操作 ======================"
echo "1) 新装服务"
echo "2) 重启服务"
echo "3) 更新服务"
echo "4) 更新配置"
echo "5) 卸载服务"
read -e -p "$(INFO '输入对应数字并按 Enter 键: ')" user_choice
case $user_choice in
    1)
        CHECK_OS
        CHECK_PACKAGE_MANAGER
        CHECK_PKG_MANAGER
        CHECKMEM
        CHECKFIRE
        PACKAGE
        INSTALL_WEB
        INSTALL_DOCKER
        INSTALL_DOCKER_PROXY
        PROMPT
        ;;
    2)
        INFO "======================= 重启服务 ======================="
        docker compose restart
        INFO "======================= 重启完成 ======================="
        ;;
    3)
        INFO "======================= 更新服务 ======================="
        UPDATE_SERVICE
        docker compose pull ${selected_services[*]}
        docker compose up -d --force-recreate ${selected_services[*]}
        INFO "======================= 更新完成 ======================="
        ;;
    4)
        INFO "======================= 更新配置 ======================="
        UPDATE_CONFIG
        INFO "======================= 更新完成 ======================="
        ;;
    5)
        INFO "======================= 卸载服务 ======================="
        WARN "注意: 卸载服务会一同将项目本地的镜像缓存删除，请执行卸载之前确定是否需要备份本地的镜像缓存文件"
        while true; do
            read -e -p "$(INFO '本人已知晓后果,确认卸载服务? [y/n]: ')" uninstall
            case "$uninstall" in
                y|Y )
                    STOP_REMOVE_CONTAINER
                    REMOVE_NONE_TAG
                    docker rmi --force $(docker images -q ${IMAGE_NAME}) &>/dev/null
                    docker rmi --force $(docker images -q ${UI_IMAGE_NAME}) &>/dev/null
                    rm -rf ${PROXY_DIR} &>/dev/null
                    INFO "服务已经卸载,感谢你的使用!"
                    INFO "========================================================"
                    break;;
                n|N )
                    WARN "退出卸载服务."
                    break;;
                * )
                    INFO "请输入 'y' 表示是，或者 'n' 表示否。";;
            esac
        done
        ;;
    *)
        WARN "输入了无效的选择。请重新运行脚本并选择1-4的选项。"
        ;;
esac
}
main