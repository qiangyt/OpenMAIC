/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PptxGenJS 接口
 */

import { CHART_NAME, PLACEHOLDER_TYPE, SHAPE_NAME, SLIDE_OBJECT_TYPES, TEXT_HALIGN, TEXT_VALIGN, WRITE_OUTPUT_TYPE } from './core-enums'

// 核心类型
// ==========

/**
 * 坐标数字 - 可以是：
 * - 英寸 (0-n)
 * - 百分比 (0-100)
 *
 * @example 10.25 // 以英寸为单位的坐标
 * @example '75%' // 以幻灯片大小百分比为单位的坐标
 */
export type Coord = number | `${number}%`
export interface PositionProps {
	/**
	 * 水平位置
	 * - 英寸或百分比
	 * @example 10.25 // 以英寸为单位的位置
	 * @example '75%' // 以幻灯片大小百分比为单位的位置
	 */
	x?: Coord
	/**
	 * 垂直位置
	 * - 英寸或百分比
	 * @example 10.25 // 以英寸为单位的位置
	 * @example '75%' // 以幻灯片大小百分比为单位的位置
	 */
	y?: Coord
	/**
	 * 高度
	 * - 英寸或百分比
	 * @example 10.25 // 以英寸为单位的高度
	 * @example '75%' // 以幻灯片大小百分比为单位的高度
	 */
	h?: Coord
	/**
	 * 宽度
	 * - 英寸或百分比
	 * @example 10.25 // 以英寸为单位的宽度
	 * @example '75%' // 以幻灯片大小百分比为单位的宽度
	 */
	w?: Coord
}
/**
 * 必须提供 `data` 或 `path`
 */
export interface DataOrPathProps {
	/**
	 * URL 或相对路径
	 *
	 * @example 'https://onedrives.com/myimg.png` // 通过 URL 获取图片
	 * @example '/home/gitbrent/images/myimg.png` // 通过本地路径获取图片
	 */
	path?: string
	/**
	 * base64 编码的字符串
	 * - 用于避免潜在的路径/服务器问题
	 *
	 * @example 'image/png;base64,iVtDafDrBF[...]=' // base-64 预编码的图片
	 */
	data?: string
}
export interface BackgroundProps extends DataOrPathProps, ShapeFillProps {
	/**
	 * 颜色（十六进制格式）
	 * @deprecated v3.6.0 - 改用 `ShapeFillProps`
	 */
	fill?: HexColor

	/**
	 * 源 URL
	 * @deprecated v3.6.0 - 改用 `DataOrPathProps` - 将在 v4.0.0 中移除
	 */
	src?: string
}
/**
 * 十六进制格式的颜色
 * @example 'FF3399'
 */
export type HexColor = string
export type ThemeColor = 'tx1' | 'tx2' | 'bg1' | 'bg2' | 'accent1' | 'accent2' | 'accent3' | 'accent4' | 'accent5' | 'accent6'
export type Color = HexColor | ThemeColor
export type Margin = number | [number, number, number, number]
export type HAlign = 'left' | 'center' | 'right' | 'justify'
export type VAlign = 'top' | 'middle' | 'bottom'

// 用于图表、形状、文本
export interface BorderProps {
	/**
	 * 边框类型
	 * @default solid
	 */
	type?: 'none' | 'dash' | 'solid'
	/**
	 * 边框颜色（十六进制）
	 * @example 'FF3399'
	 * @default '666666'
	 */
	color?: HexColor

	// TODO: 为边框添加 `transparency` 属性 (0-100%)

	// TODO: 添加 `width` - 废弃 `pt`
	/**
	 * 边框大小（点）
	 * @default 1
	 */
	pt?: number
}
// 用于：图片、对象、文本
export interface HyperlinkProps {
	_rId: number
	/**
	 * 要链接到的幻灯片编号
	 */
	slide?: number
	/**
	 * 要链接到的 URL
	 */
	url?: string
	/**
	 * 超链接提示
	 */
	tooltip?: string
}
// 用于：图表、文本、图片
export interface ShadowProps {
	/**
	 * 阴影类型
	 * @default 'none'
	 */
	type: 'outer' | 'inner' | 'none'
	/**
	 * 不透明度（百分比）
	 * - 范围：0.0-1.0
	 * @example 0.5 // 50% 不透明
	 */
	opacity?: number // TODO: PPT 中的"透明度 (0-100%)" // TODO: 废弃并添加 `transparency`
	/**
	 * 模糊（点）
	 * - 范围：0-100
	 * @default 0
	 */
	blur?: number
	/**
	 * 角度（度）
	 * - 范围：0-359
	 * @default 0
	 */
	angle?: number
	/**
	 * 阴影偏移（点）
	 * - 范围：0-200
	 * @default 0
	 */
	offset?: number // TODO: PPT 中的"距离"
	/**
	 * 阴影颜色（十六进制格式）
	 * @example 'FF3399'
	 */
	color?: HexColor
	/**
	 * 是否随形状旋转阴影
	 * @default false
	 */
	rotateWithShape?: boolean
}
// 用于：形状、表格、文本
export interface ShapeFillProps {
	/**
	 * 填充颜色
	 * - `HexColor` 或 `ThemeColor`
	 * @example 'FF0000' // 十六进制颜色（红色）
	 * @example pptx.SchemeColor.text1 // 主题颜色（Text1）
	 */
	color?: Color
	/**
	 * 透明度（百分比）
	 * - MS-PPT > 设置形状格式 > 填充与线条 > 填充 > 透明度
	 * - 范围：0-100
	 * @default 0
	 */
	transparency?: number
	/**
	 * 填充类型
	 * @default 'solid'
	 */
	type?: 'none' | 'solid'

	/**
	 * 透明度（百分比）
	 * @deprecated v3.3.0 - 改用 `transparency`
	 */
	alpha?: number
}
export interface ShapeLineProps extends ShapeFillProps {
	/**
	 * 线条宽度（点）
	 * @default 1
	 */
	width?: number
	/**
	 * 虚线类型
	 * @default 'solid'
	 */
	dashType?: 'solid' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot'
	/**
	 * 起始箭头类型
	 * @since v3.3.0
	 */
	beginArrowType?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
	/**
	 * 结束箭头类型
	 * @since v3.3.0
	 */
	endArrowType?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
	// 未来：beginArrowSize (1-9)
	// 未来：endArrowSize (1-9)

