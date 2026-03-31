import type { Metadata } from 'next'
import WalkthroughClient from './WalkthroughClient'

export const metadata: Metadata = {
  title: 'Flujo de Uso — Flow-QA/QC',
  description: 'Walkthrough completo del sistema Flow-QA/QC con pantallas reales de la aplicación.',
}

export default function WalkthroughPage() {
  return <WalkthroughClient />
}
