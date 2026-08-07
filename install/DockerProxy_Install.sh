#!/usr/bin/env bash
#===============================================================================
#
#          FILE: DockerProxy_Install.sh
# 
#         USAGE: ./DockerProxy_Install.sh
#
#   DESCRIPTION: 自建Docker镜像加速服务，零磁盘缓存，流量监控告警、代理管理、服务资源管理等功能。一键部署Docker、K8s、Quay、Ghcr、Nvcr镜像加速\管理服务.支持免服务器部署到Render.
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

                                    博客: dqzboy.com 浅时光博客
                        项目地址: https://github.com/dqzboy/Docker-Proxy
                                                                 
EOF

echo "----------------------------------------------------------------------------------------------------------"
echo -e "\033[32mVPS 推荐\033[0m(\033[34mRackNerd 高性价比便宜VPS\033[0m)：\033[34;4m https://dqzboy.github.io/proxyui/racknerd \033[0m"
echo "----------------------------------------------------------------------------------------------------------"
echo
echo

GREEN="\033[0;32m"
RED="\033[31m"
YELLOW="\033[33m"
RESET="\033[0m"
BLUE="\033[0;34m"
MAGENTA="\033[0;35m"
CYAN="\033[0;36m"
WHITE="\033[1;37m"
BLACK="\033[0;30m"
PINK="\033[0;95m"
LIGHT_GREEN="\033[1;32m"
LIGHT_RED="\033[1;31m"
LIGHT_YELLOW="\033[1;33m"
LIGHT_BLUE="\033[1;34m"
LIGHT_MAGENTA="\033[1;35m"
LIGHT_CYAN="\033[1;36m"
LIGHT_PINK="\033[1;95m"
BRIGHT_CYAN="\033[96m"
BOLD="\033[1m"
UNDERLINE="\033[4m"
BLINK="\033[5m"
REVERSE="\033[7m"

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

function PROMPT_Y_N() {
    echo -e "[${LIGHT_GREEN}y${RESET}/${LIGHT_BLUE}n${RESET}]: "
}

PROMPT_YES_NO=$(PROMPT_Y_N)

function SEPARATOR() {
    echo -e "${INFO}${BOLD}${LIGHT_BLUE}======================== ${1} ========================${RESET}"
}


SPINNER_CHARS=('⣾' '⣽' '⣻' '⢿' '⡿' '⣟' '⣯' '⣷')
SPINNER_DELAY=0.1

function cleanup() {
    trap - SIGINT SIGTERM
    stop_spinner
    echo
    exit 1
}

function start_spinner() {
    local msg="$1"
    local temp_dir="/tmp/spinner"
    local pid_file="${temp_dir}/pid"
    local msg_file="${temp_dir}/message"
    mkdir -p "$temp_dir"
    echo "$msg" > "$msg_file"
    trap cleanup SIGINT SIGTERM
    (
        trap 'exit 0' TERM
        local i=0
        while true; do
            if [ -f "$msg_file" ]; then
                msg=$(cat "$msg_file")
                printf "\r${LIGHT_BLUE}%s${RESET} ${LIGHT_YELLOW}%s${RESET} " "${SPINNER_CHARS[i]}" "$msg"
                i=$(( (i + 1) % ${#SPINNER_CHARS[@]} ))
                sleep $SPINNER_DELAY
            else
                exit 0
            fi
        done
    ) & disown
    echo $! > "$pid_file"
}

function stop_spinner() {
    local temp_dir="/tmp/spinner"
    local pid_file="${temp_dir}/pid"
    local msg_file="${temp_dir}/message"
    
    if [ -f "$pid_file" ]; then
        local spinner_pid=$(cat "$pid_file")
        rm -f "$msg_file"
        rm -f "$pid_file"
        kill -TERM "$spinner_pid" 2>/dev/null
        wait "$spinner_pid" 2>/dev/null
        printf "\r%-60s\r" " "
        echo -ne "\033[0m"
    fi

    rm -rf "$temp_dir" 2>/dev/null
    trap - SIGINT SIGTERM
}

# 检查是否以root权限运行
if [[ $EUID -ne 0 ]]; then
   ERROR "此脚本必须以root权限运行!" 
   exit 1
fi


# 固定工作目录（部署文件、配置、compose 均落在此处）
PROXY_DIR="/data/docker-proxy"
mkdir -p ${PROXY_DIR}
cd "${PROXY_DIR}"


GITRAW="https://raw.githubusercontent.com/dqzboy/Docker-Proxy/main"
CNGITRAW="https://gitee.com/boydqz/Docker-Proxy/raw/main"
# docker registry（go-proxy 镜像）
IMAGE_NAME="dqzboy/registry"
# hubcmd-ui 管理面板镜像
UI_IMAGE_NAME="dqzboy/hubcmd-ui"
DOCKER_COMPOSE_FILE="docker-compose.yaml"

# Registry Domain prefix
REGISTRY_SLD="ui、hub、gcr、ghcr、k8sgcr、k8s、quay、mcr、elastic、nvcr"
RECORDS=("ui" "hub" "gcr" "ghcr" "k8sgcr" "k8s" "quay" "mcr" "elastic" "nvcr")

attempts=0
maxAttempts=3

# go-proxy 专用管理服务菜单（仅 2 个 compose 服务：go-proxy / hubcmd-ui）
function PROXY_SVC_MENU() {
    echo -e "${YELLOW}-------------------------------------------------${RESET}"
    echo -e "${GREEN}1)${RESET} ${BOLD}Docker 镜像加速 (代理服务)${RESET}"
    echo -e "${GREEN}2)${RESET} ${BOLD}hubcmd-ui (管理面板)${RESET}"
    echo -e "${GREEN}10)${RESET} ${BOLD}all (全部)${RESET}"
    echo -e "${GREEN}0)${RESET} ${BOLD}exit${RESET}"
    echo -e "${YELLOW}-------------------------------------------------${RESET}"
}
function PROXY_SER_MENU() {
    echo -e "${YELLOW}-------------------------------------------------${RESET}"
    echo -e "${GREEN}1)${RESET} ${BOLD}Docker 镜像加速 (代理服务)${RESET}"
    echo -e "${GREEN}2)${RESET} ${BOLD}hubcmd-ui (管理面板)${RESET}"
    echo -e "${GREEN}0)${RESET} ${BOLD}exit${RESET}"
    echo -e "${YELLOW}-------------------------------------------------${RESET}"
}

# 定义 compose 服务名称（注意：必须是 compose 的 service 名，而非 container_name）
# go-proxy 模型：仅 2 个服务 -> go-proxy (代理服务) / hubcmd-ui (管理面板)
CONTAINER_SERVICES() {
    services=(
        "go-proxy"
        "hubcmd-ui"
    )
}


function CHECK_OS() {
SEPARATOR "检查环境"
OSVER=$(cat /etc/os-release | grep -o '[0-9]' | head -n 1)

if [ -f /etc/os-release ]; then
    . /etc/os-release
else
    echo "无法确定发行版"
    exit 1
fi

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
    elif command -v apt &> /dev/null; then
        package_manager="apt"
    elif command -v apt-get &> /dev/null; then
        package_manager="apt-get"
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

function CHECK_COMPOSE_CMD() {
if command -v docker &> /dev/null && docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    WARN "未检查到Docker Compose客户端工具,请通过脚本安装部署!"
fi
}

function CHECKMEM() {
memory_usage=$(free | awk '/^Mem:/ {printf "%.2f", $3/$2 * 100}')
memory_usage=${memory_usage%.*}

if [[ $memory_usage -gt 90 ]]; then
    read -e -p "$(WARN "内存占用率${LIGHT_RED}高于 70%($memory_usage%)${RESET} 是否继续安装? ${PROMPT_YES_NO}")" continu
    if [ "$continu" == "n" ] || [ "$continu" == "N" ]; then
        exit 1
    fi
else
    INFO "内存资源充足.请继续 ${LIGHT_GREEN}($memory_usage%)${RESET}"
fi
}

function CHECKFIRE() {
systemctl stop firewalld &> /dev/null
systemctl disable firewalld &> /dev/null
systemctl stop iptables &> /dev/null
systemctl disable iptables &> /dev/null
ufw disable &> /dev/null
systemctl disable ufw &> /dev/null
WARN "服务器防火墙已被禁用."

if [[ "$repo_type" == "centos" || "$repo_type" == "rhel" ]]; then
    if sestatus | grep "SELinux status" | grep -q "enabled"; then
        INFO "SELinux 已启用。禁用 SELinux..."
        setenforce 0
        sed -i 's/SELINUX=enforcing/SELINUX=disabled/g' /etc/selinux/config
        WARN "SELinux 已被禁用."
    else
        WARN "SELinux 已被禁用."
    fi
fi
}


function CHECKBBR() {
kernel_version=$(uname -r | awk -F "-" '{print $1}')

read -e -p "$(WARN "是否开启${BRIGHT_CYAN}BBR${RESET},优化网络带宽提高网络性能? ${PROMPT_YES_NO}")" choice_bbr
case $choice_bbr in
    y | Y)
        version_compare=$(echo "${kernel_version} 4.9" | awk '{if ($1 >= $2) print "yes"; else print "no"}')
        if [ "$version_compare" != "yes" ]; then
            WARN "你的内核版本小于4.9，无法启动BBR，需要你手动升级内核"
            exit 0
        fi
        sysctl net.ipv4.tcp_available_congestion_control | grep -q "bbr"
        if [ $? -eq 0 ]; then
            INFO "你的服务器已经启动 ${BRIGHT_CYAN}BBR${RESET}"
        else
            INFO "开启BBR中..."
            modprobe tcp_bbr
            if [ $? -eq 0 ]; then
                INFO "${BRIGHT_CYAN}BBR${RESET} 模块${LIGHT_GREEN}添加成功${RESET}"
            else 
                ERROR "${BRIGHT_CYAN}BBR${RESET} 模块${LIGHT_RED}添加失败${RESET}，请执行 ${LIGHT_CYAN}sysctl -p${RESET} 检查."
                exit 1
            fi

            if [ ! -d /etc/modules-load.d/ ]; then
                mkdir -p /etc/modules-load.d/
            fi

            if [ ! -f /etc/modules-load.d/tcp_bbr.conf ]; then
                touch /etc/modules-load.d/tcp_bbr.conf
            fi

            if ! grep -q "tcp_bbr" /etc/modules-load.d/tcp_bbr.conf ; then
                echo 'tcp_bbr' >> /etc/modules-load.d/tcp_bbr.conf
            fi

            for setting in "net.core.default_qdisc=fq" "net.ipv4.tcp_congestion_control=bbr"; do
                if ! grep -q "$setting" /etc/sysctl.conf; then
                    echo "$setting" >> /etc/sysctl.conf
                fi
            done       

            sysctl -p &> /dev/null
            if [ $? -ne 0 ]; then
                ERROR "应用sysctl设置过程中发生了一个错误，请执行 ${LIGHT_CYAN}sysctl -p${RESET} 检查."
                exit 2
            fi

            lsmod | grep tcp_bbr &> /dev/null
            if [ $? -eq 0 ]; then
                INFO "${BRIGHT_CYAN}BBR${RESET} 已经${LIGHT_GREEN}成功开启${RESET}"
            else
                ERROR "${BRIGHT_CYAN}BBR${RESET} 开启${LIGHT_RED}失败${RESET}，请执行 ${LIGHT_CYAN}sysctl -p${RESET} 检查."
                exit 3
            fi

            WARN "如果 ${BRIGHT_CYAN}BBR${RESET} 开启后${LIGHT_YELLOW}未生效${RESET}，请执行 ${LIGHT_BLUE}reboot${RESET} 重启服务器使其BBR模块生效"
        fi
    ;;
    n | N)
        INFO "不开启BBR"
    ;;
    *)
        WARN "输入了无效的选择。请重新输入${LIGHT_GREEN}y${RESET} 或 ${LIGHT_YELLOW}n${RESET}"
        CHECKBBR
    ;;
esac
}


function INSTALL_PACKAGE(){
SEPARATOR "安装依赖"
INFO "检查依赖安装情况，请稍等 ..."
TIMEOUT=300
PACKAGES_APT=(
    lsof jq wget apache2-utils tar
)
PACKAGES_YUM=(
    epel-release lsof jq wget yum-utils httpd-tools tar
)

if [ "$package_manager" = "dnf" ] || [ "$package_manager" = "yum" ]; then
    for package in "${PACKAGES_YUM[@]}"; do
        if $pkg_manager -q "$package" &>/dev/null; then
            INFO "${LIGHT_GREEN}已经安装${RESET} $package ..."
        else
            INFO "${LIGHT_CYAN}正在安装${RESET} $package ..."
            start_spinner "安装 $package 中..."
            
            start_time=$(date +%s)
            $package_manager -y install "$package" --skip-broken > /dev/null 2>&1
            install_status=$?
            stop_spinner

            if [ $install_status -ne 0 ]; then
                ERROR "$package 安装失败。请检查系统安装源，然后再次运行此脚本！请尝试手动执行安装: ${LIGHT_BLUE}$package_manager -y install $package${RESET}"
                exit 1
            fi
        fi
    done
elif [ "$package_manager" = "apt" ] || [ "$package_manager" = "apt-get" ];then
    start_spinner "正在检查依赖安装情况..."
    dpkg --configure -a &>/dev/null
    $package_manager -y update &>/dev/null
    stop_spinner
    for package in "${PACKAGES_APT[@]}"; do
        if $pkg_manager -s "$package" &>/dev/null; then
            INFO "已经安装 $package ..."
        else
            INFO "正在安装 $package ..."
            start_spinner "安装 $package 中..."
            $package_manager install -y $package > /dev/null 2>&1
            install_status=$?
            stop_spinner
            
            if [ $install_status -ne 0 ]; then
                ERROR "安装 $package 失败,请检查系统安装源之后再次运行此脚本！请尝试手动执行安装: ${LIGHT_BLUE}$package_manager -y install $package${RESET}"
                exit 1
            fi
        fi
    done
else
    ERROR "无法确定包管理系统,脚本无法继续执行,请检查!"
    exit 1
fi
}


function INSTALL_CADDY() {
SEPARATOR "安装Caddy"
start_caddy() {
systemctl enable caddy.service &>/dev/null
systemctl restart caddy.service

status=$(systemctl is-active caddy)

if [ "$status" = "active" ]; then
    INFO "Caddy 服务运行正常，请继续..."
else
    ERROR "Caddy 服务未运行，请查看日志报错，定位问题后再次执行脚本！"
    ERROR "-----------服务启动失败，请查看错误日志 ↓↓↓-----------"
      journalctl -u caddy.service --no-pager
    ERROR "-----------服务启动失败，请查看错误日志 ↑↑↑-----------"
    exit 1
fi
}

check_caddy() {
if pgrep "caddy" > /dev/null; then
    INFO "Caddy 已在运行."
else
    WARN "Caddy 未运行。尝试启动 Caddy..."
    start_attempts=3

    for ((i=1; i<=$start_attempts; i++)); do
        start_caddy
        if pgrep "caddy" > /dev/null; then
            INFO "Caddy 已成功启动."
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
    if which caddy &>/dev/null; then
        INFO "Caddy 已经安装."
    else
        INFO "正在安装Caddy程序，请稍候..."

        start_spinner "安装Caddy中..."
        $package_manager -y install 'dnf-command(copr)' &>/dev/null
        $package_manager -y copr enable @caddy/caddy &>/dev/null
        stop_spinner
        while [ $attempts -lt $maxAttempts ]; do
            start_spinner "安装Caddy服务..."
            $package_manager -y install caddy &>/dev/null
            stop_spinner
            if [ $? -ne 0 ]; then
                ((attempts++))
                WARN "正在尝试安装Caddy >>> (Attempt: $attempts)"

                if [ $attempts -eq $maxAttempts ]; then
                    ERROR "Caddy installation failed. Please try installing manually."
                    echo "命令: $package_manager -y install 'dnf-command(copr)' && $package_manager -y copr enable @caddy/caddy && $package_manager -y install caddy"
                    exit 1
                fi
            else
                INFO "检测到服务 Caddy 已安装"
                break
            fi
        done
    fi
    check_caddy

elif [ "$package_manager" = "yum" ]; then
    if which caddy &>/dev/null; then
        INFO "Caddy 已经安装."
    else
        INFO "正在安装Caddy程序，请稍候..."

        start_spinner "安装Caddy中..."
        $package_manager -y install yum-plugin-copr &>/dev/null
        $package_manager -y copr enable @caddy/caddy &>/dev/null
        stop_spinner
        while [ $attempts -lt $maxAttempts ]; do
            start_spinner "安装Caddy服务..."
            $package_manager -y install caddy &>/dev/null
            stop_spinner
            if [ $? -ne 0 ]; then
                ((attempts++))
                WARN "正在尝试安装Caddy >>> (Attempt: $attempts)"

                if [ $attempts -eq $maxAttempts ]; then
                    ERROR "Caddy installation failed. Please try installing manually."
                    echo "命令: $package_manager -y install 'dnf-command(copr)' && $package_manager -y copr enable @caddy/caddy && $package_manager -y install caddy"
                    exit 1
                fi
            else
                INFO "检测到服务 Caddy 已安装"
                break
            fi
        done
    fi

    check_caddy

elif [ "$package_manager" = "apt" ] || [ "$package_manager" = "apt-get" ];then
    dpkg --configure -a &>/dev/null
    if $pkg_manager -s "caddy" &>/dev/null; then
        INFO "检测到服务 Caddy 已安装，跳过..."
    else
        INFO "安装 Caddy 请稍等 ..."

        start_spinner "安装Caddy中..."
        $package_manager -y update &>/dev/null
        $package_manager install -y debian-keyring debian-archive-keyring apt-transport-https &>/dev/null
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg &>/dev/null
        curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list &>/dev/null
        $package_manager -y update &>/dev/null
        $package_manager install -y caddy &>/dev/null
        stop_spinner
        while [ $attempts -lt $maxAttempts ]; do
            start_spinner "安装Caddy服务..."
            $package_manager -y install caddy &>/dev/null
            stop_spinner
            if [ $? -ne 0 ]; then
                ((attempts++))
                WARN "正在尝试安装Caddy >>> (Attempt: $attempts)"

                if [ $attempts -eq $maxAttempts ]; then
                    ERROR "Caddy installation failed. Please try installing manually."
                    echo "命令: $package_manager -y install update && $package_manager -y install caddy"
                    exit 1
                fi
            else
                INFO "检测到服务 Caddy 已安装"
                break
            fi
        done
    fi

    check_caddy
else
    WARN "无法确定包管理系统."
    exit 1
fi
}

function CONFIG_CADDY() {
SEPARATOR "配置Caddy"
while true; do
    INFO "${LIGHT_GREEN}>>> 域名解析主机记录(即域名前缀):${RESET} ${LIGHT_CYAN}${REGISTRY_SLD}${RESET}"
    WARN "${LIGHT_GREEN}>>> 只需选择你部署的服务进行解析即可${RESET},${LIGHT_YELLOW}无需将上面提示中所有的主机记录进行解析${RESET}"
    read -e -p "$(WARN "是否配置Caddy,实现自动HTTPS? 执行前需在DNS服务商对部署服务解析主机记录 ${PROMPT_YES_NO}")" caddy_conf
    case "$caddy_conf" in
        y|Y )
            read -e -p "$(INFO "请输入你的域名${LIGHT_BLUE}[例: baidu.com]${RESET} ${LIGHT_RED}不可为空${RESET}: ")" caddy_domain           
            read -e -p "$(INFO "请输入要配置的${LIGHT_MAGENTA}主机记录${RESET}，用逗号分隔${LIGHT_BLUE}[例: ui,hub]${RESET}: ")" selected_records

            # 验证输入的主机记录
            local valid_records=("${RECORDS[@]}")
            IFS=',' read -r -a records_array <<< "$selected_records"
            local invalid_records=()
            for record in "${records_array[@]}"; do
                if ! [[ " ${valid_records[@]} " =~ " ${record} " ]]; then
                    invalid_records+=("$record")
                fi
            done

            if [[ ${#invalid_records[@]} -gt 0 ]]; then
                ERROR "无效的主机记录: ${LIGHT_RED}${invalid_records[@]}${RESET}"
                INFO "请输入有效的主机记录: ${LIGHT_GREEN}${REGISTRY_SLD}${RESET}"
                continue
            fi

            declare -A record_templates
            record_templates[ui]="ui.$caddy_domain {
    reverse_proxy localhost:30080 {
        header_up Host {host}
        header_up Origin {scheme}://{host}
        header_up X-Forwarded-For {remote_addr}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Ssl on
        header_up X-Forwarded-Port {server_port}
        header_up X-Forwarded-Host {host}
    }
}"
            record_templates[hub]="hub.$caddy_domain {
    reverse_proxy localhost:50000 {
        header_up Host {host}
        header_up X-Real-IP {remote_addr}
        header_up X-Forwarded-For {remote_addr}
        header_up X-Nginx-Proxy true
    }
}"
            record_templates[ghcr]="ghcr.$caddy_domain {
    reverse_proxy localhost:50000 {
        header_up Host {host}
        header_up X-Real-IP {remote_addr}
        header_up X-Forwarded-For {remote_addr}
        header_up X-Nginx-Proxy true
    }
}"
            record_templates[gcr]="gcr.$caddy_domain {
    reverse_proxy localhost:50000 {
        header_up Host {host}
        header_up X-Real-IP {remote_addr}
        header_up X-Forwarded-For {remote_addr}
        header_up X-Nginx-Proxy true
    }
}"
            record_templates[k8sgcr]="k8sgcr.$caddy_domain {
    reverse_proxy localhost:50000 {
        header_up Host {host}
        header_up X-Real-IP {remote_addr}
        header_up X-Forwarded-For {remote_addr}
        header_up X-Nginx-Proxy true
    }
}"
            record_templates[k8s]="k8s.$caddy_domain {
    reverse_proxy localhost:50000 {
        header_up Host {host}
        header_up X-Real-IP {remote_addr}
        header_up X-Forwarded-For {remote_addr}
        header_up X-Nginx-Proxy true
    }
}"
            record_templates[quay]="quay.$caddy_domain {
    reverse_proxy localhost:50000 {
        header_up Host {host}
        header_up X-Real-IP {remote_addr}
        header_up X-Forwarded-For {remote_addr}
        header_up X-Nginx-Proxy true
    }
}"
            record_templates[mcr]="mcr.$caddy_domain {
    reverse_proxy localhost:50000 {
        header_up Host {host}
        header_up X-Real-IP {remote_addr}
        header_up X-Forwarded-For {remote_addr}
        header_up X-Nginx-Proxy true
    }
}"
            record_templates[elastic]="elastic.$caddy_domain {
    reverse_proxy localhost:50000 {
        header_up Host {host}
        header_up X-Real-IP {remote_addr}
        header_up X-Forwarded-For {remote_addr}
        header_up X-Nginx-Proxy true
    }
}"
            record_templates[nvcr]="nvcr.$caddy_domain {
    reverse_proxy localhost:50000 {
        header_up Host {host}
        header_up X-Real-IP {remote_addr}
        header_up X-Forwarded-For {remote_addr}
        header_up X-Nginx-Proxy true
    }
}"
            > /etc/caddy/Caddyfile
            for record in "${records_array[@]}"; do
                if [[ -n "${record_templates[$record]}" ]]; then
                    echo "${record_templates[$record]}" >> /etc/caddy/Caddyfile
                fi
            done

            start_attempts=3
            for ((i=1; i<=$start_attempts; i++)); do
                start_caddy
                if pgrep "caddy" > /dev/null; then
                    INFO "重新载入配置成功. Caddy服务启动完成"
                    break
                else
                    if [ $i -eq $start_attempts ]; then
                        ERROR "Caddy 在尝试 $start_attempts 后无法启动。请检查配置"
                        exit 1
                    else
                        WARN "第 $i 次启动 Caddy 失败。重试..."
                    fi
                fi
            done
            break;;
        n|N )
            WARN "退出配置 Caddy 操作。"
            break;;
        * )
            INFO "请输入 ${LIGHT_GREEN}y${RESET} 或 ${LIGHT_YELLOW}n${RESET}";;
    esac