	/**
	 * 虚线类型
	 * @deprecated v3.3.0 - 改用 `dashType`
	 */
	lineDash?: 'solid' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot'
	/**
	 * @deprecated v3.3.0 - 改用 `beginArrowType`
	 */
	lineHead?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
	/**
	 * @deprecated v3.3.0 - 改用 `endArrowType`
	 */
	lineTail?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
	/**
	 * 线条宽度（点）
	 * @deprecated v3.3.0 - 改用 `width`
	 */
	pt?: number
	/**
	 * 线条大小（点）
	 * @deprecated v3.3.0 - 改用 `width`
	 */
	size?: number
}
// 用于：图表、幻灯片、表格、文本
export interface TextBaseProps {
	/**
	 * 水平对齐方式
	 * @default 'left'
	 */
	align?: HAlign
	/**
	 * 粗体样式
	 * @default false
	 */
	bold?: boolean
	/**
	 * 添加换行符
	 * @default false
	 */
	breakLine?: boolean
	/**
	 * 添加标准或自定义项目符号
	 * - 使用 `true` 表示标准项目符号
	 * - 传递对象选项表示自定义项目符号
	 * @default false
	 */
	bullet?:
	| boolean
	| {
		/**
		 * 项目符号类型
		 * @default bullet
		 */
		type?: 'bullet' | 'number'
		/**
		 * 项目符号字符代码（unicode）
		 * @since v3.3.0
		 * @example '25BA' // '黑色向右指针' (U+25BA)
		 */
		characterCode?: string
		/**
		 * 缩进（项目符号和文本之间的间距）（点）
		 * @since v3.3.0
		 * @default 27 // DEF_BULLET_MARGIN
		 * @example 10 // 将文本从项目符号缩进 10 点
		 */
		indent?: number
		/**
		 * 编号类型
		 * @since v3.3.0
		 * @example 'romanLcParenR' // 带右括号的小写罗马数字
		 */
		numberType?:
		| 'alphaLcParenBoth'
		| 'alphaLcParenR'
		| 'alphaLcPeriod'
		| 'alphaUcParenBoth'
		| 'alphaUcParenR'
		| 'alphaUcPeriod'
		| 'arabicParenBoth'
		| 'arabicParenR'
		| 'arabicPeriod'
		| 'arabicPlain'
		| 'romanLcParenBoth'
		| 'romanLcParenR'
		| 'romanLcPeriod'
		| 'romanUcParenBoth'
		| 'romanUcParenR'
		| 'romanUcPeriod'
		/**
		 * 编号项目符号起始值
		 * @since v3.3.0
		 * @default 1
		 * @example 10 // 编号项目符号从 10 开始
		 */
		numberStartAt?: number

		// 已废弃

		/**
		 * 项目符号代码（unicode）
		 * @deprecated v3.3.0 - 改用 `characterCode`
		 */
		code?: string
		/**
		 * 项目符号和文本之间的边距
		 * @since v3.2.1
		 * @deprecated v3.3.0 - 改用 `indent`
		 */
		marginPt?: number
		/**
		 * 起始编号（仅适用于 type:number）
		 * @deprecated v3.3.0 - 改用 `numberStartAt`
		 */
		startAt?: number
		/**
		 * 编号类型
		 * @deprecated v3.3.0 - 改用 `numberType`
		 */
		style?: string
	}
	/**
	 * 文本颜色
	 * - `HexColor` 或 `ThemeColor`
	 * - MS-PPT > 设置形状格式 > 文本选项 > 文本填充与轮廓 > 文本填充 > 颜色
	 * @example 'FF0000' // 十六进制颜色（红色）
	 * @example pptx.SchemeColor.text1 // 主题颜色（Text1）
	 */
	color?: Color
	/**
	 * 字体名称
	 * @example 'Arial' // Arial 字体
	 */
	fontFace?: string
	/**
	 * 字体大小
	 * @example 12 // 字体大小 12
	 */
	fontSize?: number
	/**
	 * 文本高亮颜色（十六进制格式）
	 * @example 'FFFF00' // 黄色
	 */
	highlight?: HexColor
	/**
	 * 斜体样式
	 * @default false
	 */
	italic?: boolean
	/**
	 * 语言
	 * - ISO 639-1 标准语言代码
	 * @default 'en-US' // 英语（美国）
	 * @example 'fr-CA' // 法语（加拿大）
	 */
	lang?: string
	/**
	 * 在行文本内容前添加软换行符（shift+enter）
	 * @default false
	 * @since v3.5.0
	 */
	softBreakBefore?: boolean
	/**
	 * 制表位
	 * - PowerPoint：段落 > 制表位 > 制表位位置
	 * @example [{ position:1 }, { position:3 }] // 将第一个制表位设置为 1 英寸，将第二个制表位设置为 3 英寸
	 */
	tabStops?: Array<{ position: number, alignment?: 'l' | 'r' | 'ctr' | 'dec' }>
	/**
	 * 文本方向
	 * `horz` = 水平
	 * `vert` = 旋转 90 度
	 * `vert270` = 旋转 270 度
	 * `wordArtVert` = 堆叠
	 * @default 'horz'
	 */
	textDirection?: 'horz' | 'vert' | 'vert270' | 'wordArtVert'
	/**
	 * 透明度（百分比）
	 * - MS-PPT > 设置形状格式 > 文本选项 > 文本填充与轮廓 > 文本填充 > 透明度
	 * - 范围：0-100
	 * @default 0
	 */
	transparency?: number
	/**
	 * 下划线属性
	 * - PowerPoint：字体 > 颜色与下划线 > 下划线样式/下划线颜色
	 * @default (无)
	 */
	underline?: {
		style?:
		| 'dash'
		| 'dashHeavy'
		| 'dashLong'
		| 'dashLongHeavy'
		| 'dbl'
		| 'dotDash'
		| 'dotDashHeave'
		| 'dotDotDash'
		| 'dotDotDashHeavy'
		| 'dotted'
		| 'dottedHeavy'
		| 'heavy'
		| 'none'
		| 'sng'
		| 'wavy'
		| 'wavyDbl'
		| 'wavyHeavy'
		color?: Color
	}
	/**
	 * 垂直对齐方式
	 * @default 'top'
	 */
	valign?: VAlign
}
export interface PlaceholderProps extends PositionProps, TextBaseProps {
	name: string
	type: PLACEHOLDER_TYPE
	/**
	 * 边距（点）
	 */
	margin?: Margin
}
export interface ObjectNameProps {
	/**
	 * 对象名称
	 * - 用于代替默认的"对象 N"名称
	 * - PowerPoint：开始 > 排列 > 选择窗格...
	 * @since v3.10.0
	 * @default 'Object 1'
	 * @example 'Antenna Design 9'
	 */
	objectName?: string
}
export interface ThemeProps {
	/**
	 * 标题字体名称
	 * @example 'Arial Narrow'
	 * @default 'Calibri Light'
	 */
	headFontFace?: string
	/**
	 * 正文字体名称
	 * @example 'Arial'
	 * @default 'Calibri'
	 */
	bodyFontFace?: string
}

// 图片 / 媒体 ==================================================================================
export type MediaType = 'audio' | 'online' | 'video'

export interface ImageProps extends PositionProps, DataOrPathProps, ObjectNameProps {
	/**
	 * 替代文本值（"您如何向盲人描述此对象及其内容？"）
	 * - PowerPoint：[右键点击图片] > "编辑替代文本..."
	 */
	altText?: string
	/**
	 * 水平翻转？
	 * @default false
	 */
	flipH?: boolean
	/**
	 * 垂直翻转？
	 * @default false
	 */
	flipV?: boolean
	hyperlink?: HyperlinkProps
	/**
	 * 占位符类型
	 * - 值：'body' | 'header' | 'footer' | 'title' | 等
	 * @example 'body'
	 * @see https://docs.microsoft.com/en-us/office/vba/api/powerpoint.ppplaceholdertype
	 */
	placeholder?: string
	/**
	 * 图片旋转（度）
	 * - 范围：-360 到 360
	 * @default 0
	 * @example 180 // 将图片旋转 180 度
	 */
	rotate?: number
	/**
	 * 启用图片圆角
	 * @default false
	 */
	rounding?: boolean
	/**
	 * 阴影属性
	 * - MS-PPT > 设置图片格式 > 阴影
	 * @example
	 * { type: 'outer', color: '000000', opacity: 0.5, blur: 20,  offset: 20, angle: 270 }
	 */
	shadow?: ShadowProps
	/**
	 * 图片尺寸选项
	 */
	sizing?: {
		/**
		 * 尺寸类型
		 */
		type: 'contain' | 'cover' | 'crop'
		/**
		 * 图片宽度
		 * - 英寸或百分比
		 * @example 10.25 // 以英寸为单位的位置
		 * @example '75%' // 以幻灯片大小百分比为单位的位置
		 */
		w: Coord
		/**
		 * 图片高度
		 * - 英寸或百分比
		 * @example 10.25 // 以英寸为单位的位置
		 * @example '75%' // 以幻灯片大小百分比为单位的位置
		 */
		h: Coord
		/**
		 * 从左侧裁剪图片的偏移量
		 * - 仅限 `crop`
		 * - 英寸或百分比
		 * @example 10.25 // 以英寸为单位的位置
		 * @example '75%' // 以幻灯片大小百分比为单位的位置
		 */
		x?: Coord
		/**
		 * 从顶部裁剪图片的偏移量
		 * - 仅限 `crop`
		 * - 英寸或百分比
		 * @example 10.25 // 以英寸为单位的位置
		 * @example '75%' // 以幻灯片大小百分比为单位的位置
		 */
		y?: Coord
	}
	/**
	 * 透明度（百分比）
	 * - MS-PPT > 设置图片格式 > 图片 > 图片透明度 > 透明度
	 * - 范围：0-100
	 * @default 0
	 * @example 25 // 25% 透明
	 */
	transparency?: number
}
/**
 * 向幻灯片添加媒体（音频/视频）
 * @requires 需要提供 `link` 或 `path`
 */
