'use client';

import { useRef, useState, useEffect } from 'react';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import { useKeyboardStore } from '@/lib/store/keyboard';
import { useViewportSize } from './hooks/useViewportSize';
import { useSelectElement } from './hooks/useSelectElement';
import { useDragElement } from './hooks/useDragElement';
import { useRotateElement } from './hooks/useRotateElement';
import { useMouseSelection } from './hooks/useMouseSelection';
import { useScaleElement } from './hooks/useScaleElement';
import { useDragLineElement } from './hooks/useDragLineElement';
import { useMoveShapeKeypoint } from './hooks/useMoveShapeKeypoint';
import { useInsertFromCreateSelection } from './hooks/useInsertFromCreateSelection';
import { useDrop } from './hooks/useDrop';
import { AlignmentLine } from './AlignmentLine';
import { MouseSelection } from './MouseSelection';
import { ViewportBackground } from './ViewportBackground';
import { EditableElement } from './EditableElement';
import { Operate } from './Operate';
import { MultiSelectOperate } from './Operate/MultiSelectOperate';
import { ElementCreateSelection } from './ElementCreateSelection';
import { ShapeCreateCanvas } from './ShapeCreateCanvas';
import { Ruler } from './Ruler';
import { GridLines } from './GridLines';
import type { PPTElement } from '@/lib/types/slides';
import type { AlignmentLineProps } from '@/lib/types/edit';
import type { ContextmenuItem } from './EditableElement';
import type { SlideContent } from '@/lib/types/stage';
import { useCanvasOperations } from '@/lib/hooks/use-canvas-operations';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuShortcut,
  ContextMenuItem,
} from '@/components/ui/context-menu';

export interface CanvasProps {
  editable?: boolean;
}

/**
 * 画布组件
 *
 * 架构：
 * - 幻灯片数据（元素、背景）→ Scene Context（来自 stageStore）
 * - 本地元素列表 → useRef + useState（用于拖拽/缩放/旋转操作）
 * - 画布 UI 状态（选择、工具栏）→ Canvas Store
 * - 键盘状态 → Keyboard Store
 *
 * 用法：
 * <SceneProvider>
 *   <Canvas />
 * </SceneProvider>
 */
