/**
 * PptxGenJS: Table Generation
 */

import { DEF_FONT_SIZE, DEF_SLIDE_MARGIN_IN, EMU, LINEH_MODIFIER, ONEPT, SLIDE_OBJECT_TYPES } from './core-enums'
import { PresLayout, SlideLayout, TableCell, TableToSlidesProps, TableRow, TableRowSlide, TableCellProps } from './core-interfaces'
import { getSmartParseNumber, inch2Emu, rgbToHex, valToPts } from './gen-utils'
import PptxGenJS from './pptxgen'

/**
 * 根据表格列宽将单元格文本分割成行（神奇的处理逻辑）
 * @param {TableCell} cell - 表格单元格
 * @param {number} colWidth - 表格列宽（英寸）
 * @return {TableRow[]} - 按行分组的单元格文本对象
 */
function parseTextToLines(cell: TableCell, colWidth: number, verbose?: boolean): TableCell[][] {
	// 参考: CPL = 宽度 / (字体大小 / 字体常数)
	// 参考: CHAR:2.3, colWidth:10, fontSize:12 => CPL=138, (PPT中实际每行字符数)=145 [14.5 CPI]
	// 参考: CHAR:2.3, colWidth:7 , fontSize:12 => CPL= 97, (PPT中实际每行字符数)=100 [14.3 CPI]
	// 参考: CHAR:2.3, colWidth:9 , fontSize:16 => CPL= 96, (PPT中实际每行字符数)=84  [ 9.3 CPI]
	const FOCO = 2.3 + (cell.options?.autoPageCharWeight ? cell.options.autoPageCharWeight : 0) // 字符常数
	const CPL = Math.floor((colWidth / ONEPT) * EMU) / ((cell.options?.fontSize ? cell.options.fontSize : DEF_FONT_SIZE) / FOCO) // 每行字符数

	const parsedLines: TableCell[][] = []
	let inputCells: TableCell[] = []
	const inputLines1: TableCell[][] = []
	const inputLines2: TableCell[][] = []
	/*
		if (cell.options && cell.options.autoPageCharWeight) {
			let CHR1 = 2.3 + (cell.options && cell.options.autoPageCharWeight ? cell.options.autoPageCharWeight : 0) // 字符常数
			let CPL1 = ((colWidth / ONEPT) * EMU) / ((cell.options && cell.options.fontSize ? cell.options.fontSize : DEF_FONT_SIZE) / CHR1) // 每行字符数
			console.log(`cell.options.autoPageCharWeight: '${cell.options.autoPageCharWeight}' => CPL: ${CPL1}`)
			let CHR2 = 2.3 + 0
			let CPL2 = ((colWidth / ONEPT) * EMU) / ((cell.options && cell.options.fontSize ? cell.options.fontSize : DEF_FONT_SIZE) / CHR2) // 每行字符数
			console.log(`cell.options.autoPageCharWeight: '0' => CPL: ${CPL2}`)
		}
	*/

	/**
	 * 示例输入: `cell.text`
	 * - 字符串....: "Account Name Column"
	 * - 对象......: { text:"Account Name Column" }
	 * - 对象数组..: [{ text:"Account Name", options:{ bold:true } }, { text:" Column" }]
	 * - 对象数组..: [{ text:"Account Name", options:{ breakLine:true } }, { text:"Input" }]
	 */

	/**
	 * 示例输出:
	 * - 字符串....: [{ text:"Account Name Column" }]
	 * - 对象......: [{ text:"Account Name Column" }]
	 * - 对象数组..: [{ text:"Account Name", options:{ breakLine:true } }, { text:"Input" }]
	 * - 对象数组..: [{ text:"Account Name", options:{ breakLine:true } }, { text:"Input" }]
	 */

	// 步骤 1: 确保 inputCells 是 TableCell 数组
	if (cell.text && cell.text.toString().trim().length === 0) {
		// 允许单个空格/空白作为单元格文本（用户请求的功能）
		inputCells.push({ _type: SLIDE_OBJECT_TYPES.tablecell, text: ' ' })
	} else if (typeof cell.text === 'number' || typeof cell.text === 'string') {
		inputCells.push({ _type: SLIDE_OBJECT_TYPES.tablecell, text: (cell.text || '').toString().trim() })
	} else if (Array.isArray(cell.text)) {
		inputCells = cell.text
	}
	if (verbose) {
		console.log('[1/4] inputCells')
		inputCells.forEach((cell, idx) => console.log(`[1/4] [${idx + 1}] cell: ${JSON.stringify(cell)}`))
		// console.log('...............................................\n\n')
	}

	// 步骤 2: 根据 "\n" 或 `breakLine` 属性将表格单元格分组为行
	/**
	 * - 示例: `[{ text:"Input Output" }, { text:"Extra" }]`                       == 1 行
	 * - 示例: `[{ text:"Input" }, { text:"Output", options:{ breakLine:true } }]` == 1 行
	 * - 示例: `[{ text:"Input\nOutput" }]`                                        == 2 行
	 * - 示例: `[{ text:"Input", options:{ breakLine:true } }, { text:"Output" }]` == 2 行
	 */
	let newLine: TableCell[] = []
	inputCells.forEach(cell => {
		// (这里总是 true，我们上面刚构造了它们，但需要告诉 TypeScript，因为类型仍然是 string||Cell[])
		if (typeof cell.text === 'string') {
			if (cell.text.split('\n').length > 1) {
				cell.text.split('\n').forEach(textLine => {
					newLine.push({
						_type: SLIDE_OBJECT_TYPES.tablecell,
						text: textLine,
						options: { ...cell.options, ...{ breakLine: true } },
					})
				})
			} else {
				newLine.push({
					_type: SLIDE_OBJECT_TYPES.tablecell,
					text: cell.text.trim(),
					options: cell.options,
				})
			}

			if (cell.options?.breakLine) {
				if (verbose) console.log(`inputCells: new line > ${JSON.stringify(newLine)}`)
				inputLines1.push(newLine)
				newLine = []
			}
		}

		// 刷新缓冲区
		if (newLine.length > 0) {
			inputLines1.push(newLine)
			newLine = []
		}
	})
	if (verbose) {
		console.log(`[2/4] inputLines1 (${inputLines1.length})`)
		inputLines1.forEach((line, idx) => console.log(`[2/4] [${idx + 1}] line: ${JSON.stringify(line)}`))
		// console.log('...............................................\n\n')
	}

	// 步骤 3: 将每个文本对象分词为单词（这样在下面组装行时就很容易，无需拆分文本、添加其 `options` 等）
	inputLines1.forEach(line => {
		line.forEach(cell => {
			const lineCells: TableCell[] = []
			const cellTextStr = String(cell.text) // 强制转换为字符串（编译后的 JS 比类型转换更擅长处理这个）
			const lineWords = cellTextStr.split(' ')

			lineWords.forEach((word, idx) => {
				const cellProps = { ...cell.options }
				// 重要: 处理 `breakLine` 属性 - 我们不能应用到每个单词 - 只能应用到最后一个单词！
				if (cellProps?.breakLine) cellProps.breakLine = idx + 1 === lineWords.length
				lineCells.push({ _type: SLIDE_OBJECT_TYPES.tablecell, text: word + (idx + 1 < lineWords.length ? ' ' : ''), options: cellProps })
			})

			inputLines2.push(lineCells)
		})
	})
	if (verbose) {
		console.log(`[3/4] inputLines2 (${inputLines2.length})`)
		inputLines2.forEach(line => console.log(`[3/4] line: ${JSON.stringify(line)}`))
		// console.log('...............................................\n\n')
	}

	// 步骤 4: 根据单词字母占用的空间将单元格/单词分组为行
	inputLines2.forEach(line => {
		let lineCells: TableCell[] = []
		let strCurrLine = ''

		line.forEach(word => {
			// A: 当水平空间耗尽时创建新行
			if (strCurrLine.length + word.text.length > CPL) {
				// if (verbose) console.log(`STEP 4: New line added: (${strCurrLine.length} + ${word.text.length} > ${CPL})`);
				parsedLines.push(lineCells)
				lineCells = []
				strCurrLine = ''
			}

			// B: 将当前单词添加到行单元格
			lineCells.push(word)

			// C: 将当前单词添加到 `strCurrLine`，用于跟踪行的字符长度
			strCurrLine += word.text.toString()
		})

		// 刷新缓冲区: 只有在有文本时才创建行，避免空行
		if (lineCells.length > 0) parsedLines.push(lineCells)
	})
	if (verbose) {
		console.log(`[4/4] parsedLines (${parsedLines.length})`)
		parsedLines.forEach((line, idx) => console.log(`[4/4] [Line ${idx + 1}]:\n${JSON.stringify(line)}`))
		console.log('...............................................\n\n')
	}

	// 完成:
	return parsedLines
}

