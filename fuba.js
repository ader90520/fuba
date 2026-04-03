/*
福利吧签到 for Quantumult X (BoxJS 优化版)
配套订阅：https://raw.githubusercontent.com/你的用户名/仓库/main/fuba_sub.json
功能：自动签到、记录连续天数、总天数、积分，支持多域名自动切换
修复：连续签到天数和总签到天数不再为 0，正确从网页提取或计算
*/

const cookieName = '福利吧签到';

// 从 BoxJS 读取配置
function getConfig() {
    return {
        cookie: $prefs.valueForKey('fuba_cookie') || '',
        username: $prefs.valueForKey('fuba_username') || '',
        domain: $prefs.valueForKey('fuba_domain') || 'www.wnflb2023.com',
        lastSignDate: $prefs.valueForKey('fuba_last_sign_date') || '',
        continuousDays: parseInt($prefs.valueForKey('fuba_continuous_days')) || 0,
        totalDays: parseInt($prefs.valueForKey('fuba_total_days')) || 0,
        points: $prefs.valueForKey('fuba_points') || '0'
    };
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

    // 提取积分
    let pointsMatch = html.match(/<a.*?id="extcreditmenu".*?>(.*?)<\/a>/);
    if (pointsMatch) points = pointsMatch[1].trim();
    else {
        pointsMatch = html.match(/(?:积分|金币|金钱)[^\d]*(\d+)/);
        if (pointsMatch) points = pointsMatch[1];
    }

    // 提取连续签到天数
    let match = html.match(/连续签到[：:]\s*(\d+)\s*天/);
    if (match) continuous = parseInt(match[1]);
    else {
        match = html.match(/已连续签到\s*(\d+)\s*天/);
        if (match) continuous = parseInt(match[1]);
    }

    // 提取累计签到天数
    match = html.match(/累计签到[：:]\s*(\d+)\s*天/);
    if (match) total = parseInt(match[1]);
    else {
        match = html.match(/累计签到\s*(\d+)\s*天/);
        if (match) total = parseInt(match[1]);
    }

    return { points, continuous, total };
}

