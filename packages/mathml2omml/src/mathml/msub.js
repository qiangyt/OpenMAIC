import { getNary, getNaryTarget } from '../ooml/index.js'
import { walker } from '../walker.js'

export function msub(element, targetParent, previousSibling, nextSibling, ancestors) {
  // 下标
  if (element.children.length !== 2) {
    // 视为 mrow 处理
    return targetParent
  }
  ancestors = [...ancestors]
  ancestors.unshift(element)
  const base = element.children[0]
  const subscript = element.children[1]

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
    topTarget = getNaryTarget(naryChar, element, 'subSup', false, true)
    element.isNary = true
  } else {
    // 检查空基底 → 前标模式（LaTeX {}_{sub}X）
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
      const baseTarget = {
        name: 'm:e',
        type: 'tag',
        attribs: {},
        children: []
      }
      walker(base, baseTarget, false, false, ancestors)
      topTarget = {
        type: 'tag',
        name: 'm:sSub',
        attribs: {},
        children: [
          {
            type: 'tag',
            name: 'm:sSubPr',
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

  walker(subscript, subscriptTarget, false, false, ancestors)
  topTarget.children.push(subscriptTarget)
  if (element.isNary) {
    topTarget.children.push({ type: 'tag', name: 'm:sup', attribs: {}, children: [] })
    topTarget.children.push({ type: 'tag', name: 'm:e', attribs: {}, children: [] })
  }
  // 对于前标，添加空的 m:sup 和 m:e（基底由 walker 重定向填充）
  if (element.isPrescript) {
    topTarget.children.push({ type: 'tag', name: 'm:sup', attribs: {}, children: [] })
    topTarget.children.push({ type: 'tag', name: 'm:e', attribs: {}, children: [] })
  }
  targetParent.children.push(topTarget)
  // 不要以常规方式遍历子元素。
}
