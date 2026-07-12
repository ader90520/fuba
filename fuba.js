// 福利吧签到脚本 for Quantumult X (BoxJS 优化版)
// 功能：自动签到、记录连续天数、总天数、积分，支持多域名自动切换

const cookieName = '福利吧签到';

// 从 BoxJS 读取配置
function getConfig() {
    let config = {
        cookie: '',
        username: '',
        domain: 'www.wnflb2023.com'
    };
    // 持久化存储（主要方式）
    config.cookie = $prefs.valueForKey('fuba_cookie') || '';
    config.username = $prefs.valueForKey('fuba_username') || '';
    config.domain = $prefs.valueForKey('fuba_domain') || 'www.wnflb2023.com';
    // 通过参数获取（用于调试或临时传值）
    if (typeof $argument !== 'undefined' && $argument) {
        $argument.split('&').forEach((part) => {
            const [key, value] = part.split('=');
            if (key === 'cookie') config.cookie = decodeURIComponent(value);
            if (key === 'username') config.username = decodeURIComponent(value);
            if (key === 'domain') config.domain = decodeURIComponent(value);
        });
    }
    console.log(`配置获取: 用户名=${config.username ? '已设置' : '未设置'}, 域名=${config.domain}`);
    return config;
}

// 保存统计数据到 BoxJS
function saveStats(lastDate, continuous, total, points) {
    if (lastDate) $prefs.setValueForKey(lastDate, 'fuba_last_sign_date');
    if (continuous !== undefined) $prefs.setValueForKey(String(continuous), 'fuba_continuous_days');
    if (total !== undefined) $prefs.setValueForKey(String(total), 'fuba_total_days');
    if (points) $prefs.setValueForKey(points, 'fuba_points');
}

// 从 HTML 中提取积分、连续天数、总天数
function extractStats(html) {
    let points = '未知';
    let continuous = 0;
    let total = 0;

    // 积分提取（保留原脚本的多种匹配）
    let pointsMatch = html.match(/<a.*?id="extcreditmenu".*?>(.*?)<\/a>/);
    if (pointsMatch) points = pointsMatch[1].trim();
    else {
        pointsMatch = html.match(/积分.*?(\d+)/);
        if (pointsMatch) points = pointsMatch[1];
        else {
            pointsMatch = html.match(/(金钱|金币|积分)[^\d]*(\d+)/);
            if (pointsMatch) points = pointsMatch[2];
            else {
                const fallbackMatch = html.match(/(\d+\.?\d*)\s*(金币|金钱|积分)/);
                if (fallbackMatch) points = fallbackMatch[1];
            }
        }
    }

    // 连续签到天数提取
    let match = html.match(/连续签到[：:]\s*(\d+)\s*天/);
    if (match) continuous = parseInt(match[1]);
    else {
        match = html.match(/已连续签到\s*(\d+)\s*天/);
        if (match) continuous = parseInt(match[1]);
    }

    // 累计签到天数提取
    match = html.match(/累计签到[：:]\s*(\d+)\s*天/);
    if (match) total = parseInt(match[1]);
    else {
        match = html.match(/累计签到\s*(\d+)\s*天/);
        if (match) total = parseInt(match[1]);
    }

    return { points, continuous, total };
}