export function Canvas(_props: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // 订阅特定部分以优化性能
  const elements = useSceneSelector<SlideContent, PPTElement[]>(
    (content) => content.canvas.elements,
  );

  // 画布 UI 状态
  const canvasScale = useCanvasStore.use.canvasScale();
  const activeElementIdList = useCanvasStore.use.activeElementIdList();
  const activeGroupElementId = useCanvasStore.use.activeGroupElementId();
  const handleElementId = useCanvasStore.use.handleElementId();
  const hiddenElementIdList = useCanvasStore.use.hiddenElementIdList();
  const creatingElement = useCanvasStore.use.creatingElement();
  const creatingCustomShape = useCanvasStore.use.creatingCustomShape();
  const showRuler = useCanvasStore.use.showRuler();
  const gridLineSize = useCanvasStore.use.gridLineSize();
  const setActiveElementIdList = useCanvasStore.use.setActiveElementIdList();
  const setGridLineSize = useCanvasStore.use.setGridLineSize();
  const setRulerState = useCanvasStore.use.setRulerState();

  // 键盘状态
  const spaceKeyState = useKeyboardStore((state) => state.spaceKeyState);

  const [alignmentLines, setAlignmentLines] = useState<AlignmentLineProps[]>([]);
  const [linkDialogVisible, setLinkDialogVisible] = useState(false);

  // 用于拖拽/缩放/旋转操作的本地元素列表
  const elementListRef = useRef<PPTElement[]>(elements || []);
  const [elementList, setElementList] = useState<PPTElement[]>(elements || []);

  // 同步 store 元素到本地状态
  useEffect(() => {
    const newElements = elements ? JSON.parse(JSON.stringify(elements)) : [];
    elementListRef.current = newElements;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 同步 store 元素到本地状态
    setElementList(newElements);
  }, [elements]);

  // 视口尺寸和定位
  const { viewportStyles, dragViewport } = useViewportSize(canvasRef);

  // 初始化放置处理器
  useDrop(canvasRef);

  // 元素拖拽（带对齐吸附）
  const { dragElement } = useDragElement(elementListRef, setElementList, setAlignmentLines);

  // 元素选择
  const { selectElement } = useSelectElement(elementListRef, dragElement);

  // 鼠标选区
  const { mouseSelection, mouseSelectionVisible, mouseSelectionQuadrant, updateMouseSelection } =
    useMouseSelection(elementListRef, viewportRef);

  // 元素操作
  const { scaleElement, scaleMultiElement } = useScaleElement(
    elementListRef,
    setElementList,
    setAlignmentLines,
  );
  const { rotateElement } = useRotateElement(
    elementListRef,
    setElementList,
    viewportRef,
    canvasScale,
  );
  const { dragLineElement } = useDragLineElement(elementListRef, setElementList);
  const { moveShapeKeypoint } = useMoveShapeKeypoint(elementListRef, setElementList, canvasScale);

  // 从选区创建元素
  const { insertElementFromCreateSelection } = useInsertFromCreateSelection(viewportRef);

  // 点击画布空白区域：清除活动元素
  const handleClickBlankArea = (e: React.MouseEvent) => {
    // 检查点击目标是否为右键菜单元素（Portal 中的菜单内容）
    const target = e.target as HTMLElement;
    if (
      target.closest('[data-slot="context-menu-content"]') ||
      target.closest('[data-slot="context-menu-sub-content"]') ||
      target.closest('[data-slot="context-menu-item"]') ||
      target.closest('[data-slot="context-menu-sub-trigger"]')
    ) {
      return; // 如果点击右键菜单则跳过空白区域处理
    }

    if (activeElementIdList.length) {
      setActiveElementIdList([]);
    }

    if (!spaceKeyState) {
      updateMouseSelection(e);
    } else {
      dragViewport(e);
    }
  };

  // 双击空白区域插入文本
  const handleDblClick = (_e: React.MouseEvent) => {
    if (activeElementIdList.length || creatingElement || creatingCustomShape) return;
    if (!viewportRef.current) return;

    const _viewportRect = viewportRef.current.getBoundingClientRect();
    // TODO: 实现 createTextElement（使用 _viewportRect + e.pageX/Y + canvasScale）
  };

  const openLinkDialog = () => {
    setLinkDialogVisible(true);
  };

  const { pasteElement, selectAllElements, deleteAllElements } = useCanvasOperations();

  const contextmenus = (): ContextmenuItem[] => {
    return [
      {
        text: '粘贴',
        subText: 'Ctrl + V',
        handler: pasteElement,
      },
      {
        text: '全选',
        subText: 'Ctrl + A',
        handler: selectAllElements,
      },
      {
        text: '标尺',
        subText: showRuler ? '√' : '',
        handler: () => setRulerState(!showRuler),
      },
      {
        text: '网格线',
        handler: () => setGridLineSize(gridLineSize ? 0 : 50),
        children: [
          {
            text: '无',
            subText: gridLineSize === 0 ? '√' : '',
            handler: () => setGridLineSize(0),
          },
          {
            text: '小',
            subText: gridLineSize === 25 ? '√' : '',
            handler: () => setGridLineSize(25),
          },
          {
            text: '中',
            subText: gridLineSize === 50 ? '√' : '',
            handler: () => setGridLineSize(50),
          },
          {
            text: '大',
            subText: gridLineSize === 100 ? '√' : '',
            handler: () => setGridLineSize(100),
          },
        ],
      },
      {
        text: '重置当前页',
        handler: deleteAllElements,
      },
    ];
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className="canvas relative h-full w-full overflow-hidden bg-gray-100 select-none"
          ref={canvasRef}
          onMouseDown={handleClickBlankArea}
          onDoubleClick={handleDblClick}
        >
          {/* 元素创建选区 */}
          {creatingElement && (
            <ElementCreateSelection onCreated={insertElementFromCreateSelection} />
          )}

          {/* 自定义形状创建画布 */}
          {creatingCustomShape && (
            <ShapeCreateCanvas
              onCreated={(_data) => {
                // TODO: 实现 insertCustomShape
              }}
            />
          )}

          {/* 视口包装器 */}
          <div
            className="viewport-wrapper absolute shadow-[0_0_0_1px_rgba(0,0,0,0.01),0_0_12px_0_rgba(0,0,0,0.1)]"
            style={{
              width: `${viewportStyles.width * canvasScale}px`,
              height: `${viewportStyles.height * canvasScale}px`,
              left: `${viewportStyles.left}px`,
              top: `${viewportStyles.top}px`,
            }}
          >
            {/* 操作层 - 对齐线和选择手柄 */}
            <div className="operates absolute top-0 left-0 w-full h-full pointer-events-none">
              {/* 对齐线 */}
              {alignmentLines.map((line, index) => (
                <AlignmentLine
                  key={`${line.type}-${line.axis.x}-${line.axis.y}-${index}`}
                  type={line.type}
                  axis={line.axis}
                  length={line.length}
                  canvasScale={canvasScale}
                />
              ))}

              {/* 多选操作 */}
              {activeElementIdList.length > 1 && (
                <MultiSelectOperate
                  elementList={elementList}
                  scaleMultiElement={scaleMultiElement}
                />
              )}

              {/* 单元素操作 */}
              {elementList.map(
                (element: PPTElement) =>
                  !hiddenElementIdList.includes(element.id) && (
                    <Operate
                      key={element.id}
                      elementInfo={element}
                      isSelected={activeElementIdList.includes(element.id)}
                      isActive={handleElementId === element.id}
                      isActiveGroupElement={activeGroupElementId === element.id}
                      isMultiSelect={activeElementIdList.length > 1}
                      rotateElement={rotateElement}
                      scaleElement={scaleElement}
                      dragLineElement={dragLineElement}
                      moveShapeKeypoint={moveShapeKeypoint}
                      openLinkDialog={openLinkDialog}
                    />
                  ),
              )}

              <ViewportBackground />
            </div>

            {/* 视口 - 实际的幻灯片画布 */}
            <div
              ref={viewportRef}
              className="viewport absolute top-0 left-0 origin-top-left"
              style={{
                width: `${viewportStyles.width}px`,
                height: `${viewportStyles.height}px`,
                transform: `scale(${canvasScale})`,
              }}
            >
              {/* 网格线 */}
              {gridLineSize > 0 && <GridLines />}

              {/* 鼠标选区矩形 */}
              {mouseSelectionVisible && (
                <MouseSelection
                  top={mouseSelection.top}
                  left={mouseSelection.left}
                  width={mouseSelection.width}
                  height={mouseSelection.height}
                  quadrant={mouseSelectionQuadrant}
                  canvasScale={canvasScale}
                />
              )}

              {/* 渲染所有元素 */}
              {elementList.map((element: PPTElement, index: number) =>
                !hiddenElementIdList.includes(element.id) ? (
                  <EditableElement
                    key={element.id}
                    elementInfo={element}
                    elementIndex={index + 1}
                    isMultiSelect={activeElementIdList.length > 1}
                    selectElement={selectElement}
                    openLinkDialog={openLinkDialog}
                  />
                ) : null,
              )}
            </div>
          </div>

          {/* 标尺 */}
          {showRuler && <Ruler viewportStyles={viewportStyles} elementList={elementList} />}

          {/* 按住空格键时的拖拽遮罩 */}
          {spaceKeyState && <div className="drag-mask absolute inset-0 cursor-grab" />}

          {/* TODO: 添加 LinkDialog 弹窗 */}
          {linkDialogVisible && <div>LinkDialog placeholder</div>}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {contextmenus().map((item, index) => {
          if (item.divider) {
            return <ContextMenuSeparator key={index} />;
          }

          // 如果有子项，使用子菜单组件
          if (item.children && item.children.length > 0) {
            return (
              <ContextMenuSub key={index}>
                <ContextMenuSubTrigger disabled={item.disable} hidden={item.hide}>
                  {item.text}
                  {item.subText && <ContextMenuShortcut>{item.subText}</ContextMenuShortcut>}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  {item.children.map((child, childIndex) =>
                    child.divider ? (
                      <ContextMenuSeparator key={childIndex} />
                    ) : (
                      <ContextMenuItem
                        key={childIndex}
                        onClick={(e) => {
                          e.stopPropagation();
                          child.handler?.();
                        }}
                        disabled={child.disable}
                        hidden={child.hide}
                      >
                        {child.text}
                        {child.subText && (
                          <ContextMenuShortcut>{child.subText}</ContextMenuShortcut>
                        )}
                      </ContextMenuItem>
                    ),
                  )}
                </ContextMenuSubContent>
              </ContextMenuSub>
            );
          }

          // 常规菜单项
          return (
            <ContextMenuItem
              key={index}
              onClick={(e) => {
                e.stopPropagation();
                item.handler?.();
              }}
              disabled={item.disable}
              hidden={item.hide}
            >
              {item.text}
              {item.subText && <ContextMenuShortcut>{item.subText}</ContextMenuShortcut>}
            </ContextMenuItem>
          );
        })}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export default Canvas;