export interface MediaProps extends PositionProps, DataOrPathProps, ObjectNameProps {
	/**
	 * 媒体类型
	 * - 使用 'online' 嵌入 YouTube 视频（仅较新版本的 PowerPoint 支持）
	 */
	type: MediaType
	/**
	 * 封面图片
	 * @since 3.9.0
	 * @default "播放按钮"图片，灰色背景
	 */
	cover?: string
	/**
	 * 媒体文件扩展名
	 * - 当媒体文件路径没有扩展名时使用，例如："/folder/SomeSong"
	 * @since 3.9.0
	 * @default extension from file provided
	 */
	extn?: string
	/**
	 * 视频嵌入链接
	 * - 适用于 YouTube
	 * - 其他网站可能无法在 PowerPoint 中正确显示
	 * @example 'https://www.youtube.com/embed/Dph6ynRVyUc' // 嵌入 YouTube 视频
	 */
	link?: string
	/**
	 * 完整路径或本地路径
	 * @example 'https://freesounds/simpsons/bart.mp3' // 从服务器嵌入 mp3 音频片段
	 * @example '/sounds/simpsons_haha.mp3' // 从本地目录嵌入 mp3 音频片段
	 */
	path?: string
}

// 公式 =========================================================================================

/**
 * 向幻灯片添加公式（Office Math / OMML）
 */
export interface FormulaProps extends PositionProps, ObjectNameProps {
	/**
	 * 表示公式的 OMML XML 字符串
	 */
	omml: string
	/**
	 * 公式的字体大小（点）
	 */
	fontSize?: number
	/**
	 * 字体颜色（十六进制）
	 */
	color?: string
	/**
	 * 公式的水平对齐方式：'left' | 'center' | 'right'
	 * @default 'center'
	 */
	align?: 'left' | 'center' | 'right'
}

// 形状 =========================================================================================

export interface ShapeProps extends PositionProps, ObjectNameProps {
	/**
	 * 水平对齐方式
	 * @default 'left'
	 */
	align?: HAlign
	/**
	 * 角度范围（仅适用于 pptx.shapes.PIE, pptx.shapes.ARC, pptx.shapes.BLOCK_ARC）
	 * - 对于 pptx.shapes.BLOCK_ARC，您需要设置 arcThicknessRatio
	 * - 值：[0-359, 0-359]
	 * @since v3.4.0
	 * @default [270, 0]
	 */
	angleRange?: [number, number]
	/**
	 * 弧线厚度比例（仅适用于 pptx.shapes.BLOCK_ARC）
	 * - 您需要同时设置 angleRange 值
	 * - 值：0.0-1.0
	 * @since v3.4.0
	 * @default 0.5
	 */
	arcThicknessRatio?: number
	/**
	 * 形状填充颜色属性
	 * @example { color:'FF0000' } // 十六进制颜色（红色）
	 * @example { color:'0088CC', transparency:50 } // 十六进制颜色，50% 透明
	 * @example { color:pptx.SchemeColor.accent1 } // 主题颜色 Accent1
	 */
	fill?: ShapeFillProps
	/**
	 * 水平翻转形状？
	 * @default false
	 */
	flipH?: boolean
	/**
	 * 垂直翻转形状？
	 * @default false
	 */
	flipV?: boolean
	/**
	 * 为形状添加超链接
	 * @example hyperlink: { url: "https://github.com/gitbrent/pptxgenjs", tooltip: "Visit Homepage" },
	 */
	hyperlink?: HyperlinkProps
	/**
	 * 线条选项
	 */
	line?: ShapeLineProps
	/**
	 * 点（仅适用于 pptx.shapes.CUSTOM_GEOMETRY）
	 * - type: 'arc'
	 * - `hR` 形状弧线高度半径
	 * - `wR` 形状弧线宽度半径
	 * - `stAng` 形状弧线起始角度
	 * - `swAng` 形状弧线摆动角度
	 * @see http://www.datypic.com/sc/ooxml/e-a_arcTo-1.html
	 * @example [{ x: 0, y: 0 }, { x: 10, y: 10 }] // 在这两点之间画一条线
	 */
	points?: Array<
	| { x: Coord, y: Coord, moveTo?: boolean }
	| { x: Coord, y: Coord, curve: { type: 'arc', hR: Coord, wR: Coord, stAng: number, swAng: number } }
	| { x: Coord, y: Coord, curve: { type: 'cubic', x1: Coord, y1: Coord, x2: Coord, y2: Coord } }
	| { x: Coord, y: Coord, curve: { type: 'quadratic', x1: Coord, y1: Coord } }
	| { close: true }
	>
	/**
	 * 圆角矩形半径（仅适用于 pptx.shapes.ROUNDED_RECTANGLE）
	 * - 值：0.0 到 1.0
	 * @default 0
	 */
	rectRadius?: number
	/**
	 * 旋转（度）
	 * - 范围：-360 到 360
	 * @default 0
	 * @example 180 // 旋转 180 度
	 */
	rotate?: number
	/**
	 * 阴影选项
	 * TODO: 需要为形状阴影添加新的 demo.js 条目
	 */
	shadow?: ShadowProps

	/**
	 * @deprecated v3.3.0
	 */
	lineSize?: number
	/**
	 * @deprecated v3.3.0
	 */
	lineDash?: 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'solid' | 'sysDash' | 'sysDot'
	/**
	 * @deprecated v3.3.0
	 */
	lineHead?: 'arrow' | 'diamond' | 'none' | 'oval' | 'stealth' | 'triangle'
	/**
	 * @deprecated v3.3.0
	 */
	lineTail?: 'arrow' | 'diamond' | 'none' | 'oval' | 'stealth' | 'triangle'
	/**
	 * 形状名称（用于代替默认的"形状 N"名称）
	 * @deprecated v3.10.0 - 改用 `objectName`
	 */
	shapeName?: string
}

// 表格 =========================================================================================

export interface TableToSlidesProps extends TableProps {
	_arrObjTabHeadRows?: TableRow[]
	// _masterSlide?: SlideLayout