// 提取签到链接（修复版：排除补签干扰，增加 FormHash 动态拼装兜底）
function extractSignUrl(html, domain) {
    // 模式1: 优先精确匹配原本的常规签到链接（规范链接不带 resign 补签）
    let match = html.match(/plugin\.php\?id=fx_checkin:checkin(&amp;|&)formhash=[0-9a-zA-Z]+/);
    if (match) {
        return match[0].replace(/&amp;/g, '&');
    }

    // 模式2: 寻找带有 checkin 且排除 resign 关键字的 a 标签 href
    match = html.match(/href\s*=\s*['"]([^'"]*?plugin\.php\?id=fx_checkin(?!:resign)[^'"]*?)['"]/);
    if (match) {
        return match[1].replace(/&amp;/g, '&');
    }

    // 模式3: 动态提取正确的 FORMHASH 强行拼接（Discuz 通用兜底策略）
    let hashMatch = html.match(/formhash=([0-9a-zA-Z]{8})/);
    if (!hashMatch) {
        hashMatch = html.match(/var FX_FORMHASH\s*=\s*["']([0-9a-zA-Z]{8})["']/);
    }
    if (hashMatch) {
        console.log(`💡 触发兜底逻辑，成功提取 FormHash: ${hashMatch[1]}`);
        return `plugin.php?id=fx_checkin:checkin&formhash=${hashMatch[1]}`;
    }

    return null;
}

// 构建请求头
function buildHeaders(cookie, referer = null) {
    const headers = {
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br'
    };
    if (referer) headers['Referer'] = referer;
    return headers;
}

// 网络请求封装
function request(options, throwError = true) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('请求超时')), options.timeout || 20000);
        $task.fetch(options).then(response => {
            clearTimeout(timeout);
            if (response.statusCode === 200) {
                resolve(response.body);
            } else if (throwError) {
                reject(`HTTP错误: ${response.statusCode} - ${response.statusText || response.statusCode}`);
            } else {
                resolve(null);
            }
        }, reason => {
            clearTimeout(timeout);
            if (throwError) {
                reject(reason.error || reason);
            } else {
                resolve(null);
            }
        });
    });
}

// 主函数
!(async () => {
    // 环境检查
    if (!$task) {
        $notify(cookieName, "错误", "当前环境不支持，请在 Quantumult X 中运行");
        $done();
        return;
    }

    const config = getConfig();
    const { cookie: myCookie, username: myUsername, domain: flbDomain } = config;

    if (!myCookie || !myUsername) {
        const errorMsg = `请在 BoxJS 中配置福利吧签到参数\nCookie: ${myCookie ? '已设置' : '未设置'}\n用户名: ${myUsername ? '已设置' : '未设置'}`;
        $notify(cookieName, "配置错误", errorMsg);
        console.log(errorMsg);
        $done();
        return;
    }

    console.log(`🚀 开始福利吧签到流程... 域名: ${flbDomain}, 用户: ${myUsername}`);

    // 备选域名列表（自动切换）
    const backupDomains = ["www.wnflb2023.com", "www.wnflb00.com", "www.wnflb99.com", "www.wnflb77.com"];
    let domainsToTry = [flbDomain, ...backupDomains.filter(d => d !== flbDomain)];
    let lastError = null;

    for (let domain of domainsToTry) {
        try {
            console.log(`🌐 尝试域名: ${domain}`);
            await performSignOnDomain(domain, myCookie, myUsername);
            // 如果当前配置的域名不是有效的，自动更新到有效的域名
            if (config.domain !== domain) {
                console.log(`✅ 域名 ${domain} 有效，更新配置`);
                $prefs.setValueForKey(domain, "fuba_domain");
            }
            return; // 成功则退出
        } catch (err) {
            lastError = err;
            console.log(`❌ 域名 ${domain} 签到失败: ${err.message || err}`);
            continue;
        }
    }
    throw lastError || new Error("所有域名均签到失败");

})().catch(error => {
    const errorMsg = error.message || error;
    $notify(cookieName, '签到失败', errorMsg);
    console.error(`❌ 签到失败: ${errorMsg}`);
    if (errorMsg.includes('Cookie') || errorMsg.includes('用户名')) {
        console.log('💡 建议: 在 BoxJS 中重新获取并配置 Cookie 和用户名');
    } else if (errorMsg.includes('域名')) {
        console.log('💡 建议: 在 BoxJS 中更换福利吧域名');
    }
}).finally(() => $done());

