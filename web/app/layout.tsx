import type { Metadata } from 'next';
import './emoji-font.css';
import './globals.css';

const publicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ??
  'https://kiwifundhongning.github.io/AlphabetAndThings/';

export const metadata: Metadata = {
  metadataBase: new URL(publicSiteUrl),
  title: 'AlphabetAndThings | 字母和好朋友',
  description: '面向三岁儿童的中英双语字母与常见事物认知小游戏。',
  manifest: 'manifest.webmanifest',
  icons: {
    icon: 'icon-192.png',
    apple: 'icon-192.png',
  },
  openGraph: {
    title: 'AlphabetAndThings | 字母和好朋友',
    description: '听一听、找一找，开心认识英文字母。',
    type: 'website',
    images: [{ url: 'og.png', width: 1672, height: 941, alt: 'AlphabetAndThings 儿童字母认知游戏' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AlphabetAndThings | 字母和好朋友',
    description: '听一听、找一找，开心认识英文字母。',
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
