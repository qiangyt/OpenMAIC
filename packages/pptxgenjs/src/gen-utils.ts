/**
 * PptxGenJS: 工具方法
 */

import { EMU, REGEX_HEX_COLOR, DEF_FONT_COLOR, ONEPT, SchemeColor, SCHEME_COLORS } from './core-enums'
import { PresLayout, TextGlowProps, PresSlide, ShapeFillProps, Color, ShapeLineProps, Coord, ShadowProps } from './core-interfaces'

/**
 * 将任意类型的 `x`/`y`/`w`/`h` 属性转换为 EMU
    - 无论 undefined、 null 等如何，都保证返回结果（0)
    - {number} - 12800 (EMU)
    - {number} - 0.5 (英寸)
    - {string} - "75%"
    * @param {number|string} size - 数字 ("5.5") 或百分比 ("90%")
    * @param {'X' | 'Y'} xyDir - 方向
    * @param {PresLayout} layout - 演示文稿布局
    * @returns {number} 计算后的大小
    */
export function getSmartParseNumber (size: Coord, xyDir: 'X' | 'Y', layout: PresLayout): number {
	// 首先: 如果需要，将字符串数字值转换
	if (typeof size === 'string' && !isNaN(Number(size))) size = Number(size)

	// 情况 1: 以英寸为单位的数字
	// 假设任何小于 100 的数字都是英寸
	if (typeof size === 'number' && size < 100) return inch2Emu(size)

	// 情况 2: 数字已经转换为除英寸以外的其他单位
	// 假设任何大于 100 的数字肯定不是英寸！直接返回（假设值已经是 EMU）
	if (typeof size === 'number' && size >= 100) return size

	// 情况 3: 百分比 (例如: '50%')
	if (typeof size === 'string' && size.includes('%')) {
		if (xyDir && xyDir === 'X') return Math.round((parseFloat(size) / 100) * layout.width)
		if (xyDir && xyDir === 'Y') return Math.round((parseFloat(size) / 100) * layout.height)

		// 默认: 假设为宽度 (x/cx)
		return Math.round((parseFloat(size) / 100) * layout.width)
	}

	// 最后: 默认值
	return 0
}

/**
 * 基础 UUID 生成器改编
 * @link https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript#answer-2117523
 * @param {string} uuidFormat - UUID 格式
 * @returns {string} UUID
 */
export function getUuid (uuidFormat: string): string {
	return uuidFormat.replace(/[xy]/g, function (c) {
		const r = (Math.random() * 16) | 0
		const v = c === 'x' ? r : (r & 0x3) | 0x8
		return v.toString(16)
	})
}

/**
 * 将特殊 XML 字符替换为 HTML 编码字符串
 * @param {string} xml - 要编码的 XML 字符串
 * @returns {string} 转义后的 XML
 */