done
}


function INSTALL_NGINX() {
SEPARATOR "安装Nginx"
start_nginx() {
systemctl enable nginx &>/dev/null
systemctl restart nginx

status=$(systemctl is-active nginx)

if [ "$status" = "active" ]; then
    INFO "Nginx 服务运行正常，请继续..."
else
    ERROR "Nginx 服务未运行，请查看日志报错，定位问题后再次执行脚本！"
    ERROR "-----------服务启动失败，请查看错误日志 ↓↓↓-----------"
      journalctl -u nginx.service --no-pager
    ERROR "-----------服务启动失败，请查看错误日志 ↑↑↑-----------"
    exit 1
fi
}

check_nginx() {
if pgrep "nginx" > /dev/null; then
    INFO "Nginx 已在运行."
else
    WARN "Nginx 未运行。尝试启动 Nginx..."
    start_attempts=3

    for ((i=1; i<=$start_attempts; i++)); do
        start_nginx
        if pgrep "nginx" > /dev/null; then
            INFO "Nginx 已成功启动."
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
    if which nginx &>/dev/null; then
        INFO "Nginx 已经安装."
    else
        INFO "正在安装Nginx程序，请稍候..."
        NGINX="nginx-1.24.0-1.el${OSVER}.ngx.x86_64.rpm"

        start_spinner "下载Nginx安装包..."
        rm -f ${NGINX}
        wget http://nginx.org/packages/centos/${OSVER}/x86_64/RPMS/${NGINX} &>/dev/null
        stop_spinner

        while [ $attempts -lt $maxAttempts ]; do
            start_spinner "安装Nginx服务..."
            $package_manager -y install ${NGINX} &>/dev/null
            stop_spinner

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
                INFO "检测到服务 Nginx 已安装"
                rm -f ${NGINX}
                break
            fi
        done
    fi

    check_nginx

elif [ "$package_manager" = "apt" ] || [ "$package_manager" = "apt-get" ];then
    dpkg --configure -a &>/dev/null
    if $pkg_manager -s "nginx" &>/dev/null; then
        INFO "检测到服务 Nginx 已安装，跳过..."
    else
        INFO "安装 Nginx 请稍等 ..."
        while [ $attempts -lt $maxAttempts ]; do
            start_spinner "安装Nginx服务..."
            $package_manager -y update &>/dev/null
            $package_manager install -y nginx > /dev/null 2>&1
            stop_spinner
            if [ $? -ne 0 ]; then
                ((attempts++))
                WARN "正在尝试安装Nginx >>> (Attempt: $attempts)"

                if [ $attempts -eq $maxAttempts ]; then
                    ERROR "Nginx installation failed. Please try installing manually."
                    echo "命令: $package_manager install -y nginx"
                    exit 1
                fi
            else
                INFO "检测到服务 Nginx 已安装"
                break
            fi
        done
    fi

    check_nginx
else
    WARN "无法确定包管理系统."
    exit 1
fi
}

function CONFIG_NGINX() {
SEPARATOR "配置Nginx"
while true; do
    WARN "自行安装的 Nginx ${LIGHT_RED}请谨慎执行此操作${RESET}，${LIGHT_BLUE}以防覆盖原有配置${RESET}"
    INFO "${LIGHT_GREEN}>>> 域名解析主机记录(即域名前缀):${RESET} ${LIGHT_CYAN}${REGISTRY_SLD}${RESET}"
    WARN "${LIGHT_GREEN}>>> 只需选择你部署的服务进行解析即可${RESET},${LIGHT_YELLOW}无需将上面提示中所有的主机记录进行解析${RESET}"
    read -e -p "$(WARN "是否配置 Nginx？配置完成后需在DNS服务商解析主机记录 ${PROMPT_YES_NO}")" nginx_conf
    case "$nginx_conf" in
        y|Y )
            read -e -p "$(INFO "请输入你的域名${LIGHT_BLUE}[例: baidu.com]${RESET} ${LIGHT_RED}不可为空${RESET}: ")" nginx_domain           
            read -e -p "$(INFO "请输入要配置的${LIGHT_MAGENTA}主机记录${RESET}，用逗号分隔${LIGHT_BLUE}[例: ui,hub]${RESET}: ")" selected_records

            # 验证输入的主机记录
            local valid_records=("${RECORDS[@]}")
            IFS=',' read -r -a records_array <<< "$selected_records"
            local invalid_records=()
            for record in "${records_array[@]}"; do
                if ! [[ " ${valid_records[@]} " =~ " ${record} " ]]; then
                    invalid_records+=("$record")
                fi
            done

            if [[ ${#invalid_records[@]} -gt 0 ]]; then
                ERROR "无效的主机记录: ${LIGHT_RED}${invalid_records[@]}${RESET}"
                INFO "请输入有效的主机记录: ${LIGHT_GREEN}${REGISTRY_SLD}${RESET}"
                continue
            fi

            declare -A record_templates
            record_templates[ui]="server {
    listen       80;
    #listen       443 ssl;
    server_name  ui.$nginx_domain;
    #ssl_certificate /path/to/your_domain_name.crt;
    #ssl_certificate_key /path/to/your_domain_name.key;
    #ssl_session_timeout 1d;
    #ssl_session_cache   shared:SSL:50m;
    #ssl_session_tickets off;
    #ssl_protocols TLSv1.2 TLSv1.3;
    #ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:HIGH:!aNULL:!MD5:!RC4:!DHE;
    #ssl_prefer_server_ciphers on;
    #ssl_buffer_size 8k;
    proxy_connect_timeout 600;
    proxy_send_timeout    600;
    proxy_read_timeout    600;
    send_timeout          600;
    location / {
        proxy_pass   http://localhost:30080;
        proxy_set_header  Host \$host;
        proxy_set_header  Origin \$scheme://\$host;
        proxy_set_header  X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header  X-Forwarded-Proto \$scheme;
        proxy_set_header  X-Forwarded-Ssl on; 
        proxy_set_header  X-Forwarded-Port \$server_port;
        proxy_set_header  X-Forwarded-Host \$host;
    }
}"
            record_templates[hub]="server {
    listen       80;
    #listen       443 ssl;
    server_name  hub.$nginx_domain;
    #ssl_certificate /path/to/your_domain_name.crt;
    #ssl_certificate_key /path/to/your_domain_name.key;
    #ssl_session_timeout 1d;
    #ssl_session_cache   shared:SSL:50m;
    #ssl_session_tickets off;
    #ssl_protocols TLSv1.2 TLSv1.3;
    #ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:HIGH:!aNULL:!MD5:!RC4:!DHE;
    #ssl_prefer_server_ciphers on;
    #ssl_buffer_size 8k;
    proxy_connect_timeout 600;
    proxy_send_timeout    600;
    proxy_read_timeout    600;
    send_timeout          600;
    location / {
        proxy_pass   http://localhost:50000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;        
        proxy_set_header X-Nginx-Proxy true;
        proxy_buffering off;
        proxy_redirect off;
    }
}"
            record_templates[ghcr]="server {
    listen       80;
    #listen       443 ssl;
    server_name  ghcr.$nginx_domain;
    #ssl_certificate /path/to/your_domain_name.crt;
    #ssl_certificate_key /path/to/your_domain_name.key;
    #ssl_session_timeout 1d;
    #ssl_session_cache   shared:SSL:50m;
    #ssl_session_tickets off;
    #ssl_protocols TLSv1.2 TLSv1.3;
    #ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:HIGH:!aNULL:!MD5:!RC4:!DHE;
    #ssl_prefer_server_ciphers on;
    #ssl_buffer_size 8k;
    proxy_connect_timeout 600;
    proxy_send_timeout    600;
    proxy_read_timeout    600;
    send_timeout          600;
    location / {
        proxy_pass   http://localhost:50000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;        
        proxy_set_header X-Nginx-Proxy true;
        proxy_buffering off;
        proxy_redirect off;
    }
}"
            record_templates[gcr]="server {
    listen       80;
    #listen       443 ssl;
    server_name  gcr.$nginx_domain;
    #ssl_certificate /path/to/your_domain_name.crt;
    #ssl_certificate_key /path/to/your_domain_name.key;
    #ssl_session_timeout 1d;
    #ssl_session_cache   shared:SSL:50m;
    #ssl_session_tickets off;
    #ssl_protocols TLSv1.2 TLSv1.3;
    #ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:HIGH:!aNULL:!MD5:!RC4:!DHE;
    #ssl_prefer_server_ciphers on;
    #ssl_buffer_size 8k;
    proxy_connect_timeout 600;
    proxy_send_timeout    600;
    proxy_read_timeout    600;
    send_timeout          600;
    location / {
        proxy_pass   http://localhost:50000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;        
        proxy_set_header X-Nginx-Proxy true;
        proxy_buffering off;
        proxy_redirect off;
    }
}"
            record_templates[k8sgcr]="server {
    listen       80;
    #listen       443 ssl;
    server_name  k8sgcr.$nginx_domain;
    #ssl_certificate /path/to/your_domain_name.crt;
    #ssl_certificate_key /path/to/your_domain_name.key;
    #ssl_session_timeout 1d;
    #ssl_session_cache   shared:SSL:50m;
    #ssl_session_tickets off;
    #ssl_protocols TLSv1.2 TLSv1.3;
    #ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:HIGH:!aNULL:!MD5:!RC4:!DHE;
    #ssl_prefer_server_ciphers on;
    #ssl_buffer_size 8k;
    proxy_connect_timeout 600;
    proxy_send_timeout    600;
    proxy_read_timeout    600;
    send_timeout          600;
    location / {
        proxy_pass   http://localhost:50000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;        
        proxy_set_header X-Nginx-Proxy true;
        proxy_buffering off;
        proxy_redirect off;
    }
}"
            record_templates[k8s]="server {
    listen       80;
    #listen       443 ssl;
    server_name  k8s.$nginx_domain;
    #ssl_certificate /path/to/your_domain_name.crt;
    #ssl_certificate_key /path/to/your_domain_name.key;
    #ssl_session_timeout 1d;
    #ssl_session_cache   shared:SSL:50m;
    #ssl_session_tickets off;
    #ssl_protocols TLSv1.2 TLSv1.3;
    #ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:HIGH:!aNULL:!MD5:!RC4:!DHE;
    #ssl_prefer_server_ciphers on;
    #ssl_buffer_size 8k;
    proxy_connect_timeout 600;
    proxy_send_timeout    600;
    proxy_read_timeout    600;
    send_timeout          600;
    location / {
        proxy_pass   http://localhost:50000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;        
        proxy_set_header X-Nginx-Proxy true;
        proxy_buffering off;
        proxy_redirect off;
    }
}"
            record_templates[quay]="server {
    listen       80;
    #listen       443 ssl;
    server_name  quay.$nginx_domain;
    #ssl_certificate /path/to/your_domain_name.crt;
    #ssl_certificate_key /path/to/your_domain_name.key;
    #ssl_session_timeout 1d;
    #ssl_session_cache   shared:SSL:50m;
    #ssl_session_tickets off;
    #ssl_protocols TLSv1.2 TLSv1.3;
    #ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:HIGH:!aNULL:!MD5:!RC4:!DHE;
    #ssl_prefer_server_ciphers on;
    #ssl_buffer_size 8k;
    proxy_connect_timeout 600;
    proxy_send_timeout    600;
    proxy_read_timeout    600;
    send_timeout          600;
    location / {
        proxy_pass   http://localhost:50000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;        
        proxy_set_header X-Nginx-Proxy true;
        proxy_buffering off;
        proxy_redirect off;
    }
}"
            record_templates[mcr]="server {
    listen       80;
    #listen       443 ssl;
    server_name  mcr.$nginx_domain;
    #ssl_certificate /path/to/your_domain_name.crt;
    #ssl_certificate_key /path/to/your_domain_name.key;
    #ssl_session_timeout 1d;
    #ssl_session_cache   shared:SSL:50m;
    #ssl_session_tickets off;
    #ssl_protocols TLSv1.2 TLSv1.3;
    #ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:HIGH:!aNULL:!MD5:!RC4:!DHE;
    #ssl_prefer_server_ciphers on;
    #ssl_buffer_size 8k;
    proxy_connect_timeout 600;
    proxy_send_timeout    600;
    proxy_read_timeout    600;
    send_timeout          600;
    location / {
        proxy_pass   http://localhost:50000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;        
        proxy_set_header X-Nginx-Proxy true;
        proxy_buffering off;
        proxy_redirect off;
    }
}"
            record_templates[elastic]="server {
    listen       80;
    #listen       443 ssl;
    server_name  elastic.$nginx_domain;
    #ssl_certificate /path/to/your_domain_name.crt;
    #ssl_certificate_key /path/to/your_domain_name.key;
    #ssl_session_timeout 1d;
    #ssl_session_cache   shared:SSL:50m;
    #ssl_session_tickets off;
    #ssl_protocols TLSv1.2 TLSv1.3;
    #ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:HIGH:!aNULL:!MD5:!RC4:!DHE;
    #ssl_prefer_server_ciphers on;
    #ssl_buffer_size 8k;
    proxy_connect_timeout 600;
    proxy_send_timeout    600;
    proxy_read_timeout    600;
    send_timeout          600;
    location / {
        proxy_pass   http://localhost:50000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;        
        proxy_set_header X-Nginx-Proxy true;
        proxy_buffering off;
        proxy_redirect off;
    }
}"
            record_templates[nvcr]="server {
    listen       80;
    #listen       443 ssl;
    server_name  nvcr.$nginx_domain;
    #ssl_certificate /path/to/your_domain_name.crt;
    #ssl_certificate_key /path/to/your_domain_name.key;
    #ssl_session_timeout 1d;
    #ssl_session_cache   shared:SSL:50m;
    #ssl_session_tickets off;
    #ssl_protocols TLSv1.2 TLSv1.3;
    #ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:HIGH:!aNULL:!MD5:!RC4:!DHE;
    #ssl_prefer_server_ciphers on;
    #ssl_buffer_size 8k;
    proxy_connect_timeout 600;
    proxy_send_timeout    600;
    proxy_read_timeout    600;
    send_timeout          600;
    location / {
        proxy_pass   http://localhost:50000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;        
        proxy_set_header X-Nginx-Proxy true;
        proxy_buffering off;
        proxy_redirect off;
    }
}"
            > /etc/nginx/conf.d/docker-proxy.conf
            for record in "${records_array[@]}"; do
                if [[ -n "${record_templates[$record]}" ]]; then
                    echo "${record_templates[$record]}" >> /etc/nginx/conf.d/docker-proxy.conf
                fi
            done

            start_attempts=3
            for ((i=1; i<=$start_attempts; i++)); do
                start_nginx
                if pgrep "nginx" > /dev/null; then
                    INFO "重新载入配置成功. Nginx服务启动完成"
                    break
                else
                    if [ $i -eq $start_attempts ]; then
                        ERROR "Nginx 在尝试 $start_attempts 后无法启动。请检查配置"
                        exit 1
                    else
                        WARN "第 $i 次启动 Nginx 失败。重试..."
                    fi
                fi
            done
            break;;
        n|N )
            WARN "退出配置 Nginx 操作。"
            break;;
        * )
            INFO "请输入 ${LIGHT_GREEN}y${RESET} 或 ${LIGHT_YELLOW}n${RESET}";;
    esac