	/**
	 * 在自动分页期间创建的幻灯片添加图片
	 * - `image` 属性需要提供 `path` 或 `data`
	 * - 有关 `image` 属性，请参阅 `DataOrPathProps`
	 * - 有关 `options` 属性，请参阅 `PositionProps`
	 */
	addImage?: { image: DataOrPathProps, options: PositionProps }
	/**
	 * 在自动分页期间创建的幻灯片添加形状
	 */
	addShape?: { shapeName: SHAPE_NAME, options: ShapeProps }
	/**
	 * 在自动分页期间创建的幻灯片添加表格
	 */
	addTable?: { rows: TableRow[], options: TableProps }
	/**
	 * 在自动分页期间创建的幻灯片添加文本对象
	 */
	addText?: { text: TextProps[], options: TextPropsOptions }
	/**
	 * 是否启用自动分页
	 * - 自动分页在内容超出幻灯片时创建新幻灯片
	 * @default true
	 */
	autoPage?: boolean
	/**
	 * 自动分页字符权重
	 * - 调整换行前使用的字符数
	 * - 范围：-1.0 到 1.0
	 * @see https://gitbrent.github.io/PptxGenJS/docs/api-tables.html
	 * @default 0.0
	 * @example 0.5 // 行更长（增加给定行可容纳的字符数）
	 */
	autoPageCharWeight?: number
	/**
	 * 自动分页行权重
	 * - 调整幻灯片换行前使用的行数
	 * - 范围：-1.0 到 1.0
	 * @see https://gitbrent.github.io/PptxGenJS/docs/api-tables.html
	 * @default 0.0
	 * @example 0.5 // 表格更高（增加给定幻灯片可容纳的行数）
	 */
	autoPageLineWeight?: number
	/**
	 * 是否在自动分页创建的新表格上重复标题行
	 * @since v3.3.0
	 * @default false
	 */
	autoPageRepeatHeader?: boolean
	/**
	 * 自动分页创建的后续幻灯片使用的 `y` 位置
	 * @default （幻灯片的顶部边距）
	 */
	autoPageSlideStartY?: number
	/**
	 * 列宽（英寸）
	 */
	colW?: number | number[]
	/**
	 * 母版幻灯片名称
	 * - 定义母版幻灯片以使自动分页的幻灯片具有企业设计等
	 * @see https://gitbrent.github.io/PptxGenJS/docs/masters.html
	 */
	masterSlideName?: string
	/**
	 * 幻灯片边距
	 * - 此边距将应用于自动分页创建的所有幻灯片
	 */
	slideMargin?: Margin

	/**
	 * @deprecated v3.3.0 - 改用 `autoPageRepeatHeader`
	 */
	addHeaderToEach?: boolean
	/**
	 * @deprecated v3.3.0 - 改用 `autoPageSlideStartY`
	 */
	newSlideStartY?: number
}
export interface TableCellProps extends TextBaseProps {
	/**
	 * 自动分页字符权重
	 * - 调整换行前使用的字符数
	 * - 范围：-1.0 到 1.0
	 * @see https://gitbrent.github.io/PptxGenJS/docs/api-tables.html
	 * @default 0.0
	 * @example 0.5 // 行更长（增加给定行可容纳的字符数）
	 */
	autoPageCharWeight?: number
	/**
	 * 自动分页行权重
	 * - 调整幻灯片换行前使用的行数
	 * - 范围：-1.0 到 1.0
	 * @see https://gitbrent.github.io/PptxGenJS/docs/api-tables.html
	 * @default 0.0
	 * @example 0.5 // 表格更高（增加给定幻灯片可容纳的行数）
	 */
	autoPageLineWeight?: number
	/**
	 * 单元格边框
	 */
	border?: BorderProps | [BorderProps, BorderProps, BorderProps, BorderProps]
	/**
	 * 单元格跨列数
	 */
	colspan?: number
	/**
	 * 填充颜色
	 * @example { color:'FF0000' } // 十六进制颜色（红色）
	 * @example { color:'0088CC', transparency:50 } // 十六进制颜色，50% 透明
	 * @example { color:pptx.SchemeColor.accent1 } // 主题颜色 Accent1
	 */
	fill?: ShapeFillProps
	hyperlink?: HyperlinkProps
	/**
	 * 单元格边距（英寸）
	 * @default 0
	 */
	margin?: Margin
	/**
	 * 单元格跨行数
	 */
	rowspan?: number
}
export interface TableProps extends PositionProps, TextBaseProps, ObjectNameProps {
	_arrObjTabHeadRows?: TableRow[]

	/**
	 * 是否启用自动分页
	 * - 自动分页在内容超出幻灯片时创建新幻灯片
	 * @default false
	 */
	autoPage?: boolean
	/**
	 * 自动分页字符权重
	 * - 调整换行前使用的字符数
	 * - 范围：-1.0 到 1.0
	 * @see https://gitbrent.github.io/PptxGenJS/docs/api-tables.html
	 * @default 0.0
	 * @example 0.5 // 行更长（增加给定行可容纳的字符数）
	 */
	autoPageCharWeight?: number
	/**
	 * 自动分页行权重
	 * - 调整幻灯片换行前使用的行数
	 * - 范围：-1.0 到 1.0
	 * @see https://gitbrent.github.io/PptxGenJS/docs/api-tables.html
	 * @default 0.0
	 * @example 0.5 // 表格更高（增加给定幻灯片可容纳的行数）
	 */
	autoPageLineWeight?: number
	/**
	 * 表格标题行是否应在 autoPage 创建的每张新幻灯片上重复。
	 * 使用 `autoPageHeaderRows` 指定表格标题由多少行组成（1+）。
	 * @default false
	 * @since v3.3.0
	 */
	autoPageRepeatHeader?: boolean
	/**
	 * 组成表格标题的行数
	 * - 当 `autoPageRepeatHeader` 设置为 true 时必需。
	 * @example 2 - 在创建的每张新幻灯片上重复前两行表格
	 * @default 1
	 * @since v3.3.0
	 */
	autoPageHeaderRows?: number
	/**
	 * 自动分页创建的后续幻灯片使用的 `y` 位置
	 * @default （幻灯片的顶部边距）
	 */
	autoPageSlideStartY?: number
	/**
	 * 表格边框
	 * - 单个值应用于所有 4 个边
	 * - 数组值按 TRBL 顺序应用于各边
	 */
	border?: BorderProps | [BorderProps, BorderProps, BorderProps, BorderProps]
	/**
	 * 表格列宽（英寸）
	 * - 单个值根据 `w` 平均应用于每列
	 * - 数组值按顺序应用于每列
	 * @default 根据 `w` 等宽的列
	 */
	colW?: number | number[]
	/**
	 * 单元格背景颜色
	 * @example { color:'FF0000' } // 十六进制颜色（红色）
	 * @example { color:'0088CC', transparency:50 } // 十六进制颜色，50% 透明
	 * @example { color:pptx.SchemeColor.accent1 } // 主题颜色 Accent1
	 */
	fill?: ShapeFillProps
	/**
	 * 单元格边距（英寸）
	 * - 影响所有表格单元格，被单元格选项覆盖
	 */
	margin?: Margin
	/**
	 * 表格行高（英寸）
	 * - 单个值根据 `h` 平均应用于每行
	 * - 数组值按顺序应用于每行
	 * @default 根据 `h` 等高的行
	 */
	rowH?: number | number[]
	/**
	 * 开发工具：详细模式（输出到控制台）
	 * - 让库在自动分页计算期间提供几乎荒谬的详细信息
	 * @default false // 显然
	 */
	verbose?: boolean // 未记录；显示详细输出

