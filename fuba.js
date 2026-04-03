/*
福利吧签到 for Quantumult X (BoxJS 优化版)
配套订阅：https://raw.githubusercontent.com/你的用户名/仓库/main/fuba_sub.json
功能：自动签到、记录连续天数、总天数、积分，支持多域名自动切换
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

        // 2. 检查今日是否已签到
        const today = new Date().toDateString();
        if (homeHtml.includes('今日已签到') || homeHtml.includes('已经签到')) {
            console.log('📅 今日已签到，跳过签到动作');
            await updatePointsAndStats(homeHtml, config);
            $notify(cookieName, '今日已签到', `用户: ${actualUser}\n积分: ${config.points}`);
            $done();
            return;
        }

        // 3. 提取签到链接
        let signUrl = extractSignUrl(homeHtml, flbDomain);
        if (!signUrl) throw new Error('无法提取签到链接，请检查网页结构');

        console.log(`🔗 签到链接: ${signUrl}`);

        // 4. 执行签到
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

        // 5. 获取最新积分和统计
        const finalHtml = await request({
            url: homeUrl,
            headers: buildHeaders(myCookie),
            timeout: 20000
        });
        await updatePointsAndStats(finalHtml, config);

        // 6. 更新连续/总签到天数
        const lastSignDate = config.lastSignDate;
        let newContinuous = config.continuousDays;
        let newTotal = config.totalDays;
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toDateString();

        if (lastSignDate === yesterdayStr) {
            newContinuous = config.continuousDays + 1;
        } else if (lastSignDate !== today) {
            newContinuous = 1;
        }
        newTotal = config.totalDays + 1;

        saveStats(today, newContinuous, newTotal, config.points);

        // 7. 发送成功通知
        const message = `用户: ${actualUser}\n积分: ${config.points}\n连续签到: ${newContinuous} 天\n累计签到: ${newTotal} 天`;
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

// 更新积分和统计信息（不签到，仅解析）
async function updatePointsAndStats(html, config) {
    // 提取积分
    let points = '未知';
    let pointsMatch = html.match(/<a.*?id="extcreditmenu".*?>(.*?)<\/a>/);
    if (pointsMatch) points = pointsMatch[1].trim();
    else {
        pointsMatch = html.match(/(?:积分|金币|金钱)[^\d]*(\d+)/);
        if (pointsMatch) points = pointsMatch[1];
    }
    config.points = points;
    saveStats(null, null, null, points);
    console.log(`📊 当前积分: ${points}`);
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