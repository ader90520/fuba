// 福利吧Cookie获取脚本 for Quantumult X
// 用于自动获取Cookie并更新BoxJS配置

const cookieName = '福利吧Cookie获取'
const cookieKey = 'fuba_cookie'
const userKey = 'fuba_username'

if ($request && $request.url.includes('forum.php')) {
    const cookie = $request.headers['Cookie'] || $request.headers['cookie']
    
    if (cookie) {
        try {
            // 保存Cookie到BoxJS
            $prefs.setValueForKey(cookie, cookieKey)
            
            // 尝试从Cookie或后续请求中提取用户名
            // 这里需要根据福利吧实际返回的数据调整用户名提取逻辑
            // 以下为示例代码，您可能需要调整匹配模式
            
            // 发送额外请求获取用户名信息（可选）
            const userInfoOptions = {
                url: $request.url,
                headers: {
                    'Cookie': cookie,
                    'User-Agent': $request.headers['User-Agent'] || 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
                }
            }
            
            $task.fetch(userInfoOptions).then(response => {
                const body = response.body
                // 尝试匹配福利吧用户名
                const userNameMatch = body.match(/title="访问我的空间">(.*?)<\/a>/)
                
                if (userNameMatch && userNameMatch[1]) {
                    const userName = userNameMatch[1].trim()
                    $prefs.setValueForKey(userName, userKey)
                    $notify(cookieName, 'Cookie和用户名获取成功', `用户: ${userName}`)
                    console.log(`福利吧用户名获取成功: ${userName}`)
                } else {
                    $notify(cookieName, 'Cookie获取成功', '用户名需手动填写')
                    console.log('Cookie已保存，但未能自动获取用户名')
                }
            }, reason => {
                $notify(cookieName, 'Cookie获取成功', '用户名需手动填写')
                console.log('Cookie已保存，用户名获取请求失败')
            })
            
        } catch (error) {
            $notify(cookieName, 'Cookie处理错误', error.message || error)
            console.log(`Cookie处理错误: ${error}`)
        }
    } else {
        $notify(cookieName, '获取失败', '未找到Cookie信息')
    }
}

$done({})