	/**
	 * @deprecated v3.3.0 - 改用 `autoPageSlideStartY`
	 */
	newSlideStartY?: number
}
export interface TableCell {
	_type: SLIDE_OBJECT_TYPES.tablecell
	/** 此单元格中的行（自动分页） */
	_lines?: TableCell[][]
	/** `text` 属性但保证持有 "TableCell[]" */
	_tableCells?: TableCell[]
	/** 高度（EMU） */
	_lineHeight?: number
	_hmerge?: boolean
	_vmerge?: boolean
	_rowContinue?: number
	_optImp?: any

	text?: string | TableCell[] // TODO: 未来：20210815：只允许 `TableCell[]`，处理 string|TableCell[] *很糟糕*
	options?: TableCellProps
}
export interface TableRowSlide {
	rows: TableRow[]
}
export type TableRow = TableCell[]

// 文本 ===========================================================================================
export interface TextGlowProps {
	/**
	 * 边框颜色（十六进制格式）
	 * @example 'FF3399'
	 */
	color?: HexColor
	/**
	 * 不透明度（0.0 - 1.0）
	 * @example 0.5
	 * 50% 不透明
	 */
	opacity?: number
	/**
	 * 大小（点）
	 */
	size: number
}

export interface TextPropsOptions extends PositionProps, DataOrPathProps, TextBaseProps, ObjectNameProps {
	_bodyProp?: {
		// 注意：其中许多重复，因为用户选项会转换为 _bodyProp 选项以进行 XML 处理
		autoFit?: boolean
		align?: TEXT_HALIGN
		anchor?: TEXT_VALIGN
		lIns?: number
		rIns?: number
		tIns?: number
		bIns?: number
		vert?: 'eaVert' | 'horz' | 'mongolianVert' | 'vert' | 'vert270' | 'wordArtVert' | 'wordArtVertRtl'
		wrap?: boolean
	}
	_lineIdx?: number

	baseline?: number
	/**
	 * 字符间距
	 */
	charSpacing?: number
	/**
	 * 文本适应选项
	 *
	 * MS-PPT > 设置形状格式 > 形状选项 > 文本框 > "[未标记的组]"：[下面 3 个选项]
	 * - 'none' = 不自动调整
	 * - 'shrink' = 溢出时缩小文本
	 * - 'resize' = 调整形状大小以适应文本
	 *
	 * **注意** 'shrink' 和 'resize' 仅在编辑文本/调整形状大小后生效。
	 * PowerPoint 和 Word 都会动态计算缩放因子，并在编辑/调整大小时应用它。
	 *
	 * 此库无法触发该行为，抱歉。
	 * @since v3.3.0
	 * @default "none"
	 */
	fit?: 'none' | 'shrink' | 'resize'
	/**
	 * 形状填充
	 * @example { color:'FF0000' } // 十六进制颜色（红色）
	 * @example { color:'0088CC', transparency:50 } // 十六进制颜色，50% 透明
	 * @example { color:pptx.SchemeColor.accent1 } // 主题颜色 Accent1
	 */
	fill?: ShapeFillProps
	/**
	 * 水平翻转形状？
	 * @default false
	 */
	flipH?: boolean
	/**
	 * 垂直翻转形状？
	 * @default false
	 */
	flipV?: boolean
	glow?: TextGlowProps
	hyperlink?: HyperlinkProps
	indentLevel?: number
	isTextBox?: boolean
	line?: ShapeLineProps
	/**
	 * 行间距（点）
	 * - PowerPoint：段落 > 缩进和间距 > 行距：> "固定值"
	 * @example 28 // 28点
	 */
	lineSpacing?: number
	/**
	 * 行间距倍数（百分比）
	 * - 范围：0.0-9.99
	 * - PowerPoint：段落 > 缩进和间距 > 行距：> "多倍行距"
	 * @example 1.5 // 1.5 倍行距
	 * @since v3.5.0
	 */
	lineSpacingMultiple?: number
	// TODO: [20220219] powerpoint 使用英寸但库一直使用点... @未来 @废弃 - 在 v4.0 中更新？[范围：0.0-22.0]
	/**
	 * 边距（点）
	 * - PowerPoint：设置形状格式 > 形状选项 > 大小与属性 > 文本框 > 左/右/上/下边距
	 * @default PowerPoint 中的"普通"边距 [3.5, 7.0, 3.5, 7.0] // （此库不设置值，但 PowerPoint 默认为"普通" [0.05", 0.1", 0.05", 0.1"]）
	 * @example 0 // 上/右/下/左边距 0 [PowerPoint 中为 0.0"]
	 * @example 10 // 上/右/下/左边距 10 [PowerPoint 中为 0.14"]
	 * @example [10,5,10,5] // 上边距 10，右边距 5，下边距 10，左边距 5
	 */
	margin?: Margin
	outline?: { color: Color, size: number }
	paraSpaceAfter?: number
	paraSpaceBefore?: number
	placeholder?: string
	/**
	 * 圆角矩形半径（仅适用于 pptx.shapes.ROUNDED_RECTANGLE）
	 * - 值：0.0 到 1.0
	 * @default 0
	 */
	rectRadius?: number
	/**
	 * 旋转（度）
	 * - 范围：-360 到 360
	 * @default 0
	 * @example 180 // 旋转 180 度
	 */
	rotate?: number
	/**
	 * 是否启用从右到左模式
	 * @default false
	 */
	rtlMode?: boolean
	shadow?: ShadowProps
	shape?: SHAPE_NAME
	strike?: boolean | 'dblStrike' | 'sngStrike'
	subscript?: boolean
	superscript?: boolean
	/**
	 * 垂直对齐方式
	 * @default middle
	 */
	valign?: VAlign
	vert?: 'eaVert' | 'horz' | 'mongolianVert' | 'vert' | 'vert270' | 'wordArtVert' | 'wordArtVertRtl'
	/**
	 * 文本换行
	 * @since v3.3.0
	 * @default true
	 */
	wrap?: boolean

	/**
	 * 是否启用"适应形状"
	 * @deprecated v3.3.0 - 改用 `fit`
	 */
	autoFit?: boolean
	/**
	 * 是否启用"溢出时缩小文本"
	 * @deprecated v3.3.0 - 改用 `fit`
	 */
	shrinkText?: boolean
	/**
	 * 内缩
	 * @deprecated v3.10.0 - 改用 `margin`
	 */
	inset?: number
	/**
	 * 虚线类型
	 * @deprecated v3.3.0 - 改用 `line.dashType`
	 */
	lineDash?: 'solid' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot'
	/**
	 * @deprecated v3.3.0 - 改用 `line.beginArrowType`
	 */
	lineHead?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
	/**
	 * @deprecated v3.3.0 - 改用 `line.width`
	 */
	lineSize?: number
	/**
	 * @deprecated v3.3.0 - 改用 `line.endArrowType`
	 */
	lineTail?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
}
export interface TextProps {
	text?: string
	options?: TextPropsOptions
}

// 图表 =========================================================================================
// 未来：破坏性更改：（解决方案：在 3.5/4.0 之前使用 `OptsDataLabelPosition|string`）
/*
export interface OptsDataLabelPosition {
	pie: 'ctr' | 'inEnd' | 'outEnd' | 'bestFit'
	scatter: 'b' | 'ctr' | 'l' | 'r' | 't'
	// TODO: 添加所有其他图表类型
}
*/

export type ChartAxisTickMark = 'none' | 'inside' | 'outside' | 'cross'
export type ChartLineCap = 'flat' | 'round' | 'square'

export interface OptsChartData {
	_dataIndex?: number

