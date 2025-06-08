// VNC实例申请系统 - 真实后端交互版本
var currentInstanceId = null;
var statusCheckInterval = null;
var heartbeatInterval = null;

// 申请实例
function applyInstance(instanceType) {
    var statusDiv = document.getElementById('status-message');
    var applyBtn = document.getElementById('apply-btn');

    // 显示申请中状态
    statusDiv.innerHTML = '<font size="2" color="#ff6600" class="blinking">正在提交申请请求...</font>';
    applyBtn.disabled = true;
    applyBtn.value = '处理中...';
    applyBtn.className = 'btn-disabled';

    // 发送申请请求到后端
    fetch('/api/apply-instance', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            instanceType: instanceType
        })
    })
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        if (data.success) {
            currentInstanceId = data.instanceId;
            statusDiv.innerHTML =
                '<font size="2" color="#ff6600" class="blinking">申请成功！正在创建实例...</font><br>' +
                '<font size="2">实例ID: ' + data.instanceId + '</font><br>' +
                '<font size="1" color="#666666">预计需要2-3分钟，请耐心等待</font>';

            // 开始轮询状态
            startStatusPolling(data.instanceId);

            console.log('BEEP! 申请提交成功');
        } else {
            statusDiv.innerHTML =
                '<div class="error-message">' +
                '<font size="2">✗ 申请失败</font><br>' +
                '<font size="2">错误: ' + data.error + '</font><br>' +
                '<font size="1" color="#666666">请稍后重试或联系技术支持</font>' +
                '</div>';

            // 恢复按钮状态
            setTimeout(function() {
                applyBtn.disabled = false;
                applyBtn.value = '申请实例';
                applyBtn.className = 'btn-enabled';
            }, 3000);

            console.log('ERROR BEEP! 申请失败');
        }
    })
    .catch(function(error) {
        console.error('申请请求失败:', error);
        statusDiv.innerHTML =
            '<div class="error-message">' +
            '<font size="2">✗ 网络错误</font><br>' +
            '<font size="2">无法连接到服务器</font><br>' +
            '<font size="1" color="#666666">请检查网络连接后重试</font>' +
            '</div>';

        // 恢复按钮状态
        setTimeout(function() {
            applyBtn.disabled = false;
            applyBtn.value = '申请实例';
            applyBtn.className = 'btn-enabled';
        }, 3000);
    });
}

// 开始状态轮询
function startStatusPolling(instanceId) {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }

    statusCheckInterval = setInterval(function() {
        checkInstanceStatus(instanceId);
    }, 3000); // 每3秒检查一次

    // 立即检查一次
    checkInstanceStatus(instanceId);
}

// 检查实例状态
function checkInstanceStatus(instanceId) {
    fetch('/api/instance-status/' + instanceId)
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        if (data.success) {
            updateStatusDisplay(data.instance);
        } else {
            console.error('获取状态失败:', data.error);
        }
    })
    .catch(function(error) {
        console.error('状态检查失败:', error);
    });
}

// 更新状态显示
function updateStatusDisplay(instance) {
    var statusDiv = document.getElementById('status-message');
    var applyBtn = document.getElementById('apply-btn');

    switch (instance.status) {
        case 'creating_container':
            statusDiv.innerHTML =
                '<font size="2" color="#ff6600" class="blinking">正在创建Docker容器...</font><br>' +
                '<font size="2">实例ID: ' + instance.instanceId + '</font><br>' +
                '<font size="1" color="#666666">正在拉取 dorowu/ubuntu-desktop-lxde-vnc 镜像</font>';
            break;

        case 'creating_tunnel':
            statusDiv.innerHTML =
                '<font size="2" color="#ff6600" class="blinking">正在创建Cloudflare隧道...</font><br>' +
                '<font size="2">实例ID: ' + instance.instanceId + '</font><br>' +
                '<font size="1" color="#666666">容器已创建，正在建立外网访问通道</font>';
            break;

        case 'starting':
            statusDiv.innerHTML =
                '<font size="2" color="#ff6600" class="blinking">正在启动VNC服务...</font><br>' +
                '<font size="2">实例ID: ' + instance.instanceId + '</font><br>' +
                '<font size="1" color="#666666">隧道已建立，等待服务完全启动</font>';
            break;

        case 'ready':
            // 停止状态轮询
            if (statusCheckInterval) {
                clearInterval(statusCheckInterval);
                statusCheckInterval = null;
            }

            // 开始心跳
            startHeartbeat();

            statusDiv.innerHTML =
                '<div class="success-message">' +
                '<font size="2">✓ 实例创建成功！</font><br>' +
                '<font size="2">实例ID: ' + instance.instanceId + '</font><br>' +
                '<font size="2">VNC访问地址: <a href="' + instance.vncUrl + '" target="_blank">' + instance.vncUrl + '</a></font><br>' +
                '<font size="2">配置: Ubuntu桌面 + LXDE + VNC</font><br>' +
                '<font size="1" color="#666666">点击链接访问您的虚拟桌面</font><br>' +
                '<font size="1" color="#cc6600">注意: 闲置10分钟后将自动回收</font>' +
                '</div>';
            break;

        case 'error':
            // 停止状态轮询
            if (statusCheckInterval) {
                clearInterval(statusCheckInterval);
                statusCheckInterval = null;
            }

            statusDiv.innerHTML =
                '<div class="error-message">' +
                '<font size="2">✗ 实例创建失败</font><br>' +
                '<font size="2">实例ID: ' + instance.instanceId + '</font><br>' +
                '<font size="2">错误: ' + (instance.error || '未知错误') + '</font><br>' +
                '<font size="1" color="#666666">请稍后重试或联系技术支持</font>' +
                '</div>';

            // 恢复按钮状态
            setTimeout(function() {
                applyBtn.disabled = false;
                applyBtn.value = '申请实例';
                applyBtn.className = 'btn-enabled';
                currentInstanceId = null;
            }, 5000);
            break;
    }
}

