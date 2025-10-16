// 福利吧专用Cookie获取脚本
const cookieName = '福利吧'
const cookieKey = 'fuba_cookie'
const cookieVal = $request.headers['Cookie'] || $request.headers['cookie']

if (cookieVal) {
    // 提取用户名（用于验证）
    const userMatch = cookieVal.match(/S5r8_2132_auth=[^;]+/);
    if (userMatch) {
        // 保存Cookie到持久化存储
        $prefs.setValueForKey(cookieVal, cookieKey)
        
        // 发送成功通知
        $notify(`🎉 ${cookieName} 获取成功`, '', 'Cookie已成功获取，请禁用获取规则避免重复触发')
        console.log(`${cookieName} Cookie: ${cookieVal}`)
    } else {
        $notify(`❌ ${cookieName} 获取失败`, '', '未检测到有效的登录Cookie，请确保已登录福利吧')
    }
} else {
    $notify(`❌ ${cookieName} 获取失败`, '', '未能从请求头中提取Cookie')
}

$done()