	/**
	 * 类别标签
	 * @example ['Year 2000', 'Year 2010', 'Year 2020'] // 单层类别轴标签
	 * @example [['Year 2000', 'Year 2010', 'Year 2020'], ['Decades', '', '']] // 多层类别轴标签
	 * @since `labels` string[][] 类型在 v3.11.0 中添加
	 */
	labels?: string[] | string[][]
	/**
	 * 系列名称
	 * @example 'Locations'
	 */
	name?: string
	/**
	 * 气泡大小
	 * @example [5, 1, 5, 1]
	 */
	sizes?: number[]
	/**
	 * 类别值
	 * @example [2000, 2010, 2020]
	 */
	values?: number[]
	/**
	 * 覆盖 `chartColors`
	 */
	// color?: string // TODO: 进行中：（Pull #727）
}
// 内部使用，终端用户不应使用
export interface IOptsChartData extends OptsChartData {
	labels?: string[][]
}
export interface OptsChartGridLine {
	/**
	 * MS-PPT > 图表格式 > 设置主要网格线格式 > 线条 > 线端类型
	 * - 线端类型
	 * @default flat
	 */
	cap?: ChartLineCap
	/**
	 * 网格线颜色（十六进制）
	 * @example 'FF3399'
	 */
	color?: HexColor
	/**
	 * 网格线大小（点）
	 */
	size?: number
	/**
	 * 网格线样式
	 */
	style?: 'solid' | 'dash' | 'dot' | 'none'
}
// TODO: 202008：图表类型在 v3.3.0 中仍以 "I" 为前缀（时间不够！）
export interface IChartMulti {
	type: CHART_NAME
	data: IOptsChartData[]
	options: IChartOptsLib
}
export interface IChartPropsFillLine {
	/**
	 * PowerPoint：设置图表区/绘图区格式 > 边框 ["线条"]
	 * @example border: {color: 'FF0000', pt: 1} // 十六进制 RGB 颜色，1 点线条
	 */
	border?: BorderProps
	/**
	 * PowerPoint：设置图表区/绘图区格式 > 填充
	 * @example fill: {color: '696969'} // 十六进制 RGB 颜色值
	 * @example fill: {color: pptx.SchemeColor.background2} // 主题颜色值
	 * @example fill: {transparency: 50} // 50% 透明度
	 */
	fill?: ShapeFillProps
}
export interface IChartAreaProps extends IChartPropsFillLine {
	/**
	 * 图表区是否有圆角
	 * - 仅在使用 `fill` 或 `border` 时适用
	 * @default true
	 * @since v3.11
	 */
	roundedCorners?: boolean
}
export interface IChartPropsBase {
	/**
	 * 轴位置
	 */
	axisPos?: 'b' | 'l' | 'r' | 't'
	chartColors?: HexColor[]
	/**
	 * 不透明度（0 - 100）
	 * @example 50 // 50% 不透明
	 */
	chartColorsOpacity?: number
	dataBorder?: BorderProps
	displayBlanksAs?: string
	invertedColors?: HexColor[]
	lang?: string
	layout?: PositionProps
	shadow?: ShadowProps
	/**
	 * @default false
	 */
	showLabel?: boolean
	showLeaderLines?: boolean
	/**
	 * @default false
	 */
	showLegend?: boolean
	/**
	 * @default false
	 */
	showPercent?: boolean
	/**
	 * @default false
	 */
	showSerName?: boolean
	/**
	 * @default false
	 */
	showTitle?: boolean
	/**
	 * @default false
	 */
	showValue?: boolean
	/**
	 * 3D Perspecitve
	 * - range: 0-120
	 * @default 30
	 */
	v3DPerspective?: number
	/**
	 * Right Angle Axes
	 * - Shows chart from first-person perspective
	 * - Overrides `v3DPerspective` when true
	 * - PowerPoint: Chart Options > 3-D Rotation
	 * @default false
	 */
	v3DRAngAx?: boolean
	/**
	 * X Rotation
	 * - PowerPoint: Chart Options > 3-D Rotation
	 * - range: 0-359.9
	 * @default 30
	 */
	v3DRotX?: number
	/**
	 * Y Rotation
	 * - range: 0-359.9
	 * @default 30
	 */
	v3DRotY?: number

	/**
	 * PowerPoint: Format Chart Area (Fill & Border/Line)
	 * @since v3.11
	 */
	chartArea?: IChartAreaProps
	/**
	 * PowerPoint: Format Plot Area (Fill & Border/Line)
	 * @since v3.11
	 */
	plotArea?: IChartPropsFillLine

