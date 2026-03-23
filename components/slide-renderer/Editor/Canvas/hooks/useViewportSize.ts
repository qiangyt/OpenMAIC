import { useState, useEffect, useRef, useMemo, useCallback, type RefObject } from 'react';
import { useCanvasStore } from '@/lib/store';

export interface ViewportStyles {
  width: number;
  height: number;
  left: number;
  top: number;
}

/**
 * 管理画布视口尺寸和位置的 Hook
 * 处理视口缩放、定位和画布拖拽
 */
export function useViewportSize(canvasRef: RefObject<HTMLElement | null>) {
  const [viewportLeft, setViewportLeft] = useState(0);
  const [viewportTop, setViewportTop] = useState(0);

  const canvasPercentage = useCanvasStore.use.canvasPercentage();
  const canvasDragged = useCanvasStore.use.canvasDragged();
  const setCanvasScale = useCanvasStore.use.setCanvasScale();
  const setCanvasDragged = useCanvasStore.use.setCanvasDragged();

  const viewportRatio = useCanvasStore.use.viewportRatio();
  const viewportSize = useCanvasStore.use.viewportSize();

  // 初始化视口位置
  const initViewportPosition = useCallback(() => {
    if (!canvasRef.current) return;
    const canvasWidth = canvasRef.current.clientWidth;
    const canvasHeight = canvasRef.current.clientHeight;

    if (canvasHeight / canvasWidth > viewportRatio) {
      const viewportActualWidth = canvasWidth * (canvasPercentage / 100);
      setCanvasScale(viewportActualWidth / viewportSize);
      setViewportLeft((canvasWidth - viewportActualWidth) / 2);
      setViewportTop((canvasHeight - viewportActualWidth * viewportRatio) / 2);
    } else {
      const viewportActualHeight = canvasHeight * (canvasPercentage / 100);
      setCanvasScale(viewportActualHeight / (viewportSize * viewportRatio));
      setViewportLeft((canvasWidth - viewportActualHeight / viewportRatio) / 2);
      setViewportTop((canvasHeight - viewportActualHeight) / 2);
    }
  }, [canvasRef, canvasPercentage, viewportRatio, viewportSize, setCanvasScale]);

  // 更新视口位置
  const setViewportPosition = useCallback(
    (newValue: number, oldValue: number) => {
      if (!canvasRef.current) return;
      const canvasWidth = canvasRef.current.clientWidth;
      const canvasHeight = canvasRef.current.clientHeight;

      if (canvasHeight / canvasWidth > viewportRatio) {
        const newViewportActualWidth = canvasWidth * (newValue / 100);
        const oldViewportActualWidth = canvasWidth * (oldValue / 100);
        const newViewportActualHeight = newViewportActualWidth * viewportRatio;
        const oldViewportActualHeight = oldViewportActualWidth * viewportRatio;

        setCanvasScale(newViewportActualWidth / viewportSize);

        setViewportLeft((prev) => prev - (newViewportActualWidth - oldViewportActualWidth) / 2);
        setViewportTop((prev) => prev - (newViewportActualHeight - oldViewportActualHeight) / 2);
      } else {
        const newViewportActualHeight = canvasHeight * (newValue / 100);
        const oldViewportActualHeight = canvasHeight * (oldValue / 100);
        const newViewportActualWidth = newViewportActualHeight / viewportRatio;
        const oldViewportActualWidth = oldViewportActualHeight / viewportRatio;

        setCanvasScale(newViewportActualHeight / (viewportSize * viewportRatio));

        setViewportLeft((prev) => prev - (newViewportActualWidth - oldViewportActualWidth) / 2);
        setViewportTop((prev) => prev - (newViewportActualHeight - oldViewportActualHeight) / 2);
      }
    },
    [canvasRef, viewportRatio, viewportSize, setCanvasScale],
  );

  // 跟踪上一个画布百分比用于检测变化
  const prevCanvasPercentageRef = useRef(canvasPercentage);

  // 当画布百分比变化时更新视口位置
  useEffect(() => {
    if (prevCanvasPercentageRef.current !== canvasPercentage) {
      setViewportPosition(canvasPercentage, prevCanvasPercentageRef.current);
      prevCanvasPercentageRef.current = canvasPercentage;
    }
  }, [canvasPercentage, setViewportPosition]);

  // 当视口比例或尺寸变化时重置视口位置
  useEffect(() => {
    initViewportPosition();
  }, [viewportRatio, viewportSize, initViewportPosition]);

  // 当拖拽状态恢复时重置视口位置
  useEffect(() => {
    if (!canvasDragged) {
      initViewportPosition();
    }
  }, [canvasDragged, initViewportPosition]);

  // 当画布尺寸变化时重置视口位置
  useEffect(() => {
    const el = canvasRef.current;
    const resizeObserver = new ResizeObserver(initViewportPosition);
    if (el) {
      resizeObserver.observe(el);
    }
    return () => {
      if (el) {
        resizeObserver.unobserve(el);
      }
    };
  }, [canvasRef, initViewportPosition]);

  // 拖拽画布视口
  const dragViewport = useCallback(
    (e: React.MouseEvent) => {
      let isMouseDown = true;

      const startPageX = e.pageX;
      const startPageY = e.pageY;

      const originLeft = viewportLeft;
      const originTop = viewportTop;

      const handleMouseMove = (e: MouseEvent) => {
        if (!isMouseDown) return;

        const currentPageX = e.pageX;
        const currentPageY = e.pageY;

        setViewportLeft(originLeft + (currentPageX - startPageX));
        setViewportTop(originTop + (currentPageY - startPageY));
      };

      const handleMouseUp = () => {
        isMouseDown = false;
        document.onmousemove = null;
        document.onmouseup = null;

        setCanvasDragged(true);
      };

      document.onmousemove = handleMouseMove;
      document.onmouseup = handleMouseUp;
    },
    [viewportLeft, viewportTop, setCanvasDragged],
  );

  // 视口位置和尺寸样式
  const viewportStyles: ViewportStyles = useMemo(
    () => ({
      width: viewportSize,
      height: viewportSize * viewportRatio,
      left: viewportLeft,
      top: viewportTop,
    }),
    [viewportSize, viewportRatio, viewportLeft, viewportTop],
  );

  return {
    viewportStyles,
    dragViewport,
  };
}
