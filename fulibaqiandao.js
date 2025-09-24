// 福利吧签到脚本 for Quantumult X
// 支持多账号，请在BoxJS或脚本内配置cookie和用户名
const cookieName = '福利吧签到'
const signurlKey = 'fuba_sign_url'
const cookieKey = 'fuba_cookie'
const usernameKey = 'fuba_username'
const myCookie = $prefs.valueForKey(cookieKey)
const myUsername = $prefs.valueForKey(usernameKey)

if (!$task || !myCookie || !myUsername) {
    $notify(cookieName, "错误", "配置信息不完整或环境不支持")
    $done()
}

// 可能的域名列表
const allUrls = ['www.wnflb2023.com', 'www.wnflb00.com', 'www.wnflb99.com']
let flbUrl = null

;(async () => {
    try {
        // 1. 检测可用的域名
        for (let url of allUrls) {
            const options = {
                url: `https://${url}/forum.php?mobile=no`,
                headers: {
                    'Cookie': myCookie,
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
                },
                timeout: 10000
            }
            
            try {
                const response = await request(options, false) // 不自动处理错误
                if (response.statusCode === 200) {
                    flbUrl = url
                    console.log(`检测到可用域名: ${flbUrl}`)
                    break
                }
            } catch (e) {
                console.log(`域名 ${url} 不可用: ${e}`)
            }
        }

        if (!flbUrl) {
            throw new Error('所有域名均无法访问，请检查网络或网站状态')
        }

        // 2. 访问PC主页验证Cookie并获取用户名
        const userOptions = {
            url: `https://${flbUrl}/forum.php?mobile=no`,
            headers: {
                'Cookie': myCookie,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
        }

        const userInfo = await request(userOptions)
        const userNameMatch = userInfo.match(/title="访问我的空间">(.*?)<\/a>/)
        
        if (!userNameMatch) {
            throw new Error('Cookie可能已失效，无法获取用户名')
        }

        const userName = userNameMatch[1]
        console.log(`登录用户名为：${userName}`)
        console.log(`环境用户名为：${myUsername}`)

        if (userName !== myUsername) {
            throw new Error('Cookie失效：用户名不匹配')
        }

        // 3. 获取签到链接
        const signUrlMatch = userInfo.match(/}function fx_checkin(.*?);/)
        if (!signUrlMatch) {
            throw new Error('无法提取签到链接')
        }

        let signUrl = signUrlMatch[1]
        signUrl = signUrl.substring(47, signUrl.length - 2)
        console.log(`签到链接: ${signUrl}`)

        // 4. 执行签到
        const signOptions = {
            url: `https://${flbUrl}/${signUrl}`,
            headers: {
                'Cookie': myCookie,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
        }

        await request(signOptions)

        // 5. 获取签到后的积分信息
        const finalUserInfo = await request(userOptions)
        const currentMoneyMatch = finalUserInfo.match(/<a.*? id="extcreditmenu".*?>(.*?)<\/a>/)
        const singDayMatch = finalUserInfo.match(/<div class="tip_c">(.*?)<\/div>/)

        if (currentMoneyMatch && singDayMatch) {
            const currentMoney = currentMoneyMatch[1]
            const singDay = singDayMatch[1]
            const logInfo = `${singDay}当前${currentMoney}`
            
            $notify(cookieName, `签到成功`, logInfo)
            console.log(logInfo)
        } else {
            throw new Error('签到可能成功，但无法解析积分信息')
        }

    } catch (error) {
        $notify(cookieName, '签到失败', error.message || error)
        console.error(`签到失败: ${error}`)
    } finally {
        $done()
    }
})()

// 通用请求函数
function request(options, throwError = true) {
    return new Promise((resolve, reject) => {
        $task.fetch(options).then(response => {
            if (response.statusCode === 200) {
                resolve(response.body)
            } else if (throwError) {
                reject(`HTTP错误: ${response.statusCode}`)
            } else {
                resolve(response.body)
            }
        }, reason => {
            if (throwError) {
                reject(reason.error)
            } else {
                resolve(null)
            }
        })
    })
}
