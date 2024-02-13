// 修改自https://gist.github.com/ChenYFan/4e88490212e3e08e06006cf31140cd3f

import { serve } from "https://deno.land/std/http/server.ts";

// 定义频道名称、版本、是否禁止以及禁止的地区
const ChannelName = 'TNXG_BB'
const version = "2.1.7"
let denined = true
const deninedRegion = ["CN"]

// 定义处理请求的函数
const TelgramChannelStarter = async (request) => {
    // 获取请求的URL和地区
    const url = new URL(request.url)
    // 获取用户ip
    const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || request.conn.remoteAddr.hostname
    // 获取地区
    const Region = await fetch(`https://ipinfo.io/${ip}/json`)
        .then(res => res.json())
        .then(res => res.country)
    // 如果地区不在禁止的地区列表中，将denined设置为false
    if (!deninedRegion.includes(Region)) denined = false
    // 获取代理URL
    const proxyUrl = url.searchParams.get('proxy')
    // 如果代理URL存在，检查其是否符合规则，如果不符合返回错误，如果符合则直接返回fetch的结果
    if (!!proxyUrl) {
        if (!(proxyUrl.match(/\:\/\/(.*?)\.telegram\.org/g) || proxyUrl.match(/\:\/\/(.*)\.cdn\-telegram\.org/g))) return new Response('Proxy URL is not valid')
        return fetch(proxyUrl)
    }

    // 获取startbefore参数
    const startbefore = url.searchParams.get('startbefore')
    // 构造频道URL
    const ChannelUrl = new URL(`https://t.me/s/${ChannelName}`)
    // 如果startbefore存在，将其设置为频道URL的before参数
    if (!!startbefore) ChannelUrl.searchParams.set('before', startbefore)
    // 从Telegram获取数据
    const getDataFromTelegram = await fetch(ChannelUrl, {
        "headers": {
            "x-requested-with": "XMLHttpRequest"
        },
        "method": "POST"
    })
        .then(res => res.text())
        .then(res => res
            .replace(/\\n/g, '')
            .replace(/\\(.)/g, '$1')
            .replace(/(^\"|\"$)/g, '')
        )
    // 如果rawHtml参数为true，直接返回获取到的数据
    if (url.searchParams.get('rawHtml') === 'true') return new Response(getDataFromTelegram, {
        headers: {
            "content-type": "text/html;charset=UTF-8",
            "Access-Control-Allow-Origin": "*"
        }
    })
    // 获取nextBefore参数
    const nextBefore = Number([...getDataFromTelegram.matchAll(/data\-before\=\"(?<NEXT>[0-9]+)\"/g)][0].groups.NEXT || 0)
    // 分割频道消息
    const ChannelMessages = ElementSpliter(getDataFromTelegram, '<div class="tgme_widget_message_wrap')
    // 定义频道消息数据对象
    const ChannelMessageData = {}
    // 遍历频道消息
    for (let ChannelMessage of ChannelMessages) {
        // 获取消息ID、文本、图片、时间和浏览量
        const MessageId = [...ChannelMessage.matchAll(/data-post\=\"(?<MID>.*?)\"/g)][0].groups.MID.split('/')[1]
        const MessageText = ElementSpliter(ChannelMessage, `<div class="tgme_widget_message_text js-message_text"`)[0] || ''
        // // 如果消息文本不包含#SFCN且denined为true，跳过此次循环
        // // if (!MessageText.match(/\#SFCN/g) && denined) continue
        // 如果消息文本包含#SENSITIVE且denined为true，跳过此次循环
        if (MessageText.match(/\#SENSITIVE/g) && denined) continue
        const MessagePhoto = [...ChannelMessage.matchAll(/background\-image\:url\(\'(?<URL>.*?)\'\)/g)].map(e => e.groups.URL) || []
        const getViews = [...ChannelMessage.matchAll(/<span class="tgme_widget_message_views">(?<VIEWS>.*?)<\/span>/g)][0]
        // 将获取到的数据添加到频道消息数据对象中
        ChannelMessageData[MessageId] = {
            text: MessageText
                .replace(/\<div (.*?)\>/g, '')
                .replace(/\<\/div\>/g, ''),
            image: MessagePhoto,
            time: new Date([...ChannelMessage.matchAll(/datetime\=\"(?<TIME>.*?)\"/g)][0].groups.TIME).getTime(),
            views: getViews ? getViews.groups.VIEWS : null
        }
    }

    // 返回处理后的数据
    return new Response(JSON.stringify({
        nextBefore,
        Region,
        version,
        ChannelMessageData
    }), {
        headers: {
            "content-type": "application/json;charset=UTF-8",
            "Access-Control-Allow-Origin": "*"
        }
    })
}

// 定义元素分割函数
const ElementSpliter = (html, StartElement) => {
    const Elements = []
    const ElementSpliterOnce = (html, StartElement) => {
        // 获取元素名称
        let ElementName = [...StartElement.matchAll(/\<(?<ELENAME>[a-zA-Z0-9]+)\s/g)][0].groups.ELENAME
        let ElementContent = StartElement
        // 遍历html内容，找到完整的元素内容
        for (let Start = html.indexOf(StartElement) + StartElement.length; Start < html.length; Start++) {
            ElementContent += html[Start]
            if (ElementContent.endsWith(`</${ElementName}>`)) {
                const PrefixCount = Object.keys(ElementContent.match(new RegExp(`\<${ElementName}`, 'g'))).length
                const SuffixCount = Object.keys(ElementContent.match(new RegExp(`\<\/${ElementName}(.*?)>`, 'g')) || []).length
                // 如果元素的开始标签和结束标签数量相等，返回元素内容
                if (
                    PrefixCount === SuffixCount &&
                    PrefixCount !== 0
                ) {
                    return ElementContent
                }
            }

        }
    }
    // 循环分割元素，直到html中没有StartElement
    while (1) {
        if (html.indexOf(StartElement) === -1) break
        const SplitOnce = ElementSpliterOnce(html, StartElement)
        Elements.push(SplitOnce)
        html = html.replace(SplitOnce, '')
    }
    return Elements
}

// 启动HTTP服务器并监听指定端口
serve(async (req) => {
    const response = await TelgramChannelStarter(req);
    return response;
});