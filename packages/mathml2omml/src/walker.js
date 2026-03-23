import * as mathmlHandlers from './mathml/index.js'
import { addScriptlevel } from './ooml/index.js'

export function walker(
  element,
  targetParent,
  previousSibling = false,
  nextSibling = false,
  ancestors = []
) {
  if (
    !previousSibling &&
    ['m:deg', 'm:den', 'm:e', 'm:fName', 'm:lim', 'm:num', 'm:sub', 'm:sup'].includes(
      targetParent.name
    )
  ) {
    // 我们正在遍历可能出现 <m:argPr> 的元素中的第一个元素。
    // <m:argPr> 可以指定 scriptlevel，但只有在有内容时才有意义。
    // 既然我们到了这里，意味着至少有一个内容项。
    // 所以我们将检查是否添加 m:rPr。
    // 可能的父类型参见
    // https://docs.microsoft.com/en-us/dotnet/api/documentformat.openxml.math.argumentproperties?view=openxml-2.8.1#remarks
    addScriptlevel(targetParent, ancestors)
  }
  let targetElement
  const nameOrType = element.name || element.type
  if (mathmlHandlers[nameOrType]) {
    targetElement = mathmlHandlers[nameOrType](
      element,
      targetParent,
      previousSibling,
      nextSibling,
      ancestors
    )
  } else {
    if (nameOrType && nameOrType !== 'root') {
      console.warn(`Type not supported: ${nameOrType}`)
    }

    targetElement = targetParent
  }

  if (!targetElement) {
    // 目标元素未赋值，因此不处理子元素。
    return
  }
  if (element.children?.length) {
    ancestors = [...ancestors]
    ancestors.unshift(element)
    // 跟踪 nary 体重定向：在 nary 运算符之后，将后续兄弟节点重定向到其 <m:e> 中，
    // 直到遇到关系运算符（=、<、> 等）。通过嵌套的 nary 运算符链式传递（例如双重积分 ∫∫）。
    let naryBodyTarget = null
    // 跟踪前标重定向：在带有空基底的 msubsup 之后（例如 {}^{14}_{6}C），
    // 将下一个兄弟节点重定向到 <m:sPre> 的 <m:e> 中。
    let prescriptTarget = null
    for (let i = 0; i < element.children.length; i++) {
      const child = element.children[i]
      if (child.skipInWalker) continue

      // 关系/分隔符 <mo> 或 <mtext> 会停止 nary 重定向，
      // 以便操作数后面的内容保持在 nary 体之外。
      // 示例：∑ aᵢ = S  →  操作数是 aᵢ  （由 = 停止）
      //       ∑ aᵢ, bⱼ  →  操作数是 aᵢ  （由 , 停止）
      //       ∑ aᵢ \text{ for } i  →  操作数是 aᵢ  （由 mtext 停止）
      if (naryBodyTarget) {
        if (child.name === 'mo') {
          const txt = child.children?.[0]?.data
          if (txt && /^[=<>≤≥≠≈≡∼≲≳≪≫∈∉⊂⊃⊆⊇⊄⊅≺≻⪯⪰∝≅≃≍≎∥⊥⊢⊣⊨⊩,;:∣]$/.test(txt)) {
            naryBodyTarget = null
          }
        } else if (child.name === 'mtext') {
          naryBodyTarget = null
        }
      }

      const effectiveTarget = prescriptTarget || naryBodyTarget || targetElement
      walker(
        child,
        effectiveTarget,
        element.children[i - 1],
        element.children[i + 1],
        ancestors
      )
      if (child.isNary) {
        // 链入新 nary 的 <m:e>
        const naryNode = effectiveTarget.children[effectiveTarget.children.length - 1]
        naryBodyTarget = naryNode.children[naryNode.children.length - 1]
      }
      if (child.isPrescript) {
        // 将下一个兄弟节点重定向到 <m:sPre> 的 <m:e> 中
        const preNode = effectiveTarget.children[effectiveTarget.children.length - 1]
        prescriptTarget = preNode.children[preNode.children.length - 1]
      } else if (prescriptTarget) {
        // 消耗了一个元素；停止前标重定向
        prescriptTarget = null
      }
    }
  }
}