done
}

function CHECK_DOCKER() {
status=$(systemctl is-active docker)

if [ "$status" = "active" ]; then
    INFO "Docker 服务运行正常，请继续..."
else
    ERROR "Docker 服务未运行，请查看日志报错，定位问题后再次执行脚本！"
    ERROR "-----------服务启动失败，请查看错误日志 ↓↓↓-----------"
      journalctl -u docker.service --no-pager
    ERROR "-----------服务启动失败，请查看错误日志 ↑↑↑-----------"
    exit 1
fi
}

function INSTALL_DOCKER() {
repo_file="docker-ce.repo"
url="https://download.docker.com/linux/$repo_type"
MAX_ATTEMPTS=3
attempt=0
success=false

if [ "$repo_type" = "centos" ] || [ "$repo_type" = "rhel" ]; then
    if ! command -v docker &> /dev/null;then
      while [[ $attempt -lt $MAX_ATTEMPTS ]]; do
        attempt=$((attempt + 1))
        WARN "Docker 未安装，正在进行安装..."
        start_spinner "添加Docker仓库..."
        yum-config-manager --add-repo $url/$repo_file &>/dev/null
        stop_spinner

        start_spinner "安装Docker服务..."
        $package_manager -y install docker-ce &>/dev/null
        stop_spinner
        if [ $? -eq 0 ]; then
            success=true
            break
        fi
        ERROR "Docker 安装失败，正在尝试重新下载 (尝试次数: $attempt)"
      done

      if $success; then
         INFO "Docker 安装成功，版本为：$(docker --version)"
         start_spinner "启动Docker服务..."
         systemctl restart docker &>/dev/null
         stop_spinner
         CHECK_DOCKER
         systemctl enable docker &>/dev/null         
      else
         ERROR "Docker 安装失败，请尝试手动安装"
         exit 1
      fi
    else
      INFO "Docker 已安装，安装版本为：$(docker --version)"
      systemctl restart docker | grep -E "ERROR|ELIFECYCLE|WARN"
    fi
elif [ "$repo_type" == "ubuntu" ]; then
    if ! command -v docker &> /dev/null;then
      while [[ $attempt -lt $MAX_ATTEMPTS ]]; do
        attempt=$((attempt + 1))
        WARN "Docker 未安装，正在进行安装..."
        start_spinner "添加Docker仓库..."        
        curl -fsSL $url/gpg | sudo apt-key add - &>/dev/null
        add-apt-repository "deb [arch=amd64] $url $(lsb_release -cs) stable" <<< $'\n' &>/dev/null
        start_spinner "安装Docker服务..."
        $package_manager -y install docker-ce docker-ce-cli containerd.io &>/dev/null
        stop_spinner
        if [ $? -eq 0 ]; then
            success=true
            break
        fi
        ERROR "Docker 安装失败，正在尝试重新下载 (尝试次数: $attempt)"
      done

      if $success; then
         INFO "Docker 安装成功，版本为：$(docker --version)"
         systemctl restart docker &>/dev/null
         CHECK_DOCKER
         systemctl enable docker &>/dev/null
      else
         ERROR "Docker 安装失败，请尝试手动安装"
         exit 1
      fi
    else
      INFO "Docker 已安装，安装版本为：$(docker --version)"
      systemctl restart docker | grep -E "ERROR|ELIFECYCLE|WARN"
    fi
elif [ "$repo_type" == "debian" ]; then
    if ! command -v docker &> /dev/null;then
      while [[ $attempt -lt $MAX_ATTEMPTS ]]; do
        attempt=$((attempt + 1))

        WARN "Docker 未安装，正在进行安装..."
        start_spinner "添加Docker仓库..."
        curl -fsSL $url/gpg | sudo apt-key add - &>/dev/null
        add-apt-repository "deb [arch=amd64] $url $(lsb_release -cs) stable" <<< $'\n' &>/dev/null
        start_spinner "安装Docker服务..."
        $package_manager -y install docker-ce docker-ce-cli containerd.io &>/dev/null
        stop_spinner
        if [ $? -eq 0 ]; then
            success=true
            break
        fi
        ERROR "Docker 安装失败，正在尝试重新下载 (尝试次数: $attempt)"
      done

      if $success; then
         INFO "Docker 安装成功，版本为：$(docker --version)"
         systemctl restart docker &>/dev/null
         CHECK_DOCKER
         systemctl enable docker &>/dev/null
      else
         ERROR "Docker 安装失败，请尝试手动安装"
         exit 1
      fi
    else
        INFO "Docker 已安装，安装版本为：$(docker --version)"
        systemctl restart docker &>/dev/null
        CHECK_DOCKER
    fi
else
    ERROR "不支持的操作系统."
    exit 1
fi
}

function INSTALL_COMPOSE() {
SEPARATOR "安装Docker Compose"

TAG=`curl -s https://api.github.com/repos/docker/compose/releases/latest | jq -r '.tag_name'`
url="https://github.com/docker/compose/releases/download/$TAG/docker-compose-$(uname -s)-$(uname -m)"
MAX_ATTEMPTS=3
attempt=0
success=false
save_path="/usr/local/bin"

chmod +x $save_path/docker-compose &>/dev/null
if ! command -v docker-compose &> /dev/null || [ -z "$(docker-compose --version)" ]; then
    WARN "Docker Compose 未安装或安装不完整，正在进行安装..."    
    while [ $attempt -lt $MAX_ATTEMPTS ]; do
        attempt=$((attempt + 1))
        start_spinner "下载Docker Compose..."
        wget --continue -q $url -O $save_path/docker-compose
        stop_spinner
        if [ $? -eq 0 ]; then
            chmod +x $save_path/docker-compose
            version_check=$(docker-compose --version)
            if [ -n "$version_check" ]; then
                success=true
                chmod +x $save_path/docker-compose
                break
            else
                WARN "Docker Compose 下载的文件不完整，正在尝试重新下载 (尝试次数: $attempt)"
                rm -f $save_path/docker-compose
            fi
        fi

        ERROR "Docker Compose 下载失败，正在尝试重新下载 (尝试次数: $attempt)"
    done

    if $success; then
        INFO "Docker Compose 安装成功，版本为：$(docker-compose --version)"
    else
        ERROR "Docker Compose 下载失败，请尝试手动安装docker-compose"
        exit 1
    fi
else
    chmod +x $save_path/docker-compose
    INFO "Docker Compose 已经安装，版本为：$(docker-compose --version)"
fi
}