/**
 * 获取表格行数组并将其拆分为幻灯片数组，每张幻灯片包含计算出的适合该幻灯片的表格行数
 * @param {TableCell[][]} tableRows - 表格行
 * @param {TableToSlidesProps} tableProps - table2slides 属性
 * @param {PresLayout} presLayout - 演示文稿布局
 * @param {SlideLayout} masterSlide - 母版幻灯片
 * @return {TableRowSlide[]} 表格行数组
 */
export function getSlidesForTableRows(tableRows: TableCell[][] = [], tableProps: TableToSlidesProps = {}, presLayout: PresLayout, masterSlide?: SlideLayout): TableRowSlide[] {
	let arrInchMargins = DEF_SLIDE_MARGIN_IN
	let emuSlideTabW = EMU * 1
	let emuSlideTabH = EMU * 1
	let emuTabCurrH = 0
	let numCols = 0
	const tableRowSlides: TableRowSlide[] = []
	const tablePropX = getSmartParseNumber(tableProps.x, 'X', presLayout)
	const tablePropY = getSmartParseNumber(tableProps.y, 'Y', presLayout)
	const tablePropW = getSmartParseNumber(tableProps.w, 'X', presLayout)
	const tablePropH = getSmartParseNumber(tableProps.h, 'Y', presLayout)
	let tableCalcW = tablePropW

	function calcSlideTabH(): void {
		let emuStartY = 0
		if (tableRowSlides.length === 0) emuStartY = tablePropY || inch2Emu(arrInchMargins[0])
		if (tableRowSlides.length > 0) emuStartY = inch2Emu(tableProps.autoPageSlideStartY || tableProps.newSlideStartY || arrInchMargins[0])
		emuSlideTabH = (tablePropH || presLayout.height) - emuStartY - inch2Emu(arrInchMargins[2])
		// console.log(`| startY .......................................... = ${(emuStartY / EMU).toFixed(1)}`)
		// console.log(`| emuSlideTabH .................................... = ${(emuSlideTabH / EMU).toFixed(1)}`)
		if (tableRowSlides.length > 1) {
			// D: 规则: 初始幻灯片之后使用边距作为起始点，而不是 `opt.y` (ISSUE #43, ISSUE #47, ISSUE #48)
			if (typeof tableProps.autoPageSlideStartY === 'number') {
				emuSlideTabH = (tablePropH || presLayout.height) - inch2Emu(tableProps.autoPageSlideStartY + arrInchMargins[2])
			} else if (typeof tableProps.newSlideStartY === 'number') {
				// @deprecated v3.3.0
				emuSlideTabH = (tablePropH || presLayout.height) - inch2Emu(tableProps.newSlideStartY + arrInchMargins[2])
			} else if (tablePropY) {
				emuSlideTabH = (tablePropH || presLayout.height) - inch2Emu((tablePropY / EMU < arrInchMargins[0] ? tablePropY / EMU : arrInchMargins[0]) + arrInchMargins[2])
				// 使用较大的值: 边距之间的区域或提供的表格高度（不要缩小可用区域 - 分页时覆盖 Y 的全部意义是为了*增加*可用空间）
				if (emuSlideTabH < tablePropH) emuSlideTabH = tablePropH
			}
		}
	}

	if (tableProps.verbose) {
		console.log('[[VERBOSE MODE]]')
		console.log('|-- TABLE PROPS --------------------------------------------------------|')
		console.log(`| presLayout.width ................................ = ${(presLayout.width / EMU).toFixed(1)}`)
		console.log(`| presLayout.height ............................... = ${(presLayout.height / EMU).toFixed(1)}`)
		console.log(`| tableProps.x .................................... = ${typeof tableProps.x === 'number' ? (tableProps.x / EMU).toFixed(1) : tableProps.x}`)
		console.log(`| tableProps.y .................................... = ${typeof tableProps.y === 'number' ? (tableProps.y / EMU).toFixed(1) : tableProps.y}`)
		console.log(`| tableProps.w .................................... = ${typeof tableProps.w === 'number' ? (tableProps.w / EMU).toFixed(1) : tableProps.w}`)
		console.log(`| tableProps.h .................................... = ${typeof tableProps.h === 'number' ? (tableProps.h / EMU).toFixed(1) : tableProps.h}`)
		console.log(`| tableProps.slideMargin .......................... = ${tableProps.slideMargin ? String(tableProps.slideMargin) : ''}`)
		console.log(`| tableProps.margin ............................... = ${String(tableProps.margin)}`)
		console.log(`| tableProps.colW ................................. = ${String(tableProps.colW)}`)
		console.log(`| tableProps.autoPageSlideStartY .................. = ${tableProps.autoPageSlideStartY}`)
		console.log(`| tableProps.autoPageCharWeight ................... = ${tableProps.autoPageCharWeight}`)
		console.log('|-- CALCULATIONS -------------------------------------------------------|')
		console.log(`| tablePropX ...................................... = ${tablePropX / EMU}`)
		console.log(`| tablePropY ...................................... = ${tablePropY / EMU}`)
		console.log(`| tablePropW ...................................... = ${tablePropW / EMU}`)
		console.log(`| tablePropH ...................................... = ${tablePropH / EMU}`)
		console.log(`| tableCalcW ...................................... = ${tableCalcW / EMU}`)
	}

	// 步骤 1: 计算边距
	{
		// 重要: 使用默认大小，因为零单元格边距会导致我们的表格太大并触及幻灯片底部！
		if (!tableProps.slideMargin && tableProps.slideMargin !== 0) tableProps.slideMargin = DEF_SLIDE_MARGIN_IN[0]

		if (masterSlide && typeof masterSlide._margin !== 'undefined') {
			if (Array.isArray(masterSlide._margin)) arrInchMargins = masterSlide._margin
			else if (!isNaN(Number(masterSlide._margin))) { arrInchMargins = [Number(masterSlide._margin), Number(masterSlide._margin), Number(masterSlide._margin), Number(masterSlide._margin)] }
		} else if (tableProps.slideMargin || tableProps.slideMargin === 0) {
			if (Array.isArray(tableProps.slideMargin)) arrInchMargins = tableProps.slideMargin
			else if (!isNaN(tableProps.slideMargin)) arrInchMargins = [tableProps.slideMargin, tableProps.slideMargin, tableProps.slideMargin, tableProps.slideMargin]
		}

		if (tableProps.verbose) console.log(`| arrInchMargins .................................. = [${arrInchMargins.join(', ')}]`)
	}

	// 步骤 2: 计算列数
	{
		// 注意: 单元格可能有 colspan，所以仅仅取 [0]（或任何其他）行的长度
		// ....: 不足以确定列数。因此，检查每个单元格的 colspan 并按要求总计列数
		const firstRow = tableRows[0] || []
		firstRow.forEach(cell => {
			if (!cell) cell = { _type: SLIDE_OBJECT_TYPES.tablecell }
			const cellOpts = cell.options || null
			numCols += Number(cellOpts?.colspan ? cellOpts.colspan : 1)
		})
		if (tableProps.verbose) console.log(`| numCols ......................................... = ${numCols}`)
	}

	// 步骤 3: 如果可能，使用 tableProps.colW 计算宽度
	if (!tablePropW && tableProps.colW) {
		tableCalcW = Array.isArray(tableProps.colW) ? tableProps.colW.reduce((p, n) => p + n) * EMU : tableProps.colW * numCols || 0
		if (tableProps.verbose) console.log(`| tableCalcW ...................................... = ${tableCalcW / EMU}`)
	}

	// 步骤 4: 现在已知总可用空间，计算可用宽度（`emuSlideTabW`）
	{
		emuSlideTabW = tableCalcW || inch2Emu((tablePropX ? tablePropX / EMU : arrInchMargins[1]) + arrInchMargins[3])
		if (tableProps.verbose) console.log(`| emuSlideTabW .................................... = ${(emuSlideTabW / EMU).toFixed(1)}`)
	}

	// 步骤 5: 如果未提供，计算列宽（emuSlideTabW 将在下面用于确定每列的行数）
	if (!tableProps.colW || !Array.isArray(tableProps.colW)) {
		if (tableProps.colW && !isNaN(Number(tableProps.colW))) {
			const arrColW = []
			const firstRow = tableRows[0] || []
			firstRow.forEach(() => arrColW.push(tableProps.colW))
			tableProps.colW = []
			arrColW.forEach(val => {
				if (Array.isArray(tableProps.colW)) tableProps.colW.push(val)
			})
		} else {
			// 没有提供列宽？那么平均分配列。
			tableProps.colW = []
			for (let iCol = 0; iCol < numCols; iCol++) {
				tableProps.colW.push(emuSlideTabW / EMU / numCols)
			}
		}
	}

	// 步骤 6: **主要逻辑** 遍历行，添加表格内容，当行溢出时创建新幻灯片
	let newTableRowSlide: TableRowSlide = { rows: [] as TableRow[] }
	tableRows.forEach((row, iRow) => {
		// A: 行变量
		const rowCellLines: TableCell[] = []
		let maxCellMarTopEmu = 0
		let maxCellMarBtmEmu = 0

		// B: 在数据模型中创建新行，计算 `maxCellMar*`
		let currTableRow: TableRow = []
		row.forEach(cell => {
			currTableRow.push({
				_type: SLIDE_OBJECT_TYPES.tablecell,
				text: [],
				options: cell.options,
			})

			/** 未来: 已弃用:
			 * - 向后兼容: 哎呀！发现我们在 v3.8.0 之前仍然使用点作为单元格边距（唉！）
			 * - 我们不能在 v4.0 之前引入破坏性更改，所以...
			 */
			if (cell.options.margin && cell.options.margin[0] >= 1) {
				if (cell.options?.margin && cell.options.margin[0] && valToPts(cell.options.margin[0]) > maxCellMarTopEmu) maxCellMarTopEmu = valToPts(cell.options.margin[0])
				else if (tableProps?.margin && tableProps.margin[0] && valToPts(tableProps.margin[0]) > maxCellMarTopEmu) maxCellMarTopEmu = valToPts(tableProps.margin[0])
				if (cell.options?.margin && cell.options.margin[2] && valToPts(cell.options.margin[2]) > maxCellMarBtmEmu) maxCellMarBtmEmu = valToPts(cell.options.margin[2])
				else if (tableProps?.margin && tableProps.margin[2] && valToPts(tableProps.margin[2]) > maxCellMarBtmEmu) maxCellMarBtmEmu = valToPts(tableProps.margin[2])
			} else {
				if (cell.options?.margin && cell.options.margin[0] && inch2Emu(cell.options.margin[0]) > maxCellMarTopEmu) maxCellMarTopEmu = inch2Emu(cell.options.margin[0])
				else if (tableProps?.margin && tableProps.margin[0] && inch2Emu(tableProps.margin[0]) > maxCellMarTopEmu) maxCellMarTopEmu = inch2Emu(tableProps.margin[0])
				if (cell.options?.margin && cell.options.margin[2] && inch2Emu(cell.options.margin[2]) > maxCellMarBtmEmu) maxCellMarBtmEmu = inch2Emu(cell.options.margin[2])
				else if (tableProps?.margin && tableProps.margin[2] && inch2Emu(tableProps.margin[2]) > maxCellMarBtmEmu) maxCellMarBtmEmu = inch2Emu(tableProps.margin[2])
			}
		})

		// C: 计算可用的垂直空间/表格高度。首先设置默认值，必要时在下面调整。
		calcSlideTabH()
		emuTabCurrH += maxCellMarTopEmu + maxCellMarBtmEmu // 从边距开始计算行高
		if (tableProps.verbose && iRow === 0) console.log(`| SLIDE [${tableRowSlides.length}]: emuSlideTabH ...... = ${(emuSlideTabH / EMU).toFixed(1)} `)

		// D: --==[[ 构建数据集 ]]==-- (遍历单元格: 将文本分割为行数组，设置 `lineHeight`)
		row.forEach((cell, iCell) => {
			const newCell: TableCell = {
				_type: SLIDE_OBJECT_TYPES.tablecell,
				_lines: null,
				_lineHeight: inch2Emu(
					((cell.options?.fontSize ? cell.options.fontSize : tableProps.fontSize ? tableProps.fontSize : DEF_FONT_SIZE) *
						(LINEH_MODIFIER + (tableProps.autoPageLineWeight ? tableProps.autoPageLineWeight : 0))) /
					100
				),
				text: [],
				options: cell.options,
			}

			// E-1: 豁免带有 `rowspan` 的单元格增加行高（否则我们可能会不必要地创建新幻灯片！）
			if (newCell.options.rowspan) newCell._lineHeight = 0

			// E-2: parseTextToLines 方法使用 `autoPageCharWeight`，所以从表格选项继承
			newCell.options.autoPageCharWeight = tableProps.autoPageCharWeight ? tableProps.autoPageCharWeight : null

			// E-3: **主要逻辑** 根据列宽、字体等将单元格内容解析为行
			let totalColW = tableProps.colW[iCell]
			if (cell.options.colspan && Array.isArray(tableProps.colW)) {
				totalColW = tableProps.colW.filter((_cell, idx) => idx >= iCell && idx < idx + cell.options.colspan).reduce((prev, curr) => prev + curr)
			}

			// E-4: 根据可用列宽创建行
			newCell._lines = parseTextToLines(cell, totalColW, false)

			// E-5: 将单元格添加到数组
			rowCellLines.push(newCell)
		})

		/** E: --==[[ PAGE DATA SET ]]==--
		 * Add text one-line-a-time to this row's cells until: lines are exhausted OR table height limit is hit
		 *
		 * Design:
		 * - Building cells L-to-R/loop style wont work as one could be 100 lines and another 1 line
		 * - Therefore, build the whole row, one-line-at-a-time, across each table columns
		 * - Then, when the vertical size limit is hit is by any of the cells, make a new slide and continue adding any remaining lines
		 *
		 * Implementation:
		 * - `rowCellLines` is an array of cells, one for each column in the table, with each cell containing an array of lines
		 *
		 * Sample Data:
		 * - `rowCellLines` ..: [ TableCell, TableCell, TableCell ]
		 * - `TableCell` .....: { _type: 'tablecell', _lines: TableCell[], _lineHeight: 10 }
		 * - `_lines` ........: [ {_type: 'tablecell', text: 'cell-1,line-1', options: {…}}, {_type: 'tablecell', text: 'cell-1,line-2', options: {…}} }
		 * - `_lines` is TableCell[] (the 1-N words in the line)
		 * {
		 *    _lines: [{ text:'cell-1,line-1' }, { text:'cell-1,line-2' }],                                                     // TOTAL-CELL-HEIGHT = 2
		 *    _lines: [{ text:'cell-2,line-1' }, { text:'cell-2,line-2' }],                                                     // TOTAL-CELL-HEIGHT = 2
		 *    _lines: [{ text:'cell-3,line-1' }, { text:'cell-3,line-2' }, { text:'cell-3,line-3' }, { text:'cell-3,line-4' }], // TOTAL-CELL-HEIGHT = 4
		 * }
		 *
		 * Example: 2 rows, with the firstrow overflowing onto a new slide
		 * SLIDE 1:
		 *  |--------|--------|--------|--------|
		 *  | line-1 | line-1 | line-1 | line-1 |
		 *  |        |        | line-2 |        |
		 *  |        |        | line-3 |        |
		 *  |--------|--------|--------|--------|
		 *
		 * SLIDE 2:
		 *  |--------|--------|--------|--------|
		 *  |        |        | line-4 |        |
		 *  |--------|--------|--------|--------|
		 *  | line-1 | line-1 | line-1 | line-1 |
		 *  |--------|--------|--------|--------|
		 */
		if (tableProps.verbose) console.log(`\n| SLIDE [${tableRowSlides.length}]: ROW [${iRow}]: START...`)
		let currCellIdx = 0
		let emuLineMaxH = 0
		let isDone = false
		while (!isDone) {
			const srcCell: TableCell = rowCellLines[currCellIdx]
			let tgtCell: TableCell = currTableRow[currCellIdx] // 注意: 可能会在下面重新定义（可能会创建新行，从而更改此值）

			// 1: 计算 emuLineMaxH
			rowCellLines.forEach(cell => {
				if (cell._lineHeight >= emuLineMaxH) emuLineMaxH = cell._lineHeight
			})

			// 2: 如果当前行没有足够的空间，则创建新幻灯片
			if (emuTabCurrH + emuLineMaxH > emuSlideTabH) {
				if (tableProps.verbose) {
					console.log('\n|-----------------------------------------------------------------------|')
					// prettier-ignore
					console.log(`|-- NEW SLIDE CREATED (currTabH+currLineH > maxH) => ${(emuTabCurrH / EMU).toFixed(2)} + ${(srcCell._lineHeight / EMU).toFixed(2)} > ${emuSlideTabH / EMU}`)
					console.log('|-----------------------------------------------------------------------|\n\n')
				}

				// A: 添加当前行幻灯片，否则会丢失（仅当它有行和文本时）
				if (currTableRow.length > 0 && currTableRow.map(cell => cell.text.length).reduce((p, n) => p + n) > 0) newTableRowSlide.rows.push(currTableRow)

				// B: 将当前幻灯片添加到幻灯片数组
				tableRowSlides.push(newTableRowSlide)

				// C: 重置工作/当前幻灯片以容纳创建的行
				const newRows: TableRow[] = []
				newTableRowSlide = { rows: newRows }

				// D: 重置工作/当前行
				currTableRow = []
				row.forEach(cell => currTableRow.push({ _type: SLIDE_OBJECT_TYPES.tablecell, text: [], options: cell.options }))

				// E: 籈在我们可能仍在同一行中，计算可用的垂直空间/表格高度，因为上面的代码（“C: 计算可用的垂直空间/表格高度。"）现在可能无效
				calcSlideTabH()
				emuTabCurrH += maxCellMarTopEmu + maxCellMarBtmEmu // 从边距开始计算行高
				if (tableProps.verbose) console.log(`| SLIDE [${tableRowSlides.length}]: emuSlideTabH ...... = ${(emuSlideTabH / EMU).toFixed(1)} `)

				// F: 为此新幻灯片重置当前表格高度
				emuTabCurrH = 0

				// G: 处理重复表头选项/或添加新的空行以继续当前行
				if ((tableProps.addHeaderToEach || tableProps.autoPageRepeatHeader) && tableProps._arrObjTabHeadRows) {
					tableProps._arrObjTabHeadRows.forEach(row => {
						const newHeadRow: TableRow = []
						let maxLineHeight = 0
						row.forEach(cell => {
							newHeadRow.push(cell)
							if (cell._lineHeight > maxLineHeight) maxLineHeight = cell._lineHeight
						})
						newTableRowSlide.rows.push(newHeadRow)
						emuTabCurrH += maxLineHeight // TODO: 边距怎么办？ 我们不需要在行高中包含单元格边距吗？
					})
				}

				// 进行中: 新功能: 测试这个!!
				tgtCell = currTableRow[currCellIdx]
			}

			// 3: 设置组成此行的单词数组
			const currLine: TableCell[] = srcCell._lines.shift()

			// 4: 通过添加当前行的所有单词来创建新行（如果没有单词则添加空内容，以避免单元格内容为 null 时触发"需要修复"问题）
			if (Array.isArray(tgtCell.text)) {
				if (currLine) tgtCell.text = tgtCell.text.concat(currLine)
				else if (tgtCell.text.length === 0) tgtCell.text = tgtCell.text.concat({ _type: SLIDE_OBJECT_TYPES.tablecell, text: '' })
				// 重要: ^^^ 如果没有单词则添加空内容，以避免单元格内容为 null 时触发"需要修复"问题
			}

			// 5: 通过当前行高增加表格高度（如果在最后一列）
			if (currCellIdx === rowCellLines.length - 1) emuTabCurrH += emuLineMaxH

           	// 6: 匉列/单元格索引前进（或循环回到第一个以继续添加行）
			currCellIdx = currCellIdx < rowCellLines.length - 1 ? currCellIdx + 1 : 0

           	// 7: 进行中: 完成?
			const brent = rowCellLines.map(cell => cell._lines.length).reduce((prev, next) => prev + next)
			if (brent === 0) isDone = true
		}

		// F: 在循环顶部重置之前刷新/捕获行缓冲区
		if (currTableRow.length > 0) newTableRowSlide.rows.push(currTableRow)

		if (tableProps.verbose) {
			console.log(
				`- SLIDE [${tableRowSlides.length}]: ROW [${iRow}]: ...COMPLETE ...... emuTabCurrH = ${(emuTabCurrH / EMU).toFixed(2)} ( emuSlideTabH = ${(
					emuSlideTabH / EMU
				).toFixed(2)} )`
			)
		}
	})

	// 步骤 7: 刷新缓冲区 / 添加最终幻灯片
	tableRowSlides.push(newTableRowSlide)

	if (tableProps.verbose) {
		console.log('\n|================================================|')
		console.log(`| FINAL: tableRowSlides.length = ${tableRowSlides.length}`)
		tableRowSlides.forEach(slide => console.log(slide))
		console.log('|================================================|\n\n')
	}

	// 最后:
	return tableRowSlides
}
/**
 * 将 HTML 表格复制为 PowerPoint 表格 - 包括列宽、样式等 - 根据需要创建 1 张或多张幻灯片
 * @param {PptxGenJS} pptx - pptxgenjs 实例
 * @param {string} tabEleId - 表格的 HTMLElementID
 * @param {ITableToSlidesOpts} options - 选项数组（例如: tabsize）
 * @param {SlideLayout} masterSlide - 母版幻灯片
 */
