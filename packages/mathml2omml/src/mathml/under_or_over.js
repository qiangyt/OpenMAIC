import { getNary, getNaryTarget } from '../ooml/index.js'
import { walker } from '../walker.js'

import { getTextContent } from '../helpers.js'

const UPPER_COMBINATION = {
  '\u2190': '\u20D6', // arrow left
  '\u27F5': '\u20D6', // arrow left, long
  '\u2192': '\u20D7', // arrow right
  '\u27F6': '\u20D7', // arrow right, long
  '\u00B4': '\u0301', // accute
  '\u02DD': '\u030B', // accute, double
  '\u02D8': '\u0306', // breve
  ˇ: '\u030C', // caron
  '\u00B8': '\u0312', // cedilla
  '\u005E': '\u0302', // circumflex accent
  '\u00A8': '\u0308', // diaresis
  '\u02D9': '\u0307', // dot above
  '\u0060': '\u0300', // grave accent
  '\u002D': '\u0305', // hyphen -> overline
  '\u00AF': '\u0305', // macron
  '\u2212': '\u0305', // minus -> overline
  '\u002E': '\u0307', // period -> dot above
  '\u007E': '\u0303', // tilde
  '\u02DC': '\u0303' // small tilde
}

function underOrOver(element, targetParent, previousSibling, nextSibling, ancestors, direction) {
  // Munder/Mover（下标/上标）

  if (element.children.length !== 2) {
    // 视为 mrow 处理
    return targetParent
  }

  ancestors = [...ancestors]
  ancestors.unshift(element)

  const base = element.children[0]
  const script = element.children[1]

  // Munder/Mover 可以通过不同方式转换为 ooml。

  // 首先检查 m:nAry。
  //
  // m:nAry
  //
  // 条件：
  // 1. 基底文本必须是 nary 运算符
  // 2. 没有重音符号
  const naryChar = getNary(base)

  if (
    naryChar &&
    element.attribs?.accent?.toLowerCase() !== 'true' &&
    element.attribs?.accentunder?.toLowerCase() !== 'true'
  ) {
    const topTarget = getNaryTarget(
      naryChar,
      element,
      'undOvr',
      direction === 'over',
      direction === 'under'
    )
    element.isNary = true

    const subscriptTarget = {
      name: 'm:sub',
      type: 'tag',
      attribs: {},
      children: []
    }
    const superscriptTarget = {
      name: 'm:sup',
      type: 'tag',
      attribs: {},
      children: []
    }
    walker(
      script,
      direction === 'under' ? subscriptTarget : superscriptTarget,
      false,
      false,
      ancestors
    )
    topTarget.children.push(subscriptTarget)
    topTarget.children.push(superscriptTarget)
    topTarget.children.push({ type: 'tag', name: 'm:e', attribs: {}, children: [] })
    targetParent.children.push(topTarget)
    return
  }

  const scriptText = getTextContent(script)

  const baseTarget = {
    name: 'm:e',
    type: 'tag',
    attribs: {},
    children: []
  }
  walker(base, baseTarget, false, false, ancestors)

  //
  // m:bar
  //
  // 然后检查是否应该是 m:bar。
  // 满足以下条件时为 m:bar：
  // 1. 脚本文本是对应于 \u0332/\u005F（下划线）或 \u0305/\u00AF（上划线）的单个字符
  // 2. 脚本元素的类型是 mo。
  if (
    (direction === 'under' && script.name === 'mo' && ['\u0332', '\u005F'].includes(scriptText)) ||
    (direction === 'over' && script.name === 'mo' && ['\u0305', '\u00AF'].includes(scriptText))
  ) {
    // m:bar（划线）
    targetParent.children.push({
      type: 'tag',
      name: 'm:bar',
      attribs: {},
      children: [
        {
          type: 'tag',
          name: 'm:barPr',
          attribs: {},
          children: [
            {
              type: 'tag',
              name: 'm:pos',
              attribs: {
                'm:val': direction === 'under' ? 'bot' : 'top'
              },
              children: []
            }
          ]
        },
        {
          type: 'tag',
          name: 'm:e',
          attribs: {},
          children: [
            {
              type: 'tag',
              name: direction === 'under' ? 'm:sSub' : 'm:sSup',
              attribs: {},
              children: [
                {
                  type: 'tag',
                  name: direction === 'under' ? 'm:sSubPr' : 'm:sSupPr',
                  attribs: {},
                  children: [{ type: 'tag', name: 'm:ctrlPr', attribs: {}, children: [] }]
                },
                baseTarget,
                { type: 'tag', name: 'm:sub', attribs: {}, children: [] }
              ]
            }
          ]
        }
      ]
    })
    return
  }

  // m:acc
  //
  // 接下来尝试判断是否是 m:acc。满足以下条件时为 m:acc：
  // 1. scriptText 长度为 0-1 个字符。
  // 2. 脚本是一个 mo 元素
  // 3. 设置了 accent 属性。
  if (
    (direction === 'under' &&
      element.attribs?.accentunder?.toLowerCase() === 'true' &&
      script.name === 'mo' &&
      scriptText.length < 2) ||
    (direction === 'over' &&
      element.attribs?.accent?.toLowerCase() === 'true' &&
      script.name === 'mo' &&
      scriptText.length < 2)
  ) {
    // m:acc（重音）
    targetParent.children.push({
      type: 'tag',
      name: 'm:acc',
      attribs: {},
      children: [
        {
          type: 'tag',
          name: 'm:accPr',
          attribs: {},
          children: [
            {
              type: 'tag',
              name: 'm:chr',
              attribs: {
                'm:val': UPPER_COMBINATION[scriptText] || scriptText
              },
              children: []
            }
          ]
        },
        baseTarget
      ]
    })
    return
  }
  // m:groupChr
  //
  // 现在尝试 m:groupChr。条件是：
  // 1. 基底是 'mrow' 且脚本是 'mo'。
  // 2. 脚本长度为 1。
  // 3. 没有重音符号
  if (
    element.attribs?.accent?.toLowerCase() !== 'true' &&
    element.attribs?.accentunder?.toLowerCase() !== 'true' &&
    script.name === 'mo' &&
    base.name === 'mrow' &&
    scriptText.length === 1
  ) {
    targetParent.children.push({
      type: 'tag',
      name: 'm:groupChr',
      attribs: {},
      children: [
        {
          type: 'tag',
          name: 'm:groupChrPr',
          attribs: {},
          children: [
            {
              type: 'tag',
              name: 'm:chr',
              attribs: {
                'm:val': scriptText,
                'm:pos': direction === 'under' ? 'bot' : 'top'
              },
              children: []
            }
          ]
        },
        baseTarget
      ]
    })
    return
  }
  // 回退：m:lim

  const scriptTarget = {
    name: 'm:lim',
    type: 'tag',
    attribs: {},
    children: []
  }

  walker(script, scriptTarget, false, false, ancestors)
  targetParent.children.push({
    type: 'tag',
    name: direction === 'under' ? 'm:limLow' : 'm:limUpp',
    attribs: {},
    children: [baseTarget, scriptTarget]
  })
  // 不要以常规方式遍历子元素。
}

export function munder(element, targetParent, previousSibling, nextSibling, ancestors) {
  return underOrOver(element, targetParent, previousSibling, nextSibling, ancestors, 'under')
}

export function mover(element, targetParent, previousSibling, nextSibling, ancestors) {
  return underOrOver(element, targetParent, previousSibling, nextSibling, ancestors, 'over')
}