// 开始心跳
function startHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }

    // 每30秒发送一次心跳
    heartbeatInterval = setInterval(function() {
        fetch('/api/heartbeat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            if (!data.success) {
                console.log('心跳失败，实例可能已被回收');
                clearInterval(heartbeatInterval);
                location.reload(); // 刷新页面
            }
        })
        .catch(function(error) {
            console.error('心跳请求失败:', error);
        });
    }, 30000);
}

// 检查用户状态
function checkUserStatus() {
    fetch('/api/user-status')
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        var applyBtn = document.getElementById('apply-btn');
        var statusDiv = document.getElementById('status-message');

        if (data.hasInstance && data.instance) {
            // 用户已有实例
            currentInstanceId = data.instance.instanceId;
            applyBtn.disabled = true;
            applyBtn.value = '已申请';
            applyBtn.className = 'btn-disabled';

            if (data.instance.status === 'ready') {
                // 实例就绪，显示访问链接
                statusDiv.innerHTML =
                    '<div class="success-message">' +
                    '<font size="2">✓ 您的实例正在运行</font><br>' +
                    '<font size="2">实例ID: ' + data.instance.instanceId + '</font><br>' +
                    '<font size="2">VNC访问地址: <a href="' + data.instance.vncUrl + '" target="_blank">' + data.instance.vncUrl + '</a></font><br>' +
                    '<font size="1" color="#cc6600">注意: 闲置10分钟后将自动回收</font>' +
                    '</div>';

                // 开始心跳
                startHeartbeat();
            } else {
                // 实例还在创建中
                updateStatusDisplay(data.instance);
                startStatusPolling(data.instance.instanceId);
            }
        } else {
            // 用户没有实例，可以申请
            statusDiv.innerHTML = '<font size="2">请选择需要申请的实例配置</font>';
        }
    })
    .catch(function(error) {
        console.error('检查用户状态失败:', error);
    });
}

// 页面加载完成后的初始化
window.onload = function() {
    console.log('VNC云计算实例申请系统已加载');

    // 显示当前时间（上世纪风格）
    var now = new Date();
    var timeString = now.getFullYear() + '年' +
                    (now.getMonth() + 1) + '月' +
                    now.getDate() + '日 ' +
                    now.getHours() + ':' +
                    (now.getMinutes() < 10 ? '0' : '') + now.getMinutes();

    document.title = 'VNC云计算 - ' + timeString;

    // 检查用户状态
    checkUserStatus();

    // 模拟上世纪的慢速加载效果
    var elements = document.querySelectorAll('table');
    for (var i = 0; i < elements.length; i++) {
        elements[i].style.opacity = '0';
        (function(element, delay) {
            setTimeout(function() {
                element.style.transition = 'opacity 0.5s';
                element.style.opacity = '1';
            }, delay);
        })(elements[i], i * 200);
    }
};

// 键盘快捷键支持
document.onkeydown = function(event) {
    // F5刷新页面
    if (event.keyCode === 116) {
        location.reload();
        return false;
    }
    
    // Ctrl+A 申请实例
    if (event.ctrlKey && event.keyCode === 65) {
        var applyBtn = document.getElementById('apply-btn');
        if (!applyBtn.disabled) {
            applyInstance('24v64g');
        }
        event.preventDefault();
        return false;
    }
};

// 右键菜单禁用（上世纪常见做法）
document.oncontextmenu = function() {
    alert('右键菜单已被禁用');
    return false;
};