export function genTableToSlides(pptx: PptxGenJS, tabEleId: string, options: TableToSlidesProps = {}, masterSlide?: SlideLayout): void {
	const opts = options || {}
	opts.slideMargin = opts.slideMargin || opts.slideMargin === 0 ? opts.slideMargin : 0.5
	let emuSlideTabW = opts.w || pptx.presLayout.width
	const arrObjTabHeadRows: [TableCell[]?] = []
	const arrObjTabBodyRows: [TableCell[]?] = []
	const arrObjTabFootRows: [TableCell[]?] = []
	const arrColW: number[] = []
	const arrTabColW: number[] = []
	let arrInchMargins: [number, number, number, number] = [0.5, 0.5, 0.5, 0.5] // 上右下左样式
	let intTabW = 0

	// 现实检查:
	if (!document.getElementById(tabEleId)) throw new Error('tableToSlides: Table ID "' + tabEleId + '" does not exist!')

	// 步骤 1: 设置边距
	if (masterSlide?._margin) {
		if (Array.isArray(masterSlide._margin)) arrInchMargins = masterSlide._margin
		else if (!isNaN(masterSlide._margin)) arrInchMargins = [masterSlide._margin, masterSlide._margin, masterSlide._margin, masterSlide._margin]
		opts.slideMargin = arrInchMargins
	} else if (opts?.slideMargin) {
		if (Array.isArray(opts.slideMargin)) arrInchMargins = opts.slideMargin
		else if (!isNaN(opts.slideMargin)) arrInchMargins = [opts.slideMargin, opts.slideMargin, opts.slideMargin, opts.slideMargin]
	}
	emuSlideTabW = (opts.w ? inch2Emu(opts.w) : pptx.presLayout.width) - inch2Emu(arrInchMargins[1] + arrInchMargins[3])

	if (opts.verbose) {
		console.log('[[VERBOSE MODE]]')
		console.log('|-- `tableToSlides` ----------------------------------------------------|')
		console.log(`| tableProps.h .................................... = ${opts.h}`)
		console.log(`| tableProps.w .................................... = ${opts.w}`)
		console.log(`| pptx.presLayout.width ........................... = ${(pptx.presLayout.width / EMU).toFixed(1)}`)
		console.log(`| pptx.presLayout.height .......................... = ${(pptx.presLayout.height / EMU).toFixed(1)}`)
		console.log(`| emuSlideTabW .................................... = ${(emuSlideTabW / EMU).toFixed(1)}`)
	}

	// 步骤 2: 获取表格列宽 - 只需找到第一个可用行，无论是 thead/tbody/tfoot，其他可能有 colspans，谁在乎，我们只需要从 1 行获取列宽
	let firstRowCells = document.querySelectorAll(`#${tabEleId} tr:first-child th`)
	if (firstRowCells.length === 0) firstRowCells = document.querySelectorAll(`#${tabEleId} tr:first-child td`)
	firstRowCells.forEach((cellEle: Element) => {
		const cell = cellEle as HTMLTableCellElement
		if (cell.getAttribute('colspan')) {
			// 估算（平均分配）列宽
			// 注意: 当表格不可见时，j$query 和 vanilla 选择器都返回 {0}
			for (let idxc = 0; idxc < Number(cell.getAttribute('colspan')); idxc++) {
				arrTabColW.push(Math.round(cell.offsetWidth / Number(cell.getAttribute('colspan'))))
			}
		} else {
			arrTabColW.push(cell.offsetWidth)
		}
	})
	arrTabColW.forEach(colW => {
		intTabW += colW
	})

	// 步骤 3: 使用与 HTML 表格相同的列宽百分比计算/设置列宽
	arrTabColW.forEach((colW, idxW) => {
		const intCalcWidth = Number(((Number(emuSlideTabW) * ((colW / intTabW) * 100)) / 100 / EMU).toFixed(2))
		let intMinWidth = 0
		const colSelectorMin = document.querySelector(`#${tabEleId} thead tr:first-child th:nth-child(${idxW + 1})`)
		if (colSelectorMin) intMinWidth = Number(colSelectorMin.getAttribute('data-pptx-min-width'))
		const intSetWidth = 0
		const colSelectorSet = document.querySelector(`#${tabEleId} thead tr:first-child th:nth-child(${idxW + 1})`)
		if (colSelectorSet) intMinWidth = Number(colSelectorSet.getAttribute('data-pptx-width'))
		arrColW.push(intSetWidth || (intMinWidth > intCalcWidth ? intMinWidth : intCalcWidth))
	})
	if (opts.verbose) {
		console.log(`| arrColW ......................................... = [${arrColW.join(', ')}]`)
	}

	// 步骤 4: 遍历每个表格元素并创建数据数组（文本和选项）
	// 注意: 我们创建 3 个数组而不是一个，这样我们可以遍历主体，然后在第一页和最后一页显示页眉/页脚行
	const tableParts = ['thead', 'tbody', 'tfoot']
	tableParts.forEach(part => {
		document.querySelectorAll(`#${tabEleId} ${part} tr`).forEach((row: Element) => {
			const htmlRow = row as HTMLTableRowElement
			const arrObjTabCells: TableCell[] = []
			Array.from(htmlRow.cells).forEach(cell => {
				// A: 获取 RGB 文本/背景颜色
				const arrRGB1 = window.getComputedStyle(cell).getPropertyValue('color').replace(/\s+/gi, '').replace('rgba(', '').replace('rgb(', '').replace(')', '').split(',')
				let arrRGB2 = window
					.getComputedStyle(cell)
					.getPropertyValue('background-color')
					.replace(/\s+/gi, '')
					.replace('rgba(', '')
					.replace('rgb(', '')
					.replace(')', '')
					.split(',')
				if (
					// 注意: (ISSUE#57): 未设置样式的表格默认背景是黑色，所以改用白色
					window.getComputedStyle(cell).getPropertyValue('background-color') === 'rgba(0, 0, 0, 0)' ||
					window.getComputedStyle(cell).getPropertyValue('transparent')
				) {
					arrRGB2 = ['255', '255', '255']
				}

				// B: 创建选项对象
				const cellOpts: TableCellProps = {
					align: null,
					bold:
						!!(window.getComputedStyle(cell).getPropertyValue('font-weight') === 'bold' ||
							Number(window.getComputedStyle(cell).getPropertyValue('font-weight')) >= 500),
					border: null,
					color: rgbToHex(Number(arrRGB1[0]), Number(arrRGB1[1]), Number(arrRGB1[2])),
					fill: { color: rgbToHex(Number(arrRGB2[0]), Number(arrRGB2[1]), Number(arrRGB2[2])) },
					fontFace:
						(window.getComputedStyle(cell).getPropertyValue('font-family') || '').split(',')[0].replace(/"/g, '').replace('inherit', '').replace('initial', '') ||
						null,
					fontSize: Number(window.getComputedStyle(cell).getPropertyValue('font-size').replace(/[a-z]/gi, '')),
					margin: null,
					colspan: Number(cell.getAttribute('colspan')) || null,
					rowspan: Number(cell.getAttribute('rowspan')) || null,
					valign: null,
				}

				if (['left', 'center', 'right', 'start', 'end'].includes(window.getComputedStyle(cell).getPropertyValue('text-align'))) {
					const align = window.getComputedStyle(cell).getPropertyValue('text-align').replace('start', 'left').replace('end', 'right')
					cellOpts.align = align === 'center' ? 'center' : align === 'left' ? 'left' : align === 'right' ? 'right' : null
				}
				if (['top', 'middle', 'bottom'].includes(window.getComputedStyle(cell).getPropertyValue('vertical-align'))) {
					const valign = window.getComputedStyle(cell).getPropertyValue('vertical-align')
					cellOpts.valign = valign === 'top' ? 'top' : valign === 'middle' ? 'middle' : valign === 'bottom' ? 'bottom' : null
				}

				// C: 添加内边距 [margin]（如果有）
				// 注意: 边距转换: px->pt 1:1（例如: 20px 内边距的单元格在 PPTX 中看起来与 20pt 文本插入/内边距相同）
				if (window.getComputedStyle(cell).getPropertyValue('padding-left')) {
					cellOpts.margin = [0, 0, 0, 0]
					const sidesPad = ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']
					sidesPad.forEach((val, idxs) => {
						cellOpts.margin[idxs] = Math.round(Number(window.getComputedStyle(cell).getPropertyValue(val).replace(/\D/gi, '')))
					})
				}

				// D: 添加边框（如果有）
				if (
					window.getComputedStyle(cell).getPropertyValue('border-top-width') ||
					window.getComputedStyle(cell).getPropertyValue('border-right-width') ||
					window.getComputedStyle(cell).getPropertyValue('border-bottom-width') ||
					window.getComputedStyle(cell).getPropertyValue('border-left-width')
				) {
					cellOpts.border = [null, null, null, null]
					const sidesBor = ['top', 'right', 'bottom', 'left']
					sidesBor.forEach((val, idxb) => {
						const intBorderW = Math.round(
							Number(
								window
									.getComputedStyle(cell)
									.getPropertyValue('border-' + val + '-width')
									.replace('px', '')
							)
						)
						let arrRGB = []
						arrRGB = window
							.getComputedStyle(cell)
							.getPropertyValue('border-' + val + '-color')
							.replace(/\s+/gi, '')
							.replace('rgba(', '')
							.replace('rgb(', '')
							.replace(')', '')
							.split(',')
						const strBorderC = rgbToHex(Number(arrRGB[0]), Number(arrRGB[1]), Number(arrRGB[2]))
						cellOpts.border[idxb] = { pt: intBorderW, color: strBorderC }
					})
				}

				// 最后: 添加单元格
				arrObjTabCells.push({
					_type: SLIDE_OBJECT_TYPES.tablecell,
					text: cell.innerText, // `innerText` 将 <br> 返回为 "\n"，所以换行等稍后可以正常工作！
					options: cellOpts,
				})
			})
			switch (part) {
				case 'thead':
					arrObjTabHeadRows.push(arrObjTabCells)
					break
				case 'tbody':
					arrObjTabBodyRows.push(arrObjTabCells)
					break
				case 'tfoot':
					arrObjTabFootRows.push(arrObjTabCells)
					break
				default:
					console.log(`table parsing: unexpected table part: ${part}`)
					break
			}
		})
	})

	// 步骤 5: 根据需要将表格拆分为幻灯片
	// 传递标题行，因为有一个选项可以添加到每个表格，解析函数需要此数据来满足该选项
	opts._arrObjTabHeadRows = arrObjTabHeadRows || null
	opts.colW = arrColW
	getSlidesForTableRows([...arrObjTabHeadRows, ...arrObjTabBodyRows, ...arrObjTabFootRows], opts, pptx.presLayout, masterSlide).forEach((slide, idxTr) => {
		// A: 创建新幻灯片
		const newSlide = pptx.addSlide({ masterName: opts.masterSlideName || null })

		// B: 设计: 在第一张幻灯片后将 `y` 重置为 startY 或 margin (ISSUE#43, ISSUE#47, ISSUE#48)
		if (idxTr === 0) opts.y = opts.y || arrInchMargins[0]
		if (idxTr > 0) opts.y = opts.autoPageSlideStartY || opts.newSlideStartY || arrInchMargins[0]
		if (opts.verbose) console.log(`| opts.autoPageSlideStartY: ${opts.autoPageSlideStartY} / arrInchMargins[0]: ${arrInchMargins[0]} => opts.y = ${opts.y}`)

		// C: 将表格添加到幻灯片
		newSlide.addTable(slide.rows, { x: opts.x || arrInchMargins[3], y: opts.y, w: Number(emuSlideTabW) / EMU, colW: arrColW, autoPage: false })

		// D: 添加任何额外的对象
		if (opts.addImage) {
			opts.addImage.options = opts.addImage.options || {}
			if (!opts.addImage.image || (!opts.addImage.image.path && !opts.addImage.image.data)) {
				console.warn('Warning: tableToSlides.addImage requires either `path` or `data`')
			} else {
				newSlide.addImage({
					path: opts.addImage.image.path,
					data: opts.addImage.image.data,
					x: opts.addImage.options.x,
					y: opts.addImage.options.y,
					w: opts.addImage.options.w,
					h: opts.addImage.options.h,
				})
			}
		}
		if (opts.addShape) newSlide.addShape(opts.addShape.shapeName, opts.addShape.options || {})
		if (opts.addTable) newSlide.addTable(opts.addTable.rows, opts.addTable.options || {})
		if (opts.addText) newSlide.addText(opts.addText.text, opts.addText.options || {})
	})
}
