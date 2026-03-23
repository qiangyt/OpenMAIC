import * as entities from 'entities'

import parseTag from './parse-tag'

const tagRE = /<[a-zA-Z0-9\-!/](?:"[^"]*"|'[^']*'|[^'">])*>/g
const whitespaceRE = /^\s*$/

const textContainerNames = ['mtext', 'mi', 'mn', 'mo', 'ms']

// 用于快速查找组件的复用对象
const empty = Object.create(null)

export function parse(html, options = {}) {
  const result = []
  const arr = []
  let current
  let level = -1

  html.replace(tagRE, (tag, index) => {
    const isOpen = tag.charAt(1) !== '/'
    const isComment = tag.startsWith('<!--')
    const start = index + tag.length
    const nextChar = html.charAt(start)
    let parent

    if (isComment) {
      const comment = parseTag(tag)

      // 如果在根节点，推送新的基础节点
      if (level < 0) {
        result.push(comment)
        return result
      }
      parent = arr[level]
      parent.children.push(comment)
      return result
    }

    if (isOpen) {
      level++

      current = parseTag(tag)
      if (current.type === 'tag' && options.components?.[current.name]) {
        current.type = 'component'
      }

      if (
        textContainerNames.includes(current.name) &&
        !current.voidElement &&
        nextChar &&
        nextChar !== '<'
      ) {
        const data = html.slice(start, html.indexOf('<', start)).trim()
        current.children.push({
          type: 'text',
          data: options.disableDecode ? data : entities.decodeXML(data)
        })
      }

      // 如果在根节点，推送新的基础节点
      if (level === 0) {
        result.push(current)
      }

      parent = arr[level - 1]

      if (parent) {
        parent.children.push(current)
      }

      arr[level] = current
    }

    if (!isOpen || current.voidElement) {
      if (level > -1 && (current.voidElement || current.name === tag.slice(2, -1))) {
        level--
        // 将 current 上移一级以匹配结束标签
        current = level === -1 ? result : arr[level]
      }
      if (
        level > -1 &&
        textContainerNames.includes[arr[level].name] &&
        nextChar !== '<' &&
        nextChar
      ) {
        // 尾部文本节点
        parent = arr[level].children

        // 计算内容切片的正确结束位置，以防文本节点后没有标签。
        const end = html.indexOf('<', start)
        let data = html.slice(start, end === -1 ? undefined : end)
        // 如果节点只有空白字符，按规范将其折叠：
        // https://www.w3.org/TR/html4/struct/text.html#h-9.1
        if (whitespaceRE.test(data)) {
          data = ' '
        }
        // 如果空白文本节点是尾部文本节点或前导空白文本节点，则不要添加：
        //  * end > -1 表示这不是尾部文本节点
        //  * level 为 -1 且 parent 长度为 0 时为前导节点
        if ((end > -1 && level + parent.length >= 0) || data !== ' ') {
          parent.push({
            type: 'text',
            data: options.disableDecode ? data : entities.decodeXML(data)
          })
        }
      }
    }
  })

  return result
}
