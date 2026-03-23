/**
 * PptxGenJS: 媒体方法
 */

import { IMG_BROKEN } from ‘./core-enums’
import { PresSlide, SlideLayout, ISlideRelMedia } from ‘./core-interfaces’

/**
 * 将图片/音频/视频编码为 base64
 * @param {PresSlide | SlideLayout} layout - 幻灯片布局
 * @return {Promise} promise
 */
export function encodeSlideMediaRels(layout: PresSlide | SlideLayout): Array<Promise<string>> {
	// 步骤 1: 检测一次真实的 Node 运行时
	const isNode = typeof process !== ‘undefined’ && !!process.versions?.node && process.release?.name === ‘node’
	// 这些仅在 Node 环境中填充
	let fs: typeof import(‘node:fs’) | undefined
	let https: typeof import(‘node:https’) | undefined

	// 步骤 2: 如有需要，延迟加载 Node 内置模块
	const loadNodeDeps = isNode
		? async () => {
			; ({ default: fs } = await import(‘node:fs’)); ({ default: https } = await import(‘node:https’))
		}
		: async () => { }
	// 当确定在 Node 中时立即启动
	if (isNode) loadNodeDeps()

	// 步骤 3: 准备 promise 列表
	const imageProms: Array<Promise<string>> = []

	// A: 捕获所有需要编码的音频/图片/视频候选项（过滤掉在线/预编码的）
	const candidateRels = layout._relsMedia.filter(
		rel => rel.type !== ‘online’ && !rel.data && (!rel.path || (rel.path && !rel.path.includes(‘preencoded’)))
	)

	// B: 性能优化：标记重复项（相同的 `path`）以避免重复加载相同的媒体！
	const unqPaths: string[] = []
	candidateRels.forEach(rel => {
		if (!unqPaths.includes(rel.path)) {
			rel.isDuplicate = false
			unqPaths.push(rel.path)
		} else {
			rel.isDuplicate = true
		}
	})

	// 步骤 4: 读取/编码每个唯一的媒体项
	candidateRels
		.filter(rel => !rel.isDuplicate)
		.forEach(rel => {
			imageProms.push(
				(async () => {
					if (!https) await loadNodeDeps()

					// ────────────  Node 本地文件  ────────────
					if (isNode && fs && rel.path.indexOf(‘http’) !== 0) {
						try {
							const bitmap = fs.readFileSync(rel.path)
							rel.data = Buffer.from(bitmap).toString(‘base64’)
							candidateRels
								.filter(dupe => dupe.isDuplicate && dupe.path === rel.path)
								.forEach(dupe => (dupe.data = rel.data))
							return ‘done’
						} catch (ex) {
							rel.data = IMG_BROKEN
							candidateRels
								.filter(dupe => dupe.isDuplicate && dupe.path === rel.path)
								.forEach(dupe => (dupe.data = rel.data))
							throw new Error(`错误：无法读取媒体："${rel.path}"\n${String(ex)}`)
						}
					}

					// ────────────  Node HTTP(S)  ────────────
					if (isNode && https && rel.path.startsWith(‘http’)) {
						return await new Promise<string>((resolve, reject) => {
							https.get(rel.path, res => {
								let raw = ‘’
								res.setEncoding(‘binary’) // 重要：只有二进制编码有效
								res.on(‘data’, chunk => (raw += chunk))
								res.on(‘end’, () => {
									rel.data = Buffer.from(raw, ‘binary’).toString(‘base64’)
									candidateRels
										.filter(dupe => dupe.isDuplicate && dupe.path === rel.path)
										.forEach(dupe => (dupe.data = rel.data))
									resolve(‘done’)
								})
								res.on(‘error’, () => {
									rel.data = IMG_BROKEN
									candidateRels
										.filter(dupe => dupe.isDuplicate && dupe.path === rel.path)
										.forEach(dupe => (dupe.data = rel.data))
									reject(new Error(`错误！无法加载图片 (https.get)：${rel.path}`))
								})
							})
						})
					}

					// ────────────  浏览器  ────────────
					return await new Promise<string>((resolve, reject) => {
						// A: 构建请求
						const xhr = new XMLHttpRequest()
						xhr.onload = () => {
							const reader = new FileReader()
							reader.onloadend = () => {
								rel.data = reader.result as string
								candidateRels
									.filter(dupe => dupe.isDuplicate && dupe.path === rel.path)
									.forEach(dupe => (dupe.data = rel.data))
								if (!rel.isSvgPng) {
									resolve(‘done’)
								} else {
									createSvgPngPreview(rel)
										.then(() => resolve(‘done’))
										.catch(reject)
								}
							}
							reader.readAsDataURL(xhr.response)
						}
						xhr.onerror = () => {
							rel.data = IMG_BROKEN
							candidateRels
								.filter(dupe => dupe.isDuplicate && dupe.path === rel.path)
								.forEach(dupe => (dupe.data = rel.data))
							reject(new Error(`错误！无法加载图片 (xhr.onerror)：${rel.path}`))
						}
						// B: 执行请求
						xhr.open(‘GET’, rel.path)
						xhr.responseType = ‘blob’
						xhr.send()
					})
				})(),
			)
		})

	// 步骤 5: SVG-PNG 预览
	// ......: "SVG:" base64 数据仍需要生成 png
	// ......: （`isSvgPng` 将此标记为预览图片，而不是 SVG 本身）
	layout._relsMedia
		.filter(rel => rel.isSvgPng && rel.data)
		.forEach(rel => {
			(async () => {
				if (isNode && !fs) await loadNodeDeps()
				if (isNode && fs) {
					// console.log(‘抱歉，Node 中不支持 SVG（更多信息：https://github.com/gitbrent/PptxGenJS/issues/401）’)
					rel.data = IMG_BROKEN
					imageProms.push(Promise.resolve(‘done’))
				} else {
					imageProms.push(createSvgPngPreview(rel))
				}
			})()
		})

	return imageProms
}

