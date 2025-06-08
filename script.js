// VNC实例申请系统 - 真实后端交互版本
var currentInstanceId = null;
var statusCheckInterval = null;
var heartbeatInterval = null;
var systemStatusInterval = null;

// 申请实例
function applyInstance(instanceType) {
    var statusDiv = document.getElementById('status-message');

    // 禁用所有申请按钮
    disableAllApplyButtons();

    // 显示申请中状态
    statusDiv.innerHTML = '<font size="2" color="#ff6600" class="blinking">正在提交申请请求...</font>';

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
                enableAllApplyButtons();
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
            enableAllApplyButtons();
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

// 禁用所有申请按钮
function disableAllApplyButtons() {
    var buttons = ['apply-btn-2v2g', 'apply-btn-4v4g', 'apply-btn-16v16g', 'apply-btn-24v64g'];
    buttons.forEach(function(btnId) {
        var btn = document.getElementById(btnId);
        if (btn) {
            btn.disabled = true;
            btn.value = '处理中...';
            btn.className = 'btn-disabled';
        }
    });
}

// 启用所有申请按钮
function enableAllApplyButtons() {
    var buttons = ['apply-btn-2v2g', 'apply-btn-4v4g', 'apply-btn-16v16g', 'apply-btn-24v64g'];
    buttons.forEach(function(btnId) {
        var btn = document.getElementById(btnId);
        if (btn) {
            btn.disabled = false;
            btn.value = '申请实例';
            btn.className = 'btn-enabled';
        }
    });
}

// 更新系统状态显示
function updateSystemStatus(systemStatus) {
    document.getElementById('online-count').textContent = systemStatus.onlineCount;
    document.getElementById('queue-count').textContent = systemStatus.queueCount;
    document.getElementById('creating-count').textContent = systemStatus.creatingCount;
    document.getElementById('system-status').textContent = systemStatus.systemStatus;

    // 根据系统状态更新颜色
    var statusElement = document.getElementById('system-status');
    if (systemStatus.systemStatus === '容量已满') {
        statusElement.style.color = '#cc0000';
    } else {
        statusElement.style.color = '#006600';
    }
}

// 更新状态显示
function updateStatusDisplay(instance) {
    var statusDiv = document.getElementById('status-message');

    switch (instance.status) {
        case 'queued':
            statusDiv.innerHTML =
                '<font size="2" color="#ff6600" class="blinking">排队等待中...</font><br>' +
                '<font size="2">实例ID: ' + instance.instanceId + '</font><br>' +
                '<font size="2">队列位置: 第 ' + (instance.queuePosition || 1) + ' 位</font><br>' +
                '<font size="1" color="#666666">预计等待时间: ' + (instance.estimatedWaitTime || 30) + ' 秒</font>';
            break;

        case 'creating_container':
            statusDiv.innerHTML =
                '<font size="2" color="#ff6600" class="blinking">正在创建实例...</font><br>' +
                '<font size="2">实例ID: ' + instance.instanceId + '</font><br>' +
                '<font size="1" color="#666666">正在准备系统环境</font>';
            break;

        case 'creating_tunnel':
            statusDiv.innerHTML =
                '<font size="2" color="#ff6600" class="blinking">正在建立访问通道...</font><br>' +
                '<font size="2">实例ID: ' + instance.instanceId + '</font><br>' +
                '<font size="1" color="#666666">实例已创建，正在建立外网访问通道</font>';
            break;

        case 'starting':
            statusDiv.innerHTML =
                '<font size="2" color="#ff6600" class="blinking">正在启动服务...</font><br>' +
                '<font size="2">实例ID: ' + instance.instanceId + '</font><br>' +
                '<font size="1" color="#666666">访问通道已建立，等待服务完全启动</font>';
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
                '<font size="2">配置: Ubuntu桌面环境</font><br>' +
                '<font size="1" color="#666666">点击链接访问您的虚拟桌面</font><br>' +
                '<font size="1" color="#cc6600">注意: 闲置10分钟后将自动回收</font><br>' +
                '<input type="button" value="删除实例" class="btn-enabled" onclick="deleteInstance()" style="margin-top: 10px;">' +
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
                enableAllApplyButtons();
                currentInstanceId = null;
            }, 5000);
            break;
    }
}