function INSTALL_DOCKER_CN() {
MAX_ATTEMPTS=3
attempt=0
success=false
cpu_arch=$(uname -m)
save_path="/opt/docker_tgz"
mkdir -p $save_path
docker_ver="docker-29.4.0"

case $cpu_arch in
  "arm64")
    docker_tgz="${docker_ver}-arm64.tgz"
    url="https://gitcode.com/dqzboy/docker/releases/download/${docker_ver}/${docker_tgz}"
    ;;
  "aarch64")
    docker_tgz="${docker_ver}-arm64.tgz"
    url="https://gitcode.com/dqzboy/docker/releases/download/${docker_ver}/${docker_tgz}"
    ;;
  "x86_64")
    docker_tgz="${docker_ver}-amd64.tgz"
    url="https://gitcode.com/dqzboy/docker/releases/download/${docker_ver}/${docker_tgz}"
    ;;
  *)
    ERROR "不支持的CPU架构: $cpu_arch"
    exit 1
    ;;
esac


if ! command -v docker &> /dev/null; then
  while [ $attempt -lt $MAX_ATTEMPTS ]; do
    attempt=$((attempt + 1))
    WARN "Docker 未安装，正在进行安装..."
    start_spinner "安装Docker服务..."
    wget -P "$save_path" "$url" &>/dev/null
    stop_spinner
    if [ $? -eq 0 ]; then
        success=true
        break
    fi
    ERROR "Docker 安装失败，正在尝试重新下载 (尝试次数: $attempt)"
  done

  if $success; then
     tar -xzf $save_path/$docker_tgz -C $save_path
     \cp $save_path/docker/* /usr/bin/ &>/dev/null
     rm -rf $save_path
     INFO "Docker 安装成功，版本为：$(docker --version)"
     
     cat > /usr/lib/systemd/system/docker.service <<EOF
[Unit]
Description=Docker Application Container Engine
Documentation=https://docs.docker.com
After=network-online.target firewalld.service
Wants=network-online.target
[Service]
Type=notify
ExecStart=/usr/bin/dockerd
ExecReload=/bin/kill -s HUP 
LimitNOFILE=infinity
LimitNPROC=infinity
LimitCORE=infinity
TimeoutStartSec=0
Delegate=yes
KillMode=process
Restart=on-failure
StartLimitBurst=3
StartLimitInterval=60s
[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl restart docker &>/dev/null
    CHECK_DOCKER
    systemctl enable docker &>/dev/null
  else
    ERROR "Docker 安装失败，请尝试手动安装"
    exit 1
  fi
else 
    INFO "Docker 已安装，安装版本为：$(docker --version)"
    systemctl restart docker &>/dev/null
    CHECK_DOCKER
fi
}


function INSTALL_COMPOSE_CN() {
SEPARATOR "安装Docker Compose"
MAX_ATTEMPTS=3
attempt=0
cpu_arch=$(uname -m)
success=false
save_path="/usr/local/bin"

case $cpu_arch in
  "arm64")
    url="https://gitcode.com/dqzboy/docker/releases/download/compose/docker-compose-linux-aarch64"
    ;;
  "aarch64")
    url="https://gitcode.com/dqzboy/docker/releases/download/compose/docker-compose-linux-aarch64"
    ;;
  "x86_64")
    url="https://gitcode.com/dqzboy/docker/releases/download/compose/docker-compose-linux-x86_64"
    ;;
  *)
    ERROR "不支持的CPU架构: $cpu_arch"
    exit 1
    ;;
esac


chmod +x $save_path/docker-compose &>/dev/null
if ! command -v docker-compose &> /dev/null || [ -z "$(docker-compose --version)" ]; then
    WARN "Docker Compose 未安装或安装不完整，正在进行安装..."    
    while [ $attempt -lt $MAX_ATTEMPTS ]; do
        attempt=$((attempt + 1))
        start_spinner "下载Docker Compose..."
        wget --continue -q $url -O $save_path/docker-compose
        stop_spinner
        if [ $? -eq 0 ]; then
            chmod +x $save_path/docker-compose
            version_check=$(docker-compose --version)
            if [ -n "$version_check" ]; then
                success=true
                chmod +x $save_path/docker-compose
                break
            else
                WARN "Docker Compose 下载的文件不完整，正在尝试重新下载 (尝试次数: $attempt)"
                rm -f $save_path/docker-compose
            fi
        fi

        ERROR "Docker Compose 下载失败，正在尝试重新下载 (尝试次数: $attempt)"
    done

    if $success; then
        INFO "Docker Compose 安装成功，版本为：$(docker-compose --version)"
    else
        ERROR "Docker Compose 下载失败，请尝试手动安装docker-compose"
        exit 1
    fi
else
    chmod +x $save_path/docker-compose
    INFO "Docker Compose 安装成功，版本为：$(docker-compose --version)"
fi
}






# 一键部署调此函数：为 go-proxy 容器注入上游代理（用于访问 Docker Hub / GHCR 等上游）
function PROXY_HTTP() {
read -e -p "$(INFO "是否添加上游代理(科学上网, 用于 go-proxy 访问 Docker Hub/GHCR 等上游)? ${PROMPT_YES_NO}")" modify_config
case $modify_config in
  [Yy]* )
    read -e -p "$(INFO "输入代理地址(科学上网) ${LIGHT_MAGENTA}(eg: host:port)${RESET}: ")" url
    while [[ -z "$url" ]]; do
      WARN "代理${LIGHT_YELLOW}地址不能为空${RESET}，请重新输入!"
      read -e -p "$(INFO "输入代理地址(科学上网) ${LIGHT_MAGENTA}(eg: host:port)${RESET}: ")" url
    done
    sed -i "s@# - HTTP_PROXY=http://host:port@- HTTP_PROXY=http://${url}@g" ${PROXY_DIR}/${DOCKER_COMPOSE_FILE}
    sed -i "s@# - HTTPS_PROXY=http://host:port@- HTTPS_PROXY=http://${url}@g" ${PROXY_DIR}/${DOCKER_COMPOSE_FILE}

    INFO "你配置上游代理地址为: ${CYAN}http://${url}${RESET}"
    ;;
  [Nn]* )
    WARN "跳过添加上游代理配置"
    ;;
  * )
    ERROR "无效的输入。请重新输入${LIGHT_GREEN}Y or N ${RESET}的选项"
    PROXY_HTTP
    ;;
esac
}


# 7) 本机Docker代理,调此函数
function DOCKER_PROXY_HTTP() {
WARN "${BOLD}${LIGHT_GREEN}提示:${RESET} ${LIGHT_CYAN}配置本机Docker服务走代理，加速本机Docker镜像下载${RESET}"
read -e -p "$(INFO "是否添加本机Docker服务代理? ${PROMPT_YES_NO}")" modify_proxy
case $modify_proxy in
  [Yy]* )
    read -e -p "$(INFO "输入代理地址(科学上网) ${LIGHT_MAGENTA}(eg: host:port)${RESET}: ")" url
    while [[ -z "$url" ]]; do
      WARN "代理${LIGHT_YELLOW}地址不能为空${RESET}，请重新输入。"
      read -e -p "$(INFO "输入代理地址(科学上网) ${LIGHT_MAGENTA}(eg: host:port)${RESET}: ")" url
    done

    INFO "你配置代理地址为: ${CYAN}http://${url}${RESET}"
    ;;
  [Nn]* )
    WARN "退出本机Docker服务代理配置"
    main_menu
    ;;
  * )
    ERROR "无效的输入。请重新输入${LIGHT_GREEN}Y or N ${RESET}的选项"
    DOCKER_PROXY_HTTP
    ;;
esac
}

function CHECK_DOCKER_PROXY() {
    local url=$1
    local http_proxy=$(docker info 2>/dev/null | grep -i "HTTP Proxy" | awk -F ': ' '{print $2}')
    local https_proxy=$(docker info 2>/dev/null | grep -i "HTTPS Proxy" | awk -F ': ' '{print $2}')

    if [[ "$http_proxy" == "http://$url" && "$https_proxy" == "http://$url" ]]; then
        INFO "Docker 代理${LIGHT_GREEN}配置成功${RESET}，当前 HTTP Proxy: ${LIGHT_CYAN}$http_proxy${RESET}, HTTPS Proxy: ${LIGHT_CYAN}$https_proxy${RESET}"
    else
        ERROR "Docker 代理${LIGHT_RED}配置失败${RESET}，请检查配置并重新执行配置"
        DOCKER_PROXY_HTTP
    fi
}

function ADD_DOCKERD_PROXY() {
mkdir -p /etc/systemd/system/docker.service.d

# 设置代理的函数
set_proxy_config() {
    cat > /etc/systemd/system/docker.service.d/http-proxy.conf <<EOF
[Service]
Environment="HTTP_PROXY=http://$url"
Environment="HTTPS_PROXY=http://$url"
EOF
    systemctl daemon-reload
    systemctl restart docker &>/dev/null
    CHECK_DOCKER
    CHECK_DOCKER_PROXY "$url"
}

# 检查并设置代理配置
if [ ! -f /etc/systemd/system/docker.service.d/http-proxy.conf ]; then
    # 如果配置文件不存在，直接设置代理
    set_proxy_config
else
    # 如果配置文件存在，检查是否有相同的代理配置
    if ! grep -q "HTTP_PROXY=http://$url" /etc/systemd/system/docker.service.d/http-proxy.conf || \
       ! grep -q "HTTPS_PROXY=http://$url" /etc/systemd/system/docker.service.d/http-proxy.conf; then
        # 配置文件存在，但没有相同的代理配置，添加新的代理配置
        set_proxy_config
    else
        WARN "已经存在相同的代理配置,${LIGHT_RED}请勿重复配置${RESET}"
    fi
fi
}


function DEL_DOCKERD_PROXY() {
check_proxy_config() {
    systemctl daemon-reload
    systemctl restart docker &>/dev/null
    CHECK_DOCKER
}

WARN "${BOLD}${LIGHT_GREEN}提示:${RESET} ${LIGHT_CYAN}移除本机Docker服务走代理，Docker镜像下载可能会失败!${RESET}"
read -e -p "$(INFO "是否移除本机Docker服务代理? ${PROMPT_YES_NO}")" del_proxy
case $del_proxy in
  [Yy]* )
    # 检查并设置代理配置
    if [ ! -f /etc/systemd/system/docker.service.d/http-proxy.conf ]; then
        # 如果配置文件不存在，打印提示
        INFO "本机Docker服务未配置代理"
    else
        # 如果配置文件存在，则进行删除并重启Docker服务
        rm -f /etc/systemd/system/docker.service.d/http-proxy.conf &>/dev/null
        check_proxy_config
        INFO "本机Docker服务代理已移除"
    fi
    ;;
  [Nn]* )
    WARN "退出移除本机Docker服务代理配置"
    main_menu
    ;;
  * )
    ERROR "无效的输入。请重新输入${LIGHT_GREEN}Y or N ${RESET}的选项"
    DOCKER_PROXY_HTTP
    ;;
esac
}


# 使用函数UPDATE_CONFIG时调用RESTART_CONTAINER
function RESTART_CONTAINER() {
    CHECK_COMPOSE_CMD
    $DOCKER_COMPOSE_CMD restart
    if [ $? -ne 0 ]; then
        ERROR "Docker 容器重启失败,请通过查看日志确认原因"
        exit 1
    fi
}

# 生成运行环境配置（.env：管理令牌 + 镜像地址）
function GEN_ENV() {
SEPARATOR "生成运行环境配置"
if [ -f "${PROXY_DIR}/.env" ]; then
    INFO ".env 已存在, 复用现有 GO_PROXY_ADMIN_TOKEN"
else
    local token
    if command -v openssl >/dev/null 2>&1; then
        token="$(openssl rand -hex 24)"
    else
        token="$(head -c 24 /dev/urandom | xxd -p | tr -d '\n')"
    fi
    cat > "${PROXY_DIR}/.env" <<EOF
# Docker 镜像加速管理 API 令牌 (请妥善保管, 切勿泄露)
GO_PROXY_ADMIN_TOKEN=$token

# 真实宿主机名（仪表盘「主机」展示用）。默认取安装时宿主机的 hostname，
# 如需修改可手动改成任意名称后重新 up -d。
HOST_NAME=$(hostname)

# 镜像地址 (可选覆盖, 等号右侧为默认值)
# 若构建时未选择 latest 标签, 请在此显式指定对应标签, 否则默认拉取 :latest 会失败
REGISTRY_IMAGE=dqzboy/registry:latest
UI_IMAGE=dqzboy/hubcmd-ui:latest
EOF
    chmod 600 "${PROXY_DIR}/.env"
    INFO "已生成 .env 并写入随机管理令牌"
fi
}

# 部署 Docker 镜像加速，直接拉取镜像启动，无需克隆仓库
function INSTALL_DOCKER_PROXY() {
SEPARATOR "部署 Docker 镜像加速"
CHECK_COMPOSE_CMD
# 选择下载源（国外/国内）
local COMPOSE_SRC="$GITRAW"
while true; do
    read -e -p "$(INFO "安装环境确认 [${LIGHT_GREEN}国外输1${RESET} ${LIGHT_YELLOW}国内输2${RESET}] > ")" install_src
    case "$install_src" in
        1 ) COMPOSE_SRC="$GITRAW"; break ;;
        2 ) COMPOSE_SRC="$CNGITRAW"; break ;;
        * ) INFO "请输入 ${LIGHT_GREEN}1${RESET} 表示国外 或者 ${LIGHT_YELLOW}2${RESET} 表示大陆" ;;
    esac
done

INFO "正在下载镜像版 compose 文件 ..."
wget -NP ${PROXY_DIR}/ ${COMPOSE_SRC}/${DOCKER_COMPOSE_FILE} &>/dev/null
if [ $? -ne 0 ]; then
    ERROR "下载 ${DOCKER_COMPOSE_FILE} 失败，请检查网络后重试"
    return 1
fi

GEN_ENV
PROXY_HTTP
INFO "拉取镜像并启动 Docker 镜像加速 ..."
$DOCKER_COMPOSE_CMD -f "${PROXY_DIR}/${DOCKER_COMPOSE_FILE}" up -d
if [ $? -ne 0 ]; then
    ERROR "服务启动失败，请通过查看日志确认原因: $DOCKER_COMPOSE_CMD -f ${PROXY_DIR}/${DOCKER_COMPOSE_FILE} logs"
    exit 1
fi
}

function STOP_REMOVE_CONTAINER() {
    CHECK_COMPOSE_CMD
    if [[ -f "${PROXY_DIR}/${DOCKER_COMPOSE_FILE}" ]]; then
        INFO "停止和移除所有容器"
        $DOCKER_COMPOSE_CMD -f "${PROXY_DIR}/${DOCKER_COMPOSE_FILE}" down --remove-orphans
    else 
        WARN "${LIGHT_YELLOW}容器目前未处于运行状态，无需进行删除操作！${RESET}"
        exit 1
    fi
}

# go-proxy 运行时配置文件（宿主机路径，由容器挂载 /app/config.d/config.yaml）
GO_PROXY_CONFIG="${PROXY_DIR}/config/go-proxy/config.yaml"
# go-proxy 出口代理写在 compose 的 go-proxy 服务环境变量里
COMPOSE_FILE="${PROXY_DIR}/${DOCKER_COMPOSE_FILE}"

# 校验 YAML 语法（依赖 python3 或 yq，缺失则跳过）
function VALIDATE_YAML() {
    local f="$1"
    if command -v python3 &>/dev/null; then
        if ! python3 -c "import yaml,sys; yaml.safe_load(open('$f'))" &>/dev/null; then
            ERROR "配置文件 YAML 语法校验失败，请检查刚做的修改！"
            return 1
        fi
    elif command -v yq &>/dev/null; then
        if ! yq '.' "$f" >/dev/null 2>&1; then
            ERROR "配置文件 YAML 语法校验失败，请检查刚做的修改！"
            return 1
        fi
    fi
    INFO "配置文件 YAML 语法校验通过。"
    return 0
}

# 1) 直接用编辑器打开 config.yaml 手动修改
function EDIT_CONFIG_FILE() {
    if [[ ! -f "$GO_PROXY_CONFIG" ]]; then
        ERROR "配置文件不存在: ${LIGHT_BLUE}${GO_PROXY_CONFIG}${RESET}"
        WARN "请先执行「安装服务」，配置会在首次启动时自动生成。"
        return 1
    fi
    local editor="${EDITOR:-${VISUAL:-vi}}"
    INFO "即将用 ${LIGHT_CYAN}${editor}${RESET} 打开配置文件"
    INFO "保存退出后生效；若想放弃修改，进入后直接 ${LIGHT_YELLOW}:q!${RESET} 退出即可"
    sleep 1
    "$editor" "$GO_PROXY_CONFIG"
    VALIDATE_YAML "$GO_PROXY_CONFIG"
}

# 2) 设置 Docker Hub 加速账号（仅 dockerhub 块含 username/password，全局替换安全）
function SET_DOCKERHUB_AUTH() {
    if [[ ! -f "$GO_PROXY_CONFIG" ]]; then
        ERROR "配置文件不存在: ${LIGHT_BLUE}${GO_PROXY_CONFIG}${RESET}"
        return 1
    fi
    echo
    INFO "设置 Docker Hub 账号密码，用于提升匿名拉取频率限制（留空则清除）"
    read -e -p "$(INFO "Docker Hub 用户名: ")" dh_user
    read -e -p "$(INFO "Docker Hub 密码 / Token: ")" dh_pass
    # 转义 sed 特殊字符（\ / & |）
    local u_esc pw_esc
    u_esc=$(printf '%s' "$dh_user" | sed -e 's/[\\/&|]/\\&/g')
    pw_esc=$(printf '%s' "$dh_pass" | sed -e 's/[\\/&|]/\\&/g')
    sed -i 's|^\([[:space:]]*\)username:.*|\1username: "'"${u_esc}"'"|' "$GO_PROXY_CONFIG"
    sed -i 's|^\([[:space:]]*\)password:.*|\1password: "'"${pw_esc}"'"|' "$GO_PROXY_CONFIG"
    VALIDATE_YAML "$GO_PROXY_CONFIG" || return 1
    if [[ -n "$dh_user" ]]; then
        INFO "Docker Hub 账号已写入: ${LIGHT_CYAN}${dh_user}${RESET}"
    else
        INFO "已清除 Docker Hub 账号配置"
    fi
}

# 3) 切换日志级别
function SET_LOG_LEVEL() {
    if [[ ! -f "$GO_PROXY_CONFIG" ]]; then
        ERROR "配置文件不存在: ${LIGHT_BLUE}${GO_PROXY_CONFIG}${RESET}"
        return 1
    fi
    echo
    echo -e "  1) ${BOLD}quiet${RESET}  - 仅输出错误"
    echo -e "  2) ${BOLD}normal${RESET} - 默认，跳过 blob 噪声"
    echo -e "  3) ${BOLD}debug${RESET}  - 输出全部请求"
    read -e -p "$(INFO "选择日志级别 > ")" ll_choice
    local lvl
    case "$ll_choice" in
        1) lvl=quiet ;;
        2) lvl=normal ;;
        3) lvl=debug ;;
        *) ERROR "无效选项"; return 1 ;;
    esac
    sed -i -E "s|^log_level:.*|log_level: ${lvl}|" "$GO_PROXY_CONFIG"
    VALIDATE_YAML "$GO_PROXY_CONFIG" || return 1
    INFO "日志级别已设置为: ${LIGHT_CYAN}${lvl}${RESET}"
}

# 4) 配置 go-proxy 容器出口代理（上游 registry 走本地代理访问）
#    注意：compose 中 go-proxy 与 hubcmd-ui 两个服务都有代理占位符，
#    必须用 awk 将修改限定在 go-proxy 服务块内，避免误伤 hubcmd-ui。
function SET_UPSTREAM_PROXY() {
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        ERROR "compose 文件不存在: ${LIGHT_BLUE}${COMPOSE_FILE}${RESET}"
        return 1
    fi
    echo
    INFO "为 go-proxy 容器配置出口代理，用于通过本地代理（如科学上网）访问上游 registry"
    echo -e "  1) ${BOLD}设置${RESET} 上游代理"
    echo -e "  2) ${BOLD}清除${RESET} 上游代理"
    read -e -p "$(INFO "选择操作 > ")" up_choice
    case "$up_choice" in
        1)
            read -e -p "$(INFO "输入代理地址 ${LIGHT_MAGENTA}(eg: 127.0.0.1:7890)${RESET}: ")" px
            while [[ -z "$px" ]]; do
                WARN "代理地址不能为空"
                read -e -p "$(INFO "输入代理地址: ")" px
            done
            local px_esc
            px_esc=$(printf '%s' "$px" | sed -e 's/[\\/&|]/\\&/g')
            awk -v px="$px_esc" '
                /^  go-proxy:/ { in_gp=1 }
                in_gp && /^  [a-zA-Z0-9_-]+:/ && $0 !~ /go-proxy:/ { in_gp=0 }
                in_gp && /^[[:space:]]*#? ?- HTTP_PROXY=http:\/\// {
                    sub(/^[[:space:]]*#? ?- HTTP_PROXY=http:\/\/.*/, "      - HTTP_PROXY=http://" px)
                }
                in_gp && /^[[:space:]]*#? ?- HTTPS_PROXY=http:\/\// {
                    sub(/^[[:space:]]*#? ?- HTTPS_PROXY=http:\/\/.*/, "      - HTTPS_PROXY=http://" px)
                }
                { print }
            ' "$COMPOSE_FILE" > "$COMPOSE_FILE.tmp" && mv "$COMPOSE_FILE.tmp" "$COMPOSE_FILE"
            INFO "已为 go-proxy 设置出口代理: ${LIGHT_CYAN}http://${px}${RESET}（需 up -d 生效）"
            ;;
        2)
            awk '
                /^  go-proxy:/ { in_gp=1 }
                in_gp && /^  [a-zA-Z0-9_-]+:/ && $0 !~ /go-proxy:/ { in_gp=0 }
                in_gp && /^[[:space:]]*- HTTP_PROXY=http:\/\// {
                    sub(/^[[:space:]]*- HTTP_PROXY=http:\/\/.*/, "      # - HTTP_PROXY=http://host:port")
                }
                in_gp && /^[[:space:]]*- HTTPS_PROXY=http:\/\// {
                    sub(/^[[:space:]]*- HTTPS_PROXY=http:\/\/.*/, "      # - HTTPS_PROXY=http://host:port")
                }
                { print }
            ' "$COMPOSE_FILE" > "$COMPOSE_FILE.tmp" && mv "$COMPOSE_FILE.tmp" "$COMPOSE_FILE"
            INFO "已清除 go-proxy 出口代理配置"
            ;;
        *) ERROR "无效选项"; return 1 ;;
    esac
}