/**
 * 创建 SVG 预览图片
 * @param {ISlideRelMedia} rel - 幻灯片关联
 * @return {Promise} promise
 */
async function createSvgPngPreview(rel: ISlideRelMedia): Promise<string> {
	return await new Promise((resolve, reject) => {
		// A: 创建
		const image = new Image()

		// B: 设置 onload 事件
		image.onload = () => {
			// 首先：检查任何错误：这是最好的方法（try/catch 不起作用等）
			if (image.width + image.height === 0) {
				image.onerror(‘h/w=0’)
			}
			let canvas: HTMLCanvasElement = document.createElement(‘CANVAS’) as HTMLCanvasElement
			const ctx = canvas.getContext(‘2d’)
			canvas.width = image.width
			canvas.height = image.height
			ctx.drawImage(image, 0, 0)
			// 在本地机器上运行的用户将收到以下错误：
			// "SecurityError: Failed to execute ‘toDataURL’ on ‘HTMLCanvasElement’: Tainted canvases may not be exported."
			// 当下面的 canvas.toDataURL 调用执行时。
			try {
				rel.data = canvas.toDataURL(rel.type)
				resolve(‘done’)
			} catch (ex) {
				image.onerror(ex.toString())
			}
			canvas = null
		}
		image.onerror = () => {
			rel.data = IMG_BROKEN
			reject(new Error(`错误！无法加载图片 (image.onerror)：${rel.path}`))
		}

		// C: 加载图片
		image.src = typeof rel.data === ‘string’ ? rel.data : IMG_BROKEN
	})
}

/**
 * 修复：待办：目前未使用
 * 待办：应该返回一个 Promise
 */
/*
function getSizeFromImage (inImgUrl: string): { width: number, height: number } {
	const sizeOf = typeof require !== ‘undefined’ ? require(‘sizeof’) : null // NodeJS

	if (sizeOf) {
		try {
			const dimensions = sizeOf(inImgUrl)
			return { width: dimensions.width, height: dimensions.height }
		} catch (ex) {
			console.error(‘错误：sizeOf：无法加载图片：’ + inImgUrl)
			return { width: 0, height: 0 }
		}
	} else if (Image && typeof Image === ‘function’) {
		// A: 创建
		const image = new Image()

		// B: 设置 onload 事件
		image.onload = () => {
			// 首先：检查任何错误：这是最好的方法（try/catch 不起作用等）
			if (image.width + image.height === 0) {
				return { width: 0, height: 0 }
			}
			const obj = { width: image.width, height: image.height }
			return obj
		}
		image.onerror = () => {
			console.error(`错误：image.onload：无法加载图片：${inImgUrl}`)
		}

		// C: 加载图片
		image.src = inImgUrl
	}
}
*/