// 在指定域名上执行签到
async function performSignOnDomain(domain, cookie, expectedUsername) {
    console.log(`使用域名: ${domain}, 用户名: ${expectedUsername}`);
    const baseUrl = `https://${domain}`;

    // 1. 访问首页验证 Cookie 并获取用户名
    const userOptions = {
        url: `${baseUrl}/forum.php?mobile=no`,
        headers: buildHeaders(cookie),
        timeout: 20000
    };
    const userInfo = await request(userOptions);

    if (!userInfo) throw new Error('网站访问失败，请检查网络连接或域名状态');
    if (userInfo.includes('登录') && userInfo.includes('password')) throw new Error('Cookie已失效，请重新获取');
    if (userInfo.includes('维护') || userInfo.includes('错误') || userInfo.includes('404')) throw new Error('网站暂时无法访问');

    // 提取用户名
    const userNameMatch = userInfo.match(/title="访问我的空间">(.*?)<\/a>/);
    if (!userNameMatch) throw new Error('Cookie可能已失效，无法获取用户名信息');
    const actualUser = userNameMatch[1].trim();
    console.log(`登录用户名为：${actualUser}`);
    if (actualUser !== expectedUsername) {
        throw new Error(`Cookie用户不匹配：期望"${expectedUsername}"，实际"${actualUser}"`);
    }

    // 2. 提取当前积分和统计（用于后续更新）
    let currentStats = extractStats(userInfo);
    console.log(`📊 签到前积分: ${currentStats.points}, 连续: ${currentStats.continuous}, 累计: ${currentStats.total}`);

    // 3. 检查今日是否已签到
    const today = new Date().toDateString();
    if (userInfo.includes('今日已签到') || userInfo.includes('已经签到')) {
        console.log('📅 今日已签到，跳过签到动作');
        // 更新存储的统计数据
        if (currentStats.continuous > 0 || currentStats.total > 0) {
            saveStats(today, currentStats.continuous, currentStats.total, currentStats.points);
        }
        const message = `用户: ${actualUser}\n积分: ${currentStats.points}\n连续: ${currentStats.continuous}天\n累计: ${currentStats.total}天`;
        $notify(cookieName, '今日已签到', message);
        console.log(`✅ ${message}`);
        return;
    }

    // 4. 获取签到链接
    let signUrl = extractSignUrl(userInfo, domain);
    if (!signUrl) throw new Error('无法提取签到链接，请检查网页结构');

    console.log(`🔗 签到链接: ${signUrl}`);
    const signFullUrl = signUrl.startsWith('http') ? signUrl : `${baseUrl}/${signUrl}`;

    // 5. 执行签到
    const signOptions = {
        url: signFullUrl,
        headers: buildHeaders(cookie, `${baseUrl}/forum.php`),
        timeout: 15000
    };
    const signResult = await request(signOptions);
    if (signResult && (signResult.includes('今日已签到') || signResult.includes('已经签到') || signResult.includes('签到成功'))) {
        console.log('📝 签到完成');
    } else {
        console.log('✅ 签到请求已发送');
    }

    // 6. 获取签到后的积分和统计信息
    const finalUserInfo = await request(userOptions);
    const finalStats = extractStats(finalUserInfo);
    console.log(`📊 签到后积分: ${finalStats.points}, 连续: ${finalStats.continuous}, 累计: ${finalStats.total}`);

    // 7. 更新存储的统计数据（优先使用网页提取的真实值）
    let newContinuous = finalStats.continuous;
    let newTotal = finalStats.total;
    let newPoints = finalStats.points;

    // 如果网页未提供连续/累计数据，则使用计算逻辑作为后备
    if (newContinuous === 0) {
        const lastDate = $prefs.valueForKey('fuba_last_sign_date');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toDateString();
        if (lastDate === yesterdayStr) {
            newContinuous = (parseInt($prefs.valueForKey('fuba_continuous_days')) || 0) + 1;
        } else {
            newContinuous = 1;
        }
    }
    if (newTotal === 0) {
        newTotal = (parseInt($prefs.valueForKey('fuba_total_days')) || 0) + 1;
    }

    saveStats(today, newContinuous, newTotal, newPoints);

    // 8. 发送成功通知
    const message = `用户: ${actualUser}\n积分: ${newPoints}\n连续签到: ${newContinuous} 天\n累计签到: ${newTotal} 天`;
    $notify(cookieName, '签到成功', message);
    console.log(`✅ ${message}`);
}
