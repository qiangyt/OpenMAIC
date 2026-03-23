export function mrow(element, targetParent, previousSibling, nextSibling, ancestors) {
  // 检测围栏模式：<mo fence="true">OPEN ... <mo fence="true">CLOSE
  // 转换为 OMML <m:d> 分隔符（例如二项式、\left(\right)）
  const children = element.children || []
  if (children.length >= 2) {
    const first = children[0]
    const last = children[children.length - 1]
    if (first?.name === 'mo' && first?.attribs?.fence === 'true' &&
        last?.name === 'mo' && last?.attribs?.fence === 'true') {
      const begChar = first.children?.[0]?.data || '('
      const endChar = last.children?.[0]?.data || ')'
      const dNode = {
        type: 'tag', name: 'm:d', attribs: {}, children: [
          { type: 'tag', name: 'm:dPr', attribs: {}, children: [
            { type: 'tag', name: 'm:begChr', attribs: { 'm:val': begChar }, children: [] },
            { type: 'tag', name: 'm:endChr', attribs: { 'm:val': endChar }, children: [] },
            { type: 'tag', name: 'm:ctrlPr', attribs: {}, children: [] }
          ]},
          { type: 'tag', name: 'm:e', attribs: {}, children: [] }
        ]
      }
      targetParent.children.push(dNode)
      // 标记围栏运算符，以便 walker 子循环跳过它们
      first.skipInWalker = true
      last.skipInWalker = true
      // 返回 <m:e> 作为目标 — 内部子元素放到这里
      return dNode.children[1]
    }
  }
  // isNary 重定向现在由 walker 的子循环处理
  return targetParent
}
