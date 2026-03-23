import { getNary, getNaryTarget } from '../ooml/index.js'
import { walker } from '../walker.js'

export function msubsup(element, targetParent, previousSibling, nextSibling, ancestors) {
  // 下标 + 上标
  if (element.children.length !== 3) {
    // 视为 mrow 处理
    return targetParent
  }

  ancestors = [...ancestors]
  ancestors.unshift(element)

  const base = element.children[0]
  const subscript = element.children[1]
  const superscript = element.children[2]

  let topTarget
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
    topTarget = getNaryTarget(naryChar, element, 'subSup')
    element.isNary = true
  } else {
    // 检查空基底 → 前标模式（LaTeX {}^{sup}_{sub}X）
    const isEmptyBase = base.name === 'mrow' && (!base.children || base.children.length === 0)

    if (isEmptyBase) {
      topTarget = {
        type: 'tag',
        name: 'm:sPre',
        attribs: {},
        children: [
          {
            type: 'tag',
            name: 'm:sPrePr',
            attribs: {},
            children: [
              {
                type: 'tag',
                name: 'm:ctrlPr',
                attribs: {},
                children: []
              }
            ]
          }
        ]
      }
      element.isPrescript = true
    } else {
      // 常规 m:sSubSup
      const baseTarget = {
        name: 'm:e',
        type: 'tag',
        attribs: {},
        children: []
      }

      walker(base, baseTarget, false, false, ancestors)
      topTarget = {
        type: 'tag',
        name: 'm:sSubSup',
        attribs: {},
        children: [
          {
            type: 'tag',
            name: 'm:sSubSupPr',
            attribs: {},
            children: [
              {
                type: 'tag',
                name: 'm:ctrlPr',
                attribs: {},
                children: []
              }
            ]
          },
          baseTarget
        ]
      }
    }
  }

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
  walker(subscript, subscriptTarget, false, false, ancestors)
  walker(superscript, superscriptTarget, false, false, ancestors)
  topTarget.children.push(subscriptTarget)
  topTarget.children.push(superscriptTarget)
  if (element.isNary) {
    topTarget.children.push({ type: 'tag', name: 'm:e', attribs: {}, children: [] })
  }
  if (element.isPrescript) {
    topTarget.children.push({ type: 'tag', name: 'm:e', attribs: {}, children: [] })
  }
  targetParent.children.push(topTarget)
  // 不要以常规方式遍历子元素。
}