// 删除实例
function deleteInstance() {
    if (!confirm('确定要删除当前实例吗？删除后您可以重新申请新的实例。')) {
        return;
    }

    var statusDiv = document.getElementById('status-message');

    // 显示删除中状态
    statusDiv.innerHTML = '<font size="2" color="#ff6600" class="blinking">正在删除实例...</font>';

    // 停止心跳
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }

    // 发送删除请求
    fetch('/api/delete-instance', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        if (data.success) {
            statusDiv.innerHTML =
                '<div class="success-message">' +
                '<font size="2">✓ 实例已成功删除</font><br>' +
                '<font size="1" color="#666666">您现在可以重新申请新的实例</font>' +
                '</div>';

            // 重置状态
            currentInstanceId = null;
            enableAllApplyButtons();

            console.log('BEEP! 实例删除成功');
        } else {
            statusDiv.innerHTML =
                '<div class="error-message">' +
                '<font size="2">✗ 删除失败</font><br>' +
                '<font size="2">错误: ' + data.error + '</font>' +
                '</div>';

            console.log('ERROR BEEP! 删除失败');
        }
    })
    .catch(function(error) {
        console.error('删除请求失败:', error);
        statusDiv.innerHTML =
            '<div class="error-message">' +
            '<font size="2">✗ 网络错误</font><br>' +
            '<font size="2">无法连接到服务器</font>' +
            '</div>';
    });
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

// 开始系统状态轮询
function startSystemStatusPolling() {
    if (systemStatusInterval) {
        clearInterval(systemStatusInterval);
    }

    systemStatusInterval = setInterval(function() {
        fetch('/api/system-status')
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            updateSystemStatus(data);
        })
        .catch(function(error) {
            console.error('获取系统状态失败:', error);
        });
    }, 5000); // 每5秒更新一次

    // 立即获取一次
    fetch('/api/system-status')
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        updateSystemStatus(data);
    })
    .catch(function(error) {
        console.error('获取系统状态失败:', error);
    });
}

// 检查用户状态
function checkUserStatus() {
    fetch('/api/user-status')
    .then(function(response) {
        return response.json();
    })
    .then(function(data) {
        var statusDiv = document.getElementById('status-message');

        // 更新系统状态
        if (data.systemStatus) {
            updateSystemStatus(data.systemStatus);
        }

        if (data.hasInstance && data.instance) {
            // 用户已有实例
            currentInstanceId = data.instance.instanceId;
            disableAllApplyButtons();

            if (data.instance.status === 'ready') {
                // 实例就绪，显示访问链接
                statusDiv.innerHTML =
                    '<div class="success-message">' +
                    '<font size="2">✓ 您的实例正在运行</font><br>' +
                    '<font size="2">实例ID: ' + data.instance.instanceId + '</font><br>' +
                    '<font size="2">访问地址: <a href="' + data.instance.vncUrl + '" target="_blank">' + data.instance.vncUrl + '</a></font><br>' +
                    '<font size="1" color="#cc6600">注意: 闲置10分钟后将自动回收</font><br>' +
                    '<input type="button" value="删除实例" class="btn-enabled" onclick="deleteInstance()" style="margin-top: 10px;">' +
                    '</div>';

                // 开始心跳
                startHeartbeat();
            } else {
                // 实例还在创建中或排队中
                updateStatusDisplay(data.instance);
                startStatusPolling(data.instance.instanceId);
            }
        } else {
            // 用户没有实例，可以申请
            enableAllApplyButtons();
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

    // 开始系统状态轮询
    startSystemStatusPolling();

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
