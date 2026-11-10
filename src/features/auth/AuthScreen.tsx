import type { ReactNode } from 'react'

/** Cadre commun des écrans de connexion et d'installation. */
export function AuthScreen({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand text-2xl font-black text-white">
            T
          </div>
          <h1 className="text-2xl font-bold text-ink">TransCash</h1>
          <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  )
}