# 应用 compose 配置变更（env 变化需 up -d 而非仅 restart）
function APPLY_COMPOSE_CHANGES() {
    CHECK_COMPOSE_CMD
    $DOCKER_COMPOSE_CMD -f "$COMPOSE_FILE" up -d
    if [ $? -ne 0 ]; then
        ERROR "服务更新失败，请通过日志确认原因: $DOCKER_COMPOSE_CMD -f $COMPOSE_FILE logs"
        return 1
    fi
    INFO "compose 配置已应用，服务已重启。"
}

# 更新配置：进入子菜单完成实际修改，退出时统一提示是否应用
function UPDATE_CONFIG() {
    local cfg_changed=0
    local compose_changed=0
    SEPARATOR "更新配置"
    echo
    WARN "建议：配置变更请优先在 ${LIGHT_CYAN}Hubcmd-UI 管理后台${RESET} 的 ${LIGHT_GREEN}『代理管理』${RESET} 中进行——后台自带校验与热更新，更安全不易出错。"
    WARN "通过本脚本直接修改配置文件属于 ${LIGHT_RED}高级应急操作${RESET}，${BOLD}不建议${RESET} 常规使用，请在确实无法访问后台时再继续。"
    echo
    read -e -p "$(WARN "是否仍要使用脚本修改配置? ${PROMPT_YES_NO}")" uc_confirm
    case "$uc_confirm" in
        y|Y ) INFO "已确认，继续进入脚本配置编辑。" ;;
        * ) WARN "已取消，返回主菜单。"; return ;;
    esac
    echo
    while true; do
        echo -e "  配置文件: ${LIGHT_BLUE}${GO_PROXY_CONFIG}${RESET}"
        echo
        echo -e "  1) ${BOLD}直接编辑${RESET} 加速服务配置 (config.yaml)"
        echo -e "  2) 设置 ${BOLD}Docker Hub 加速账号${RESET} (提升匿名拉取频率限制)"
        echo -e "  3) 切换 ${BOLD}日志级别${RESET} (quiet / normal / debug)"
        echo -e "  4) 配置 ${BOLD}上游 HTTP/HTTPS 代理${RESET} (go-proxy 容器出口)"
        echo -e "  0) ${LIGHT_YELLOW}返回${RESET} 主菜单"
        echo
        read -e -p "$(INFO "请选择操作 > ")" uc_choice
        case "$uc_choice" in
            1) EDIT_CONFIG_FILE; cfg_changed=1 ;;
            2) SET_DOCKERHUB_AUTH; cfg_changed=1 ;;
            3) SET_LOG_LEVEL; cfg_changed=1 ;;
            4) SET_UPSTREAM_PROXY; compose_changed=1 ;;
            0) break ;;
            *) ERROR "无效选项，请重新输入" ;;
        esac
        echo
    done

    if [[ "$cfg_changed" -eq 1 || "$compose_changed" -eq 1 ]]; then
        echo
        if [[ "$compose_changed" -eq 1 ]]; then
            read -e -p "$(WARN "检测到 compose 配置已变更，是否执行 ${LIGHT_CYAN}up -d${RESET} 应用并重启服务? ${PROMPT_YES_NO}")" apply_ch
        else
            read -e -p "$(WARN "是否重启服务以应用配置变更? ${PROMPT_YES_NO}")" apply_ch
        fi
        case "$apply_ch" in
            y|Y )
                if [[ "$compose_changed" -eq 1 ]]; then
                    APPLY_COMPOSE_CHANGES
                else
                    RESTART_CONTAINER
                fi
                INFO "配置已应用并生效。"
                ;;
            n|N )
                WARN "已保存配置修改，但未重启服务，变更将在下次重启后生效。"
                ;;
            * )
                INFO "请输入 ${LIGHT_GREEN}y${RESET} 或 ${LIGHT_YELLOW}n${RESET}" ;;
        esac
    else
        INFO "未做任何修改。"
    fi
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
    read -e -p "$(INFO "是否执行软件包安装? (${LIGHT_YELLOW}首次部署需安装依赖${RESET}) ${PROMPT_YES_NO}")" choice_package
    case "$choice_package" in
        y|Y )
            INSTALL_PACKAGE
            break;;
        n|N )
            WARN "跳过软件包安装步骤"
            break;;
        * )
            INFO "请输入 ${LIGHT_GREEN}y${RESET} 或 ${LIGHT_YELLOW}n${RESET}";;
    esac
done
}


function INSTALL_WEB() {
while true; do
    SEPARATOR "安装WEB服务"
    read -e -p "$(INFO "是否安装WEB服务? (用来通过域名方式访问加速服务) ${PROMPT_YES_NO}")" choice_service
    if [[ "$choice_service" =~ ^[YyNn]$ ]]; then
        if [[ "$choice_service" == "Y" || "$choice_service" == "y" ]]; then
            while true; do
                read -e -p "$(INFO "选择安装的WEB服务。安装${LIGHT_CYAN}Caddy可自动开启HTTPS${RESET} [Nginx/Caddy]: ")" web_service
                if [[ "$web_service" =~ ^(nginx|Nginx|caddy|Caddy)$ ]]; then
                    if [[ "$web_service" == "nginx" || "$web_service" == "Nginx" ]]; then
                        INSTALL_NGINX
                        CONFIG_NGINX
                        break
                    elif [[ "$web_service" == "caddy" || "$web_service" == "Caddy" ]]; then
                        INSTALL_CADDY
                        CONFIG_CADDY
                        break
                    fi
                else
                    WARN "请输入 ${LIGHT_CYAN}nginx${RESET} 或 ${LIGHT_BLUE}caddy${RESET}"
                fi
            done
            break
        else
            WARN "跳过WEB服务安装步骤"
            break
        fi
    else
        INFO "请输入 ${LIGHT_GREEN}y${RESET} 或 ${LIGHT_YELLOW}n${RESET}"
    fi
done
}

function PROMPT(){
PUBLIC_IP=$(curl -s https://ifconfig.me)
ALL_IPS=$(hostname -I)
INTERNAL_IP=$(echo "$ALL_IPS" | awk '$1!="127.0.0.1" && $1!="::1" && $1!="docker0" {print $1}')

echo
INFO "=================感谢您的耐心等待，安装已经完成=================="
INFO
INFO "请用浏览器访问管理面板(可在网页上增删改代理、热重载): "
INFO "公网访问地址: ${UNDERLINE}http://$PUBLIC_IP:30080/admin${RESET}"
INFO "内网访问地址: ${UNDERLINE}http://$INTERNAL_IP:30080/admin${RESET}"
INFO
INFO "Docker 镜像加速(直连, 按 Host 头路由 Docker Hub/GHCR/Quay/K8s/MCR/...): "
INFO "公网地址: ${UNDERLINE}http://$PUBLIC_IP:50000${RESET}"
INFO "内网地址: ${UNDERLINE}http://$INTERNAL_IP:50000${RESET}"
INFO
INFO "加速服务安装路径: ${LIGHT_BLUE}${PROXY_DIR}${RESET}"
INFO
INFO "服务对应监听端口(参考信息):"
INFO "Docker 镜像加速(go-proxy): 50000   │   管理面板(hubcmd-ui): 30080"
INFO
INFO "作者博客: https://dqzboy.com"
INFO "项目交流: https://t.me/Docker_Proxy"
INFO "代码仓库: https://github.com/dqzboy/Docker-Proxy"
INFO "合作联系: https://t.me/RelayHubBot"
INFO
INFO "若用云服务器并设域名及证书，需在安全组开放80、443端口；否则开放对应服务监听端口"
INFO
INFO "VPS推荐(AFF): https://dqzboy.github.io/proxyui/racknerd"
INFO
INFO "================================================================"
}

function INSTALL_PROXY() {
ALL_IN_ONE() {
CHECK_OS
CHECK_PACKAGE_MANAGER
CHECK_PKG_MANAGER
CHECK_COMPOSE_CMD
CHECKMEM
CHECKFIRE
CHECKBBR
PACKAGE
INSTALL_WEB
while true; do
    SEPARATOR "安装Docker"
    read -e -p "$(INFO "安装环境确认 [${LIGHT_GREEN}国外输1${RESET} ${LIGHT_YELLOW}国内输2${RESET}] > ")" deploy_docker
    case "$deploy_docker" in
        1 )
            INSTALL_DOCKER
            INSTALL_COMPOSE
            break;;
        2 )
            INSTALL_DOCKER_CN
            INSTALL_COMPOSE_CN
            break;;
        * )
            INFO "请输入 ${LIGHT_GREEN}1${RESET} 表示国外 或者 ${LIGHT_YELLOW}2${RESET} 表示大陆";;
    esac