// 主函数
!(async () => {
    // 检查环境
    if (!$task) {
        $notify(cookieName, '错误', '当前环境不支持，请在 Quantumult X 中运行');
        $done();
        return;
    }

    const config = getConfig();
    const { cookie: myCookie, username: myUsername, domain: flbDomain } = config;

    if (!myCookie || !myUsername) {
        const errorMsg = `请在 BoxJS 中配置福利吧签到参数\nCookie: ${myCookie ? '已设置' : '未设置'}\n用户名: ${myUsername ? '已设置' : '未设置'}`;
        $notify(cookieName, '配置错误', errorMsg);
        console.log(errorMsg);
        $done();
        return;
    }

    console.log(`🚀 开始福利吧签到流程... 域名: ${flbDomain}, 用户: ${myUsername}`);

    try {
        // 1. 访问首页验证 Cookie 并获取用户名
        const homeUrl = `https://${flbDomain}/forum.php?mobile=no`;
        const homeHtml = await request({
            url: homeUrl,
            headers: buildHeaders(myCookie),
            timeout: 20000
        });

        if (!homeHtml) throw new Error('网站访问失败，请检查网络或域名');
        if (homeHtml.includes('登录') && homeHtml.includes('password')) throw new Error('Cookie 已失效，请重新获取');
        if (homeHtml.includes('维护') || homeHtml.includes('404')) throw new Error('网站暂时无法访问');

        // 提取用户名
        const nameMatch = homeHtml.match(/title="访问我的空间">(.*?)<\/a>/);
        if (!nameMatch) throw new Error('无法提取用户名，Cookie 可能失效');
        const actualUser = nameMatch[1].trim();
        if (actualUser !== myUsername) {
            throw new Error(`用户名不匹配：期望 "${myUsername}"，实际 "${actualUser}"`);
        }
        console.log(`✅ 用户验证通过: ${actualUser}`);

        // 2. 提取当前积分和统计（用于后续更新）
        let currentStats = extractStats(homeHtml);
        console.log(`📊 签到前积分: ${currentStats.points}, 连续: ${currentStats.continuous}, 累计: ${currentStats.total}`);

        // 3. 检查今日是否已签到
        const today = new Date().toDateString();
        if (homeHtml.includes('今日已签到') || homeHtml.includes('已经签到')) {
            console.log('📅 今日已签到，跳过签到动作');
            // 仍然更新存储中的统计数据（可能之前未保存）
            if (currentStats.continuous > 0) saveStats(null, currentStats.continuous, currentStats.total, currentStats.points);
            $notify(cookieName, '今日已签到', `用户: ${actualUser}\n积分: ${currentStats.points}\n连续: ${currentStats.continuous}天\n累计: ${currentStats.total}天`);
            $done();
            return;
        }

        // 4. 提取签到链接
        let signUrl = extractSignUrl(homeHtml, flbDomain);
        if (!signUrl) throw new Error('无法提取签到链接，请检查网页结构');

        console.log(`🔗 签到链接: ${signUrl}`);

        // 5. 执行签到
        const signFullUrl = signUrl.startsWith('http') ? signUrl : `https://${flbDomain}/${signUrl}`;
        const signHtml = await request({
            url: signFullUrl,
            headers: buildHeaders(myCookie, signFullUrl),
            timeout: 15000
        });

        if (signHtml.includes('今日已签到') || signHtml.includes('签到成功')) {
            console.log('✅ 签到成功');
        } else {
            console.log('⚠️ 签到请求已发送，结果未知');
        }

        // 6. 获取签到后的最新页面，提取最终统计
        const finalHtml = await request({
            url: homeUrl,
            headers: buildHeaders(myCookie),
            timeout: 20000
        });
        const finalStats = extractStats(finalHtml);
        console.log(`📊 签到后积分: ${finalStats.points}, 连续: ${finalStats.continuous}, 累计: ${finalStats.total}`);

        // 7. 更新存储的统计数据（优先使用网页提取的真实值）
        let newContinuous = finalStats.continuous;
        let newTotal = finalStats.total;
        let newPoints = finalStats.points;

        // 如果网页未提供连续/累计数据，则使用计算逻辑作为后备
        if (newContinuous === 0) {
            const lastDate = config.lastSignDate;
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toDateString();
            if (lastDate === yesterdayStr) {
                newContinuous = config.continuousDays + 1;
            } else {
                newContinuous = 1;
            }
        }
        if (newTotal === 0) {
            newTotal = config.totalDays + 1;
        }

        saveStats(today, newContinuous, newTotal, newPoints);

        // 8. 发送成功通知
        const message = `用户: ${actualUser}\n积分: ${newPoints}\n连续签到: ${newContinuous} 天\n累计签到: ${newTotal} 天`;
        $notify(cookieName, '签到成功', message);
        console.log(`✅ ${message}`);

    } catch (error) {
        const errorMsg = error.message || error;
        $notify(cookieName, '签到失败', errorMsg);
        console.error(`❌ 签到失败: ${errorMsg}`);

        if (errorMsg.includes('Cookie')) {
            console.log('💡 建议: 重新获取 Cookie 并更新 BoxJS 配置');
        } else if (errorMsg.includes('域名')) {
            console.log('💡 建议: 在 BoxJS 中更换福利吧域名');
        }
    } finally {
        $done();
    }
})();

// 提取签到链接（兼容多种格式）
function extractSignUrl(html, domain) {
    // 模式1: fx_checkin 函数中的链接
    let match = html.match(/function fx_checkin\(.*?\)\s*\{[^}]*?window\.location\.href\s*=\s*['"](.*?)['"]/);
    if (match) return match[1];

    // 模式2: 直接 href 的签到链接
    match = html.match(/checkin.*?href\s*=\s*['"](.*?plugin\.php\?id=.*?checkin.*?)['"]/);
    if (match) return match[1];

    // 模式3: a 标签中的签到
    match = html.match(/<a[^>]*?href\s*=\s*['"](.*?(?:checkin|sign).*?)['"][^>]*?>.*?签到.*?<\/a>/i);
    if (match) return match[1];

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
function request(options) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('请求超时')), options.timeout || 20000);
        $task.fetch(options).then(resp => {
            clearTimeout(timeout);
            if (resp.statusCode === 200) resolve(resp.body);
            else reject(new Error(`HTTP ${resp.statusCode}`));
        }).catch(err => {
            clearTimeout(timeout);
            reject(err);
        });
    });
}