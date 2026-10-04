export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="container-page flex justify-center py-14"><div className="w-full max-w-md rounded-xl border border-line bg-surface p-8 shadow-card">{children}</div></div>;
}