export function encodeXmlEntities (xml: string): string {
	// 注意: 在这里不要使用短路求值，因为值可能是 "0"（零）等！
	if (typeof xml === 'undefined' || xml == null) return ''
	return xml.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/**
 * 将英寸转换为 EMU
 * @param {number|string} inches - 以字符串或数字形式表示的英寸值
 * @returns {number} EMU 值
 */
export function inch2Emu (inches: number | string): number {
	// 注意: 为调用者提供安全保护: 数字可能在传输过程中被转换<->转换，所以请进行一些简单的检查以确保传入的是英寸
	// 任何超过 100 的值肯定不是英寸，所以让我们假设它已经是 EMU 了,直接返回相同的值
	if (typeof inches === 'number' && inches > 100) return inches
	if (typeof inches === 'string') inches = Number(inches.replace(/in*/gi, ''))
	return Math.round(EMU * inches)
}

/**
 * 将 `pt` 转换为点数（使用 `ONEPT`）
 * @param {number|string} pt
 * @returns {number} 值以点为单位 (`ONEPT`)
 */
export function valToPts (pt: number | string): number {
	const points = Number(pt) || 0
	return isNaN(points) ? 0 : Math.round(points * ONEPT)
}

/**
 * 将角度 (0..360) 转换为 PowerPoint `rot` 值
 * @param {number} d 角度
 * @returns {number} 计算后的 `rot` 值
 */
export function convertRotationDegrees (d: number): number {
	d = d || 0
	return Math.round((d > 360 ? d - 360 : d) * 60000)
}

/**
 * 将组件值转换为十六进制值
 * @param {number} c - 组件颜色
 * @returns {string} 十六进制字符串
 */
export function componentToHex (c: number): string {
	const hex = c.toString(16)
	return hex.length === 1 ? '0' + hex : hex
}

/**
 * 将 CSS 选择器中的 RGB 颜色转换为演示文稿颜色的十六进制
 * @param {number} r - 红色值
 * @param {number} g - 绿色值
 * @param {number} b - 蓝色值
 * @returns {string} XML 字符串
 */
export function rgbToHex (r: number, g: number, b: number): string {
	return (componentToHex(r) + componentToHex(g) + componentToHex(b)).toUpperCase()
}

/**  TODO: 未来: TODO-4.0:
 * @date 2022-04-10
 * @tldr 这应该是一个私有方法，所有当前调用都应切换到 `genXmlColorSelection()`
 * @desc 很多代码调用此方法
 * @example [gen-charts.tx] `strXml += '<a:solidFill>' + createColorElement(seriesColor, `<a:alpha val="${Math.round(opts.chartColorsOpacity * 1000)}"/>`) + '</a:solidFill>'`
 * 这是不对的。我们应该调用 `genXmlColorSelection()`，因为它返回 `<a:solidfill>BLAH</a:solidFill>`！！
 */
/**
 * 创建 `a:schemeClr`（方案颜色）或 `a:srgbClr`（十六进制表示）。
 * @param {string|SCHEME_COLORS} colorStr - 十六进制表示（例如 "FFFF00"）或方案颜色常量（例如 pptx.SchemeColor.ACCENT1）
 * @param {string} innerElements - 调整颜色并被颜色元素包裹的附加元素
 * @returns {string} XML 字符串
 */
export function createColorElement (colorStr: string | SCHEME_COLORS, innerElements?: string): string {
	let colorVal = (colorStr || '').replace('#', '')

	if (
		!REGEX_HEX_COLOR.test(colorVal) &&
		colorVal !== SchemeColor.background1 &&
		colorVal !== SchemeColor.background2 &&
		colorVal !== SchemeColor.text1 &&
		colorVal !== SchemeColor.text2 &&
		colorVal !== SchemeColor.accent1 &&
		colorVal !== SchemeColor.accent2 &&
		colorVal !== SchemeColor.accent3 &&
		colorVal !== SchemeColor.accent4 &&
		colorVal !== SchemeColor.accent5 &&
		colorVal !== SchemeColor.accent6
	) {
		console.warn(`"${colorVal}" 不是有效的方案颜色或十六进制 RGB！已改用 "${DEF_FONT_COLOR}"。请只提供 6 位 RGB 或 'pptx.SchemeColor' 值！`)
		colorVal = DEF_FONT_COLOR
	}

	const tagName = REGEX_HEX_COLOR.test(colorVal) ? 'srgbClr' : 'schemeClr'
	const colorAttr = 'val="' + (REGEX_HEX_COLOR.test(colorVal) ? colorVal.toUpperCase() : colorVal) + '"'

	return innerElements ? `<a:${tagName} ${colorAttr}>${innerElements}</a:${tagName}>` : `<a:${tagName} ${colorAttr}/>`
}

/**
 * 创建 `a:glow` 元素
 * @param {TextGlowProps} options 发光属性
 * @param {TextGlowProps} defaults `opts` 中未指定属性的默认值
 * @see http://officeopenxml.com/drwSp-effects.php
 * { size: 8, color: 'FFFFFF', opacity: 0.75 };
 */
export function createGlowElement (options: TextGlowProps, defaults: TextGlowProps): string {
	let strXml = ''
	const opts = { ...defaults, ...options }
	const size = Math.round(opts.size * ONEPT)
	const color = opts.color
	const opacity = Math.round(opts.opacity * 100000)

	strXml += `<a:glow rad="${size}">`
	strXml += createColorElement(color, `<a:alpha val="${opacity}"/>`)
	strXml += '</a:glow>'

	return strXml
}

/**
 * 创建颜色选择
 * @param {Color | ShapeFillProps | ShapeLineProps} props 填充属性
 * @returns XML 字符串
 */
export function genXmlColorSelection (props: Color | ShapeFillProps | ShapeLineProps): string {
	let fillType = 'solid'
	let colorVal = ''
	let internalElements = ''
	let outText = ''

	if (props) {
		if (typeof props === 'string') colorVal = props
		else {
			if (props.type) fillType = props.type
			if (props.color) colorVal = props.color
			if (props.alpha) internalElements += `<a:alpha val="${Math.round((100 - props.alpha) * 1000)}"/>` // 已废弃: @deprecated v3.3.0
			if (props.transparency) internalElements += `<a:alpha val="${Math.round((100 - props.transparency) * 1000)}"/>`
		}

		switch (fillType) {
			case 'solid':
				outText += `<a:solidFill>${createColorElement(colorVal, internalElements)}</a:solidFill>`
				break
			default: // @note 需要一个语句，因为只有"break"会被 rollup 移除,然后触发"no-default" js-linter
				outText += ''
				break
		}
	}

	return outText
}

/**
 * 获取图表、媒体等的新关联 ID (rId)
 * @param {PresSlide} target - 要使用的幻灯片
 * @returns {number} 所有当前关联的数量加 1，供调用者用作"rId"
 */
export function getNewRelId (target: PresSlide): number {
	return target._rels.length + target._relsChart.length + target._relsMedia.length + 1
}

/**
 * 检查用户传递的阴影选项，并在需要时进行修正
 * @param {ShadowProps} ShadowProps - 阴影选项
 */
export function correctShadowOptions (ShadowProps: ShadowProps): ShadowProps | undefined {
	if (!ShadowProps || typeof ShadowProps !== 'object') {
		// console.warn("`shadow` 选项必须是对象。例如：`{shadow: {type:'none'}}`")
		return
	}

	// 选项：`type`
	if (ShadowProps.type !== 'outer' && ShadowProps.type !== 'inner' && ShadowProps.type !== 'none') {
		console.warn('警告：shadow.type 选项为 `outer`、`inner` 或 `none`。')
		ShadowProps.type = 'outer'
	}

	// 选项：`angle`
	if (ShadowProps.angle) {
		// A: 现实检查
		if (isNaN(Number(ShadowProps.angle)) || ShadowProps.angle < 0 || ShadowProps.angle > 359) {
			console.warn('警告：shadow.angle 只能为 0-359')
			ShadowProps.angle = 270
		}

		// B: 健壮性：将任何类型的有效参数转换为整数: '12', 12.3 等 -> 12
		ShadowProps.angle = Math.round(Number(ShadowProps.angle))
	}

	// 选项：`opacity`
	if (ShadowProps.opacity) {
		// A: 现实检查
		if (isNaN(Number(ShadowProps.opacity)) || ShadowProps.opacity < 0 || ShadowProps.opacity > 1) {
			console.warn('警告：shadow.opacity 只能为 0-1')
			ShadowProps.opacity = 0.75
		}

		// B: 健壮性：将任何类型的有效参数转换为数字: '12', 12.3 等 -> 12
		ShadowProps.opacity = Number(ShadowProps.opacity)
	}

	// 选项：`color`
	if (ShadowProps.color) {
		// 格式不正确
		if (ShadowProps.color.startsWith('#')) {
			console.warn('警告：shadow.color 不应包含井号 (#) 字符，例如 "FF0000"')
			ShadowProps.color = ShadowProps.color.replace('#', '')
		}
	}

	return ShadowProps
}