done

INSTALL_DOCKER_PROXY
PROMPT
}



SEPARATOR "安装服务"
echo -e "1) 一键${BOLD}${LIGHT_GREEN}部署所有${RESET}服务"
echo -e "2) ${BOLD}返回${LIGHT_RED}主菜单${RESET}"
echo -e "0) ${BOLD}退出脚本${RESET}"
echo "---------------------------------------------------------------"
read -e -p "$(INFO "输入${LIGHT_CYAN}对应数字${RESET}并按${LIGHT_GREEN}Enter${RESET}键 > ")" proxy_install

case $proxy_install in
    1)
        ALL_IN_ONE
        ;;
    2)
        main_menu
        ;;
    0)
        exit 1
        ;;
    *)
        WARN "输入了无效的选择。请重新${LIGHT_GREEN}选择0-2${RESET}的选项."
        INSTALL_PROXY
        ;;
esac
}



function COMP_INST() {
SEPARATOR "安装组件"
echo -e "1) ${BOLD}安装${LIGHT_GREEN}环境依赖${RESET}"
echo -e "2) ${BOLD}安装${LIGHT_CYAN}Docker${RESET}"
echo -e "3) ${BOLD}安装${LIGHT_MAGENTA}Compose${RESET}"
echo -e "4) ${BOLD}安装${GREEN}Nginx${RESET}"
echo -e "5) ${BOLD}安装${LIGHT_BLUE}Caddy${RESET}"
echo -e "6) ${BOLD}配置${LIGHT_YELLOW}Nginx${RESET}"
echo -e "7) ${BOLD}配置${CYAN}Caddy${RESET}"
echo -e "8) ${BOLD}返回${LIGHT_RED}主菜单${RESET}"
echo -e "0) ${BOLD}退出脚本${RESET}"
echo "---------------------------------------------------------------"
read -e -p "$(INFO "输入${LIGHT_CYAN}对应数字${RESET}并按${LIGHT_GREEN}Enter${RESET}键 > ")"  comp_choice

case $comp_choice in
    1)
        CHECK_OS
        CHECK_PACKAGE_MANAGER
        CHECK_PKG_MANAGER
        CHECKMEM
        PACKAGE
        COMP_INST
        ;;
    2)
        CHECK_OS
        CHECK_PACKAGE_MANAGER
        CHECK_PKG_MANAGER
        while true; do
            SEPARATOR "安装Docker"
            read -e -p "$(INFO "安装环境确认 [${LIGHT_GREEN}国外输1${RESET} ${LIGHT_YELLOW}国内输2${RESET}] > ")" deploy_docker
            case "$deploy_docker" in
                1 )
                    INSTALL_DOCKER
                    break;;
                2 )
                    INSTALL_DOCKER_CN
                    break;;
                * )
                    INFO "请输入 ${LIGHT_GREEN}1${RESET} 表示国外 或者 ${LIGHT_YELLOW}2${RESET} 表示大陆";;
            esac
        done
        COMP_INST
        ;;
    3)
        CHECK_OS
        CHECK_PACKAGE_MANAGER
        CHECK_PKG_MANAGER
        CHECK_COMPOSE_CMD
        while true; do
            read -e -p "$(INFO "安装环境确认 [${LIGHT_GREEN}国外输1${RESET} ${LIGHT_YELLOW}国内输2${RESET}] > ")" deploy_compose
            case "$deploy_compose" in
                1 )
                    INSTALL_COMPOSE
                    break;;
                2 )
                    INSTALL_COMPOSE_CN
                    break;;
                * )
                    INFO "请输入 ${LIGHT_GREEN}1${RESET} 表示国外 或者 ${LIGHT_YELLOW}2${RESET} 表示大陆";;
            esac
        done
        COMP_INST
        ;;
    4)
        CHECK_OS
        CHECK_PACKAGE_MANAGER
        CHECK_PKG_MANAGER
        INSTALL_NGINX
        COMP_INST
        ;;
    5)
        CHECK_OS
        CHECK_PACKAGE_MANAGER
        CHECK_PKG_MANAGER
        INSTALL_CADDY
        COMP_INST
        ;;
    6)
        CONFIG_NGINX
        COMP_INST
        ;;
    7)
        CONFIG_CADDY
        COMP_INST
        ;;
    8)
        main_menu
        ;;
    0)
        exit 1
        ;;
    *)
        WARN "输入了无效的选择。请重新${LIGHT_GREEN}选择0-8${RESET}的选项."
        COMP_INST
        ;;
esac
}


