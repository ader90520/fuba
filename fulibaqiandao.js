// 名称: 福利吧论坛自动签到
// 描述: 自动检测可用域名并执行签到
// 作者: 基于青龙脚本转换
// 日期: 2025-08-17

const cookieName = '福利吧签到';
const cookieKey = 'fuba_cookie';
const usernameKey = 'fuba_username';

// 获取存储的数据
const getCookie = $persistentStore.read(cookieKey);
const getUsername = $persistentStore.read(usernameKey);

if (!getCookie || !getUsername) {
  $notification.post('❌ 配置不完整', '请设置Cookie和用户名', '检查持久化存储');
  $done();
}

// 可用域名列表
const domains = [
  'www.wnflb2023.com',
  'www.wnflb00.com', 
  'www.wnflb99.com'
];

// 查找可用域名
findAvailableDomain();

function findAvailableDomain() {
  let checkedCount = 0;
  
  domains.forEach(domain => {
    checkDomain(domain, (isAvailable) => {
      checkedCount++;
      if (isAvailable) {
        // 找到可用域名，开始签到流程
        startSignProcess(domain);
      } else if (checkedCount === domains.length) {
        // 所有域名都不可用
        $notification.post('❌ 网络异常', '所有域名均无法访问', '请检查网络');
        $done();
      }
    });
  });
}

function checkDomain(domain, callback) {
  const testUrl = `https://${domain}/forum.php`;
  
  $httpClient.get({
    url: testUrl,
    headers: {
      'Cookie': getCookie,
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
    }
  }, (error, response, data) => {
    if (error || response.status !== 200) {
      callback(false);
    } else {
      callback(true);
    }
  });
}

function startSignProcess(domain) {
  console.log(`使用域名: ${domain}`);
  
  // 第一步：访问主页获取用户信息和签到链接
  const forumUrl = `https://${domain}/forum.php?mobile=no`;
  
  $httpClient.get({
    url: forumUrl,
    headers: {
      'Cookie': getCookie,
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  }, (error, response, data) => {
    if (error) {
      $notification.post('❌ 网络错误', '访问论坛失败', error);
      $done();
      return;
    }
    
    if (response.status !== 200) {
      $notification.post(`❌ HTTP ${response.status}`, '论坛访问异常', '');
      $done();
      return;
    }
    
    // 验证用户名
    const usernameMatch = data.match(/title="访问我的空间">(.*?)<\/a>/);
    if (!usernameMatch) {
      $notification.post('❌ Cookie失效', '未检测到登录状态', '请重新登录获取Cookie');
      $done();
      return;
    }
    
    const currentUsername = usernameMatch[1];
    console.log(`登录用户: ${currentUsername}`);
    
    if (currentUsername !== getUsername) {
      $notification.post('❌ 用户不匹配', `当前用户: ${currentUsername}`, `配置用户: ${getUsername}`);
      $done();
      return;
    }
    
    // 提取签到链接
    const signFuncMatch = data.match(/}function fx_checkin(.*?);/);
    if (!signFuncMatch) {
      $notification.post('❌ 解析失败', '未找到签到函数', '论坛结构可能变更');
      $done();
      return;
    }
    
    let signUrl = signFuncMatch[1];
    signUrl = signUrl.substring(47, signUrl.length - 2);
    console.log(`签到URL: ${signUrl}`);
    
    // 执行签到
    executeSign(domain, signUrl, data);
  });
}

function executeSign(domain, signUrl, originalData) {
  const fullSignUrl = `https://${domain}/${signUrl}`;
  
  $httpClient.get({
    url: fullSignUrl,
    headers: {
      'Cookie': getCookie,
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      'Referer': `https://${domain}/forum.php`
    }
  }, (error, response, data) => {
    if (error) {
      $notification.post('❌ 签到请求失败', '网络错误', error);
      $done();
      return;
    }
    
    // 重新获取页面检查签到结果
    checkSignResult(domain);
  });
}

function checkSignResult(domain) {
  const forumUrl = `https://${domain}/forum.php?mobile=no`;
  
  $httpClient.get({
    url: forumUrl,
    headers: {
      'Cookie': getCookie,
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
    }
  }, (error, response, data) => {
    if (error) {
      $notification.post('❌ 结果检查失败', '网络错误', error);
      $done();
      return;
    }
    
    // 解析结果
    parseFinalResult(data);
  });
}

function parseFinalResult(data) {
  try {
    // 查找签到提示信息
    const signTipMatch = data.match(/<div class="tip_c">(.*?)<\/div>/);
    const moneyMatch = data.match(/<a.*?id="extcreditmenu".*?>(.*?)<\/a>/);
    
    if (signTipMatch && moneyMatch) {
      const signMessage = signTipMatch[1].trim();
      const moneyInfo = moneyMatch[1].trim();
      
      const finalMessage = `${signMessage}，当前${moneyInfo}`;
      $notification.post('✅ 福利吧签到成功', finalMessage, '');
    } else {
      // 尝试其他可能的消息格式
      if (data.includes('签到') || data.includes('奖励')) {
        $notification.post('✅ 签到完成', '具体信息请查看日志', '');
      } else {
        $notification.post('⚠️ 签到状态未知', '请手动检查', '');
      }
    }
  } catch (e) {
    $notification.post('❌ 结果解析错误', e.message, '');
  }
  
  $done();
}