// 强制动态渲染，因为此页面使用客户端钩子 (useI18n)
export const dynamic = 'force-dynamic';

export default function GenerationPreviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