function SVC_MGMT() {
CHECK_COMPOSE_CMD

RESTART_SERVICE() {
    CONTAINER_SERVICES

    selected_services=()

    WARN "重启服务请在${LIGHT_GREEN}${DOCKER_COMPOSE_FILE}${RESET}文件存储目录下执行脚本.默认安装路径: ${LIGHT_BLUE}${PROXY_DIR}${RESET}"
    
    PROXY_SVC_MENU
    read -e -p "$(INFO "输入序号选择对应服务,${LIGHT_YELLOW}空格分隔${RESET}多个选项. ${LIGHT_CYAN}all表示所有${RESET} > ")" restart_service
    
    while true; do
        if [[ "$restart_service" =~ ^[0-9]+([[:space:]][0-9]+)*$ ]]; then
            valid=true
            for choice in $restart_service; do
                if ((choice < 0 || choice > 10)); then
                    valid=false
                    break
                fi
            done
            if $valid; then
                break
            fi
        fi
        WARN "无效输入，请重新输入${LIGHT_YELLOW} 0-10 ${RESET}序号"
        read -e -p "$(INFO "输入序号选择对应服务,${LIGHT_YELLOW}空格分隔${RESET}多个选项. ${LIGHT_CYAN}all表示所有${RESET} > ")" restart_service
    done

    if [[ "$restart_service" == "10" ]]; then
        for service_name in "${services[@]}"; do
            if $DOCKER_COMPOSE_CMD ps --services 2>/dev/null | grep -q "^${service_name}$"; then
                selected_services+=("$service_name")               
            else
                WARN "服务 ${service_name}未运行，跳过重启。"
            fi
        done
        if [ ${#selected_services[@]} -eq 0 ]; then
            WARN "选择的服务未运行，无需进行重启"
        else
            INFO "更新的服务: ${selected_services[*]}"
        fi
    elif [[ "$restart_service" == "0" ]]; then
        WARN "退出重启服务!"
        SVC_MGMT
    else
        for choice in ${restart_service}; do
            if ((choice > 0 && choice <= ${#services[@]})); then
                service_name="${services[$((choice -1))]}"
                if $DOCKER_COMPOSE_CMD ps --services 2>/dev/null | grep -q "^${service_name}$"; then
                    selected_services+=("$service_name")                  
                else
                    WARN "服务 ${service_name} 未运行，跳过重启。"
                    
                fi
            else
                ERROR "无效的选择: $choice. 请重新${LIGHT_GREEN}选择0-9${RESET}的选项" 
                RESTART_SERVICE # 选择无效重新调用当前函数进行选择
            fi
        done
        if [ ${#selected_services[@]} -eq 0 ]; then
            WARN "选择的服务未运行，无需进行重启"
        else
            INFO "更新的服务: ${selected_services[*]}"
        fi
    fi
}

UPDATE_SERVICE() {
    CONTAINER_SERVICES
    selected_services=()
    WARN "更新服务请在${LIGHT_GREEN}${DOCKER_COMPOSE_FILE}${RESET}文件存储目录下执行脚本.默认安装路径: ${LIGHT_BLUE}${PROXY_DIR}${RESET}"

    PROXY_SVC_MENU
    read -e -p "$(INFO "输入序号选择对应服务,${LIGHT_YELLOW}空格分隔${RESET}多个选项. ${LIGHT_CYAN}all表示所有${RESET} > ")" update_service

    while true; do
        if [[ "$update_service" =~ ^[0-9]+([[:space:]][0-9]+)*$ ]]; then
            valid=true
            for choice in $update_service; do
                if ((choice < 0 || choice > 10)); then
                    valid=false
                    break
                fi
            done
            if $valid; then
                break
            fi
        fi
        WARN "无效输入，请重新输入${LIGHT_YELLOW} 0-10 ${RESET}序号"
        read -e -p "$(INFO "输入序号选择对应服务,${LIGHT_YELLOW}空格分隔${RESET}多个选项. ${LIGHT_CYAN}all表示所有${RESET} > ")" update_service
    done

    if [[ "$update_service" == "10" ]]; then
        for service_name in "${services[@]}"; do
            if $DOCKER_COMPOSE_CMD ps --services 2>/dev/null | grep -q "^${service_name}$"; then
                selected_services+=("$service_name")               
            else
                WARN "服务 ${service_name}未运行，跳过更新。"
            fi
        done
        if [ ${#selected_services[@]} -eq 0 ]; then
            WARN "选择的服务未运行，无法进行更新"
        else
            INFO "更新的服务: ${selected_services[*]}"
        fi
    elif [[ "$update_service" == "0" ]]; then
        WARN "退出更新服务!"
        SVC_MGMT
    else
        for choice in ${update_service}; do
            if ((choice > 0 && choice <= ${#services[@]})); then
                service_name="${services[$((choice -1))]}"
                if $DOCKER_COMPOSE_CMD ps --services 2>/dev/null | grep -q "^${service_name}$"; then
                    selected_services+=("$service_name")
                else
                    WARN "服务 ${service_name} 未运行，跳过更新。"
                    
                fi
            else
                ERROR "无效的选择: $choice. 请重新${LIGHT_GREEN}选择0-9${RESET}的选项"
                UPDATE_SERVICE # 选择无效重新调用当前函数进行选择
            fi
        done

        if [ ${#selected_services[@]} -eq 0 ]; then
            WARN "选择的服务未运行，无法进行更新"
        else
            INFO "更新的服务: ${selected_services[*]}"
        fi
    fi
}

CONTAIENR_LOGS() {
    CONTAINER_SERVICES
    selected_services=()
    PROXY_SER_MENU

    read -e -p "$(INFO "输入序号选择对应服务,${LIGHT_YELLOW}空格分隔${RESET}多个选项 > ")"  restart_service

    if  [[ "$restart_service" == "0" ]]; then
        WARN "退出查看容器服务日志操作!"
        SVC_MGMT
    else
        for choice in ${restart_service}; do
            if [[ $choice =~ ^[0-9]+$ ]] && ((choice >0 && choice <= ${#services[@]})); then
                service_name="${services[$((choice -1))]}"
                if $DOCKER_COMPOSE_CMD ps --services 2>/dev/null | grep -q "^${service_name}$"; then
                    selected_services+=("$service_name")
                else
                    WARN "服务 ${service_name} 未运行，无法查看容器日志。"
                fi
            else
                ERROR "无效的选择: $choice. 请重新${LIGHT_GREEN}选择0-9${RESET}的选项" 
                CONTAIENR_LOGS # 选择无效重新调用当前函数进行选择
            fi
        done
        if [ ${#selected_services[@]} -eq 0 ]; then
            WARN "选择的服务未运行，无法查看日志"
        else
            INFO "查看日志的服务: ${selected_services[*]}"
        fi     
    fi
}

### 启动新容器

### 启动新容器 END

SEPARATOR "服务管理"
echo -e "1) ${BOLD}${LIGHT_GREEN}重启${RESET}服务"
echo -e "2) ${BOLD}${LIGHT_CYAN}更新${RESET}服务"
echo -e "3) ${BOLD}${LIGHT_MAGENTA}查看${RESET}日志"
echo -e "4) ${BOLD}返回${LIGHT_RED}主菜单${RESET}"
echo -e "0) ${BOLD}退出脚本${RESET}"
echo "---------------------------------------------------------------"
read -e -p "$(INFO "输入${LIGHT_CYAN}对应数字${RESET}并按${LIGHT_GREEN}Enter${RESET}键 > ")" ser_choice

case $ser_choice in
    1)
        RESTART_SERVICE
        if [ ${#selected_services[@]} -eq 0 ]; then
            ERROR "没有需要重启的服务,请重新选择"
            RESTART_SERVICE
        else
            $DOCKER_COMPOSE_CMD stop ${selected_services[*]}
            $DOCKER_COMPOSE_CMD up -d --force-recreate ${selected_services[*]}
        fi
        SVC_MGMT
        ;;
    2)
        UPDATE_SERVICE
        if [ ${#selected_services[@]} -eq 0 ]; then
            ERROR "没有需要更新的服务,请重新选择"
            UPDATE_SERVICE
        else
            $DOCKER_COMPOSE_CMD pull ${selected_services[*]}
            $DOCKER_COMPOSE_CMD up -d --force-recreate ${selected_services[*]}
        fi
        SVC_MGMT
        ;;
    3)
        CONTAIENR_LOGS
        if [ ${#selected_services[@]} -eq 0 ]; then
            ERROR "没有需要查看的服务,请重新选择"
            CONTAIENR_LOGS
        else
            # 查看最近30条日志
            $DOCKER_COMPOSE_CMD logs --tail=30 ${selected_services[*]}
        fi
        SVC_MGMT
        ;;
    4)
        main_menu
        ;;
    0)
        exit 1
        ;;
    *)
        WARN "输入了无效的选择。请重新${LIGHT_GREEN}选择0-4${RESET}的选项."
        SVC_MGMT
        ;;
esac
}


function ADD_SYS_CMD() {
MAX_ATTEMPTS=3
attempt=0
success=false
TARGET_PATH="/usr/bin/hub"

INSTALL_ENV() {
    while true; do
        read -e -p "$(INFO "安装环境确认 [${LIGHT_GREEN}国外输1${RESET} ${LIGHT_YELLOW}国内输2${RESET}] > ")" sys_cmd
        case "$sys_cmd" in
            1 )
                DOWNLOAD_URL="https://raw.githubusercontent.com/dqzboy/Docker-Proxy/main/install/DockerProxy_Install.sh"
                break;;
            2 )
                DOWNLOAD_URL="https://cdn.jsdelivr.net/gh/dqzboy/Docker-Proxy/install/DockerProxy_Install.sh"                
                break;;
            * )
                INFO "请输入 ${LIGHT_GREEN}1${RESET} 表示国外 或者 ${LIGHT_YELLOW}2${RESET} 表示大陆";;
        esac
    done
}

INSTALL_OR_UPDATE_CMD() {
    local action=$1
    while [[ $attempt -lt $MAX_ATTEMPTS ]]; do
        attempt=$((attempt + 1))
        if [[ "$action" == "安装" ]]; then
            if command -v hub &> /dev/null; then
                INFO "系统命令已存在，无需安装。"
                success=true
                break
            fi
            WARN "正在安装脚本中,请稍等..."
        else
            WARN "正在进行脚本更新,请稍等..."
            if [ -f "$TARGET_PATH" ]; then
                rm -f "$TARGET_PATH" &>/dev/null
            fi
        fi
        
        wget -q -O "$TARGET_PATH" "$DOWNLOAD_URL" &>/dev/null
        if [ $? -eq 0 ]; then
            success=true
            chmod +x "$TARGET_PATH"
            break
        fi
        ERROR "${action}脚本${RED}失败${RESET}，正在尝试重新${action} (尝试次数: $attempt)"
    done

    if $success; then
        INFO "${action}脚本${GREEN}成功${RESET}，命令行输入 ${LIGHT_GREEN}hub${RESET} 运行"
    else
        ERROR "设置系统命令失败"
        exit 1
    fi
}

SEPARATOR "设置脚本为系统命令"
echo -e "1) ${BOLD}安装${LIGHT_GREEN}系统命令${RESET}"
echo -e "2) ${BOLD}更新${LIGHT_CYAN}系统命令${RESET}"
echo -e "3) ${BOLD}返回${LIGHT_RED}主菜单${RESET}"
echo -e "0) ${BOLD}退出脚本${RESET}"
echo "---------------------------------------------------------------"
read -e -p "$(INFO "输入${LIGHT_CYAN}对应数字${RESET}并按${LIGHT_GREEN}Enter${RESET}键 > ")" cmd_choice

case $cmd_choice in
    1)
        INSTALL_ENV
        INSTALL_OR_UPDATE_CMD "安装"
        ;;
    2)
        INSTALL_ENV
        INSTALL_OR_UPDATE_CMD "更新"
        ;;
    3)
        main_menu
        ;;
    0)
        exit 1
        ;;
    *)
        WARN "输入了无效的选择。请重新${LIGHT_GREEN}选择0-3${RESET}的选项."
        ADD_SYS_CMD
        ;;
esac
}


function UNI_DOCKER_SERVICE() {
CHECK_COMPOSE_CMD
RM_SERVICE() {
    selected_services=()
    CONTAINER_SERVICES
    PROXY_SVC_MENU

    read -e -p "$(INFO "输入序号删除服务,${LIGHT_YELLOW}空格分隔${RESET}多个选项. ${LIGHT_CYAN}10删除全部${RESET} > ")" rm_service
    while [[ ! "$rm_service" =~ ^([0-9]+[[:space:]]*)+$ ]]; do
        WARN "无效输入，请重新输入${LIGHT_YELLOW} 0-10 ${RESET}序号"
        read -e -p "$(INFO "输入序号删除服务,${LIGHT_YELLOW}空格分隔${RESET}多个选项. ${LIGHT_CYAN}10删除全部${RESET} > ")" rm_service
    done

    if [[ "$rm_service" == "0" ]]; then
        WARN "退出删除容器服务操作!"
        return
    fi

    if [[ "$rm_service" == "10" ]]; then
        selected_services=("${services[@]}")
    else
        for choice in ${rm_service}; do
            if [[ $choice =~ ^[0-9]+$ ]] && ((choice > 0 && choice <= ${#services[@]})); then
                selected_services+=("${services[$((choice - 1))]}")
            else
                WARN "无效输入，请重新输入${LIGHT_YELLOW} 0-10 ${RESET}序号"
                RM_SERVICE
                return
            fi
        done
    fi

    # 一次性删除所有选中的服务
    if [ ${#selected_services[@]} -gt 0 ]; then
        INFO "删除的服务: ${LIGHT_RED}${selected_services[*]}${RESET}"
        $DOCKER_COMPOSE_CMD down ${selected_services[*]}
    fi
}

RM_ALLSERVICE() {
STOP_REMOVE_CONTAINER
REMOVE_NONE_TAG
docker rmi --force $(docker images -q ${IMAGE_NAME}) &>/dev/null
docker rmi --force $(docker images -q ${UI_IMAGE_NAME}) &>/dev/null
if [ -d "${PROXY_DIR}" ]; then
    rm -rf "${PROXY_DIR}" &>/dev/null
fi
if [ -f "/usr/bin/hub" ]; then
    rm -f /usr/bin/hub &>/dev/null
fi
INFO "${LIGHT_YELLOW}感谢您的使用，Docker-Proxy服务已卸载。欢迎您再次使用！${RESET}"
SEPARATOR "DONE"
}

CONFIREM_ACTION() {
    local action_name=$1
    local action_function=$2

    WARN "${LIGHT_RED}注意:${RESET} ${LIGHT_YELLOW}卸载服务会一同将本地的配置和对应服务删除，请执行删除之前确定是否需要备份本地的配置文件${RESET}"
    while true; do
        read -e -p "$(INFO "本人${LIGHT_RED}已知晓后果,确认${action_name}${RESET}服务? ${PROMPT_YES_NO}")" uniservice
        case "$uniservice" in
            y|Y )
                $action_function
                break;;
            n|N )
                WARN "退出${action_name}服务."
                break;;
            * )
                INFO "请输入 ${LIGHT_GREEN}y${RESET} 或 ${LIGHT_YELLOW}n${RESET}";;
        esac
    done
}

SEPARATOR "卸载服务"
echo -e "1) ${BOLD}卸载${LIGHT_YELLOW}所有服务${RESET}"
echo -e "2) ${BOLD}删除${LIGHT_CYAN}指定服务${RESET}"
echo -e "3) ${BOLD}返回${LIGHT_RED}主菜单${RESET}"
echo -e "0) ${BOLD}退出脚本${RESET}"
echo "---------------------------------------------------------------"
read -e -p "$(INFO "输入${LIGHT_CYAN}对应数字${RESET}并按${LIGHT_GREEN}Enter${RESET}键 > ")" rm_choice

case $rm_choice in
    1)
        CONFIREM_ACTION "卸载所有" RM_ALLSERVICE
        ;;
    2)
        CONFIREM_ACTION "删除指定" RM_SERVICE
        UNI_DOCKER_SERVICE
        ;;
    3)
        main_menu
        ;;
    0)
        exit 1
        ;;
    *)
        WARN "输入了无效的选择。请重新${LIGHT_GREEN}选择0-3${RESET}的选项."
        UNI_DOCKER_SERVICE
        ;;
esac
}



# 本机Docker代理
function DOCKER_PROXY() {
SEPARATOR "Docker服务代理"
echo -e "1) ${BOLD}${LIGHT_GREEN}添加${RESET}本机Docker代理"
echo -e "2) ${BOLD}${YELLOW}移除${RESET}本机Docker代理"
echo -e "3) ${BOLD}返回${LIGHT_RED}主菜单${RESET}"
echo -e "0) ${BOLD}退出脚本${RESET}"
echo "---------------------------------------------------------------"
read -e -p "$(INFO "输入${LIGHT_CYAN}对应数字${RESET}并按${LIGHT_GREEN}Enter${RESET}键 > ")" main_choice

case $main_choice in
    1)
        DOCKER_PROXY_HTTP
        ADD_DOCKERD_PROXY
        DOCKER_PROXY
        ;;
    2)
        DEL_DOCKERD_PROXY
        DOCKER_PROXY
        ;;
    3)
        main_menu
        ;;
    0)
        exit 1
        ;;
    *)
        WARN "输入了无效的选择。请重新${LIGHT_GREEN}选择0-3${RESET}的选项."
        sleep 2; DOCKER_PROXY
        ;;
esac
}

# IP 黑白名单
function IP_BLACKWHITE_LIST() {
    if ! command -v iptables &> /dev/null
    then
        WARN "iptables 未安装. 请安装后再运行此脚本."
        exit 1
    fi
    IPTABLES=$(which iptables)

    BLACKLIST_CHAIN="IP_BLACKLIST"
    WHITELIST_CHAIN="IP_WHITELIST"
    WHITELIST_FILE="/etc/firewall/whitelist.txt"
    BLACKLIST_FILE="/etc/firewall/blacklist.txt"

    # 确保文件存在
    mkdir -p /etc/firewall
    touch $WHITELIST_FILE $BLACKLIST_FILE

    get_chain_name() {
        local chain=$1
        case $chain in
            $BLACKLIST_CHAIN) echo "黑名单" ;;
            $WHITELIST_CHAIN) echo "白名单" ;;
            *) echo "未知名单" ;;
        esac
    }

    create_chains() {
        $IPTABLES -N $BLACKLIST_CHAIN 2>/dev/null
        $IPTABLES -N $WHITELIST_CHAIN 2>/dev/null
    }

    check_ip() {
        local ip=$1
        local ipv4_regex='^([0-9]{1,3}\.){3}[0-9]{1,3}$'
        local ipv6_regex='^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$'
        
        if [[ $ip =~ $ipv4_regex ]] || [[ $ip =~ $ipv6_regex ]]; then
            return 0
        else
            return 1
        fi
    }

    ip_exists_in_file() {
        local ip=$1
        local file=$2
        grep -q "^$ip$" "$file"
        return $?
    }

    add_ips_to_file() {
        local ips=("$@")
        local file="${ips[-1]}"
        unset 'ips[-1]'
        local chain_name=$(get_chain_name $([[ $file == $WHITELIST_FILE ]] && echo $WHITELIST_CHAIN || echo $BLACKLIST_CHAIN))
        local added=()
        local skipped=()

        for ip in "${ips[@]}"; do
            if ! ip_exists_in_file $ip $file; then
                echo $ip >> "$file"
                added+=("$ip")
            else
                skipped+=("$ip")
            fi
        done

        if [ ${#added[@]} -gt 0 ]; then
            INFO "${LIGHT_BLUE}${added[*]}${RESET} ${LIGHT_GREEN}已添加${RESET}到$chain_name"
        fi
        if [ ${#skipped[@]} -gt 0 ]; then
            WARN "${LIGHT_BLUE}${skipped[*]}${RESET} ${LIGHT_YELLOW}已存在${RESET}于$chain_name，跳过添加"
        fi
    }

    remove_ips_from_file() {
        local ips=("$@")
        local file="${ips[-1]}"
        unset 'ips[-1]'
        local chain_name=$(get_chain_name $([[ $file == $WHITELIST_FILE ]] && echo $WHITELIST_CHAIN || echo $BLACKLIST_CHAIN))
        local removed=()
        local not_found=()

        for ip in "${ips[@]}"; do
            if ip_exists_in_file $ip $file; then
                sed -i "/^$ip$/d" "$file"
                removed+=("$ip")
            else
                not_found+=("$ip")
            fi
        done

        if [ ${#removed[@]} -gt 0 ]; then
            INFO "${LIGHT_BLUE}${removed[*]}${RESET} ${LIGHT_RED}已从${RESET}$chain_name${LIGHT_RED}移除${RESET}"
        fi
        if [ ${#not_found[@]} -gt 0 ]; then
            WARN "${LIGHT_BLUE}${not_found[*]}${RESET} ${LIGHT_YELLOW}不存在${RESET}于$chain_name，无需移除"
        fi
    }

    list_ips_in_file() {
        local file=$1
        local chain_name=$(get_chain_name $([[ $file == $WHITELIST_FILE ]] && echo $WHITELIST_CHAIN || echo $BLACKLIST_CHAIN))

        echo "---------------------------------------------------------------"
        echo "当前${chain_name}中的IP列表："
        cat "$file"
    }

    apply_ip_list() {
        local chain=$1
        local file=$2
        local action=$3

        # 清空链
        $IPTABLES -F $chain

        # 使用 iptables-restore 批量应用规则
        {
            echo "*filter"
            echo ":$chain - [0:0]"
            while IFS= read -r ip; do
                echo "-A $chain -s $ip -j $action"
            done < "$file"
            echo "COMMIT"
        } | $IPTABLES-restore -n
    }

    ensure_default_deny_for_whitelist() {
        if ! $IPTABLES -C $WHITELIST_CHAIN -j DROP &>/dev/null; then
            $IPTABLES -A $WHITELIST_CHAIN -j DROP
        fi
    }

    whitelist_is_empty() {
        [ ! -s "$WHITELIST_FILE" ]
    }

    apply_whitelist() {
        if whitelist_is_empty; then
            WARN "白名单为空，不应用白名单规则以避免锁定系统。"
            return 1
        fi
        
        if ! $IPTABLES -C INPUT -j $WHITELIST_CHAIN &>/dev/null; then
            $IPTABLES -I INPUT 1 -j $WHITELIST_CHAIN
            INFO "已将白名单规则应用到 INPUT 链"
        else
            INFO "白名单规则已经应用到 INPUT 链"
        fi
        apply_ip_list $WHITELIST_CHAIN $WHITELIST_FILE ACCEPT
        ensure_default_deny_for_whitelist
        return 0
    }

    switch_to_whitelist() {
        $IPTABLES -D INPUT -j $BLACKLIST_CHAIN 2>/dev/null
        INFO "${LIGHT_YELLOW}已切换到白名单模式，请注意：请在添加IP后手动应用规则${RESET}"
    }

    switch_to_blacklist() {
        $IPTABLES -D INPUT -j $WHITELIST_CHAIN 2>/dev/null
        $IPTABLES -I INPUT 1 -j $BLACKLIST_CHAIN
        apply_ip_list $BLACKLIST_CHAIN $BLACKLIST_FILE DROP
        INFO "${LIGHT_YELLOW}已切换到黑名单模式${RESET}"
    }

    handle_whitelist() {
        create_chains
        
        local whitelist_mode_active=false
        local whitelist_rules_applied=false

        if $IPTABLES -C INPUT -j $WHITELIST_CHAIN &>/dev/null; then
            whitelist_mode_active=true
            whitelist_rules_applied=true
        elif $IPTABLES -C INPUT -j $BLACKLIST_CHAIN &>/dev/null; then
            read -e -p "$(WARN "${LIGHT_YELLOW}当前使用黑名单模式${RESET},${LIGHT_CYAN}是否切换到白名单模式？(y/n)${RESET}: ")" switch
            if [[ $switch == "y" ]]; then
                switch_to_whitelist
                whitelist_mode_active=true
                whitelist_rules_applied=false
            else
                WARN "保持在黑名单模式，返回主菜单。"
                return
            fi
        else
            switch_to_whitelist
            whitelist_mode_active=true
            whitelist_rules_applied=false
        fi

        while true; do
            echo "---------------------------------------------------------------"
            echo -e "1) ${BOLD}添加IP到白名单${RESET}"
            echo -e "2) ${BOLD}从白名单移除IP${RESET}"
            echo -e "3) ${BOLD}查看当前白名单${RESET}"
            echo -e "4) ${BOLD}应用白名单规则${RESET}"
            echo -e "5) ${BOLD}返回上一级${RESET}"
            echo "---------------------------------------------------------------"
            read -e -p "$(INFO "输入${LIGHT_CYAN}对应数字${RESET}并按${LIGHT_GREEN}Enter${RESET}键 > ")" whitelist_choice

            case $whitelist_choice in
                1)
                    read -e -p "$(INFO "${LIGHT_CYAN}请输入要添加到白名单的IP (用逗号分隔多个IP)${RESET}: ")" ips
                    IFS=',' read -ra ip_array <<< "$ips"
                    valid_ips=()
                    for ip in "${ip_array[@]}"; do
                        if check_ip $ip; then
                            valid_ips+=("$ip")
                        else
                            WARN "无效IP: $ip"
                        fi
                    done
                    if [ ${#valid_ips[@]} -gt 0 ]; then
                        add_ips_to_file "${valid_ips[@]}" "$WHITELIST_FILE"
                        whitelist_rules_applied=false
                    fi
                    ;;
                2)
                    read -e -p "$(INFO "${LIGHT_CYAN}请输入要从白名单移除的IP (用逗号分隔多个IP)${RESET}: ")" ips
                    IFS=',' read -ra ip_array <<< "$ips"
                    valid_ips=()
                    for ip in "${ip_array[@]}"; do
                        if check_ip $ip; then
                            valid_ips+=("$ip")
                        else
                            WARN "无效IP: $ip"
                        fi
                    done
                    if [ ${#valid_ips[@]} -gt 0 ]; then
                        remove_ips_from_file "${valid_ips[@]}" "$WHITELIST_FILE"
                        whitelist_rules_applied=false
                    fi
                    ;;
                3)
                    list_ips_in_file $WHITELIST_FILE
                    ;;
                4)
                    if apply_whitelist; then
                        whitelist_rules_applied=true
                        INFO "${LIGHT_GREEN}白名单规则已成功应用${RESET}"
                    else
                        WARN "${LIGHT_YELLOW}无法应用白名单规则${RESET}"
                    fi
                    ;;
                5)
                    if ! $whitelist_rules_applied; then
                        read -e -p "$(WARN "${LIGHT_YELLOW}白名单规则尚未应用。您确定要退出吗？${RESET} (y/n): ")" confirm
                        if [[ $confirm != "y" ]]; then
                            continue
                        fi
                    fi
                    return
                    ;;
                *)
                    WARN "输入了无效的选择。请重新${LIGHT_GREEN}选择1-5${RESET}的选项."
                    ;;
            esac
        done
    }

    handle_blacklist() {
        create_chains
        
        local blacklist_mode_active=false
        if $IPTABLES -C INPUT -j $BLACKLIST_CHAIN &>/dev/null; then
            blacklist_mode_active=true
        elif $IPTABLES -C INPUT -j $WHITELIST_CHAIN &>/dev/null; then
            read -e -p "$(WARN "${LIGHT_YELLOW}当前使用白名单模式${RESET},${LIGHT_CYAN}是否切换到黑名单模式？(y/n)${RESET}: ")" switch
            if [[ $switch == "y" ]]; then
                switch_to_blacklist
                blacklist_mode_active=true
            else
                WARN "保持在白名单模式，返回主菜单。"
                return
            fi
        else
            switch_to_blacklist
            blacklist_mode_active=true
        fi

        while true; do
            echo "---------------------------------------------------------------"
            echo -e "1) ${BOLD}添加IP到黑名单${RESET}"
            echo -e "2) ${BOLD}从黑名单移除IP${RESET}"
            echo -e "3) ${BOLD}查看当前黑名单${RESET}"
            echo -e "4) ${BOLD}返回上一级${RESET}"
            echo "---------------------------------------------------------------"
            read -e -p "$(INFO "输入${LIGHT_CYAN}对应数字${RESET}并按${LIGHT_GREEN}Enter${RESET}键 > ")" blacklist_choice

            case $blacklist_choice in
                1)
                    read -e -p "$(INFO "${LIGHT_CYAN}请输入要添加到黑名单的IP (用逗号分隔多个IP)${RESET}: ")" ips
                    IFS=',' read -ra ip_array <<< "$ips"
                    valid_ips=()
                    for ip in "${ip_array[@]}"; do
                        if check_ip $ip; then
                            valid_ips+=("$ip")
                        else
                            WARN "无效IP: $ip"
                        fi
                    done
                    if [ ${#valid_ips[@]} -gt 0 ]; then
                        add_ips_to_file "${valid_ips[@]}" "$BLACKLIST_FILE"
                        apply_ip_list $BLACKLIST_CHAIN $BLACKLIST_FILE DROP
                    fi
                    ;;
                2)
                    read -e -p "$(INFO "${LIGHT_CYAN}请输入要从黑名单移除的IP (用逗号分隔多个IP)${RESET}: ")" ips
                    IFS=',' read -ra ip_array <<< "$ips"
                    valid_ips=()
                    for ip in "${ip_array[@]}"; do
                        if check_ip $ip; then
                            valid_ips+=("$ip")
                        else
                            WARN "无效IP: $ip"
                        fi
                    done
                    if [ ${#valid_ips[@]} -gt 0 ]; then
                        remove_ips_from_file "${valid_ips[@]}" "$BLACKLIST_FILE"
                        apply_ip_list $BLACKLIST_CHAIN $BLACKLIST_FILE DROP
                    fi
                    ;;
                3)
                    list_ips_in_file $BLACKLIST_FILE
                    ;;
                4)
                    return
                    ;;
                *)
                    WARN "输入了无效的选择。请重新${LIGHT_GREEN}选择1-4${RESET}的选项."
                    ;;
            esac
        done
    }

    while true; do
        SEPARATOR "设置IP黑白名单"
        echo -e "1) ${BOLD}管理${LIGHT_GREEN}白名单${RESET}"
        echo -e "2) ${BOLD}管理${LIGHT_CYAN}黑名单${RESET}"
        echo -e "3) ${BOLD}返回${LIGHT_RED}主菜单${RESET}"
        echo -e "0) ${BOLD}退出脚本${RESET}"
        echo "---------------------------------------------------------------"
        read -e -p "$(INFO "输入${LIGHT_CYAN}对应数字${RESET}并按${LIGHT_GREEN}Enter${RESET}键 > ")" ipblack_choice

        case $ipblack_choice in
            1)
                handle_whitelist
                ;;
            2)
                handle_blacklist
                ;;
            3)
                main_menu
                ;;
            0)
                exit 0
                ;;
            *)
                WARN "输入了无效的选择。请重新${LIGHT_GREEN}选择0-3${RESET}的选项."
                ;;
        esac
    done
}