	/**
	 * @deprecated v3.11.0 - use `plotArea.border`
	 */
	border?: BorderProps
	/**
	 * @deprecated v3.11.0 - use `plotArea.fill`
	 */
	fill?: HexColor
}
export interface IChartPropsAxisCat {
	/**
	 * Multi-Chart prop: array of cat axes
	 */
	catAxes?: IChartPropsAxisCat[]
	catAxisBaseTimeUnit?: string
	catAxisCrossesAt?: number | 'autoZero'
	catAxisHidden?: boolean
	catAxisLabelColor?: string
	catAxisLabelFontBold?: boolean
	catAxisLabelFontFace?: string
	catAxisLabelFontItalic?: boolean
	catAxisLabelFontSize?: number
	catAxisLabelFrequency?: string
	catAxisLabelPos?: 'none' | 'low' | 'high' | 'nextTo'
	catAxisLabelRotate?: number
	catAxisLineColor?: string
	catAxisLineShow?: boolean
	catAxisLineSize?: number
	catAxisLineStyle?: 'solid' | 'dash' | 'dot'
	catAxisMajorTickMark?: ChartAxisTickMark
	catAxisMajorTimeUnit?: string
	catAxisMajorUnit?: number
	catAxisMaxVal?: number
	catAxisMinorTickMark?: ChartAxisTickMark
	catAxisMinorTimeUnit?: string
	catAxisMinorUnit?: number
	catAxisMinVal?: number
	/** @since v3.11.0 */
	catAxisMultiLevelLabels?: boolean
	catAxisOrientation?: 'minMax'
	catAxisTitle?: string
	catAxisTitleColor?: string
	catAxisTitleFontFace?: string
	catAxisTitleFontSize?: number
	catAxisTitleRotate?: number
	catGridLine?: OptsChartGridLine
	catLabelFormatCode?: string
	/**
	 * Whether data should use secondary category axis (instead of primary)
	 * @default false
	 */
	secondaryCatAxis?: boolean
	showCatAxisTitle?: boolean
}
export interface IChartPropsAxisSer {
	serAxisBaseTimeUnit?: string
	serAxisHidden?: boolean
	serAxisLabelColor?: string
	serAxisLabelFontBold?: boolean
	serAxisLabelFontFace?: string
	serAxisLabelFontItalic?: boolean
	serAxisLabelFontSize?: number
	serAxisLabelFrequency?: string
	serAxisLabelPos?: 'none' | 'low' | 'high' | 'nextTo'
	serAxisLineColor?: string
	serAxisLineShow?: boolean
	serAxisMajorTimeUnit?: string
	serAxisMajorUnit?: number
	serAxisMinorTimeUnit?: string
	serAxisMinorUnit?: number
	serAxisOrientation?: string
	serAxisTitle?: string
	serAxisTitleColor?: string
	serAxisTitleFontFace?: string
	serAxisTitleFontSize?: number
	serAxisTitleRotate?: number
	serGridLine?: OptsChartGridLine
	serLabelFormatCode?: string
	showSerAxisTitle?: boolean
}
export interface IChartPropsAxisVal {
	/**
	 * Whether data should use secondary value axis (instead of primary)
	 * @default false
	 */
	secondaryValAxis?: boolean
	showValAxisTitle?: boolean
	/**
	 * Multi-Chart prop: array of val axes
	 */
	valAxes?: IChartPropsAxisVal[]
	valAxisCrossesAt?: number | 'autoZero'
	valAxisDisplayUnit?: 'billions' | 'hundredMillions' | 'hundreds' | 'hundredThousands' | 'millions' | 'tenMillions' | 'tenThousands' | 'thousands' | 'trillions'
	valAxisDisplayUnitLabel?: boolean
	valAxisHidden?: boolean
	valAxisLabelColor?: string
	valAxisLabelFontBold?: boolean
	valAxisLabelFontFace?: string
	valAxisLabelFontItalic?: boolean
	valAxisLabelFontSize?: number
	valAxisLabelFormatCode?: string
	valAxisLabelPos?: 'none' | 'low' | 'high' | 'nextTo'
	valAxisLabelRotate?: number
	valAxisLineColor?: string
	valAxisLineShow?: boolean
	valAxisLineSize?: number
	valAxisLineStyle?: 'solid' | 'dash' | 'dot'
	/**
	 * PowerPoint: Format Axis > Axis Options > Logarithmic scale - Base
	 * - range: 2-99
	 * @since v3.5.0
	 */
	valAxisLogScaleBase?: number
	valAxisMajorTickMark?: ChartAxisTickMark
	valAxisMajorUnit?: number
	valAxisMaxVal?: number
	valAxisMinorTickMark?: ChartAxisTickMark
	valAxisMinVal?: number
	valAxisOrientation?: 'minMax'
	valAxisTitle?: string
	valAxisTitleColor?: string
	valAxisTitleFontFace?: string
	valAxisTitleFontSize?: number
	valAxisTitleRotate?: number
	valGridLine?: OptsChartGridLine
	/**
	 * Value label format code
	 * - this also directs Data Table formatting
	 * @since v3.3.0
	 * @example '#%' // round percent
	 * @example '0.00%' // shows values as '0.00%'
	 * @example '$0.00' // shows values as '$0.00'
	 */
	valLabelFormatCode?: string
}
export interface IChartPropsChartBar {
	bar3DShape?: string
	barDir?: string
	barGapDepthPct?: number
	/**
	 * MS-PPT > Format chart > Format Data Point > Series Options >  "Gap Width"
	 * - width (percent)
	 * - range: `0`-`500`
	 * @default 150
	 */
	barGapWidthPct?: number
	barGrouping?: string
	/**
	 * MS-PPT > Format chart > Format Data Point > Series Options >  "Series Overlap"
	 * - overlap (percent)
	 * - range: `-100`-`100`
	 * @since v3.9.0
	 * @default 0
	 */
	barOverlapPct?: number
}
export interface IChartPropsChartDoughnut {
	dataNoEffects?: boolean
	holeSize?: number
}
export interface IChartPropsChartLine {
	/**
	 * MS-PPT > Chart format > Format Data Series > Line > Cap type
	 * - line cap type
	 * @default flat
	 */
	lineCap?: ChartLineCap
	/**
	 * MS-PPT > Chart format > Format Data Series > Marker Options > Built-in > Type
	 * - line dash type
	 * @default solid
	 */
	lineDash?: 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'solid' | 'sysDash' | 'sysDot'
	/**
	 * MS-PPT > Chart format > Format Data Series > Marker Options > Built-in > Type
	 * - marker type
	 * @default circle
	 */
	lineDataSymbol?: 'circle' | 'dash' | 'diamond' | 'dot' | 'none' | 'square' | 'triangle'
	/**
	 * MS-PPT > Chart format > Format Data Series > [Marker Options] > Border > Color
	 * - border color
	 * @default circle
	 */
	lineDataSymbolLineColor?: string
	/**
	 * MS-PPT > Chart format > Format Data Series > [Marker Options] > Border > Width
	 * - border width (points)
	 * @default 0.75
	 */
	lineDataSymbolLineSize?: number
	/**
	 * MS-PPT > Chart format > Format Data Series > Marker Options > Built-in > Size
	 * - marker size
	 * - range: 2-72
	 * @default 6
	 */
	lineDataSymbolSize?: number
	/**
	 * MS-PPT > Chart format > Format Data Series > Line > Width
	 * - line width (points)
	 * - range: 0-1584
	 * @default 2
	 */
	lineSize?: number
	/**
	 * MS-PPT > Chart format > Format Data Series > Line > Smoothed line
	 * - "Smoothed line"
	 * @default false
	 */
	lineSmooth?: boolean
}
export interface IChartPropsChartPie {
	dataNoEffects?: boolean
	/**
	 * MS-PPT > Format chart > Format Data Series > Series Options >  "Angle of first slice"
	 * - angle (degrees)
	 * - range: 0-359
	 * @since v3.4.0
	 * @default 0
	 */
	firstSliceAng?: number
}
export interface IChartPropsChartRadar {
	/**
	 * MS-PPT > Chart Type > Waterfall
	 * - radar chart type
	 * @default standard
	 */
	radarStyle?: 'standard' | 'marker' | 'filled' // TODO: convert to 'radar'|'markers'|'filled' in 4.0 (verbatim with PPT app UI)
}
export interface IChartPropsDataLabel {
	dataLabelBkgrdColors?: boolean
	dataLabelColor?: string
	dataLabelFontBold?: boolean
	dataLabelFontFace?: string
	dataLabelFontItalic?: boolean
	dataLabelFontSize?: number
	/**
	 * Data label format code
	 * @example '#%' // round percent
	 * @example '0.00%' // shows values as '0.00%'
	 * @example '$0.00' // shows values as '$0.00'
	 */
	dataLabelFormatCode?: string
	dataLabelFormatScatter?: 'custom' | 'customXY' | 'XY'
	dataLabelPosition?: 'b' | 'bestFit' | 'ctr' | 'l' | 'r' | 't' | 'inEnd' | 'outEnd'
}
export interface IChartPropsDataTable {
	dataTableFontSize?: number
	/**
	 * Data table format code
	 * @since v3.3.0
	 * @example '#%' // round percent
	 * @example '0.00%' // shows values as '0.00%'
	 * @example '$0.00' // shows values as '$0.00'
	 */
	dataTableFormatCode?: string
	/**
	 * Whether to show a data table adjacent to the chart
	 * @default false
	 */
	showDataTable?: boolean
	showDataTableHorzBorder?: boolean
	showDataTableKeys?: boolean
	showDataTableOutline?: boolean
	showDataTableVertBorder?: boolean
}
export interface IChartPropsLegend {
	legendColor?: string
	legendFontFace?: string
	legendFontSize?: number
	legendPos?: 'b' | 'l' | 'r' | 't' | 'tr'
}
export interface IChartPropsTitle extends TextBaseProps {
	title?: string
	titleAlign?: string
	titleBold?: boolean
	titleColor?: string
	titleFontFace?: string
	titleFontSize?: number
	titlePos?: { x: number, y: number }
	titleRotate?: number
}
export interface IChartOpts
	extends IChartPropsAxisCat,
	IChartPropsAxisSer,
	IChartPropsAxisVal,
	IChartPropsBase,
	IChartPropsChartBar,
	IChartPropsChartDoughnut,
	IChartPropsChartLine,
	IChartPropsChartPie,
	IChartPropsChartRadar,
	IChartPropsDataLabel,
	IChartPropsDataTable,
	IChartPropsLegend,
	IChartPropsTitle,
	ObjectNameProps,
	OptsChartGridLine,
	PositionProps {
	/**
	 * Alt Text value ("How would you describe this object and its contents to someone who is blind?")
	 * - PowerPoint: [right-click on a chart] > "Edit Alt Text..."
	 */
	altText?: string
}
export interface IChartOptsLib extends IChartOpts {
	_type?: CHART_NAME | IChartMulti[] // TODO: v3.4.0 - move to `IChartOpts`, remove `IChartOptsLib`
}
export interface ISlideRelChart extends OptsChartData {
	type: CHART_NAME | IChartMulti[]
	opts: IChartOptsLib
	data: IOptsChartData[]
	// internal below
	rId: number
	Target: string
	globalId: number
	fileName: string
}

