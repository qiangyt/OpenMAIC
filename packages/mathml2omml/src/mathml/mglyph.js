export function mglyph(element, targetParent, previousSibling, nextSibling, ancestors) {
  // omml 不支持。输出 alt 文本。
  if (element.attribs?.alt) {
    targetParent.children.push({
      type: 'text',
      data: element.attribs.alt
    })
  }
}