# 重置 Hubcmd-UI 管理面板用户密码（应急恢复，需 root，不走 Web 端）
# 安全说明：
#  - 必须 root 且能登录服务器才能执行，密码重置能力不暴露于公网，比 Web 找回密码更安全。
#  - 复用容器内 bcrypt(cost=10) 生成哈希，与程序自身登录校验完全一致，不降低加密强度。
#  - 密码不回显、不写入命令行参数（通过标准输入传入容器，避开特殊字符转义与进程参数泄露）；
#    重置后清除该用户会话，强制使用新密码重新登录。
function RESET_USER_PASSWORD() {
    CHECK_COMPOSE_CMD
    local db_host="${PROXY_DIR}/data/hubcmd-ui/app.db"

    if [[ ! -f "$db_host" ]]; then
        ERROR "未找到数据库文件: ${LIGHT_BLUE}$db_host${RESET}"
        ERROR "请确认已部署 Hubcmd-UI 且至少成功启动过一次（数据库已初始化）。"
        return 1
    fi

    WARN "此操作将${LIGHT_RED}直接修改数据库${RESET}中指定用户的登录密码，仅作为${BOLD}忘记密码时的应急恢复${RESET}手段。"
    WARN "执行后该用户的${LIGHT_YELLOW}所有已登录会话会被强制注销${RESET}，需用新密码重新登录。"

    read -e -p "$(INFO "请输入要重置密码的用户名: ")" ru_user
    while [[ -z "$ru_user" ]]; do
        WARN "用户名不能为空"
        read -e -p "$(INFO "请输入要重置密码的用户名: ")" ru_user
    done

    local ru_pw ru_pw2
    while true; do
        read -s -p "$(INFO "请输入新密码(8-16位,需含字母+数字+特殊字符): ")" ru_pw
        echo
        read -s -p "$(INFO "请再次输入新密码确认: ")" ru_pw2
        echo
        if [[ -z "$ru_pw" ]]; then
            ERROR "密码不能为空，请重新输入。"
            continue
        fi
        if [[ "$ru_pw" != "$ru_pw2" ]]; then
            ERROR "两次输入的密码不一致，请重新输入。"
            continue
        fi
        break
    done

    read -e -p "$(WARN "确认将用户 ${LIGHT_CYAN}${ru_user}${RESET} 的密码重置? 操作不可撤销 ${PROMPT_YES_NO}")" ru_confirm
    case "$ru_confirm" in
        y|Y ) ;;
        * ) WARN "已取消操作。"; return ;;
    esac

    # 容器内执行的 Node 脚本：用户名从环境变量读取，密码从标准输入读取
    # （标准输入传密码可彻底避开双引号/美元符等特殊字符导致的 shell 转义与进程参数泄露）
    local tmpjs
    tmpjs="$(mktemp /tmp/ru_reset.XXXXXX.js)"
    cat > "$tmpjs" <<'RU_EOF'
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const username = process.env.RU;
const pw = fs.readFileSync(0, "utf8").trim();
if (!username || !pw) { console.error("缺少用户名或密码参数"); process.exit(1); }
const sq = String.fromCharCode(39);
const dq = String.fromCharCode(34);
const special = ".,\\-_+=()[\\]{}|\\;:" + sq + dq + "<>?/@$!%*#&";
const re = new RegExp("^(?=.*[A-Za-z])(?=.*\\d)(?=.*[" + special + "])[A-Za-z\\d" + special + "]{8,16}$");
if (!re.test(pw)) { console.error("密码不符合复杂度要求（8-16位，需同时包含字母、数字、特殊字符）"); process.exit(3); }
const db = new sqlite3.Database("/app/data/app.db");
db.get("SELECT id FROM users WHERE username = ?", [username], function(err, row) {
  if (err) { console.error("查询用户失败: " + err.message); process.exit(1); }
  if (!row) { console.error("用户不存在: " + username); process.exit(2); }
  bcrypt.hash(pw, 10).then(function(hash) {
    db.run("UPDATE users SET password = ?, updated_at = ? WHERE username = ?", [hash, new Date().toISOString(), username], function(e2) {
      if (e2) { console.error("更新密码失败: " + e2.message); process.exit(1); }
      const pat = "%" + dq + "username" + dq + ":" + dq + username + dq + "%";
      db.run("DELETE FROM sessions WHERE sess LIKE ?", [pat], function() {
        console.log("OK: 用户 " + username + " 密码已重置，请使用新密码重新登录（旧会话已失效）");
        db.close();
      });
    });
  }).catch(function(e) { console.error("生成密码哈希失败: " + e.message); process.exit(1); });
});
RU_EOF

    local ru_out rc
    local running
    running=$($DOCKER_COMPOSE_CMD ps -q hubcmd-ui 2>/dev/null)
    if [[ -z "$running" ]]; then
        WARN "hubcmd-ui 容器未运行，尝试启动服务以执行重置..."
        $DOCKER_COMPOSE_CMD up -d hubcmd-ui >/dev/null 2>&1
        running=$($DOCKER_COMPOSE_CMD ps -q hubcmd-ui 2>/dev/null)
        if [[ -z "$running" ]]; then
            ERROR "无法启动 hubcmd-ui 容器，重置中止。"
            rm -f "$tmpjs"
            return 1
        fi
    fi

    # 脚本通过 docker cp 传入容器，密码通过标准输入传入，均不进入命令行参数
    docker cp "$tmpjs" hubcmd-ui:/tmp/ru_reset.js >/dev/null 2>&1
    ru_out=$(printf '%s' "$ru_pw" | $DOCKER_COMPOSE_CMD exec -T -e RU="$ru_user" hubcmd-ui node /tmp/ru_reset.js 2>&1)
    rc=$?
    # 清理容器内临时脚本（尽力而为）
    $DOCKER_COMPOSE_CMD exec -T hubcmd-ui rm -f /tmp/ru_reset.js >/dev/null 2>&1
    rm -f "$tmpjs"

    if [[ $rc -eq 0 ]]; then
        INFO "${ru_out}"
    else
        ERROR "重置失败（退出码 $rc）：${ru_out}"
        return 1
    fi
}


# 其他工具
function OtherTools() {
SEPARATOR "其他工具"
echo -e "1) 设置${BOLD}${YELLOW}系统命令${RESET}"
echo -e "2) 配置${BOLD}${LIGHT_MAGENTA}IP黑白名单${RESET}"
echo -e "3) 重置${BOLD}${LIGHT_GREEN}管理面板用户密码${RESET}"
echo -e "4) ${BOLD}返回${LIGHT_RED}主菜单${RESET}"
echo -e "0) ${BOLD}退出脚本${RESET}"
echo "---------------------------------------------------------------"
read -e -p "$(INFO "输入${LIGHT_CYAN}对应数字${RESET}并按${LIGHT_GREEN}Enter${RESET}键 > ")" main_choice

case $main_choice in
    1)
        ADD_SYS_CMD
        ;;
    2)
        IP_BLACKWHITE_LIST
        ;;
    3)
        RESET_USER_PASSWORD
        OtherTools
        ;;
    4)
        main_menu
        ;;
    0)
        exit 1
        ;;
    *)
        WARN "输入了无效的选择。请重新${LIGHT_GREEN}选择0-4${RESET}的选项."
        sleep 2; OtherTools
        ;;
esac
}

## 主菜单
function main_menu() {
echo -e "╔════════════════════════════════════════════════════╗"
echo -e "║                                                    ║"
echo -e "║                ${LIGHT_CYAN}欢迎使用Docker-Proxy${RESET}                ║"
echo -e "║                                                    ║"
echo -e "║        TG交流群: ${UNDERLINE}https://t.me/Docker_Proxy${RESET}         ║"
echo -e "║                                                    ║"
echo -e "║                                       ${LIGHT_BLUE}by dqzboy${RESET}    ║"
echo -e "║                                                    ║"
echo -e "╚════════════════════════════════════════════════════╝"
echo
SEPARATOR "请选择操作"
echo -e "1) ${BOLD}${LIGHT_GREEN}安装${RESET}服务"
echo -e "2) ${BOLD}${LIGHT_MAGENTA}组件${RESET}安装"
echo -e "3) ${BOLD}${LIGHT_YELLOW}管理${RESET}服务"
echo -e "4) ${BOLD}${LIGHT_CYAN}更新${RESET}配置"
echo -e "5) ${BOLD}${LIGHT_RED}卸载${RESET}服务"
echo -e "6) 本机${BOLD}${CYAN}Docker代理${RESET}"
echo -e "7) 其他${BOLD}${YELLOW}工具${RESET}"
echo -e "0) ${BOLD}退出脚本${RESET}"
echo "---------------------------------------------------------------"
read -e -p "$(INFO "输入${LIGHT_CYAN}对应数字${RESET}并按${LIGHT_GREEN}Enter${RESET}键 > ")" main_choice

case $main_choice in
    1)
        INSTALL_PROXY
        ;;
    2)
        COMP_INST
        ;;
    3)
        SVC_MGMT
        ;;
    4)
        UPDATE_CONFIG
        ;;
    5)
        UNI_DOCKER_SERVICE
        ;;
    6)
        DOCKER_PROXY
        ;;
    7)
        OtherTools
        ;;
    0)
        exit 1
        ;;
    *)
        WARN "输入了无效的选择。请重新${LIGHT_GREEN}选择0-7${RESET}的选项."
        sleep 2; main_menu
        ;;
esac
}
main_menu