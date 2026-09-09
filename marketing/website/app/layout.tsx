import type { Metadata } from 'next';
import './globals.css';
import './launch.css';
export const metadata: Metadata = {
  title: 'OpenBot — A little more possible',
  description:
    'Meet your open-source AI teammates. A conversation-first, local-first studio for useful work, your choice of AI, and a team you can make your own. Mac beta in preparation.',
  metadataBase: new URL(
    'https://openbot-a-little-more-possible.prisacariurobert6.chatgpt.site',
  ),
  robots: { index: false, follow: false },
  icons: { icon: '/openbot-mark.svg' },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
