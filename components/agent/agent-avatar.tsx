/**
 * 智能体头像组件
 * 在聊天消息中显示智能体头像和名称
 */

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

interface AgentAvatarProps {
  avatar: string; // 图片 URL 或表情符号
  color: string; // 主题颜色（十六进制）
  name: string; // 智能体显示名称
  size?: 'sm' | 'md' | 'lg';
}

// 检查字符串是否为 URL
function isUrl(str: string): boolean {
  return str.startsWith('http') || str.startsWith('/') || str.startsWith('data:');
}

export default function AgentAvatar({ avatar, color, name, size = 'md' }: AgentAvatarProps) {
  const sizeClasses = {
    sm: 'size-6',
    md: 'size-8',
    lg: 'size-10',
  };

  return (
    <div className="flex items-center gap-2 mb-2">
      <Avatar className={sizeClasses[size]} style={{ borderColor: color, borderWidth: 2 }}>
        {isUrl(avatar) ? (
          <>
            <AvatarImage src={avatar} alt={name} />
            <AvatarFallback style={{ backgroundColor: `${color}20`, color }}>
              {name.charAt(0)}
            </AvatarFallback>
          </>
        ) : (
          <AvatarFallback style={{ backgroundColor: `${color}20`, color }}>
            {avatar || name.charAt(0)}
          </AvatarFallback>
        )}
      </Avatar>
      <span className="text-sm font-semibold" style={{ color }}>
        {name}
      </span>
    </div>
  );
}
