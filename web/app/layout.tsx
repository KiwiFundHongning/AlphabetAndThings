import type { Metadata } from 'next';
import './globals.css';

const publicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ??
  'https://kiwifundhongning.github.io/AlphabetAndThings/';

export const metadata: Metadata = {
  metadataBase: new URL(publicSiteUrl),
  title: 'AlphabetAndThings | 字母、数字和好朋友',
  description: '含四档难度、82 个内置物品和可由家长扩展的本地数字题库，无需登录、记录只存本机的三岁儿童中英双语认知小游戏。',
  manifest: 'manifest.webmanifest',
  icons: {
    icon: [{ url: 'icon-64.png', type: 'image/png', sizes: '64x64' }],
    apple: 'icon-192.png',
  },
  openGraph: {
    title: 'AlphabetAndThings | 字母、数字和好朋友',
    description: '听一听、看卡通物品、数字词与点阵，开心认识英文字母和数字。',
    type: 'website',
    images: [{ url: 'og.png', width: 1672, height: 941, alt: 'AlphabetAndThings 儿童字母与数字认知游戏' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AlphabetAndThings | 字母、数字和好朋友',
    description: '听一听、看卡通物品、数字词与点阵，开心认识英文字母和数字。',
    images: ['og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
