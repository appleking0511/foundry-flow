import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Foundry Flow — 자동화 공장 시뮬레이션",
  description: "채굴부터 가공, 조립, 판매까지 직접 설계하는 2D 자동화 공장 방치형 게임",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
