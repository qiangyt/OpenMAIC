/**
 * 用户资料 Store
 * 将头像、昵称和简介持久化到 localStorage
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 预定义的头像选项 */
export const AVATAR_OPTIONS = [
  '/avatars/user.png',
  '/avatars/teacher-2.png',
  '/avatars/assist-2.png',
  '/avatars/clown-2.png',
  '/avatars/curious-2.png',
  '/avatars/note-taker-2.png',
  '/avatars/thinker-2.png',
] as const;

export interface UserProfileState {
  /** 本地头像路径或 data-URL（用于自定义上传） */
  avatar: string;
  nickname: string;
  bio: string;
  setAvatar: (avatar: string) => void;
  setNickname: (nickname: string) => void;
  setBio: (bio: string) => void;
}

export const useUserProfileStore = create<UserProfileState>()(
  persist(
    (set) => ({
      avatar: AVATAR_OPTIONS[0],
      nickname: '',
      bio: '',
      setAvatar: (avatar) => set({ avatar }),
      setNickname: (nickname) => set({ nickname }),
      setBio: (bio) => set({ bio }),
    }),
    {
      name: 'user-profile-storage',
    },
  ),
);