// Core
// ====
// PRIVATE vvv
export interface ISlideRel {
	type: SLIDE_OBJECT_TYPES
	Target: string
	fileName?: string
	data: any[] | string
	opts?: IChartOpts
	path?: string
	extn?: string
	globalId?: number
	rId: number
}
export interface ISlideRelMedia {
	type: string
	opts?: MediaProps
	path?: string
	extn?: string
	data?: string | ArrayBuffer
	/** used to indicate that a media file has already been read/enocded (PERF) */
	isDuplicate?: boolean
	isSvgPng?: boolean
	svgSize?: { w: number, h: number }
	rId: number
	Target: string
}
export interface ISlideObject {
	_type: SLIDE_OBJECT_TYPES
	options?: ObjectOptions
	// text
	text?: TextProps[]
	// table
	arrTabRows?: TableCell[][]
	// chart
	chartRid?: number
	// image:
	image?: string
	imageRid?: number
	hyperlink?: HyperlinkProps
	// media
	media?: string
	mtype?: MediaType
	mediaRid?: number
	shape?: SHAPE_NAME
	formula?: string
	formulaAlign?: 'left' | 'center' | 'right'
}
// PRIVATE ^^^

export interface WriteBaseProps {
	/**
	 * Whether to compress export (can save substantial space, but takes a bit longer to export)
	 * @default false
	 * @since v3.5.0
	 */
	compression?: boolean
}
export interface WriteProps extends WriteBaseProps {
	/**
	 * Output type
	 * - values: 'arraybuffer' | 'base64' | 'binarystring' | 'blob' | 'nodebuffer' | 'uint8array' | 'STREAM'
	 * @default 'blob'
	 */
	outputType?: WRITE_OUTPUT_TYPE
}
export interface WriteFileProps extends WriteBaseProps {
	/**
	 * Export file name
	 * @default 'Presentation.pptx'
	 */
	fileName?: string
}
export interface SectionProps {
	_type: 'user' | 'default'
	_slides: PresSlide[]

	/**
	 * Section title
	 */
	title: string
	/**
	 * Section order - uses to add section at any index
	 * - values: 1-n
	 */
	order?: number
}
export interface PresLayout {
	_sizeW?: number
	_sizeH?: number

	/**
	 * Layout Name
	 * @example 'LAYOUT_WIDE'
	 */
	name: string
	width: number
	height: number
}
export interface SlideNumberProps extends PositionProps, TextBaseProps {
	/**
	 * margin (points)
	 */
	margin?: Margin // TODO: convert to inches in 4.0 (valid values are 0-22)
}
export interface SlideMasterProps {
	/**
	 * Unique name for this master
	 */
	title: string
	background?: BackgroundProps
	margin?: Margin
	slideNumber?: SlideNumberProps
	objects?: Array< | { chart: IChartOpts }
	| { image: ImageProps }
	| { line: ShapeProps }
	| { rect: ShapeProps }
	| { text: TextProps }
	| {
		placeholder: {
			options: PlaceholderProps
			/**
			 * Text to be shown in placeholder (shown until user focuses textbox or adds text)
			 * - Leave blank to have powerpoint show default phrase (ex: "Click to add title")
			 */
			text?: string
		}
	}>

	/**
	 * @deprecated v3.3.0 - use `background`
	 */
	bkgd?: string | BackgroundProps
}
export interface ObjectOptions extends ImageProps, PositionProps, ShapeProps, TableCellProps, TextPropsOptions {
	_placeholderIdx?: number
	_placeholderType?: PLACEHOLDER_TYPE

	cx?: Coord
	cy?: Coord
	margin?: Margin
	colW?: number | number[] // table
	rowH?: number | number[] // table
}
export interface SlideBaseProps {
	_bkgdImgRid?: number
	_margin?: Margin
	_name?: string
	_presLayout: PresLayout
	_rels: ISlideRel[]
	_relsChart: ISlideRelChart[] // needed as we use args:"PresSlide|SlideLayout" often
	_relsMedia: ISlideRelMedia[] // needed as we use args:"PresSlide|SlideLayout" often
	_slideNum: number
	_slideNumberProps?: SlideNumberProps
	_slideObjects?: ISlideObject[]

	background?: BackgroundProps
	/**
	 * @deprecated v3.3.0 - use `background`
	 */
	bkgd?: string | BackgroundProps
}
export interface SlideLayout extends SlideBaseProps {
	_slide?: {
		_bkgdImgRid?: number
		back: string
		color: string
		hidden?: boolean
	}
}
export interface PresSlide extends SlideBaseProps {
	_rId: number
	_slideLayout: SlideLayout
	_slideId: number

	addChart: (type: CHART_NAME | IChartMulti[], data: IOptsChartData[], options?: IChartOpts) => PresSlide
	addImage: (options: ImageProps) => PresSlide
	addMedia: (options: MediaProps) => PresSlide
	addNotes: (notes: string) => PresSlide
	addShape: (shapeName: SHAPE_NAME, options?: ShapeProps) => PresSlide
	addTable: (tableRows: TableRow[], options?: TableProps) => PresSlide
	addText: (text: string | TextProps[], options?: TextPropsOptions) => PresSlide

	/**
	 * Background color or image (`color` | `path` | `data`)
	 * @example { color: 'FF3399' } - hex color
	 * @example { color: 'FF3399', transparency:50 } - hex color with 50% transparency
	 * @example { path: 'https://onedrives.com/myimg.png` } - retrieve image via URL
	 * @example { path: '/home/gitbrent/images/myimg.png` } - retrieve image via local path
	 * @example { data: 'image/png;base64,iVtDaDrF[...]=' } - base64 string
	 * @since v3.3.0
	 */
	background?: BackgroundProps
	/**
	 * Default text color (hex format)
	 * @example 'FF3399'
	 * @default '000000' (DEF_FONT_COLOR)
	 */
	color?: HexColor
	/**
	 * Whether slide is hidden
	 * @default false
	 */
	hidden?: boolean
	/**
	 * Slide number options
	 */
	slideNumber?: SlideNumberProps
}
export interface AddSlideProps {
	masterName?: string // TODO: 20200528: rename to "masterTitle" (createMaster uses `title` so lets be consistent)
	sectionTitle?: string
}
export interface PresentationProps {
	author: string
	company: string
	layout: string
	masterSlide: PresSlide
	/**
	 * Presentation's layout
	 * read-only
	 */
	presLayout: PresLayout
	revision: string
	/**
	 * Whether to enable right-to-left mode
	 * @default false
	 */
	rtlMode: boolean
	subject: string
	theme: ThemeProps
	title: string
}
// PRIVATE interface
export interface IPresentationProps extends PresentationProps {
	sections: SectionProps[]
	slideLayouts: SlideLayout[]
	slides: PresSlide[]
}
